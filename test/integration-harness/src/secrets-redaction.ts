import { createHash } from "node:crypto";
import { format } from "node:util";

/**
 * Secrets-redaction TEST HELPER (Step 03).
 *
 * Lets a test plant a known canary "secret", run some code/command, and then
 * assert that the secret did not appear in the captured output — in its raw
 * form or in the common encoded forms a leak tends to take. This backs the
 * security-baseline test "planted secret in stdout -> redacted in stored
 * refs and logs" (Implementation Plan §14, owned by later steps).
 *
 * What this is NOT: it is not a secrets manager, not a credential store and
 * not the production redaction filter (that is a later step). It only
 * observes output. It never stores, loads, or transmits real credentials.
 *
 * Self-protecting by construction: a leak report NEVER contains the secret
 * value — only its label, which encoding matched, a short SHA-256
 * fingerprint, and an offset — so a failing test cannot itself leak the
 * secret into CI logs.
 *
 * Known limitation: it detects the secret as a contiguous raw/encoded
 * substring. It cannot detect arbitrary transformations (e.g. a value split
 * across lines, encrypted, or hashed).
 */

export interface PlantedSecret {
  readonly label: string;
  readonly value: string;
}

export type SecretVariant = "raw" | "json-escaped" | "url-encoded" | "base64" | "base64url" | "hex";

export interface SecretLeak {
  readonly label: string;
  readonly variant: SecretVariant;
  /** First 12 hex chars of SHA-256(secret value) — identifies WHICH secret without revealing it. */
  readonly fingerprint: string;
  /** Character offset of the match in the scanned text. */
  readonly offset: number;
}

const MIN_SECRET_LENGTH = 8;

export function fingerprint(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 12);
}

/**
 * Creates a planted secret. With no `value`, a deterministic, obviously fake
 * canary is derived from the label (same label -> same canary, so failures
 * are reproducible). Values shorter than 8 characters are rejected: they
 * would cause false positives.
 */
export function plantSecret(label: string, value?: string): PlantedSecret {
  if (label.trim() === "") throw new Error("plantSecret: label must not be empty");
  const secret =
    value ??
    `CANARY_${label.replace(/[^A-Za-z0-9]/g, "_").toUpperCase()}_${createHash("sha256")
      .update(`coderlix-test-canary:${label}`)
      .digest("hex")
      .slice(0, 32)}`;
  if (secret.length < MIN_SECRET_LENGTH || secret.trim() === "") {
    throw new Error(
      `plantSecret: secret for "${label}" must be at least ${String(MIN_SECRET_LENGTH)} non-blank characters (shorter values cause false positives)`,
    );
  }
  return { label, value: secret };
}

/**
 * Base64 forms of `value` as it would appear embedded at any of the three
 * possible 3-byte alignments inside a larger base64 string (e.g.
 * `Authorization: Basic base64("user:" + secret)`). Characters whose bits
 * depend on neighbouring bytes are dropped so only the secret-determined
 * core remains.
 */
function embeddedBase64Cores(value: string): string[] {
  const bytes = Buffer.from(value, "utf8");
  const cores: string[] = [];
  for (let pad = 0; pad < 3; pad++) {
    const encoded = Buffer.concat([Buffer.alloc(pad, 0x78), bytes]).toString("base64").replace(/=+$/, "");
    const dropLeading = Math.ceil((pad * 8) / 6);
    const dropTrailing = (bytes.length + pad) % 3 === 0 ? 0 : 1;
    const core = encoded.slice(dropLeading, encoded.length - dropTrailing);
    if (core.length >= MIN_SECRET_LENGTH) cores.push(core);
  }
  return cores;
}

function needlesFor(value: string): Map<string, SecretVariant> {
  const needles = new Map<string, SecretVariant>();
  const add = (needle: string, variant: SecretVariant): void => {
    if (needle.length >= MIN_SECRET_LENGTH && !needles.has(needle)) needles.set(needle, variant);
  };
  add(value, "raw");
  add(JSON.stringify(value).slice(1, -1), "json-escaped");
  add(encodeURIComponent(value), "url-encoded");
  for (const core of embeddedBase64Cores(value)) add(core, "base64");
  for (const core of embeddedBase64Cores(value)) {
    add(core.replace(/\+/g, "-").replace(/\//g, "_"), "base64url");
  }
  const hex = Buffer.from(value, "utf8").toString("hex");
  add(hex, "hex");
  add(hex.toUpperCase(), "hex");
  return needles;
}

/** Scans `haystack` for each secret (raw + encoded forms). Returns every leak found; empty means clean. */
export function findSecretLeaks(
  haystack: string | Uint8Array,
  secrets: readonly PlantedSecret[],
): SecretLeak[] {
  const text = typeof haystack === "string" ? haystack : Buffer.from(haystack).toString("utf8");
  const leaks: SecretLeak[] = [];
  for (const secret of secrets) {
    for (const [needle, variant] of needlesFor(secret.value)) {
      const offset = text.indexOf(needle);
      if (offset !== -1) {
        leaks.push({ label: secret.label, variant, fingerprint: fingerprint(secret.value), offset });
      }
    }
  }
  return leaks;
}

export class SecretLeakError extends Error {
  readonly leaks: readonly SecretLeak[];
  constructor(leaks: readonly SecretLeak[], context: string | undefined) {
    super(
      `Secret leak detected${context ? ` in ${context}` : ""}: ` +
        leaks
          .map(
            (leak) =>
              `"${leak.label}" (${leak.variant} form, sha256:${leak.fingerprint}) at offset ${String(leak.offset)}`,
          )
          .join("; ") +
        ". The secret value is intentionally not printed.",
    );
    this.name = "SecretLeakError";
    this.leaks = leaks;
  }
}

/** Throws SecretLeakError if any planted secret appears in `haystack` (never echoing the secret). */
export function assertNoSecretLeak(
  haystack: string | Uint8Array,
  secrets: readonly PlantedSecret[],
  context?: string,
): void {
  const leaks = findSecretLeaks(haystack, secrets);
  if (leaks.length > 0) throw new SecretLeakError(leaks, context);
}

export interface CapturedOutput {
  readonly stdout: string;
  readonly stderr: string;
  /** stdout then stderr, for a single scan. */
  readonly combined: string;
}

function chunkToText(chunk: unknown): string {
  if (typeof chunk === "string") return chunk;
  if (chunk instanceof Uint8Array) return Buffer.from(chunk).toString("utf8");
  return String(chunk);
}

/**
 * Runs `fn` while capturing everything written via `console.*`,
 * `process.stdout.write` and `process.stderr.write` IN THIS PROCESS, then
 * restores the originals (even if `fn` throws). Output of child processes
 * is not captured here — scan their `CommandResult.stdout/stderr` with
 * `assertNoSecretLeak` instead.
 */
export async function captureOutput<T>(
  fn: () => T | Promise<T>,
): Promise<{ result: T; output: CapturedOutput }> {
  const out: string[] = [];
  const err: string[] = [];

  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;
  const consoleMethods = ["log", "info", "debug", "warn", "error"] as const;
  const originalConsole = new Map(consoleMethods.map((method) => [method, console[method]] as const));

  const makeWrite =
    (sink: string[]) =>
    (chunk: unknown, ...rest: unknown[]): boolean => {
      sink.push(chunkToText(chunk));
      const callback = rest.find((arg) => typeof arg === "function");
      if (typeof callback === "function") callback();
      return true;
    };

  process.stdout.write = makeWrite(out) as typeof process.stdout.write;
  process.stderr.write = makeWrite(err) as typeof process.stderr.write;
  for (const method of consoleMethods) {
    const sink = method === "warn" || method === "error" ? err : out;
    console[method] = (...args: unknown[]): void => {
      sink.push(`${format(...args)}\n`);
    };
  }

  try {
    const result = await fn();
    return {
      result,
      output: { stdout: out.join(""), stderr: err.join(""), combined: out.join("") + err.join("") },
    };
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    for (const [method, original] of originalConsole) console[method] = original;
  }
}
