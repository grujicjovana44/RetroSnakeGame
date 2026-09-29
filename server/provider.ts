import {
  FunctionCallingConfigMode,
  GoogleGenAI,
  type GenerateContentResponse,
} from "@google/genai";
import { parseAdviceResponse, type AdviceResponse, type GameSummary } from "./api";
import type { ProviderFailureReason, TokenUsage } from "./usage";

export type StatsTool = (sessionId: string) => GameSummary | null;
export type ProviderPhase = "initial_tool_call" | "final_response";
export type ProviderPhaseRecorder = (phase: ProviderPhase) => void;
export type TokenUsageRecorder = (usage: TokenUsage) => void;
export const DEFAULT_GEMINI_MODEL_CHAIN = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
] as const;

const GEMINI_MODEL_ORDER: ReadonlyMap<string, number> = new Map([
  ...DEFAULT_GEMINI_MODEL_CHAIN.map((model, index) => [model, index] as const),
  ["gemini-3.1-flash-lite", DEFAULT_GEMINI_MODEL_CHAIN.length],
]);

export function parseGeminiModelChain(value?: string): string[] {
  const models = value?.trim()
    ? value.split(",").map((model) => model.trim())
    : [...DEFAULT_GEMINI_MODEL_CHAIN];
  let previousIndex = -1;

  for (const model of models) {
    const index = GEMINI_MODEL_ORDER.get(model);
    if (index === undefined || index <= previousIndex) {
      throw new Error("GEMINI_MODEL_CHAIN contains an unsupported or out-of-order model.");
    }
    previousIndex = index;
  }

  if (models.length === 0) {
    throw new Error("GEMINI_MODEL_CHAIN must contain at least one supported model.");
  }
  return models;
}

export class GeminiProviderError extends Error {
  public constructor(
    message: string,
    public readonly phase: ProviderPhase,
    public readonly status?: number,
    public readonly failureReason?: ProviderFailureReason,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "GeminiProviderError";
  }
}

export interface AdviceProvider {
  generateAdvice(
    sessionId: string,
    getStats: StatsTool,
    signal: AbortSignal,
    recordTokenUsage: TokenUsageRecorder,
    recordPhase?: ProviderPhaseRecorder,
  ): Promise<unknown>;
}

export type FakeProviderMode =
  | "success"
  | "timeout"
  | "provider-error"
  | "transient-once"
  | "malformed"
  | "mismatch";

export class FakeAdviceProvider implements AdviceProvider {
  public callCount = 0;
  public abortCount = 0;

  public constructor(private readonly mode: FakeProviderMode = "success") {}

  public async generateAdvice(
    sessionId: string,
    getStats: StatsTool,
    signal: AbortSignal,
    recordTokenUsage: TokenUsageRecorder,
  ): Promise<unknown> {
    this.callCount += 1;

    if (this.mode === "timeout") {
      return new Promise<never>((_, reject) => {
        const onAbort = () => {
          this.abortCount += 1;
          reject(new GeminiProviderError("provider-timeout", "initial_tool_call"));
        };
        if (signal.aborted) {
          onAbort();
        } else {
          signal.addEventListener("abort", onAbort, { once: true });
        }
      });
    }
    if (this.mode === "provider-error" || (this.mode === "transient-once" && this.callCount === 1)) {
      throw new GeminiProviderError("provider-unavailable", "initial_tool_call", 503);
    }

    const toolSessionId = this.mode === "mismatch" ? crypto.randomUUID() : sessionId;
    const stats = getStats(toolSessionId);
    if (!stats) {
      throw new GeminiProviderError("tool-session-mismatch", "initial_tool_call");
    }

    if (this.mode === "malformed") {
      return { summary: "Valid summary", recommendation: "Valid recommendation", category: "unexpected" };
    }

    recordTokenUsage({ promptTokens: 20, outputTokens: 3, totalTokens: 23 });
    recordTokenUsage({ promptTokens: 35, outputTokens: 18, totalTokens: 53 });
    return {
      summary: `Skor ${stats.score} uz ${stats.foodCollected} sakupljenih obroka.`,
      recommendation: "Planiraj sledeci pravac pre nego sto uzmes hranu.",
      category: "strategy",
    };
  }
}

const TOOL_NAME = "get_game_session_stats";
const MAX_OUTPUT_TOKENS = 256;
const SYSTEM_INSTRUCTION =
  'Ti si AI analitičar za retro Snake igricu. Odgovaraš isključivo u validnom JSON formatu sa poljima "summary", "recommendation" i "category". Polje "category" mora biti tačno jedno od: "movement", "timing", "strategy", "general".';
const ADVICE_RESPONSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", minLength: 1, maxLength: 500 },
    recommendation: { type: "string", minLength: 1, maxLength: 500 },
    category: { type: "string", enum: ["movement", "timing", "strategy", "general"] },
  },
  required: ["summary", "recommendation", "category"],
  additionalProperties: false,
};

export class GeminiAdviceProvider implements AdviceProvider {
  private readonly ai: GoogleGenAI;
  private readonly modelName: string;
  private retryAfterMs?: number;

  public constructor(apiKey: string, modelName = "gemini-3.8-flash") {
    this.ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        retryOptions: { attempts: 1 },
        fetch: async (input, init) => {
          const response = await fetch(input, init);
          this.retryAfterMs = response.status === 429
            ? parseRetryAfterMs(response.headers.get("retry-after"))
            : undefined;
          return response;
        },
      },
    });
    this.modelName = modelName.replace(/^models\//, "");
  }

  public async generateAdvice(
    sessionId: string,
    getStats: StatsTool,
    signal: AbortSignal,
    recordTokenUsage: TokenUsageRecorder,
    recordPhase?: ProviderPhaseRecorder,
  ): Promise<AdviceResponse> {
    let phase: ProviderPhase = "initial_tool_call";
    recordPhase?.(phase);
    this.retryAfterMs = undefined;

    try {
      const chat = this.ai.chats.create({
        model: this.modelName,
        config: {
          abortSignal: signal,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          systemInstruction: SYSTEM_INSTRUCTION,
          tools: [
            {
              functionDeclarations: [
                {
                  name: TOOL_NAME,
                  description: "Vraća validirane statistike jedne završene Snake partije.",
                  parametersJsonSchema: {
                    type: "object",
                    properties: {
                      sessionId: { 
                        type: "string",
                        description: "Jedinstveni ID igračke sesije." 
                      },
                    },
                    required: ["sessionId"],
                  },
                },
              ],
            },
          ],
          toolConfig: {
            functionCallingConfig: {
              mode: FunctionCallingConfigMode.AUTO,
            },
          },
        },
      });

      const firstResult = await chat.sendMessage({
        message: `Pozovi alat ${TOOL_NAME} sa parametrom sessionId="${sessionId}". Nakon što dobiješ podatke, izanaliziraj ih i vrati rezultat striktno u traženom JSON formatu.`,
      });
      recordResponseUsage(firstResult, recordTokenUsage);

      const candidate = firstResult.candidates?.[0];
      const parts = candidate?.content?.parts ?? [];
      const functionCallPart = parts.find((part) => "functionCall" in part);
      const toolCall = functionCallPart?.functionCall ?? firstResult.functionCalls?.[0];

      if (!toolCall || toolCall.name !== TOOL_NAME) {
        throw new GeminiProviderError("missing-tool-call", phase);
      }

      const requestedSessionId = getStringArgument(toolCall.args, "sessionId");
      if (requestedSessionId !== sessionId) {
        throw new GeminiProviderError("tool-session-mismatch", phase);
      }

      const stats = getStats(requestedSessionId);
      if (!stats) {
        throw new GeminiProviderError("session-not-found", phase);
      }

      phase = "final_response";
      recordPhase?.(phase);

      const finalResult = await chat.sendMessage({
        message: [
          {
            functionResponse: {
              name: TOOL_NAME,
              response: { output: stats },
            },
          },
        ],
        config: {
          abortSignal: signal,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          responseJsonSchema: ADVICE_RESPONSE_JSON_SCHEMA,
        },
      });
      recordResponseUsage(finalResult, recordTokenUsage);

      return parseFinalAdvice(finalResult);
    } catch (error) {
      if (error instanceof GeminiProviderError) {
        throw error;
      }
      throw new GeminiProviderError(
        isTransientGeminiError(error) ? "provider-unavailable" : "provider-error",
        phase,
        getProviderStatus(error),
        undefined,
        this.retryAfterMs,
      );
    }
  }
}

function getStringArgument(args: object | undefined, key: string): string | null {
  if (!args) {
    return null;
  }

  const value = (args as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function recordResponseUsage(
  response: GenerateContentResponse,
  recordTokenUsage: TokenUsageRecorder,
): void {
  const metadata = response.usageMetadata;
  if (!metadata) {
    return;
  }

  const usage: TokenUsage = {
    promptTokens: metadata.promptTokenCount,
    outputTokens: metadata.candidatesTokenCount,
    totalTokens: metadata.totalTokenCount,
  };
  if (Object.values(usage).some((value) => typeof value === "number")) {
    recordTokenUsage(usage);
  }
}

function parseFinalAdvice(result: GenerateContentResponse): AdviceResponse {
  return parseFinalAdviceText(result.text ?? "");
}

export function parseFinalAdviceText(text: string): AdviceResponse {
  if (!text.trim()) {
    throw new GeminiProviderError("malformed-output", "final_response", undefined, "empty-output");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.trim());
  } catch {
    throw new GeminiProviderError("malformed-output", "final_response", undefined, "invalid-json");
  }

  const advice = parseAdviceResponse(parsed);
  if (!advice) {
    throw new GeminiProviderError("malformed-output", "final_response", undefined, "schema-mismatch");
  }
  return advice;
}

export function parseRetryAfterMs(value: string | null, nowMs = Date.now()): number | undefined {
  if (!value?.trim()) {
    return undefined;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds * 1_000);
  }

  const retryAt = Date.parse(value);
  return Number.isFinite(retryAt) ? Math.max(0, retryAt - nowMs) : undefined;
}

function isTransientGeminiError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const status = getProviderStatus(error);
  if (status !== undefined) {
    return status === 429 || status >= 500 || status === 408;
  }
  return (
    /timeout|timed out|network|fetch failed|unavailable|overloaded/i.test(error.message)
  );
}

function getProviderStatus(error: unknown): number | undefined {
  if (!(error instanceof Error)) {
    return undefined;
  }

  const providerError = error as Error & {
    status?: number;
    response?: { status?: number };
  };
  return providerError.status ?? providerError.response?.status;
}