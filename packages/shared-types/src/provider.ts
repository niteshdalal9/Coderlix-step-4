/**
 * Normalized provider contract (Final Architecture §18, §19).
 *
 * The single surface every provider adapter presents to the Gateway, so
 * nothing outside the Gateway/adapters branches on a provider. Types only;
 * adapters, routing, retry and timeouts are later steps.
 *
 * Modelling decisions where §19 is under-specified:
 *  - The system prompt is its own field, so `messages` carries only
 *    user / assistant / tool turns (no way to inject a second system turn).
 *  - The model id is NOT part of GenerationRequest (§19 lists none); the
 *    Gateway resolves (provider, model) from the capability alias and
 *    passes the model to the adapter call.
 *  - Time values are milliseconds (`retry_after`).
 *  - `GenerationResult.validated` is true only when a response schema was
 *    requested and the content passed validation against it.
 *  - Capability aliases are configuration (§18: "resolved from
 *    configuration only"), so they are validated by format
 *    (`planning.fast`, `coding.standard`, ...), not as a closed enum.
 *  - `ModelProvider` (§18 registry/config record) is deliberately not
 *    defined here: its pricing / rate-limit / health members are not
 *    specified. It belongs with provider configuration (Step 22).
 */
import { z } from "zod";
import { SafeNonNegativeIntSchema, SafePositiveIntSchema, hasUniqueItems } from "./common.js";

/** e.g. "planning.fast", "coding.standard", "security.advanced". */
export const CapabilityAliasSchema = z
  .string()
  .regex(
    /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$/,
    "capability alias must be dot-separated lowercase segments",
  );
export type CapabilityAlias = z.infer<typeof CapabilityAliasSchema>;

/** JSON Schema document (object form). Opaque to this package. */
export const JsonSchemaObjectSchema = z.record(z.string(), z.unknown());
export type JsonSchemaObject = z.infer<typeof JsonSchemaObjectSchema>;

/** Normalized tool call (§19): name, parsed argument object, call id. */
export const ToolCallSchema = z
  .object({
    name: z.string().min(1),
    arguments: z.record(z.string(), z.unknown()),
    call_id: z.string().min(1),
  })
  .strict();
export type ToolCall = z.infer<typeof ToolCallSchema>;

/** Tool/function definition. Name charset is the intersection providers accept. */
export const ToolDefinitionSchema = z
  .object({
    name: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "tool name must match [A-Za-z0-9_-]{1,64}"),
    description: z.string(),
    parameters: JsonSchemaObjectSchema,
  })
  .strict();
export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;

export const MessageSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("user"), content: z.string() }).strict(),
  z
    .object({
      role: z.literal("assistant"),
      content: z.string(),
      tool_calls: z.array(ToolCallSchema),
    })
    .strict(),
  z
    .object({
      role: z.literal("tool"),
      call_id: z.string().min(1),
      content: z.string(),
    })
    .strict(),
]);
export type Message = z.infer<typeof MessageSchema>;

/** Sampling params: supported-or-ignored by each adapter (§19). */
export const SamplingParamsSchema = z
  .object({
    temperature: z.number().finite().min(0).max(2).optional(),
    top_p: z.number().finite().min(0).max(1).optional(),
    seed: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
  })
  .strict();
export type SamplingParams = z.infer<typeof SamplingParamsSchema>;

export const GenerationRequestSchema = z
  .object({
    messages: z.array(MessageSchema).min(1),
    system_prompt: z.string().nullable(),
    tools: z.array(ToolDefinitionSchema),
    /** Non-null when structured output is requested. */
    response_schema: JsonSchemaObjectSchema.nullable(),
    max_tokens: SafePositiveIntSchema,
    sampling: SamplingParamsSchema,
    stream: z.boolean(),
  })
  .strict()
  .refine((r) => hasUniqueItems(r.tools.map((t) => t.name)), {
    message: "tool names must be unique",
    path: ["tools"],
  });
export type GenerationRequest = z.infer<typeof GenerationRequestSchema>;

/** Normalized usage (§19). `estimated` is true when counts are not provider-exact. */
export const TokenUsageSchema = z
  .object({
    prompt_tokens: SafeNonNegativeIntSchema,
    completion_tokens: SafeNonNegativeIntSchema,
    total_tokens: SafeNonNegativeIntSchema,
    estimated: z.boolean(),
  })
  .strict();
export type TokenUsage = z.infer<typeof TokenUsageSchema>;

export const GenerationResultSchema = z
  .object({
    content: z.string(),
    tool_calls: z.array(ToolCallSchema),
    validated: z.boolean(),
    usage: TokenUsageSchema,
  })
  .strict();
export type GenerationResult = z.infer<typeof GenerationResultSchema>;

/** Fixed error taxonomy (§19). Every provider status maps to exactly one. */
export const PROVIDER_ERROR_CODES = [
  "RATE_LIMITED",
  "TIMEOUT",
  "INVALID_REQUEST",
  "PROVIDER_UNAVAILABLE",
  "CONTENT_FILTERED",
  "UNKNOWN",
] as const;
export const ProviderErrorCodeSchema = z.enum(PROVIDER_ERROR_CODES);
export type ProviderErrorCode = z.infer<typeof ProviderErrorCodeSchema>;

export const ProviderErrorSchema = z
  .object({
    code: ProviderErrorCodeSchema,
    message: z.string(),
    /** Milliseconds, when the provider says; null otherwise. */
    retry_after: SafeNonNegativeIntSchema.nullable(),
  })
  .strict();
export type ProviderError = z.infer<typeof ProviderErrorSchema>;

/** Normalized stream events (§19): token | tool_call_delta | done | error. */
export const STREAM_EVENT_TYPES = ["token", "tool_call_delta", "done", "error"] as const;

export const StreamEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("token"), text: z.string() }).strict(),
  z
    .object({
      type: z.literal("tool_call_delta"),
      call_id: z.string().min(1),
      name: z.string().min(1).nullable(),
      arguments_delta: z.string(),
    })
    .strict(),
  z.object({ type: z.literal("done"), result: GenerationResultSchema }).strict(),
  z.object({ type: z.literal("error"), error: ProviderErrorSchema }).strict(),
]);
export type StreamEvent = z.infer<typeof StreamEventSchema>;
