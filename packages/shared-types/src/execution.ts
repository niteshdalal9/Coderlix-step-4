/**
 * Execution Record (Final Architecture §5).
 *
 * The COMPLETED record of one Execution Manager operation. (While an
 * execution is in flight the DB row exists with nullable completion
 * columns — that is storage state, not this contract.) Not every
 * Execution Record is evidence; promotion is §6 / Step 19.
 *
 * Modelling decisions where §5 is under-specified:
 *  - "command / operation, args" -> `operation_type` + `command` + `args`.
 *    For run_command: `command` is the executable and `args` its argv.
 *    For file operations: `command` is null and `args` is exactly
 *    `[path]`. File CONTENT is never stored in the record.
 *  - `exit_code` is 0..255 or null. A process killed by a signal has no
 *    exit code (null, per the MVP Plan M-05).
 *  - `resource_usage` is a free map of finite non-negative numbers; §5
 *    names the field but no members.
 *  - `stdout_ref`/`stderr_ref` are opaque refs, null when no output was
 *    captured (e.g. the process never started).
 *  - status `success` means the process ran to completion and an exit
 *    code was captured; it does NOT imply exit code 0 (a failing test
 *    run completes "successfully" with a non-zero code — evidence
 *    `result` is derived later, §30.2).
 */
import { z } from "zod";
import {
  IdSchema,
  OpaqueRefSchema,
  TimestampSchema,
  FiniteNonNegativeNumberSchema,
  isNotAfter,
} from "./common.js";
import { ExecutionStatusSchema, OperationTypeSchema } from "./state.js";

export const ExecutionRecordSchema = z
  .object({
    execution_id: IdSchema,
    workspace_id: IdSchema,
    agent_run_id: IdSchema.nullable(),
    task_id: IdSchema,
    capability_grant_id: IdSchema,
    verification_authorization_id: IdSchema.nullable(),
    operation_type: OperationTypeSchema,
    command: z.string().min(1).nullable(),
    args: z.array(z.string()),
    start_time: TimestampSchema,
    end_time: TimestampSchema,
    exit_code: z.number().int().min(0).max(255).nullable(),
    stdout_ref: OpaqueRefSchema.nullable(),
    stderr_ref: OpaqueRefSchema.nullable(),
    status: ExecutionStatusSchema,
    artifacts: z.array(OpaqueRefSchema),
    resource_usage: z.record(z.string(), FiniteNonNegativeNumberSchema),
  })
  .strict()
  .refine((r) => isNotAfter(r.start_time, r.end_time), {
    message: "end_time must not be before start_time",
    path: ["end_time"],
  })
  .refine((r) => r.status !== "killed" || r.exit_code === null, {
    message: "a killed execution has no exit_code",
    path: ["exit_code"],
  })
  .refine((r) => r.status !== "success" || r.exit_code !== null, {
    message: "a successful execution must have an exit_code",
    path: ["exit_code"],
  })
  .refine(
    (r) =>
      r.operation_type === "run_command"
        ? r.command !== null
        : r.command === null && r.args.length === 1,
    {
      message:
        "run_command requires a command; file operations require command=null and args=[path]",
      path: ["command"],
    },
  );
export type ExecutionRecord = z.infer<typeof ExecutionRecordSchema>;
