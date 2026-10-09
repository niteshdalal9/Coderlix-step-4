import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runChecked } from "../../src/command.js";
import {
  FRESH_REPO_DIR_PREFIX,
  HARNESS_GIT_AUTHOR_EMAIL,
  HARNESS_GIT_AUTHOR_NAME,
  freshRepo,
  isolatedGitEnv,
  type FreshRepo,
} from "../../src/fresh-repo.js";

// Real `git` against the real filesystem. No Docker, no Postgres, no mocks —
// so this suite can run on any machine that has git (including Termux).
const created: FreshRepo[] = [];
async function make(options?: Parameters<typeof freshRepo>[0]): Promise<FreshRepo> {
  const repo = await freshRepo(options);
  created.push(repo);
  return repo;
}
afterEach(async () => {
  for (const repo of created.splice(0)) await repo.cleanup();
});

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Independent derivation of the commit freshRepo() must create.
//
// git names an object by SHA-1("<type> <byte length>\0<body>"). From ONLY the
// pinned inputs (file contents, fixed identity, fixed instant, fixed message)
// we rebuild the exact blob -> tree -> commit objects in Node and compare with
// what git really stored. Nothing here reads git's *formatting* (e.g. %aI,
// which newer git prints with "Z" instead of "+00:00"), and no SHA is
// hard-coded: if any pinned input fails to reach the commit, the derived and
// actual objects differ.
// ---------------------------------------------------------------------------
function gitObjectId(type: "blob" | "tree" | "commit", body: Buffer): string {
  return createHash("sha1")
    .update(Buffer.concat([Buffer.from(`${type} ${String(body.length)}\0`), body]))
    .digest("hex");
}

/** Tree object id for flat (no sub-directory) regular files, git's byte-wise name order. */
function expectedTreeId(files: Readonly<Record<string, string>>): string {
  const entries = Object.entries(files)
    .map(([name, content]) => {
      if (name.includes("/")) throw new Error(`test helper supports flat files only: ${name}`);
      return { name: Buffer.from(name, "utf8"), blob: gitObjectId("blob", Buffer.from(content, "utf8")) };
    })
    .sort((a, b) => Buffer.compare(a.name, b.name));
  const body = Buffer.concat(
    entries.map((e) => Buffer.concat([Buffer.from("100644 "), e.name, Buffer.from([0]), Buffer.from(e.blob, "hex")])),
  );
  return gitObjectId("tree", body);
}

/** The exact commit object (text and id) freshRepo() must produce for `files`. */
function expectedInitialCommit(files: Readonly<Record<string, string>>): { raw: string; id: string } {
  const epoch = String(Date.UTC(2026, 0, 1, 0, 0, 0) / 1000); // 2026-01-01T00:00:00Z
  const identity = `${HARNESS_GIT_AUTHOR_NAME} <${HARNESS_GIT_AUTHOR_EMAIL}> ${epoch} +0000`;
  const raw =
    `tree ${expectedTreeId(files)}\n` +
    `author ${identity}\n` +
    `committer ${identity}\n` +
    `\n` +
    `chore: initial commit\n`;
  return { raw, id: gitObjectId("commit", Buffer.from(raw, "utf8")) };
}

/** What was actually committed (flat files only), read back from the work tree. */
async function committedFiles(repo: FreshRepo): Promise<Record<string, string>> {
  const names = (await repo.git(["ls-files", "-z"])).stdout.split("\0").filter((n) => n !== "");
  const entries = await Promise.all(
    names.map(async (name) => [name, await readFile(join(repo.workDir, name), "utf8")] as const),
  );
  return Object.fromEntries(entries);
}

async function gitIn(cwd: string, ...args: string[]): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), "coderlix-it-gitprobe-"));
  try {
    return (await runChecked("git", args, { cwd, env: isolatedGitEnv(home) })).stdout.trim();
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

describe("freshRepo()", () => {
  it("creates a bare origin and a working clone with one pushed initial commit", async () => {
    const repo = await make();
    expect(await gitIn(repo.originDir, "rev-parse", "--is-bare-repository")).toBe("true");
    expect(await gitIn(repo.workDir, "rev-parse", "--is-bare-repository")).toBe("false");
    expect(repo.branch).toBe("main");
    expect(repo.initialCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(await gitIn(repo.workDir, "rev-parse", "HEAD")).toBe(repo.initialCommit);
    // The commit really reached the "server": ask origin, not the clone.
    expect(await gitIn(repo.originDir, "rev-parse", "refs/heads/main")).toBe(repo.initialCommit);
    expect(await gitIn(repo.workDir, "ls-remote", "--heads", "origin")).toContain(
      `${repo.initialCommit}\trefs/heads/main`,
    );
    expect(await gitIn(repo.workDir, "status", "--porcelain")).toBe("");
    expect(await gitIn(repo.workDir, "rev-list", "--count", "HEAD")).toBe("1");
    expect(repo.originUrl.startsWith("file://")).toBe(true);
  });

  it("honours a custom branch and files, including nested paths", async () => {
    const repo = await make({
      branch: "trunk",
      files: { "src/a.txt": "alpha\n", "docs/notes/b.md": "# b\n" },
    });
    expect(await gitIn(repo.workDir, "rev-parse", "--abbrev-ref", "HEAD")).toBe("trunk");
    expect(await readFile(join(repo.workDir, "src", "a.txt"), "utf8")).toBe("alpha\n");
    expect(await gitIn(repo.workDir, "ls-files")).toBe("docs/notes/b.md\nsrc/a.txt");
    expect(await gitIn(repo.originDir, "rev-parse", "refs/heads/trunk")).toBe(repo.initialCommit);
  });

  it("is deterministic: identical options give an identical initial commit SHA; different content does not", async () => {
    const a = await make();
    const b = await make();
    const c = await make({ files: { "README.md": "different\n" } });
    expect(a.initialCommit).toBe(b.initialCommit);
    expect(c.initialCommit).not.toBe(a.initialCommit);
    expect(a.rootDir).not.toBe(b.rootDir);
  });

  it("stores exactly the pinned tree, identity, instant and message (git-version independent)", async () => {
    const repo = await make();
    const files = await committedFiles(repo);
    expect(Object.keys(files)).toEqual(["README.md"]);
    const expected = expectedInitialCommit(files);

    // The raw commit object as stored: no formatting involved, so the result is the
    // same for every git version (unlike %aI/%cI, which newer git prints with "Z").
    expect((await repo.git(["cat-file", "commit", "HEAD"])).stdout).toBe(expected.raw);
    expect(await gitIn(repo.workDir, "rev-parse", "HEAD^{tree}")).toBe(expectedTreeId(files));
  });

  it("produces exactly the independently derived commit SHA (no hard-coded SHA)", async () => {
    const byDefault = await make();
    expect(byDefault.initialCommit).toBe(expectedInitialCommit(await committedFiles(byDefault)).id);

    // Custom flat files, given deliberately out of name order; the branch name is not part of
    // the commit object, so a different branch must not change the SHA.
    const files = { "b.txt": "second\n", "a.txt": "first\n" };
    const onMain = await make({ files });
    const onTrunk = await make({ files, branch: "trunk" });
    const derived = expectedInitialCommit(files).id;
    expect(onMain.initialCommit).toBe(derived);
    expect(onTrunk.initialCommit).toBe(derived);
  }, 30_000);

  it("is repeatable: independent repos created seconds apart, in parallel and under different TZ settings get the identical SHA", async () => {
    const repos: FreshRepo[] = [await make()];
    const expected = expectedInitialCommit(await committedFiles(repos[0] as FreshRepo)).id;

    // Cross a wall-clock second boundary: without pinned dates two repos created in
    // different seconds would get different SHAs.
    await sleep(1100);

    const savedTz = process.env["TZ"];
    try {
      for (const tz of ["UTC", "Asia/Kolkata", "America/Los_Angeles", "Pacific/Kiritimati"]) {
        process.env["TZ"] = tz;
        repos.push(await make());
      }
    } finally {
      if (savedTz === undefined) delete process.env["TZ"];
      else process.env["TZ"] = savedTz;
    }

    repos.push(...(await Promise.all([make(), make(), make()])));

    expect(repos).toHaveLength(8);
    expect(new Set(repos.map((repo) => repo.rootDir)).size).toBe(8); // genuinely independent repositories
    expect([...new Set(repos.map((repo) => repo.initialCommit))]).toEqual([expected]);
  }, 60_000);

  it("is isolated: lives in the OS temp dir, never inside the project, with its own toplevel", async () => {
    const repo = await make();
    const tempRoot = await realpath(tmpdir());
    expect(repo.rootDir.startsWith(join(tempRoot, FRESH_REPO_DIR_PREFIX))).toBe(true);
    expect(await realpath(await gitIn(repo.workDir, "rev-parse", "--show-toplevel"))).toBe(
      await realpath(repo.workDir),
    );
  });

  it("ignores hostile inherited GIT_* variables and the user's global git config", async () => {
    const fakeHome = await mkdtemp(join(tmpdir(), "coderlix-it-hostile-home-"));
    const saved = { ...process.env };
    try {
      await writeFile(
        join(fakeHome, ".gitconfig"),
        "[user]\n\tname = Intruder\n\temail = intruder@example.invalid\n[commit]\n\tgpgsign = true\n",
      );
      await mkdir(join(fakeHome, "decoy-repo"), { recursive: true });
      process.env["HOME"] = fakeHome;
      process.env["GIT_DIR"] = join(fakeHome, "decoy-repo");
      process.env["GIT_WORK_TREE"] = fakeHome;
      process.env["GIT_AUTHOR_NAME"] = "Intruder";
      process.env["GIT_INDEX_FILE"] = join(fakeHome, "decoy-index");

      const repo = await make();

      expect(await gitIn(repo.workDir, "log", "-1", "--format=%an")).toBe(HARNESS_GIT_AUTHOR_NAME);
      // The decoy "repository" the hostile env pointed at was never written to.
      expect(existsSync(join(fakeHome, "decoy-repo", "HEAD"))).toBe(false);
      expect(existsSync(join(fakeHome, "decoy-index"))).toBe(false);
    } finally {
      for (const key of Object.keys(process.env)) delete process.env[key];
      Object.assign(process.env, saved);
      await rm(fakeHome, { recursive: true, force: true });
    }
  });

  it("supports further commits and a push through the bare origin via the git() helper", async () => {
    const repo = await make();
    await writeFile(join(repo.workDir, "next.txt"), "next\n");
    await repo.git(["add", "next.txt"]);
    await repo.git(["commit", "--quiet", "--message", "second"]);
    await repo.git(["push", "--quiet"]);
    const head = (await repo.git(["rev-parse", "HEAD"])).stdout.trim();
    expect(head).not.toBe(repo.initialCommit);
    expect(await gitIn(repo.originDir, "rev-parse", "refs/heads/main")).toBe(head);
  });

  it("cleanup() removes everything and is idempotent", async () => {
    const repo = await freshRepo();
    expect(existsSync(repo.rootDir)).toBe(true);
    await repo.cleanup();
    expect(existsSync(repo.rootDir)).toBe(false);
    expect(existsSync(repo.workDir)).toBe(false);
    expect(existsSync(repo.originDir)).toBe(false);
    await repo.cleanup();
  });

  it("rejects unsafe input before creating anything", async () => {
    await expect(freshRepo({ files: { "../escape.txt": "x" } })).rejects.toThrow();
    await expect(freshRepo({ files: { "/abs.txt": "x" } })).rejects.toThrow();
    await expect(freshRepo({ files: { ".git/config": "x" } })).rejects.toThrow();
    await expect(freshRepo({ files: {} })).rejects.toThrow();
    await expect(freshRepo({ branch: "bad..name" })).rejects.toThrow();
    await expect(freshRepo({ branch: "--upload-pack=evil" })).rejects.toThrow();
  });
});
