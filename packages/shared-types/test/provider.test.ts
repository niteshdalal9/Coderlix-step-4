import { describe, expect, it } from "vitest";
import {
  CapabilityAliasSchema, GenerationRequestSchema, GenerationResultSchema, PROVIDER_ERROR_CODES,
  ProviderErrorSchema, STREAM_EVENT_TYPES, StreamEventSchema, TokenUsageSchema, ToolCallSchema,
} from "../src/index.js";
import { accepts, generationRequest, generationResult, viaJson, without, withPatch } from "./fixtures.js";

describe("GenerationRequest", () => {
  const S = GenerationRequestSchema;
  it("round-trips (minimal and full)", () => {
    expect(S.parse(viaJson(generationRequest()))).toEqual(generationRequest());
    const full = withPatch(generationRequest(), {
      messages: [
        { role: "user", content: "hi" },
        { role: "assistant", content: "", tool_calls: [{ name: "read", arguments: { p: 1 }, call_id: "c1" }] },
        { role: "tool", call_id: "c1", content: "ok" },
      ],
      system_prompt: "be terse",
      tools: [{ name: "read_file", description: "d", parameters: { type: "object" } }],
      response_schema: { type: "object" },
      sampling: { temperature: 0, top_p: 1, seed: 7 },
      stream: true,
    });
    expect(S.parse(viaJson(full))).toEqual(full);
  });
  it("requires every field; rejects extras", () => {
    for (const k of Object.keys(generationRequest())) {
      expect(accepts(S, without(generationRequest(), k))).toBe(false);
    }
    expect(accepts(S, withPatch(generationRequest(), { model: "x" }))).toBe(false);
  });
  it("rejects empty messages, bad max_tokens, system-role messages", () => {
    expect(accepts(S, withPatch(generationRequest(), { messages: [] }))).toBe(false);
    for (const m of [0, -5, 1.5, "10"]) expect(accepts(S, withPatch(generationRequest(), { max_tokens: m }))).toBe(false);
    expect(accepts(S, withPatch(generationRequest(), { messages: [{ role: "system", content: "x" }] }))).toBe(false);
    expect(accepts(S, withPatch(generationRequest(), { messages: [{ role: "tool", content: "x" }] }))).toBe(false);
  });
  it("tool names: valid charset, unique", () => {
    const t = (name: string) => ({ name, description: "", parameters: {} });
    expect(accepts(S, withPatch(generationRequest(), { tools: [t("bad name")] }))).toBe(false);
    expect(accepts(S, withPatch(generationRequest(), { tools: [t("a"), t("a")] }))).toBe(false);
    expect(accepts(S, withPatch(generationRequest(), { tools: [t("a"), t("b")] }))).toBe(true);
  });
  it("sampling bounds", () => {
    for (const s of [{ temperature: 3 }, { temperature: -1 }, { top_p: 1.5 }, { seed: 1.2 }, { n: 2 }]) {
      expect(accepts(S, withPatch(generationRequest(), { sampling: s }))).toBe(false);
    }
  });
});

describe("normalized results / usage / tool calls", () => {
  it("GenerationResult round-trips and requires validated + usage", () => {
    expect(GenerationResultSchema.parse(viaJson(generationResult()))).toEqual(generationResult());
    expect(accepts(GenerationResultSchema, without(generationResult(), "validated"))).toBe(false);
    expect(accepts(GenerationResultSchema, without(generationResult(), "usage"))).toBe(false);
  });
  it("TokenUsage: non-negative integers, estimated flag required", () => {
    const u = { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2, estimated: true };
    expect(accepts(TokenUsageSchema, u)).toBe(true);
    expect(accepts(TokenUsageSchema, { ...u, prompt_tokens: -1 })).toBe(false);
    expect(accepts(TokenUsageSchema, { ...u, total_tokens: 1.5 })).toBe(false);
    expect(accepts(TokenUsageSchema, without(u, "estimated"))).toBe(false);
  });
  it("ToolCall: arguments must be an object, call_id non-empty", () => {
    const c = { name: "f", arguments: { a: 1 }, call_id: "c1" };
    expect(accepts(ToolCallSchema, c)).toBe(true);
    expect(accepts(ToolCallSchema, { ...c, arguments: "{\"a\":1}" })).toBe(false);
    expect(accepts(ToolCallSchema, { ...c, arguments: [1] })).toBe(false);
    expect(accepts(ToolCallSchema, { ...c, call_id: "" })).toBe(false);
  });
  it("CapabilityAlias format", () => {
    for (const a of ["planning.fast", "coding.standard", "reasoning.advanced", "security.advanced"]) {
      expect(accepts(CapabilityAliasSchema, a)).toBe(true);
    }
    for (const a of ["", "coding", "Coding.Standard", "coding..x", "coding.standard "]) {
      expect(accepts(CapabilityAliasSchema, a)).toBe(false);
    }
  });
});

describe("provider errors and stream events", () => {
  it("error taxonomy is fixed (§19)", () => {
    expect([...PROVIDER_ERROR_CODES]).toEqual([
      "RATE_LIMITED", "TIMEOUT", "INVALID_REQUEST", "PROVIDER_UNAVAILABLE", "CONTENT_FILTERED", "UNKNOWN",
    ]);
    expect(accepts(ProviderErrorSchema, { code: "HTTP_429", message: "x", retry_after: null })).toBe(false);
  });
  it("retry_after: non-negative integer or null, key required", () => {
    const e = { code: "RATE_LIMITED", message: "slow down", retry_after: 1500 };
    expect(accepts(ProviderErrorSchema, e)).toBe(true);
    expect(accepts(ProviderErrorSchema, { ...e, retry_after: null })).toBe(true);
    expect(accepts(ProviderErrorSchema, { ...e, retry_after: -1 })).toBe(false);
    expect(accepts(ProviderErrorSchema, without(e, "retry_after"))).toBe(false);
  });
  it("stream events: the four normalized types parse; others do not", () => {
    expect([...STREAM_EVENT_TYPES]).toEqual(["token", "tool_call_delta", "done", "error"]);
    const events = [
      { type: "token", text: "hi" },
      { type: "tool_call_delta", call_id: "c1", name: null, arguments_delta: "{\"a\"" },
      { type: "done", result: generationResult() },
      { type: "error", error: { code: "TIMEOUT", message: "t", retry_after: null } },
    ];
    for (const ev of events) expect(StreamEventSchema.parse(viaJson(ev))).toEqual(ev);
    expect(accepts(StreamEventSchema, { type: "message_start" })).toBe(false);
    expect(accepts(StreamEventSchema, { type: "token", text: "x", extra: 1 })).toBe(false);
    expect(accepts(StreamEventSchema, { type: "done", result: { content: "x" } })).toBe(false);
  });
});
