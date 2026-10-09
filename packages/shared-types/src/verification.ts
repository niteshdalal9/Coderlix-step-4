/**
 * Verification Authorization (Final Architecture §6).
 *
 * Issued by the Orchestrator (never by an implementing agent) immediately
 * before a Verification stage runs. This file defines the SHAPE. The
 * promotion rules that consult it (unexpired, revision == current
 * revision, stage matches evidence type, producer independence) are
 * Step 19 behaviour and are NOT checked here.
 *
 * Schema-level invariants only: `allowed_evidence_types` is non-empty and
 * duplicate-free, and `expires_at` is strictly after `issued_at`.
 * The maximum lifetime ("short-lived") is policy/config, not a type.
 */
import { z } from "zod";
import { IdSchema, RevisionSchema, TimestampSchema, hasUniqueItems, isNotAfter } from "./common.js";
import { EvidenceTypeSchema, VerificationStageSchema } from "./state.js";

export const VerificationAuthorizationSchema = z
  .object({
    verification_authorization_id: IdSchema,
    task_id: IdSchema,
    project_id: IdSchema,
    workspace_id: IdSchema,
    /** Must equal workspace.current_revision at issuance (checked by the issuer). */
    revision: RevisionSchema,
    stage: VerificationStageSchema,
    allowed_evidence_types: z.array(EvidenceTypeSchema).min(1),
    issued_at: TimestampSchema,
    /** Orchestrator instance / decision reference. */
    issued_by: z.string().min(1),
    expires_at: TimestampSchema,
  })
  .strict()
  .refine((a) => hasUniqueItems(a.allowed_evidence_types), {
    message: "allowed_evidence_types must not contain duplicates",
    path: ["allowed_evidence_types"],
  })
  .refine((a) => !isNotAfter(a.expires_at, a.issued_at), {
    message: "expires_at must be after issued_at",
    path: ["expires_at"],
  });
export type VerificationAuthorization = z.infer<typeof VerificationAuthorizationSchema>;
