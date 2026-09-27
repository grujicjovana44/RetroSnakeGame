import {
  FunctionCallingConfigMode,
  GoogleGenAI,
  type GenerateContentResponse,
} from "@google/genai";
import { parseAdviceResponse, type AdviceResponse, type GameSummary } from "./api";

export type StatsTool = (sessionId: string) => GameSummary | null;
export type ProviderPhase = "initial_tool_call" | "final_response";

export class GeminiProviderError extends Error {
  public constructor(
    message: string,
    public readonly phase: ProviderPhase,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "GeminiProviderError";
  }
}

export interface AdviceProvider {
  generateAdvice(sessionId: string, getStats: StatsTool): Promise<AdviceResponse>;
}

export type FakeProviderMode = "success" | "timeout" | "provider-error" | "malformed" | "mismatch";

export class FakeAdviceProvider implements AdviceProvider {
  public callCount = 0;

  public constructor(private readonly mode: FakeProviderMode = "success") {}

  public async generateAdvice(sessionId: string, getStats: StatsTool): Promise<AdviceResponse> {
    this.callCount += 1;

    if (this.mode === "timeout") {
      throw new Error("provider-timeout");
    }
    if (this.mode === "provider-error") {
      throw new Error("provider-unavailable");
    }

    const toolSessionId = this.mode === "mismatch" ? crypto.randomUUID() : sessionId;
    const stats = getStats(toolSessionId);
    if (!stats) {
      throw new Error("tool-session-mismatch");
    }

    if (this.mode === "malformed") {
      throw new Error("malformed-output");
    }

    return {
      summary: `Skor ${stats.score} uz ${stats.foodCollected} sakupljenih obroka.`,
      recommendation: "Planiraj sledeci pravac pre nego sto uzmes hranu.",
      category: "strategy",
    };
  }
}

const TOOL_NAME = "get_game_session_stats";

export class GeminiAdviceProvider implements AdviceProvider {
  private readonly ai: GoogleGenAI;
  private readonly modelName: string;

  public constructor(apiKey: string, modelName = "gemini-2.5-flash") {
    this.ai = new GoogleGenAI({ apiKey });
    this.modelName = modelName;
  }

  public async generateAdvice(sessionId: string, getStats: StatsTool): Promise<AdviceResponse> {
    let phase: ProviderPhase = "initial_tool_call";

    try {
      const chat = this.ai.chats.create({
        model: this.modelName,
        config: {
          tools: [
            {
              functionDeclarations: [
                {
                  name: TOOL_NAME,
                  description: "Vraca validirane statistike jedne zavrsene Snake partije.",
                  parametersJsonSchema: {
                    type: "object",
                    properties: {
                      sessionId: { type: "string" },
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
              allowedFunctionNames: [TOOL_NAME],
            },
          },
        },
      });

      const firstResult = await chat.sendMessage({
        message: `Analiziraj zavrsenu Snake partiju. Moras prvo pozvati alat ${TOOL_NAME} sa sessionId vrednoscu "${sessionId}". Posle toga vrati samo JSON objekat sa poljima summary, recommendation i category.`,
      });
      const toolCall = firstResult.functionCalls?.[0];

      if (!toolCall || toolCall.name !== TOOL_NAME) {
        throw new Error("missing-tool-call");
      }

      const requestedSessionId = getStringArgument(toolCall.args, "sessionId");
      if (requestedSessionId !== sessionId) {
        throw new Error("tool-session-mismatch");
      }

      const stats = getStats(requestedSessionId);
      if (!stats) {
        throw new Error("session-not-found");
      }

      phase = "final_response";
      const finalResult = await chat.sendMessage({
        message: [
          {
            functionResponse: {
              name: TOOL_NAME,
              response: stats,
            },
          },
        ],
      });
      return parseFinalAdvice(finalResult);
    } catch (error) {
      if (error instanceof GeminiProviderError) {
        throw error;
      }
      throw new GeminiProviderError(
        isTransientGeminiError(error) ? "provider-unavailable" : "provider-error",
        phase,
        getProviderStatus(error),
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

function parseFinalAdvice(result: GenerateContentResponse): AdviceResponse {
  const text = result.text ?? "";
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("malformed-output");
  }

  const advice = parseAdviceResponse(parsed);
  if (!advice) {
    throw new Error("malformed-output");
  }
  return advice;
}

function isTransientGeminiError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const status = getProviderStatus(error);
  return status === 429 || status !== undefined && status >= 500 ||
    /timeout|timed out|network|fetch failed|unavailable|overloaded/i.test(error.message);
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
