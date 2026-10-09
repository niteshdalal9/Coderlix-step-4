/**
 * Agent handoff envelopes (Final Architecture §16).
 *
 * Versioned: `schema_version` is a literal, so an unknown version is a
 * PARSE FAILURE, not a best-effort read. Raising the version is a
 * deliberate change to this constant plus a migration of whatever
 * persists envelopes.
 *
 * AgentRunResult carries exactly the fields the §14.1 late-result fence
 * needs (`task_generation`, `attempt_number`, `revision_at_completion`,
 * `agent_run_id`, `task_id`). Parsing a result proves it is well-formed;
 * it never means the result is accepted — fencing is Step 08 and reads
 * durable state, not the envelope's own claims.
 *
 * Under-specified in §16 (modelling choices, see the Step 04 report):
 * `task_type` is a non-empty string; `context_refs` / `input_artifacts` /
 * `artifacts` are opaque refs; `expected_output` is a non-empty string;
 * `confidence` is a number in [0, 1].
 */
import { z } from "zod";
import {
  IdSchema,
  OpaqueRefSchema,
  RevisionSchema,
  SafePositiveIntSchema,
  TimestampSchema,
} from "./common.js";
import { AgentRoleSchema, AgentRunResultStatusSchema } from "./state.js";

/** The only envelope schema_version this code accepts. */
export const ENVELOPE_SCHEMA_VERSION = 1 as const;

export const AgentRunRequestSchema = z
  .object({
    schema_version: z.literal(ENVELOPE_SCHEMA_VERSION),
    task_id: IdSchema,
    /** Epoch (§12.2). Starts at 1. */
    task_generation: SafePositiveIntSchema,
    agent_run_id: IdSchema,
    parent_run_id: IdSchema.nullable(),
    project_id: IdSchema,
    workspace_id: IdSchema,
    /** Workspace revision at dispatch time. */
    revision: RevisionSchema,
    /** Scoped to (task_generation, dag_step). Starts at 1. */
    attempt_number: SafePositiveIntSchema,
    agent_role: AgentRoleSchema,
    task_type: z.string().min(1),
    capability_grant_id: IdSchema,
    context_refs: z.array(OpaqueRefSchema),
    input_artifacts: z.array(OpaqueRefSchema),
    expected_output: z.string().min(1),
    dispatched_at: TimestampSchema,
  })
  .strict();
export type AgentRunRequest = z.infer<typeof AgentRunRequestSchema>;

export const AgentRunResultSchema = z
  .object({
    schema_version: z.literal(ENVELOPE_SCHEMA_VERSION),
    agent_run_id: IdSchema,
    task_id: IdSchema,
    task_generation: SafePositiveIntSchema,
    attempt_number: SafePositiveIntSchema,
    revision_at_completion: RevisionSchema,
    status: AgentRunResultStatusSchema,
    evidence_refs: z.array(IdSchema),
    artifacts: z.array(OpaqueRefSchema),
    confidence: z.number().finite().min(0).max(1),
    notes: z.string(),
    /** Advisory only; never authoritative (§14). */
    next_recommended_agent: AgentRoleSchema.nullable(),
    completed_at: TimestampSchema,
  })
  .strict();
export type AgentRunResult = z.infer<typeof AgentRunResultSchema>;
