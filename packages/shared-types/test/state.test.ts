import { describe, expect, it } from "vitest";
import {
  AGENT_RUN_RESULT_STATUSES,
  AGENT_RUN_STATUSES,
  AGENT_ROLES,
  AgentRoleSchema,
  AgentRunResultStatusSchema,
  AgentRunStatusSchema,
  BudgetScopeSchema,
  BUDGET_SCOPES,
  CHECKPOINT_STATUSES,
  ENUM_REGISTRY,
  EVIDENCE_RESULTS,
  EVIDENCE_STATUSES,
  EVIDENCE_TYPES,
  EXECUTION_STATUSES,
  EvidenceResultSchema,
  EvidenceStatusSchema,
  EvidenceTypeSchema,
  ExecutionStatusSchema,
  FINDING_STATUSES,
  KNOWLEDGE_ENTRY_STATUSES,
  OPERATION_CLASSES,
  OPERATION_TYPES,
  OperationClassSchema,
  OperationTypeSchema,
  PROVISIONING_REASON_CODES,
  ProvisioningReasonCodeSchema,
  TASK_PHASES,
  TASK_STATES,
  TaskPhaseSchema,
  TaskStateSchema,
  VERIFICATION_STAGES,
  VerificationStageSchema,
  WORKSPACE_STATUSES,
  type TaskState,
} from "../src/index.js";

describe("enum values are exactly those of the architecture / plan", () => {
  it("task state (§12)", () => {
    expect([...TASK_STATES]).toEqual([
      "PENDING", "PROVISIONING", "RUNNING", "RETRYING", "BLOCKED", "CANCELLED", "COMPLETED",
    ]);
  });
  it("provisioning reason codes (§12.1)", () => {
    expect([...PROVISIONING_REASON_CODES]).toEqual([
      "WORKSPACE_CREATE_FAILED", "CLONE_FAILED", "CHECKOUT_FAILED",
      "INITIAL_CHECKPOINT_FAILED", "DB_ERROR",
    ]);
  });
  it("task phase (§13)", () => {
    expect([...TASK_PHASES]).toEqual([
      "UNVERIFIED", "IMPLEMENTED", "TESTED", "FAILED", "VERIFIED", "RELEASED",
    ]);
  });
  it("agent run status (§14) and its terminal result subset (§16)", () => {
    expect([...AGENT_RUN_STATUSES]).toEqual([
      "QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "TIMED_OUT", "CANCELLED",
    ]);
    expect([...AGENT_RUN_RESULT_STATUSES]).toEqual([
      "SUCCEEDED", "FAILED", "TIMED_OUT", "CANCELLED",
    ]);
  });
  it("agent roles", () => {
    expect([...AGENT_ROLES]).toEqual([
      "Planner", "Developer", "Tester", "Fixer", "VerificationRunner", "CodeReviewer",
    ]);
  });
  it("operation class / type (§5, §6, M-04)", () => {
    expect([...OPERATION_CLASSES]).toEqual(["DEV", "DEV_TEST", "VERIFICATION", "SYSTEM"]);
    expect([...OPERATION_TYPES]).toEqual(["run_command", "read_file", "write_file", "list_files"]);
  });
  it("execution status (§5, M-05)", () => {
    expect([...EXECUTION_STATUSES]).toEqual(["success", "timeout", "killed", "error"]);
  });
  it("verification stage (§6) and evidence type/result/status (§9)", () => {
    expect([...VERIFICATION_STAGES]).toEqual([
      "STATIC_ANALYSIS", "BUILD", "UNIT_TEST", "INTEGRATION_TEST",
      "E2E_TEST", "SECURITY_SCAN", "REGRESSION",
    ]);
    expect([...EVIDENCE_TYPES]).toEqual([
      "build", "lint", "typecheck", "unit_test", "integration_test",
      "e2e_test", "security_scan", "regression", "manual_review",
    ]);
    expect([...EVIDENCE_RESULTS]).toEqual(["pass", "fail", "error", "inconclusive"]);
    expect([...EVIDENCE_STATUSES]).toEqual(["ACTIVE", "STALE"]);
  });
  it("budget scope (M-07) and other plan-named DB enums (M-02, M-08)", () => {
    expect([...BUDGET_SCOPES]).toEqual(["task", "provider", "daily"]);
    expect([...WORKSPACE_STATUSES]).toEqual(["PROVISIONED", "ACTIVE", "FINALIZING", "DESTROYED"]);
    expect([...CHECKPOINT_STATUSES]).toEqual(["PENDING", "CONFIRMED", "FAILED"]);
    expect([...KNOWLEDGE_ENTRY_STATUSES]).toEqual(["ACTIVE", "STALE"]);
    expect([...FINDING_STATUSES]).toEqual(["open", "resolved"]);
  });
});

describe("schemas are derived from the arrays (one source)", () => {
  const pairs: [string, readonly string[], { options: readonly string[] }][] = [
    ["task_state", TASK_STATES, TaskStateSchema],
    ["task_phase", TASK_PHASES, TaskPhaseSchema],
    ["agent_run_status", AGENT_RUN_STATUSES, AgentRunStatusSchema],
    ["agent_run_result_status", AGENT_RUN_RESULT_STATUSES, AgentRunResultStatusSchema],
    ["agent_role", AGENT_ROLES, AgentRoleSchema],
    ["operation_class", OPERATION_CLASSES, OperationClassSchema],
    ["operation_type", OPERATION_TYPES, OperationTypeSchema],
    ["execution_status", EXECUTION_STATUSES, ExecutionStatusSchema],
    ["verification_stage", VERIFICATION_STAGES, VerificationStageSchema],
    ["evidence_type", EVIDENCE_TYPES, EvidenceTypeSchema],
    ["evidence_result", EVIDENCE_RESULTS, EvidenceResultSchema],
    ["evidence_status", EVIDENCE_STATUSES, EvidenceStatusSchema],
    ["budget_scope", BUDGET_SCOPES, BudgetScopeSchema],
    ["provisioning_reason_code", PROVISIONING_REASON_CODES, ProvisioningReasonCodeSchema],
  ];
  for (const [name, values, schema] of pairs) {
    it(`${name}: schema options equal the array; values are unique`, () => {
      expect([...schema.options]).toEqual([...values]);
      expect(new Set(values).size).toBe(values.length);
    });
  }
});

describe("enum parsing is exact (case-sensitive, no coercion)", () => {
  it("rejects wrong case and unknown values", () => {
    expect(TaskStateSchema.safeParse("pending").success).toBe(false);
    expect(TaskStateSchema.safeParse("UNKNOWN").success).toBe(false);
    expect(EvidenceResultSchema.safeParse("PASS").success).toBe(false);
    expect(EvidenceStatusSchema.safeParse("active").success).toBe(false);
    expect(ExecutionStatusSchema.safeParse("SUCCESS").success).toBe(false);
    expect(TaskPhaseSchema.safeParse(1).success).toBe(false);
  });
  it("an AgentRunResult cannot report a lifecycle state", () => {
    expect(AgentRunResultStatusSchema.safeParse("QUEUED").success).toBe(false);
    expect(AgentRunResultStatusSchema.safeParse("RUNNING").success).toBe(false);
    expect(AgentRunResultStatusSchema.safeParse("SUCCEEDED").success).toBe(true);
  });
});

describe("ENUM_REGISTRY", () => {
  it("lists exactly the DB-backed enums, by identity with the exported arrays", () => {
    expect(Object.keys(ENUM_REGISTRY).sort()).toEqual([
      "agent_run_status", "budget_scope", "checkpoint_status", "evidence_result",
      "evidence_status", "evidence_type", "execution_status", "finding_status",
      "knowledge_entry_status", "operation_class", "task_phase", "task_state",
      "verification_stage", "workspace_status",
    ]);
    expect(ENUM_REGISTRY.task_state).toBe(TASK_STATES);
    expect(ENUM_REGISTRY.task_phase).toBe(TASK_PHASES);
    expect(ENUM_REGISTRY.evidence_result).toBe(EVIDENCE_RESULTS);
    expect(ENUM_REGISTRY.verification_stage).toBe(VERIFICATION_STAGES);
  });
});

describe("compile-time: the inferred types are the literal unions, not string", () => {
  it("TaskState rejects a non-member at compile time", () => {
    const ok: TaskState = "RUNNING";
    // @ts-expect-error "pending" is not a TaskState (case-sensitive literal union)
    const bad: TaskState = "pending";
    expect([ok, bad]).toHaveLength(2);
  });
});
