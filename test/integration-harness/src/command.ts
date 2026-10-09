import { spawn } from "node:child_process";

/**
 * Minimal, shell-free command runner for the test harness.
 *
 * This is test infrastructure: it runs `git` and `docker` for tests. It is
 * NOT the Execution Manager and must never be used by production code
 * (Final Architecture §27: exactly one process-execution boundary exists in
 * the product, and it is `packages/execution`).
 *
 * Arguments are always passed as an array (never through a shell). Secrets
 * must never be put in `args` — they would appear in error messages.
 */

export interface RunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** Kill (SIGKILL) the process after this long and report `timedOut`. */
  timeoutMs?: number;
}

export interface CommandResult {
  /** Human-readable command line (for messages only). */
  readonly command: string;
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
}

/** The executable could not be started at all (e.g. ENOENT). */
export class CommandSpawnError extends Error {
  readonly command: string;
  constructor(command: string, cause: Error) {
    super(`could not execute \`${command}\`: ${cause.message}`, { cause });
    this.name = "CommandSpawnError";
    this.command = command;
  }
}

/** The command ran but did not succeed (non-zero exit, signal, or timeout). */
export class CommandFailedError extends Error {
  readonly result: CommandResult;
  constructor(result: CommandResult) {
    const how = result.timedOut
      ? "timed out"
      : result.signal !== null
        ? `was killed by ${result.signal}`
        : `exited with code ${String(result.exitCode)}`;
    const tail = `${result.stderr}\n${result.stdout}`.trim().slice(-2000);
    super(`\`${result.command}\` ${how}${tail ? `:\n${tail}` : ""}`);
    this.name = "CommandFailedError";
    this.result = result;
  }
}

const MAX_CAPTURE_CHARS = 10 * 1024 * 1024;

/** Runs a command; resolves with its result for ANY exit code. Rejects only if it cannot be started. */
export function runCommand(
  file: string,
  args: readonly string[],
  options: RunOptions = {},
): Promise<CommandResult> {
  const command = [file, ...args].join(" ");
  return new Promise<CommandResult>((resolve, reject) => {
    let settled = false;
    let timedOut = false;
    let stdout = "";
    let stderr = "";

    const child = spawn(file, [...args], {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    const timer =
      options.timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            timedOut = true;
            child.kill("SIGKILL");
          }, options.timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      if (stdout.length < MAX_CAPTURE_CHARS) stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      if (stderr.length < MAX_CAPTURE_CHARS) stderr += chunk;
    });

    child.on("error", (error) => {
      if (timer !== undefined) clearTimeout(timer);
      if (settled) return;
      settled = true;
      reject(new CommandSpawnError(command, error));
    });

    child.on("close", (exitCode, signal) => {
      if (timer !== undefined) clearTimeout(timer);
      if (settled) return;
      settled = true;
      resolve({ command, exitCode, signal, stdout, stderr, timedOut });
    });
  });
}

/** Like runCommand, but rejects with CommandFailedError unless the exit code is 0. */
export async function runChecked(
  file: string,
  args: readonly string[],
  options: RunOptions = {},
): Promise<CommandResult> {
  const result = await runCommand(file, args, options);
  if (result.timedOut || result.exitCode !== 0) {
    throw new CommandFailedError(result);
  }
  return result;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
