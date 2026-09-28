import type { IncomingMessage, ServerResponse } from "node:http";

const DEFAULT_FRONTEND_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

export function parseAllowedOrigins(value: string | undefined): Set<string> {
  const origins = value?.split(",").map((origin) => origin.trim()).filter(Boolean);
  return new Set(origins?.length ? origins : DEFAULT_FRONTEND_ORIGINS);
}

export function isAllowedOrigin(origin: string | undefined, allowedOrigins: Set<string>): boolean {
  return !origin || allowedOrigins.has(origin);
}

export function applyCorsHeaders(
  request: IncomingMessage,
  response: ServerResponse,
  allowedOrigins: Set<string>,
): boolean {
  const origin = request.headers.origin;
  if (!isAllowedOrigin(origin, allowedOrigins)) {
    return false;
  }
  if (!origin) return true;

  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Vary", "Origin");
  return true;
}

export function createRateLimiter(
  maxRequests: number,
  windowMs: number,
  now: () => number = Date.now,
): (key: string) => boolean {
  const requestsByKey = new Map<string, number[]>();

  return (key) => {
    const timestamp = now();
    const recentRequests = (requestsByKey.get(key) ?? [])
      .filter((requestTime) => timestamp - requestTime < windowMs);
    if (recentRequests.length >= maxRequests) {
      requestsByKey.set(key, recentRequests);
      return false;
    }

    recentRequests.push(timestamp);
    requestsByKey.set(key, recentRequests);
    if (requestsByKey.size > 1_000) {
      const oldestKey = requestsByKey.keys().next().value;
      if (oldestKey) requestsByKey.delete(oldestKey);
    }
    return true;
  };
}