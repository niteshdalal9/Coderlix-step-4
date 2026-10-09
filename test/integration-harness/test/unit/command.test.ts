import { describe, expect, it } from "vitest";
import {
  CommandFailedError,
  CommandSpawnError,
  runChecked,
  runCommand,
} from "../../src/command.js";

// Real child processes (the node binary running this test) — no mocks.
const node = process.execPath;

describe("runCommand / runChecked", () => {
  it("captures stdout, stderr and a zero exit code", async () => {
    const result = await runCommand(node, [
      "-e",
      'process.stdout.write("out"); process.stderr.write("err");',
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("out");
    expect(result.stderr).toBe("err");
    expect(result.timedOut).toBe(false);
  });

  it("resolves (does not reject) with the exit code for a non-zero exit", async () => {
    const result = await runCommand(node, ["-e", "process.exit(7)"]);
    expect(result.exitCode).toBe(7);
  });

  it("runChecked rejects with CommandFailedError on a non-zero exit", async () => {
    const error = await runChecked(node, ["-e", 'console.error("boom"); process.exit(3)']).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(CommandFailedError);
    expect((error as CommandFailedError).result.exitCode).toBe(3);
    expect((error as CommandFailedError).message).toContain("boom");
  });

  it("kills the process and reports timedOut when the timeout elapses", async () => {
    const result = await runCommand(node, ["-e", "setTimeout(() => {}, 60000)"], {
      timeoutMs: 300,
    });
    expect(result.timedOut).toBe(true);
    await expect(
      runChecked(node, ["-e", "setTimeout(() => {}, 60000)"], { timeoutMs: 300 }),
    ).rejects.toBeInstanceOf(CommandFailedError);
  });

  it("rejects with CommandSpawnError when the executable does not exist", async () => {
    await expect(runCommand("/nonexistent/coderlix-no-such-binary", [])).rejects.toBeInstanceOf(
      CommandSpawnError,
    );
  });

  it("passes arguments verbatim without a shell (metacharacters are inert)", async () => {
    const nasty = "a; echo INJECTED $(echo INJECTED) `echo INJECTED` | cat";
    const result = await runChecked(node, ["-e", "process.stdout.write(process.argv[1])", nasty]);
    expect(result.stdout).toBe(nasty);
  });
});
