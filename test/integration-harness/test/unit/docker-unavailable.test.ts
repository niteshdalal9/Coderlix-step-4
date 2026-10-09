import { describe, expect, it } from "vitest";
import { DockerUnavailableError, assertDockerAvailable, probeDocker } from "../../src/docker.js";
import { startStack } from "../../src/stack.js";

// A path that cannot exist: the Docker CLI genuinely cannot be executed.
// This is a REAL failure of the real code path, not a mock of Docker — and
// it is how this suite proves Docker-dependent work fails closed instead of
// being skipped or faked when Docker is unavailable.
const MISSING_DOCKER = "/nonexistent/coderlix-docker";

describe("Docker unavailable => hard failure (never skipped, never mocked)", () => {
  it("probeDocker reports stage 'cli' when the docker executable is missing", async () => {
    const probe = await probeDocker({ dockerBin: MISSING_DOCKER });
    expect(probe.available).toBe(false);
    if (probe.available) throw new Error("unreachable");
    expect(probe.stage).toBe("cli");
    expect(probe.detail).toContain(MISSING_DOCKER);
  });

  it("assertDockerAvailable rejects with DockerUnavailableError", async () => {
    const error = await assertDockerAvailable({ dockerBin: MISSING_DOCKER }).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(DockerUnavailableError);
    const unavailable = error as DockerUnavailableError;
    expect(unavailable.stage).toBe("cli");
    expect(unavailable.message).toContain("never skipped and never mocked");
    expect(unavailable.message).toContain("pnpm run test:unit");
  });

  it("startStack rejects with DockerUnavailableError before starting anything", async () => {
    await expect(startStack({ dockerBin: MISSING_DOCKER })).rejects.toBeInstanceOf(
      DockerUnavailableError,
    );
  });
});
