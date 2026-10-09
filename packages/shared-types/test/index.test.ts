import { describe, expect, it } from "vitest";
import * as api from "../src/index.js";

describe("barrel exports every required contract", () => {
  const required = [
    "OperationRequestSchema", "ExecutionRecordSchema", "VerificationAuthorizationSchema",
    "EvidenceSchema", "AgentRunRequestSchema", "AgentRunResultSchema",
    "GenerationRequestSchema", "GenerationResultSchema", "TokenUsageSchema", "ToolCallSchema",
    "StreamEventSchema", "ProviderErrorSchema", "BudgetSchema", "BudgetReservationSchema",
    "TaskStateSchema", "TaskPhaseSchema", "AgentRunStatusSchema", "EvidenceResultSchema",
    "ENUM_REGISTRY", "ENVELOPE_SCHEMA_VERSION", "EVIDENCE_SCHEMA_VERSION", "PACKAGE_NAME",
  ];
  for (const name of required) {
    it(`exports ${name}`, () => {
      expect((api as Record<string, unknown>)[name]).toBeDefined();
    });
  }
});
