import dotenv from "dotenv";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createSession, requestAdvice, type SessionStore } from "./service";
import { GeminiAdviceProvider } from "./provider";
import { type UsageLog } from "./usage";

dotenv.config({ path: new URL(".env", import.meta.url) });

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? "127.0.0.1";
const MAX_BODY_BYTES = 16 * 1024;
const sessions: SessionStore = new Map();
const usageLog: UsageLog = [];
const MODEL_NAME = "gemini-2.5-flash";
const provider = process.env.GEMINI_API_KEY
  ? new GeminiAdviceProvider(process.env.GEMINI_API_KEY, MODEL_NAME)
  : null;

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.writeHead(statusCode);
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    totalBytes += chunk.byteLength;
    if (totalBytes > MAX_BODY_BYTES) {
      throw new Error("request-too-large");
    }
    chunks.push(chunk);
  }

  const body = new TextDecoder().decode(
    Uint8Array.from(chunks.flatMap((chunk) => [...chunk])),
  );
  return JSON.parse(body);
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method === "OPTIONS") {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method !== "POST") {
    sendJson(response, 405, { success: false, message: "Metod nije podrzan." });
    return;
  }

  try {
    const input = await readJson(request);
    if (request.url === "/api/game/session") {
      const result = createSession(input, sessions);
      sendJson(response, result.statusCode, result.body);
      return;
    }
    if (request.url === "/api/ai/advice") {
      if (!provider) {
        sendJson(response, 503, { success: false, message: "AI savet trenutno nije dostupan. Pokusajte ponovo kasnije." });
        return;
      }
      const result = await requestAdvice(input, {
        provider,
        sessions,
        usageLog,
        providerName: "gemini",
        modelName: MODEL_NAME,
      });
      const latestUsage = usageLog[usageLog.length - 1];
      if (latestUsage) {
        console.info("[ai.advice]", JSON.stringify(latestUsage));
      }
      sendJson(response, result.statusCode, result.body);
      return;
    }
    sendJson(response, 404, { success: false, message: "Ruta nije pronadjena." });
  } catch {
    sendJson(response, 400, { success: false, message: "Zahtev mora biti validan JSON." });
  }
}

createServer((request, response) => {
  void handleRequest(request, response);
}).listen(PORT, HOST, () => {
  console.log(`RetroSnake backend listening on http://${HOST}:${PORT}`);
});