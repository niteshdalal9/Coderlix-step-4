/**
 * Evidence row (Final Architecture §9, §10; migration M-06).
 *
 * SHAPE only. Whether a row is accepted (the ten provenance checks of
 * §10), how `result` is derived (§30.2) and how `authoritative` is set
 * (§6 promotion) are Steps 19/20. Parsing a row here proves it is
 * well-formed, NEVER that it is trustworthy: `authoritative: true` in a
 * payload is a claim, not a fact.
 *
 * Schema-level invariants (each is true for every row of the §30.2
 * table, so a violation means a corrupt row, not a policy choice):
 *  - `end_time >= start_time`;
 *  - `result = pass` requires `exit_code = 0`, except `manual_review`
 *    (no process involved);
 *  - a row cannot supersede itself.
 *
 * `verification_stage` is required (it "maps 1:1 to the authorization's
 * stage"). The architecture defines no stage for `manual_review` — see
 * the Step 04 report; this schema does not paper over that.
 */
import { z } from "zod";
import {
  IdSchema,
  OpaqueRefSchema,
  RevisionSchema,
  TimestampSchema,
  isNotAfter,
} from "./common.js";
import {
  EvidenceResultSchema,
  EvidenceStatusSchema,
  EvidenceTypeSchema,
  VerificationStageSchema,
} from "./state.js";

/** The only schema_version this code accepts for Evidence rows. */
export const EVIDENCE_SCHEMA_VERSION = 1 as const;

export const EvidenceSchema = z
  .object({
    evidence_id: IdSchema,
    task_id: IdSchema,
    project_id: IdSchema,
    workspace_id: IdSchema,
    /** null for directly-dispatched system verification executions. */
    agent_run_id: IdSchema.nullable(),
    execution_id: IdSchema,
    verification_authorization_id: IdSchema,
    /** Git commit this evidence proves. */
    revision: RevisionSchema,
    evidence_type: EvidenceTypeSchema,
    verification_stage: VerificationStageSchema,
    command_or_tool: z.string().min(1),
    start_time: TimestampSchema,
    end_time: TimestampSchema,
    exit_code: z.number().int().min(0).max(255).nullable(),
    stdout_ref: OpaqueRefSchema,
    stderr_ref: OpaqueRefSchema,
    result: EvidenceResultSchema,
    artifact_refs: z.array(OpaqueRefSchema),
    /** Service / agent role that produced this row. */
    producer: z.string().min(1),
    authoritative: z.boolean(),
    schema_version: z.literal(EVIDENCE_SCHEMA_VERSION),
    status: EvidenceStatusSchema,
    superseded_by: IdSchema.nullable(),
    created_at: TimestampSchema,
  })
  .strict()
  .refine((e) => isNotAfter(e.start_time, e.end_time), {
    message: "end_time must not be before start_time",
    path: ["end_time"],
  })
  .refine(
    (e) => e.result !== "pass" || e.evidence_type === "manual_review" || e.exit_code === 0,
    {
      message: "result=pass requires exit_code=0 (except manual_review)",
      path: ["result"],
    },
  )
  .refine((e) => e.superseded_by === null || e.superseded_by !== e.evidence_id, {
    message: "an evidence row cannot supersede itself",
    path: ["superseded_by"],
  });
export type Evidence = z.infer<typeof EvidenceSchema>;
