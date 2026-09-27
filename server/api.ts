import { z } from "zod";

export const gameSummarySchema = z.object({
  score: z.number().int().min(0).max(1_000_000),
  durationSeconds: z.number().finite().min(0).max(86_400),
  collisions: z.number().int().min(0).max(10_000),
  foodCollected: z.number().int().min(0).max(10_000),
});

export const adviceResponseSchema = z.object({
  summary: z.string().min(1).max(500),
  recommendation: z.string().min(1).max(500),
  category: z.enum(["movement", "timing", "strategy", "general"]),
});

export const adviceRequestSchema = z.object({
  sessionId: z.string().uuid(),
});

export type GameSummary = z.infer<typeof gameSummarySchema>;
export type AdviceResponse = z.infer<typeof adviceResponseSchema>;
export type AdviceApiResponse =
  | { success: true; advice: AdviceResponse }
  | { success: false; message: string };

export const SAFE_ERROR_MESSAGE =
  "AI savet trenutno nije dostupan. Pokusajte ponovo kasnije.";

export function parseGameSummary(input: unknown): GameSummary | null {
  const result = gameSummarySchema.safeParse(input);
  return result.success ? result.data : null;
}

export function parseAdviceRequest(input: unknown): { sessionId: string } | null {
  const result = adviceRequestSchema.safeParse(input);
  return result.success ? result.data : null;
}

export function parseAdviceResponse(input: unknown): AdviceResponse | null {
  const result = adviceResponseSchema.safeParse(input);
  return result.success ? result.data : null;
}