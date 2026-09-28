import {
  FunctionCallingConfigMode,
  GoogleGenAI,
  type GenerateContentResponse,
} from "@google/genai";
import { parseAdviceResponse, type AdviceResponse, type GameSummary } from "./api";
import type { TokenUsage } from "./usage";

export type StatsTool = (sessionId: string) => GameSummary | null;
export type ProviderPhase = "initial_tool_call" | "final_response";
export type TokenUsageRecorder = (usage: TokenUsage) => void;

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
  generateAdvice(
    sessionId: string,
    getStats: StatsTool,
    signal: AbortSignal,
    recordTokenUsage: TokenUsageRecorder,
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

export class GeminiAdviceProvider implements AdviceProvider {
  private readonly ai: GoogleGenAI;
  private readonly modelName: string;

  public constructor(apiKey: string, modelName = "gemini-3.8-flash") {
    this.ai = new GoogleGenAI({ apiKey });
    this.modelName = modelName.replace(/^models\//, "");
  }

  public async generateAdvice(
    sessionId: string,
    getStats: StatsTool,
    signal: AbortSignal,
    recordTokenUsage: TokenUsageRecorder,
  ): Promise<AdviceResponse> {
    let phase: ProviderPhase = "initial_tool_call";

    console.log(`\n==================================================`);
    console.log(`[GeminiProvider] POČETAK generisanja saveta`);
    console.log(`[GeminiProvider] Sesija ID: ${sessionId}`);
    console.log(`[GeminiProvider] Model koji se poziva: ${this.modelName}`);
    console.log(`==================================================`);

    try {
      const chat = this.ai.chats.create({
        model: this.modelName,
        config: {
          abortSignal: signal,
          systemInstruction:
            'Ti si AI analitičar za retro Snake igricu. Odgovaraš isključivo u validnom JSON formatu sa poljima "summary", "recommendation" i "category". Polje "category" mora biti tačno jedno od: "movement", "timing", "strategy", "general".',
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

      console.log(`[GeminiProvider] Šaljem početni zahtev za poziv alata...`);
      const firstResult = await chat.sendMessage({
        message: `Pozovi alat ${TOOL_NAME} sa parametrom sessionId="${sessionId}". Nakon što dobiješ podatke, izanaliziraj ih i vrati rezultat striktno u traženom JSON formatu.`,
      });
      recordResponseUsage(firstResult, recordTokenUsage);

      const candidate = firstResult.candidates?.[0];
      const parts = candidate?.content?.parts ?? [];
      const functionCallPart = parts.find((part) => "functionCall" in part);
      const toolCall = functionCallPart?.functionCall ?? firstResult.functionCalls?.[0];

      if (!toolCall || toolCall.name !== TOOL_NAME) {
        console.error(`[GeminiProvider GREŠKA] Model NIJE vratio očekivani poziv funkcije '${TOOL_NAME}'.`);
        console.error(`[GeminiProvider Sirovi Odgovor Modela]:\n`, JSON.stringify(firstResult, null, 2));
        throw new GeminiProviderError("missing-tool-call", phase);
      }

      console.log(`[GeminiProvider] Model je uspešno zatražio poziv alata:`, JSON.stringify(toolCall));

      const requestedSessionId = getStringArgument(toolCall.args, "sessionId");
      if (requestedSessionId !== sessionId) {
        console.error(`[GeminiProvider GREŠKA] Poklapanje sesije neuspešno! Traženo: ${requestedSessionId}, Očekivano: ${sessionId}`);
        throw new GeminiProviderError("tool-session-mismatch", phase);
      }

      const stats = getStats(requestedSessionId);
      if (!stats) {
        console.error(`[GeminiProvider GREŠKA] Statistika sesije nije pronađena u lokalu za ID: ${requestedSessionId}`);
        throw new GeminiProviderError("session-not-found", phase);
      }

      console.log(`[GeminiProvider] Sakupljena lokalna statistika:`, JSON.stringify(stats));
      phase = "final_response";

      console.log(`[GeminiProvider] Šaljem dobijenu statistiku nazad modelu za finalnu analizu...`);
      const finalResult = await chat.sendMessage({
        message: [
          {
            functionResponse: {
              name: TOOL_NAME,
              response: { output: stats },
            },
          },
        ],
      });
      recordResponseUsage(finalResult, recordTokenUsage);

      console.log(`[GeminiProvider] Primljen finalni odgovor od modela. Parsiram JSON...`);
      const parsedAdvice = parseFinalAdvice(finalResult);
      console.log(`[GeminiProvider USPEH] AI Savet je uspešno izgenerisan:`, JSON.stringify(parsedAdvice));
      return parsedAdvice;

    } catch (error) {
      console.error(`\n--------------------------------------------------`);
      console.error(`[GeminiProvider DETALJI GREŠKE u faza: ${phase}]`);
      if (error instanceof Error) {
        console.error(`Naziv greške: ${error.name}`);
        console.error(`Poruka greške: ${error.message}`);
        console.error(`HTTP / API Status Kod:`, getProviderStatus(error));
        console.error(`Stack trace:\n${error.stack}`);
      } else {
        console.error(`Nepoznati objekat greške:`, error);
      }
      console.error(`--------------------------------------------------\n`);

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
  const text = result.text ?? "";
  let parsed: unknown;

  try {
    const cleanedText = text.replace(/```json\s*|\s*```/g, "").trim();
    parsed = JSON.parse(cleanedText);
  } catch (jsonErr) {
    console.error(`[GeminiProvider GREŠKA] Neuspešno parsiranje JSON teksta od strane AI-ja.`);
    console.error(`[GeminiProvider Sirovi Tekst koji je AI poslao]:\n`, text);
    throw new GeminiProviderError("malformed-output", "final_response");
  }

  const advice = parseAdviceResponse(parsed);
  if (!advice) {
    console.error(`[GeminiProvider GREŠKA] Dobijeni JSON ne odgovara očekivanoj strukturi (AdviceResponse).`);
    console.error(`[GeminiProvider Dobijeni objekat]:`, parsed);
    throw new GeminiProviderError("malformed-output", "final_response");
  }
  return advice;
}

function isTransientGeminiError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const status = getProviderStatus(error);
  return (
    status === 429 ||
    status === 503 ||
    (status !== undefined && status >= 500) ||
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