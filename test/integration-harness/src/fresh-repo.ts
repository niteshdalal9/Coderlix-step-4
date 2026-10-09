import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { devNull, tmpdir } from "node:os";
import { basename, dirname, join, posix, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { runChecked } from "./command.js";

/**
 * `freshRepo()` — an isolated, deterministic, throwaway git repository for
 * integration tests (Step 03).
 *
 * What it creates, under a unique directory inside the OS temp dir:
 *   - `origin.git/` : a BARE repository acting as the "server"/remote. Real
 *                     `git push`/`fetch` go to it over the file:// transport
 *                     (a real `git-receive-pack`/`upload-pack` subprocess).
 *   - `work/`       : a non-bare working clone with one initial commit,
 *                     already pushed to origin and tracking it.
 *
 * It is test infrastructure, NOT the Coderlix Git Service (a later step) —
 * it implements none of its behavior (no checkpoints, no reconciliation, no
 * hook-disabling policy, no workspace semantics).
 *
 * Isolation (the user's real repository and git config are never touched):
 *   - every inherited `GIT_*` variable is scrubbed (so e.g. a stray
 *     `GIT_DIR`/`GIT_WORK_TREE`, as set inside a git hook, cannot redirect
 *     commands to another repository);
 *   - `HOME`/`XDG_CONFIG_HOME` point into the throwaway directory and
 *     `GIT_CONFIG_GLOBAL`/`GIT_CONFIG_NOSYSTEM` disable global/system
 *     config, so no user config, template, signing key or hook path leaks in;
 *   - repositories are created with an empty template (no sample hooks);
 *   - every command passes an explicit working directory.
 *
 * Determinism: fixed author/committer identity and dates, fixed default
 * branch, fixed commit message. The same options therefore always yield the
 * same initial commit SHA.
 */

export interface FreshRepoOptions {
  /** Initial branch name. Default: "main". */
  branch?: string;
  /** Files for the initial commit (relative POSIX path -> content). Default: README.md. */
  files?: Readonly<Record<string, string>>;
}

export interface FreshRepo {
  /** Unique throwaway directory containing everything below. */
  readonly rootDir: string;
  /** Working clone (non-bare). */
  readonly workDir: string;
  /** Bare "origin" repository directory. */
  readonly originDir: string;
  /** file:// URL of the bare origin. */
  readonly originUrl: string;
  readonly branch: string;
  /** SHA of the initial commit (deterministic for identical options). */
  readonly initialCommit: string;
  /** Runs `git <args>` in the working clone with the isolated environment; rejects on non-zero exit. */
  git(args: readonly string[]): Promise<{ stdout: string; stderr: string }>;
  /** Deletes the throwaway directory. Idempotent. */
  cleanup(): Promise<void>;
}

export const FRESH_REPO_DIR_PREFIX = "coderlix-it-repo-";
export const HARNESS_GIT_AUTHOR_NAME = "Coderlix Test Harness";
export const HARNESS_GIT_AUTHOR_EMAIL = "test-harness@coderlix.invalid";
export const HARNESS_GIT_FIXED_DATE = "2026-01-01T00:00:00Z";
const DEFAULT_FILES: Readonly<Record<string, string>> = {
  "README.md": "# Throwaway integration-test repository\n",
};

/** Environment for every git invocation: inherited env minus all GIT_* plus isolation + determinism. */
export function isolatedGitEnv(homeDir: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !key.startsWith("GIT_")) env[key] = value;
  }
  return {
    ...env,
    HOME: homeDir,
    XDG_CONFIG_HOME: join(homeDir, ".config"),
    GIT_CONFIG_GLOBAL: devNull,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
    GIT_AUTHOR_NAME: HARNESS_GIT_AUTHOR_NAME,
    GIT_AUTHOR_EMAIL: HARNESS_GIT_AUTHOR_EMAIL,
    GIT_AUTHOR_DATE: HARNESS_GIT_FIXED_DATE,
    GIT_COMMITTER_NAME: HARNESS_GIT_AUTHOR_NAME,
    GIT_COMMITTER_EMAIL: HARNESS_GIT_AUTHOR_EMAIL,
    GIT_COMMITTER_DATE: HARNESS_GIT_FIXED_DATE,
    LC_ALL: "C",
  };
}

function validateBranch(branch: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(branch) || branch.includes("..") || branch.endsWith("/") || branch.endsWith(".lock")) {
    throw new Error(`freshRepo: invalid branch name ${JSON.stringify(branch)}`);
  }
}

function validateRelativePath(path: string): string {
  const normalized = posix.normalize(path);
  if (
    path === "" ||
    posix.isAbsolute(normalized) ||
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized === ".git" ||
    normalized.startsWith(".git/") ||
    path.includes("\0")
  ) {
    throw new Error(`freshRepo: refusing unsafe file path ${JSON.stringify(path)}`);
  }
  return normalized;
}

export async function freshRepo(options: FreshRepoOptions = {}): Promise<FreshRepo> {
  const branch = options.branch ?? "main";
  validateBranch(branch);
  const files = options.files ?? DEFAULT_FILES;
  const entries = Object.entries(files).map(([path, content]) => [validateRelativePath(path), content] as const);
  if (entries.length === 0) throw new Error("freshRepo: at least one file is required for the initial commit");

  const parentDir = await realpath(tmpdir());
  const rootDir = await mkdtemp(join(parentDir, FRESH_REPO_DIR_PREFIX));
  const homeDir = join(rootDir, "home");
  const originDir = join(rootDir, "origin.git");
  const workDir = join(rootDir, "work");
  const env = isolatedGitEnv(homeDir);

  const run = (cwd: string, args: readonly string[]) =>
    runChecked("git", args, { cwd, env, timeoutMs: 60_000 });

  let cleaned = false;
  const cleanup = async (): Promise<void> => {
    if (cleaned) return;
    cleaned = true;
    // Safety: only ever delete the directory this call created.
    if (dirname(rootDir) !== parentDir || !basename(rootDir).startsWith(FRESH_REPO_DIR_PREFIX)) {
      throw new Error(`freshRepo: refusing to delete unexpected path ${rootDir}`);
    }
    await rm(rootDir, { recursive: true, force: true });
  };

  try {
    await mkdir(homeDir, { recursive: true });
    await run(rootDir, ["init", "--bare", "--quiet", "--initial-branch", branch, "--template=", originDir]);
    await run(rootDir, ["init", "--quiet", "--initial-branch", branch, "--template=", workDir]);

    for (const [path, content] of entries) {
      const target = join(workDir, ...path.split("/"));
      if (!target.startsWith(workDir + sep)) throw new Error(`freshRepo: path escapes the work tree: ${path}`);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content, "utf8");
    }

    await run(workDir, ["add", "--all"]);
    await run(workDir, ["-c", "commit.gpgsign=false", "commit", "--quiet", "--no-verify", "--message", "chore: initial commit"]);

    const originUrl = pathToFileURL(originDir).href;
    await run(workDir, ["remote", "add", "origin", originUrl]);
    await run(workDir, ["push", "--quiet", "--set-upstream", "origin", branch]);
    const head = await run(workDir, ["rev-parse", "HEAD"]);

    return {
      rootDir,
      workDir,
      originDir,
      originUrl,
      branch,
      initialCommit: head.stdout.trim(),
      git: async (args) => {
        const { stdout, stderr } = await run(workDir, args);
        return { stdout, stderr };
      },
      cleanup,
    };
  } catch (error) {
    await cleanup().catch(() => {
      // best effort; the original error is the one that matters
    });
    throw error;
  }
}
