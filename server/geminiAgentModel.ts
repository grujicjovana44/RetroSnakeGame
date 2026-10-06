import {
  FunctionCallingConfigMode,
  GoogleGenAI,
  ThinkingLevel,
  type Fetch,
} from "@google/genai";
import { parseGeminiModelChain, parseRetryAfterMs } from "./provider";
import { PRACTICE_EVIDENCE_FIELDS } from "./agentContracts";
import {
  AgentModelError,
  type AgentModel,
  type AgentModelStepRequest,
} from "./agentModel";

const TOOL_NAME = "evaluate_practice_goal";
const MAX_OUTPUT_TOKENS = 2_048;
function systemInstructionFor(request: AgentModelStepRequest): string {
  const common = [
    "Create a bounded practice plan from the supplied goal, session facts, candidate range, and evaluator results.",
    "The selected goal is fixed. Do not invent measurements or include session identifiers.",
    "Write summary and recommendation in Serbian Latin script, each no longer than 500 characters.",
    "Each finding must be one short Serbian Latin sentence of at most 300 characters explaining what its evidence value means.",
    "For a final decision, goal must equal the selected goal and targetValue must exactly equal the latest evaluated target.",
    "Copy up to five evidence source, field, and value entries from the latest evaluation; source is evaluate_practice_goal.",
  ];

  if (request.stepNumber === 1) {
    return [...common,
      "Step 1: call evaluate_practice_goal with one candidate inside candidateRange and higher than the sessionFacts value for the selected goal, using only goal and targetValue. Prefer a modest, incremental improvement rather than a target near the upper end of candidateRange. Do not return a final decision.",
      "Do not classify or self-rate the candidate; only the evaluator supplies a rating.",
    ].join(" ");
  }
  if (request.stepNumber === 2) {
    return [...common,
      "For a final decision, completed may be true only when the latest evaluator rating is realistic. Otherwise completed must be false and confidence must be low or medium.",
      "Step 2: return a final decision or refusal, or make at most one revision by calling evaluate_practice_goal with a different targetValue inside candidateRange, if that tool is available.",
      "If no tool is available, return only a final decision or refusal.",
    ].join(" ");
  }
  return [...common,
    "For a final decision, completed may be true only when the latest evaluator rating is realistic. Otherwise completed must be false and confidence must be low or medium.",
    "Step 3: return only a final decision or refusal. Do not call a tool.",
  ].join(" ");
}

const DECISION_RESPONSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["final", "refusal"] },
    plan: {
      type: "object",
      properties: {
        goal: { type: "string", enum: ["survive_longer", "collect_more_food"] },
        targetValue: { type: "integer", minimum: 0, maximum: 86_400 },
        summary: { type: "string", maxLength: 500 },
        recommendation: { type: "string", maxLength: 500 },
        evidence: {
          type: "array",
          maxItems: 5,
          items: {
            type: "object",
            properties: {
              source: { type: "string", enum: [TOOL_NAME] },
              field: { type: "string", enum: [...PRACTICE_EVIDENCE_FIELDS] },
              value: { description: "A scalar value copied from the latest evaluator result." },
              finding: { type: "string", maxLength: 300 },
            },
            required: ["source", "field", "value", "finding"],
          },
        },
        confidence: { type: "string", enum: ["low", "medium", "high"] },
        completed: { type: "boolean" },
      },
      required: [
        "goal",
        "targetValue",
        "summary",
        "recommendation",
        "evidence",
        "confidence",
        "completed",
      ],
    },
    reasonCode: { type: "string", enum: ["insufficient_evidence"] },
  },
  required: ["kind"],
} as const;

export type GeminiAgentModelOptions = {
  apiKey: string;
  modelName: string;
  fetchImplementation?: Fetch;
};

export class GeminiAgentModel implements AgentModel {
  private readonly apiKey: string;
  private readonly fetchImplementation: Fetch;
  private readonly modelName: string;

  public constructor(options: GeminiAgentModelOptions) {
    this.apiKey = options.apiKey;
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.modelName = options.modelName.replace(/^models\//, "");
    const allowedModels = parseGeminiModelChain(this.modelName);
    if (allowedModels.length !== 1 || allowedModels[0] !== this.modelName) {
      throw new Error("Gemini agent model must be one model from the backend allowlist.");
    }

  }

  public async requestDecision(
    request: AgentModelStepRequest,
    signal: AbortSignal,
  ): Promise<unknown> {
    if (signal.aborted) {
      throw new AgentModelError("provider_timeout");
    }
    let providerStatus: number | undefined;
    let retryAfterMs: number | undefined;
    const ai = new GoogleGenAI({
      apiKey: this.apiKey,
      httpOptions: {
        retryOptions: { attempts: 1, httpStatusCodes: [] },
        fetch: async (input, init) => {
          const response = await this.fetchImplementation(input, init);
          providerStatus = response.ok ? undefined : response.status;
          retryAfterMs = response.status === 429
            ? parseRetryAfterMs(response.headers.get("retry-after"))
            : undefined;
          return response;
        },
      },
    });

    try {
      const stepOne = request.stepNumber === 1;
      const allowRevisionTool = request.stepNumber === 2 &&
        request.priorEvaluations[request.priorEvaluations.length - 1]?.rating !== "realistic";
      const toolIsAvailable = stepOne || allowRevisionTool;
      const config = {
        abortSignal: signal,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        systemInstruction: systemInstructionFor(request),
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        ...(!stepOne ? {
          responseMimeType: "application/json",
          responseJsonSchema: DECISION_RESPONSE_JSON_SCHEMA,
        } : {}),
        ...(toolIsAvailable ? {
          tools: [{ functionDeclarations: [PRACTICE_TOOL_DECLARATION] }],
          toolConfig: {
            functionCallingConfig: stepOne
              ? {
                  mode: FunctionCallingConfigMode.ANY,
                  allowedFunctionNames: [TOOL_NAME],
                }
              : { mode: FunctionCallingConfigMode.AUTO },
          },
        } : {}),
      };
      const response = await ai.models.generateContent({
        model: this.modelName,
        contents: [{
          role: "user",
          parts: [{ text: JSON.stringify(request) }],
        }],
        config,
      });

      const functionCalls = response.functionCalls ?? [];
      if (functionCalls.length === 1) {
        const functionCall = functionCalls[0];
        return {
          kind: "tool_request",
          toolName: functionCall.name,
          arguments: functionCall.args,
        };
      }
      if (functionCalls.length > 1) {
        return { kind: "malformed_multiple_tool_calls" };
      }

      const text = response.text?.trim();
      if (!text) {
        const finishReason = response.candidates?.[0]?.finishReason;
        return finishReason === "SAFETY"
          ? { kind: "refusal", reasonCode: "insufficient_evidence" }
          : { kind: "malformed_model_output" };
      }

      try {
        return JSON.parse(stripMarkdownJsonFence(text)) as unknown;
      } catch {
        return text;
      }
    } catch (error) {
      throw this.mapProviderError(error, signal, providerStatus, retryAfterMs);
    }
  }

  private mapProviderError(
    error: unknown,
    signal: AbortSignal,
    providerStatus: number | undefined,
    retryAfterMs: number | undefined,
  ): AgentModelError {
    if (signal.aborted || isAbortError(error)) {
      return new AgentModelError("provider_timeout");
    }

    const status = providerStatus ?? getErrorStatus(error);
    if (status === 429) {
      return new AgentModelError("rate_limit", { retryAfterMs, httpStatus: status });
    }
    if (status === 408) {
      return new AgentModelError("provider_timeout", { httpStatus: status });
    }
    if (status === 401 || status === 403) {
      return new AgentModelError("provider_auth_or_quota", { httpStatus: status });
    }
    if (status !== undefined && status >= 500) {
      return new AgentModelError("provider_unavailable", { httpStatus: status });
    }
    if (status === undefined && isNetworkError(error)) {
      return new AgentModelError("provider_unavailable");
    }
    return new AgentModelError("provider_error", { httpStatus: status });
  }
}

const PRACTICE_TOOL_DECLARATION = {
  name: TOOL_NAME,
  description: "Evaluate one numeric candidate for the selected practice goal.",
  parametersJsonSchema: {
    type: "object",
    properties: {
      goal: {
        type: "string",
        enum: ["survive_longer", "collect_more_food"],
      },
      targetValue: { type: "integer", minimum: 0, maximum: 86_400 },
    },
    required: ["goal", "targetValue"],
  },
} as const;

function stripMarkdownJsonFence(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fenced?.[1]?.trim() ?? trimmed;
}

function getErrorStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return undefined;
  }
  const status = error.status;
  return typeof status === "number" ? status : undefined;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError ||
    (error instanceof Error && /network|fetch|socket/i.test(error.message));
}
