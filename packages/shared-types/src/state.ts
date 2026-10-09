/**
 * State / phase / result enums (Step 04).
 *
 * Each enum is ONE `as const` array. The Zod schema and the TS type are
 * both derived from that array, and `ENUM_REGISTRY` exposes every
 * DB-backed enum under a logical name so Step 05 can generate its SQL
 * enum/CHECK definitions from these same arrays (MVP Plan, Step 04:
 * "one source ... or a compile-time test asserting parity"). The
 * enum-parity test against the migrations belongs to Step 05, when the
 * migrations exist; it will import `ENUM_REGISTRY` from here.
 *
 * Value casing is copied exactly from the Final Architecture and the
 * MVP Plan's migration tables, even though it is not uniform (e.g.
 * `ACTIVE`/`STALE` upper-case, evidence `result` and execution `status`
 * lower-case). It is a wire/DB contract; do not "normalize" it here
 * without changing the spec and the migrations together.
 *
 * Only VALUES live here. Transition tables (§12, §13) are Steps 06/07.
 */
import { z } from "zod";

// --- Task state (§12) ------------------------------------------------------
export const TASK_STATES = [
  "PENDING",
  "PROVISIONING",
  "RUNNING",
  "RETRYING",
  "BLOCKED",
  "CANCELLED",
  "COMPLETED",
] as const;
export const TaskStateSchema = z.enum(TASK_STATES);
export type TaskState = z.infer<typeof TaskStateSchema>;

/** Structured reason codes for PROVISIONING attempts (§12.1). */
export const PROVISIONING_REASON_CODES = [
  "WORKSPACE_CREATE_FAILED",
  "CLONE_FAILED",
  "CHECKOUT_FAILED",
  "INITIAL_CHECKPOINT_FAILED",
  "DB_ERROR",
] as const;
export const ProvisioningReasonCodeSchema = z.enum(PROVISIONING_REASON_CODES);
export type ProvisioningReasonCode = z.infer<typeof ProvisioningReasonCodeSchema>;

// --- Task phase (§13) ------------------------------------------------------
export const TASK_PHASES = [
  "UNVERIFIED",
  "IMPLEMENTED",
  "TESTED",
  "FAILED",
  "VERIFIED",
  "RELEASED",
] as const;
export const TaskPhaseSchema = z.enum(TASK_PHASES);
export type TaskPhase = z.infer<typeof TaskPhaseSchema>;

// --- Agent run (§14) -------------------------------------------------------
export const AGENT_RUN_STATUSES = [
  "QUEUED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "TIMED_OUT",
  "CANCELLED",
] as const;
export const AgentRunStatusSchema = z.enum(AGENT_RUN_STATUSES);
export type AgentRunStatus = z.infer<typeof AgentRunStatusSchema>;

/**
 * Statuses an AgentRunResult may carry (§16): the terminal subset.
 * `QUEUED`/`RUNNING` are lifecycle states, never a completion report.
 * The `satisfies` clause makes drift from AGENT_RUN_STATUSES a compile
 * error.
 */
export const AGENT_RUN_RESULT_STATUSES = [
  "SUCCEEDED",
  "FAILED",
  "TIMED_OUT",
  "CANCELLED",
] as const satisfies readonly AgentRunStatus[];
export const AgentRunResultStatusSchema = z.enum(AGENT_RUN_RESULT_STATUSES);
export type AgentRunResultStatus = z.infer<typeof AgentRunResultStatusSchema>;

/**
 * Agent roles named by the architecture (§6, §13, §37). The architecture
 * never lists them as a closed enum; this is the set it names for the
 * MVP (Planner, Developer, Tester, Fixer), the verification dispatch
 * path (VerificationRunner) and the advisory reviewer (CodeReviewer).
 * Phase-2 roles (§38) will extend it deliberately.
 */
export const AGENT_ROLES = [
  "Planner",
  "Developer",
  "Tester",
  "Fixer",
  "VerificationRunner",
  "CodeReviewer",
] as const;
export const AgentRoleSchema = z.enum(AGENT_ROLES);
export type AgentRole = z.infer<typeof AgentRoleSchema>;

// --- Capability grant / operations (§5, §6) -------------------------------
export const OPERATION_CLASSES = [
  "DEV",
  "DEV_TEST",
  "VERIFICATION",
  "SYSTEM",
] as const;
export const OperationClassSchema = z.enum(OPERATION_CLASSES);
export type OperationClass = z.infer<typeof OperationClassSchema>;

export const OPERATION_TYPES = [
  "run_command",
  "read_file",
  "write_file",
  "list_files",
] as const;
export const OperationTypeSchema = z.enum(OPERATION_TYPES);
export type OperationType = z.infer<typeof OperationTypeSchema>;

// --- Execution (§5) --------------------------------------------------------
export const EXECUTION_STATUSES = ["success", "timeout", "killed", "error"] as const;
export const ExecutionStatusSchema = z.enum(EXECUTION_STATUSES);
export type ExecutionStatus = z.infer<typeof ExecutionStatusSchema>;

// --- Verification / evidence (§6, §9, §30.2) ------------------------------
export const VERIFICATION_STAGES = [
  "STATIC_ANALYSIS",
  "BUILD",
  "UNIT_TEST",
  "INTEGRATION_TEST",
  "E2E_TEST",
  "SECURITY_SCAN",
  "REGRESSION",
] as const;
export const VerificationStageSchema = z.enum(VERIFICATION_STAGES);
export type VerificationStage = z.infer<typeof VerificationStageSchema>;

export const EVIDENCE_TYPES = [
  "build",
  "lint",
  "typecheck",
  "unit_test",
  "integration_test",
  "e2e_test",
  "security_scan",
  "regression",
  "manual_review",
] as const;
export const EvidenceTypeSchema = z.enum(EVIDENCE_TYPES);
export type EvidenceType = z.infer<typeof EvidenceTypeSchema>;

/** Deterministic result (§30.2). Lower-case, as in §9 and migration M-06. */
export const EVIDENCE_RESULTS = ["pass", "fail", "error", "inconclusive"] as const;
export const EvidenceResultSchema = z.enum(EVIDENCE_RESULTS);
export type EvidenceResult = z.infer<typeof EvidenceResultSchema>;

export const EVIDENCE_STATUSES = ["ACTIVE", "STALE"] as const;
export const EvidenceStatusSchema = z.enum(EVIDENCE_STATUSES);
export type EvidenceStatus = z.infer<typeof EvidenceStatusSchema>;

// --- Budget (§22, §23) -----------------------------------------------------
export const BUDGET_SCOPES = ["task", "provider", "daily"] as const;
export const BudgetScopeSchema = z.enum(BUDGET_SCOPES);
export type BudgetScope = z.infer<typeof BudgetScopeSchema>;

// --- Other DB-backed enums named in the MVP Plan (M-02, M-08) -------------
export const WORKSPACE_STATUSES = [
  "PROVISIONED",
  "ACTIVE",
  "FINALIZING",
  "DESTROYED",
] as const;
export const WorkspaceStatusSchema = z.enum(WORKSPACE_STATUSES);
export type WorkspaceStatus = z.infer<typeof WorkspaceStatusSchema>;

export const CHECKPOINT_STATUSES = ["PENDING", "CONFIRMED", "FAILED"] as const;
export const CheckpointStatusSchema = z.enum(CHECKPOINT_STATUSES);
export type CheckpointStatus = z.infer<typeof CheckpointStatusSchema>;

export const KNOWLEDGE_ENTRY_STATUSES = ["ACTIVE", "STALE"] as const;
export const KnowledgeEntryStatusSchema = z.enum(KNOWLEDGE_ENTRY_STATUSES);
export type KnowledgeEntryStatus = z.infer<typeof KnowledgeEntryStatusSchema>;

export const FINDING_STATUSES = ["open", "resolved"] as const;
export const FindingStatusSchema = z.enum(FINDING_STATUSES);
export type FindingStatus = z.infer<typeof FindingStatusSchema>;

/**
 * Every enum that Step 05 must mirror in the database, keyed by a LOGICAL
 * name. The physical Postgres type/constraint names are Step 05's call.
 * `agent_role`, `operation_type`, `provisioning_reason_code` and the
 * provider enums are intentionally NOT here: the plan does not list them
 * as DB enums.
 */
export const ENUM_REGISTRY = {
  task_state: TASK_STATES,
  task_phase: TASK_PHASES,
  agent_run_status: AGENT_RUN_STATUSES,
  operation_class: OPERATION_CLASSES,
  execution_status: EXECUTION_STATUSES,
  verification_stage: VERIFICATION_STAGES,
  evidence_type: EVIDENCE_TYPES,
  evidence_result: EVIDENCE_RESULTS,
  evidence_status: EVIDENCE_STATUSES,
  budget_scope: BUDGET_SCOPES,
  workspace_status: WORKSPACE_STATUSES,
  checkpoint_status: CHECKPOINT_STATUSES,
  knowledge_entry_status: KNOWLEDGE_ENTRY_STATUSES,
  finding_status: FINDING_STATUSES,
} as const;
export type EnumRegistry = typeof ENUM_REGISTRY;
