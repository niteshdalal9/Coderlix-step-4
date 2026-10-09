/**
 * Operation Request (Final Architecture §5).
 *
 * The request the Agent Runtime / Orchestrator / Git / Workspace managers
 * hand to the Execution Manager. This file defines SHAPE only.
 *
 * What the schema deliberately does NOT enforce (and must not be assumed
 * to):
 *  - path containment / traversal / symlink safety: the Execution
 *    Manager's workspace jail is the control. The schema only rejects
 *    empty strings and NUL bytes (which can never be valid in a path or
 *    an exec argument).
 *  - `timeout_override <= grant ceiling`: needs the grant; enforced by
 *    the mediation layer. Unit here is milliseconds.
 *  - that `verification_authorization_id` is present exactly for
 *    VERIFICATION-class grants: needs the grant; enforced by mediation.
 *  - that an agent can never choose `verification_authorization_id` or
 *    `capability_grant_id` itself: the runtime builds these fields; model
 *    output is never parsed directly into an OperationRequest.
 */
import { z } from "zod";
import { IdSchema, SafePositiveIntSchema } from "./common.js";

/** Non-empty string with no NUL byte. */
const NoNulStringSchema = z
  .string()
  .min(1)
  .refine((s) => !s.includes("\u0000"), "must not contain a NUL byte");

/** run_command: executable + argv. Never a shell string. */
export const RunCommandPayloadSchema = z
  .object({
    command: NoNulStringSchema,
    args: z.array(z.string().refine((s) => !s.includes("\u0000"), "must not contain a NUL byte")),
  })
  .strict();
export type RunCommandPayload = z.infer<typeof RunCommandPayloadSchema>;

export const ReadFilePayloadSchema = z.object({ path: NoNulStringSchema }).strict();
export type ReadFilePayload = z.infer<typeof ReadFilePayloadSchema>;

export const WriteFilePayloadSchema = z
  .object({ path: NoNulStringSchema, content: z.string() })
  .strict();
export type WriteFilePayload = z.infer<typeof WriteFilePayloadSchema>;

export const ListFilesPayloadSchema = z.object({ path: NoNulStringSchema }).strict();
export type ListFilesPayload = z.infer<typeof ListFilesPayloadSchema>;

/** Fields common to every operation type. */
const operationBaseShape = {
  workspace_id: IdSchema,
  /** null for system / Git / Workspace-originated requests. */
  agent_run_id: IdSchema.nullable(),
  task_id: IdSchema,
  capability_grant_id: IdSchema,
  /** Non-null only for Verification-stage requests (§6). */
  verification_authorization_id: IdSchema.nullable(),
  /** Milliseconds, or null to use the grant's default. */
  timeout_override: SafePositiveIntSchema.nullable(),
};

export const OperationRequestSchema = z.discriminatedUnion("operation_type", [
  z
    .object({
      ...operationBaseShape,
      operation_type: z.literal("run_command"),
      payload: RunCommandPayloadSchema,
    })
    .strict(),
  z
    .object({
      ...operationBaseShape,
      operation_type: z.literal("read_file"),
      payload: ReadFilePayloadSchema,
    })
    .strict(),
  z
    .object({
      ...operationBaseShape,
      operation_type: z.literal("write_file"),
      payload: WriteFilePayloadSchema,
    })
    .strict(),
  z
    .object({
      ...operationBaseShape,
      operation_type: z.literal("list_files"),
      payload: ListFilesPayloadSchema,
    })
    .strict(),
]);
export type OperationRequest = z.infer<typeof OperationRequestSchema>;
