import { describe, expect, it } from "vitest";
import {
  SecretLeakError,
  assertNoSecretLeak,
  captureOutput,
  findSecretLeaks,
  fingerprint,
  plantSecret,
} from "../../src/secrets-redaction.js";

// A secret full of characters that change under JSON/URL encoding.
const AWKWARD = 'p@ss/w0rd"quote\\back & more=stuff+plus!';

describe("plantSecret", () => {
  it("derives a deterministic, obviously fake canary from the label", () => {
    const a = plantSecret("db-password");
    const b = plantSecret("db-password");
    const c = plantSecret("api-token");
    expect(a.value).toBe(b.value);
    expect(a.value).not.toBe(c.value);
    expect(a.value.startsWith("CANARY_DB_PASSWORD_")).toBe(true);
    expect(a.value.length).toBeGreaterThanOrEqual(8);
  });

  it("rejects labels/values that would cause false positives", () => {
    expect(() => plantSecret("")).toThrow();
    expect(() => plantSecret("short", "abc")).toThrow();
    expect(() => plantSecret("blank", "         ")).toThrow();
  });
});

describe("findSecretLeaks / assertNoSecretLeak", () => {
  const secret = plantSecret("token");

  it("passes on clean output", () => {
    expect(findSecretLeaks("nothing sensitive here", [secret])).toHaveLength(0);
    expect(() => assertNoSecretLeak("[REDACTED] only", [secret])).not.toThrow();
  });

  it("detects a raw leak and reports which secret without printing it", () => {
    const output = `starting up... token=${secret.value} ...done`;
    let caught: unknown;
    try {
      assertNoSecretLeak(output, [secret], "worker stdout");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SecretLeakError);
    const message = (caught as SecretLeakError).message;
    expect(message).toContain("worker stdout");
    expect(message).toContain('"token"');
    expect(message).toContain(`sha256:${fingerprint(secret.value)}`);
    // The whole point: the failure message must not itself leak the secret.
    expect(message).not.toContain(secret.value);
    expect(JSON.stringify((caught as SecretLeakError).leaks)).not.toContain(secret.value);
  });

  it("detects JSON-escaped, URL-encoded and hex forms", () => {
    const awkward = plantSecret("awkward", AWKWARD);
    const variants = new Map<string, string>([
      ["json-escaped", JSON.stringify({ k: AWKWARD })],
      ["url-encoded", `https://h/?q=${encodeURIComponent(AWKWARD)}`],
      ["hex", Buffer.from(AWKWARD).toString("hex")],
      ["raw", `value: ${AWKWARD}`],
    ]);
    for (const [variant, text] of variants) {
      const leaks = findSecretLeaks(text, [awkward]);
      expect(leaks.map((leak) => leak.variant)).toContain(variant);
    }
  });

  it("detects base64 at every alignment, e.g. inside an Authorization: Basic header", () => {
    const awkward = plantSecret("awkward", AWKWARD);
    for (let prefixLength = 0; prefixLength < 6; prefixLength++) {
      for (let suffixLength = 0; suffixLength < 4; suffixLength++) {
        const embedded = `${"u".repeat(prefixLength)}${AWKWARD}${"s".repeat(suffixLength)}`;
        const header = `Authorization: Basic ${Buffer.from(embedded).toString("base64")}`;
        expect(findSecretLeaks(header, [awkward]).length).toBeGreaterThan(0);
        const urlSafe = Buffer.from(embedded).toString("base64url");
        expect(findSecretLeaks(urlSafe, [awkward]).length).toBeGreaterThan(0);
      }
    }
  });

  it("reports the matching base64 form, incl. secrets whose base64 contains '+' and '/'", () => {
    // Its base64 contains both '+' and '/', so the standard and URL-safe
    // spellings differ and each must be recognised under its own name.
    const slashy = plantSecret("slashy", "subjects?>>>~~~???>>>");
    for (let prefixLength = 0; prefixLength < 3; prefixLength++) {
      const embedded = `${"u".repeat(prefixLength)}${slashy.value}tail`;
      const standard = findSecretLeaks(Buffer.from(embedded).toString("base64"), [slashy]);
      expect(standard.map((leak) => leak.variant)).toContain("base64");
      const urlSafe = findSecretLeaks(Buffer.from(embedded).toString("base64url"), [slashy]);
      expect(urlSafe.map((leak) => leak.variant)).toContain("base64url");
    }
  });

  it("accepts binary output and scans every planted secret", () => {
    const other = plantSecret("other");
    const bytes = new TextEncoder().encode(`xx ${other.value} yy`);
    const leaks = findSecretLeaks(bytes, [secret, other]);
    expect(leaks).toHaveLength(1);
    expect(leaks[0]?.label).toBe("other");
  });

  it("proves a protection by mutation: a redactor catches the leak, removing it makes the check fail", () => {
    const logLine = `request failed, auth=${secret.value}`;
    const redact = (text: string): string => text.split(secret.value).join("[REDACTED]");
    const noRedaction = (text: string): string => text;

    expect(() => assertNoSecretLeak(redact(logLine), [secret])).not.toThrow();
    expect(() => assertNoSecretLeak(noRedaction(logLine), [secret])).toThrow(SecretLeakError);
  });
});

describe("captureOutput", () => {
  const secret = plantSecret("captured");

  it("captures console.* and process.stdout/stderr writes, and returns the result", async () => {
    const { result, output } = await captureOutput(() => {
      console.log("log line", 42);
      console.warn("warn line");
      process.stdout.write("raw stdout\n");
      process.stderr.write("raw stderr\n");
      return "done";
    });
    expect(result).toBe("done");
    expect(output.stdout).toContain("log line 42");
    expect(output.stdout).toContain("raw stdout");
    expect(output.stderr).toContain("warn line");
    expect(output.stderr).toContain("raw stderr");
    expect(output.combined).toContain("raw stderr");
  });

  it("supports async functions and lets a test assert nothing leaked", async () => {
    const { output } = await captureOutput(async () => {
      await Promise.resolve();
      console.log("connected as [REDACTED]");
    });
    expect(() => assertNoSecretLeak(output.combined, [secret], "captured output")).not.toThrow();

    const leaky = await captureOutput(() => {
      console.error(`oops ${secret.value}`);
    });
    expect(() => assertNoSecretLeak(leaky.output.combined, [secret])).toThrow(SecretLeakError);
  });

  it("restores console and stdout/stderr even when the function throws", async () => {
    const before = { log: console.log, write: process.stdout.write, err: process.stderr.write };
    await expect(
      captureOutput(() => {
        throw new Error("inside");
      }),
    ).rejects.toThrow("inside");
    expect(console.log).toBe(before.log);
    expect(process.stdout.write).toBe(before.write);
    expect(process.stderr.write).toBe(before.err);
  });
});
