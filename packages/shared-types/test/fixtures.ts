/**
 * Test fixtures (not a test file: vitest only runs `*.test.ts`).
 * Every builder returns a FRESH, valid object, typed with the schema's
 * inferred type, so a contract change that breaks the shape fails
 * `typecheck:tests` here first. UUIDs are RFC-4122 v4-shaped so they are
 * valid under both Zod 3 and Zod 4 validators.
 */
import type {
  AgentRunRequest,
  AgentRunResult,
  Budget,
  BudgetReservation,
  Evidence,
  ExecutionRecord,
  GenerationRequest,
  GenerationResult,
  OperationRequest,
  VerificationAuthorization,
} from "../src/index.js";

export function uuid(n: number): string {
  return `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
}

export const REV_A = "0123456789abcdef0123456789abcdef01234567";
export const REV_B = "89abcdef0123456789abcdef0123456789abcdef";
export const T0 = "2026-10-08T10:00:00Z";
export const T1 = "2026-10-08T10:00:05Z";
export const T2 = "2026-10-08T10:05:00Z";

/** Narrow structural view of a Zod schema; keeps tests version-agnostic. */
export interface AnySchema {
  safeParse(value: unknown): {
    success: boolean;
    error?: { issues: { path: PropertyKey[] }[] };
  };
  parse(value: unknown): unknown;
}

export function accepts(schema: AnySchema, value: unknown): boolean {
  return schema.safeParse(value).success;
}

/** Dotted issue paths of a failed parse ("" for root). */
export function issuePaths(schema: AnySchema, value: unknown): string[] {
  const r = schema.safeParse(value);
  if (r.success) return [];
  return (r.error?.issues ?? []).map((i) => i.path.map(String).join("."));
}

/** JSON round trip: what a real process boundary does to a payload. */
export function viaJson<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value));
}

export function without<T extends object>(obj: T, key: string): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...(obj as Record<string, unknown>) };
  delete copy[key];
  return copy;
}

export function withPatch<T extends object>(
  obj: T,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  return { ...obj, ...patch };
}

export function operationRequest(): OperationRequest {
  return {
    operation_type: "run_command",
    payload: { command: "pnpm", args: ["run", "typecheck"] },
    workspace_id: uuid(1),
    agent_run_id: uuid(2),
    task_id: uuid(3),
    capability_grant_id: uuid(4),
    verification_authorization_id: null,
    timeout_override: null,
  };
}

export function executionRecord(): ExecutionRecord {
  return {
    execution_id: uuid(10),
    workspace_id: uuid(1),
    agent_run_id: uuid(2),
    task_id: uuid(3),
    capability_grant_id: uuid(4),
    verification_authorization_id: null,
    operation_type: "run_command",
    command: "pnpm",
    args: ["run", "typecheck"],
    start_time: T0,
    end_time: T1,
    exit_code: 0,
    stdout_ref: "blob://stdout/10",
    stderr_ref: "blob://stderr/10",
    status: "success",
    artifacts: [],
    resource_usage: { wall_time_ms: 5000, max_rss_bytes: 104857600 },
  };
}

export function verificationAuthorization(): VerificationAuthorization {
  return {
    verification_authorization_id: uuid(20),
    task_id: uuid(3),
    project_id: uuid(5),
    workspace_id: uuid(1),
    revision: REV_A,
    stage: "STATIC_ANALYSIS",
    allowed_evidence_types: ["lint", "typecheck"],
    issued_at: T0,
    issued_by: "orchestrator:instance-1",
    expires_at: T2,
  };
}

export function evidence(): Evidence {
  return {
    evidence_id: uuid(30),
    task_id: uuid(3),
    project_id: uuid(5),
    workspace_id: uuid(1),
    agent_run_id: null,
    execution_id: uuid(10),
    verification_authorization_id: uuid(20),
    revision: REV_A,
    evidence_type: "typecheck",
    verification_stage: "STATIC_ANALYSIS",
    command_or_tool: "pnpm run typecheck",
    start_time: T0,
    end_time: T1,
    exit_code: 0,
    stdout_ref: "blob://stdout/10",
    stderr_ref: "blob://stderr/10",
    result: "pass",
    artifact_refs: [],
    producer: "verification-runner",
    authoritative: true,
    schema_version: 1,
    status: "ACTIVE",
    superseded_by: null,
    created_at: T1,
  };
}

export function agentRunRequest(): AgentRunRequest {
  return {
    schema_version: 1,
    task_id: uuid(3),
    task_generation: 1,
    agent_run_id: uuid(2),
    parent_run_id: null,
    project_id: uuid(5),
    workspace_id: uuid(1),
    revision: REV_A,
    attempt_number: 1,
    agent_role: "Developer",
    task_type: "implementation",
    capability_grant_id: uuid(4),
    context_refs: ["ctx://plan/1"],
    input_artifacts: [],
    expected_output: "unified diff",
    dispatched_at: T0,
  };
}

export function agentRunResult(): AgentRunResult {
  return {
    schema_version: 1,
    agent_run_id: uuid(2),
    task_id: uuid(3),
    task_generation: 1,
    attempt_number: 1,
    revision_at_completion: REV_B,
    status: "SUCCEEDED",
    evidence_refs: [],
    artifacts: ["artifact://diff/1"],
    confidence: 0.8,
    notes: "",
    next_recommended_agent: null,
    completed_at: T1,
  };
}

export function generationRequest(): GenerationRequest {
  return {
    messages: [{ role: "user", content: "Write a function." }],
    system_prompt: null,
    tools: [],
    response_schema: null,
    max_tokens: 1024,
    sampling: {},
    stream: false,
  };
}

export function generationResult(): GenerationResult {
  return {
    content: "done",
    tool_calls: [],
    validated: false,
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, estimated: false },
  };
}

export function budget(): Budget {
  return {
    id: uuid(40),
    scope: "task",
    scope_ref: uuid(3),
    period: null,
    limit: 1000,
    used: 100,
    reserved: 50,
  };
}

export function budgetReservation(): BudgetReservation {
  return {
    id: uuid(41),
    budget_id: uuid(40),
    agent_run_id: uuid(2),
    estimate: 50,
    expires_at: T2,
    settled_at: null,
  };
}
