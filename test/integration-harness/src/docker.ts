import { randomUUID } from "node:crypto";
import { errorMessage, runChecked, runCommand } from "./command.js";
import {
  HARNESS_LABEL_KEY,
  HARNESS_RUN_LABEL_KEY,
  MIN_COMPOSE_VERSION,
  PROBE_IMAGE,
} from "./constants.js";

/**
 * Docker availability + real-container probing for the integration harness.
 *
 * Design rule (Step 03): Docker-dependent integration tests FAIL when Docker
 * is not usable. There is deliberately no skip path and no mock daemon, so
 * a Docker-dependent test can never be reported as passed unless a real
 * Docker daemon actually did the work.
 */

export type DockerFailureStage = "cli" | "daemon" | "compose";

export interface DockerInfo {
  readonly dockerBin: string;
  readonly serverVersion: string;
  readonly serverOs: string;
  readonly composeVersion: string;
}

export type DockerProbeFailure = {
  readonly available: false;
  readonly dockerBin: string;
  readonly stage: DockerFailureStage;
  readonly message: string;
  readonly detail: string;
};

export type DockerProbe = ({ readonly available: true } & DockerInfo) | DockerProbeFailure;

export interface DockerOptions {
  /** Docker CLI executable. Default: "docker". */
  dockerBin?: string;
}

export class DockerUnavailableError extends Error {
  readonly stage: DockerFailureStage;
  readonly detail: string;
  constructor(failure: DockerProbeFailure) {
    super(
      [
        `Docker is required for Coderlix integration tests but is not usable (${failure.stage}): ${failure.message}`,
        failure.detail ? `  detail: ${failure.detail}` : "",
        "  This is a hard failure by design: Docker-dependent integration tests are never skipped and never mocked,",
        "  so they can never be reported as passed without a real Docker daemon.",
        "  Run them on a Docker-capable Linux host (CI does). Hermetic unit tests need no Docker: `pnpm run test:unit`.",
      ]
        .filter((line) => line !== "")
        .join("\n"),
    );
    this.name = "DockerUnavailableError";
    this.stage = failure.stage;
    this.detail = failure.detail;
  }
}

/** Parses `docker compose version --short` output ("2.38.2", "v2.17.0", "5.0.0"). */
export function parseComposeVersion(raw: string): [number, number, number] | undefined {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(raw.trim());
  if (match === null) return undefined;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function isComposeVersionSupported(raw: string): boolean {
  const parsed = parseComposeVersion(raw);
  if (parsed === undefined) return false;
  for (let i = 0; i < 3; i++) {
    const have = parsed[i] ?? 0;
    const need = MIN_COMPOSE_VERSION[i] ?? 0;
    if (have !== need) return have > need;
  }
  return true;
}

/** Inspects the Docker CLI, the daemon, and Docker Compose. Never throws. */
export async function probeDocker(options: DockerOptions = {}): Promise<DockerProbe> {
  const dockerBin = options.dockerBin ?? "docker";

  let version;
  try {
    version = await runCommand(
      dockerBin,
      ["version", "--format", "{{.Server.Version}}|{{.Server.Os}}"],
      { timeoutMs: 30_000 },
    );
  } catch (error) {
    return {
      available: false,
      dockerBin,
      stage: "cli",
      message: `the Docker CLI (\`${dockerBin}\`) could not be executed`,
      detail: errorMessage(error),
    };
  }

  const [serverVersion = "", serverOs = ""] = version.stdout.trim().split("|");
  if (version.timedOut || version.exitCode !== 0 || serverVersion === "") {
    return {
      available: false,
      dockerBin,
      stage: "daemon",
      message: "the Docker daemon is not reachable",
      detail:
        (version.timedOut ? "`docker version` timed out" : version.stderr.trim()) ||
        "no server version reported",
    };
  }
  if (serverOs !== "linux") {
    return {
      available: false,
      dockerBin,
      stage: "daemon",
      message: `the Docker daemon is not a Linux daemon (reported OS: "${serverOs}")`,
      detail: "",
    };
  }

  let compose;
  try {
    compose = await runCommand(dockerBin, ["compose", "version", "--short"], {
      timeoutMs: 30_000,
    });
  } catch (error) {
    return {
      available: false,
      dockerBin,
      stage: "compose",
      message: "`docker compose` could not be executed",
      detail: errorMessage(error),
    };
  }
  const composeVersion = compose.stdout.trim();
  if (compose.exitCode !== 0 || !isComposeVersionSupported(composeVersion)) {
    const min = MIN_COMPOSE_VERSION.join(".");
    return {
      available: false,
      dockerBin,
      stage: "compose",
      message: `Docker Compose v${min} or newer is required`,
      detail: compose.exitCode === 0 ? `found "${composeVersion}"` : compose.stderr.trim(),
    };
  }

  return { available: true, dockerBin, serverVersion, serverOs, composeVersion };
}

/** Like probeDocker, but throws DockerUnavailableError instead of returning a failure. */
export async function assertDockerAvailable(options: DockerOptions = {}): Promise<DockerInfo> {
  const probe = await probeDocker(options);
  if (!probe.available) throw new DockerUnavailableError(probe);
  return probe;
}

export interface ProbeContainerResult {
  readonly image: string;
  /** Random value passed INTO the container and echoed back OUT of it. */
  readonly nonce: string;
  readonly echoedNonce: string;
  /** Container hostname (Docker sets it to the short container ID). */
  readonly containerHostname: string;
  readonly containerKernel: string;
  /** Unique label value; use it with `listContainerIdsByLabel` to prove removal. */
  readonly runLabelValue: string;
}

/**
 * Actually runs a throwaway container and reports what the container itself
 * printed. A random nonce goes in through the environment and must come back
 * out through stdout, so the result cannot be faked by a cached or
 * pre-recorded response, and the container hostname proves the command did
 * not run on the host.
 *
 * NOT the sandbox container factory (Step 14). The minimal restrictive
 * flags below are only hygiene for a probe: no network, no capabilities,
 * read-only rootfs, no mounts of any kind (never the Docker socket).
 */
export async function runProbeContainer(
  options: DockerOptions & { image?: string } = {},
): Promise<ProbeContainerResult> {
  const dockerBin = options.dockerBin ?? "docker";
  const image = options.image ?? PROBE_IMAGE;
  const nonce = randomUUID();
  const runLabelValue = randomUUID();

  const result = await runChecked(
    dockerBin,
    [
      "run",
      "--rm",
      "--label",
      `${HARNESS_LABEL_KEY}=1`,
      "--label",
      `${HARNESS_RUN_LABEL_KEY}=${runLabelValue}`,
      "--network",
      "none",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      "--read-only",
      "--env",
      `CODERLIX_PROBE_NONCE=${nonce}`,
      "--entrypoint",
      "/bin/sh",
      image,
      "-c",
      // Only shell builtins + coreutils (`cat`, `uname`): no reliance on a `hostname`
      // binary, which newer Debian-based images do not guarantee. /etc/hostname is
      // written by Docker itself (the short container ID).
      'printf "%s\\n%s\\n%s\\n" "$CODERLIX_PROBE_NONCE" "$(cat /etc/hostname)" "$(uname -s)"',
    ],
    { timeoutMs: 300_000 },
  );

  const [echoedNonce = "", containerHostname = "", containerKernel = ""] = result.stdout
    .trim()
    .split("\n");
  return { image, nonce, echoedNonce, containerHostname, containerKernel, runLabelValue };
}

/** IDs of ALL containers (running or not) carrying `label` (`key=value`). */
export async function listContainerIdsByLabel(
  label: string,
  options: DockerOptions = {},
): Promise<string[]> {
  const dockerBin = options.dockerBin ?? "docker";
  const result = await runChecked(
    dockerBin,
    ["ps", "--all", "--quiet", "--filter", `label=${label}`],
    { timeoutMs: 30_000 },
  );
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

/** Polls until no container carries `label`, or throws after `timeoutMs`. */
export async function waitForNoContainers(
  label: string,
  options: DockerOptions & { timeoutMs?: number } = {},
): Promise<void> {
  const deadline = Date.now() + (options.timeoutMs ?? 15_000);
  for (;;) {
    const remaining = await listContainerIdsByLabel(label, options);
    if (remaining.length === 0) return;
    if (Date.now() >= deadline) {
      throw new Error(`containers with label ${label} still exist: ${remaining.join(", ")}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}
