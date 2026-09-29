# W04 Implementation Plan - Reliable AI Advice and Private Usage Report

## Status

Approved for implementation on 2026-09-27. `docs/AI_FEATURE_SPEC.md` is the
feature specification and `docs/AI_PROVIDER_CONTRACT.md` is the provider
contract. `docs/GAME_SPEC.md` remains authoritative for W03 gameplay behavior.

Status update — 2026-09-29: the default fallback chain remains
`gemini-3.8-flash` → `gemini-3.7-flash` → `gemini-3.6-flash` →
`gemini-3.5-flash`. `gemini-3.1-flash-lite` is now an explicitly allowed
single-model selection. The local usage history records five successful live
two-step Advice requests and three timeouts for that model; live availability
of the other chain members and live fallback are still unverified. The official
pricing page lists free-tier input/output for 3.1 Flash Lite, but the account's
actual billing tier and quota have not been checked. Gemma is not implemented;
the accepted live checks used Gemini.

## Scope

Harden the existing post-game AI Advice flow and write a private local report
for backend-recorded provider token usage. Use the backend-only Gemini order
`gemini-3.8-flash` → `gemini-3.7-flash` → `gemini-3.6-flash` →
`gemini-3.5-flash` → `gemini-3.1-flash-lite`; the first four remain the
default chain, while 3.1 Flash Lite is an explicitly selectable candidate.
Retain the read-only game-stats tool, existing TypeScript stack, and
fake-provider approach. Do not add dependencies. A live model is verified
only when the exact two-step flow succeeds; that gate has passed five times
for `gemini-3.1-flash-lite`, alongside three timeout results, not for the full
chain.

## Decisions and constraints

- AI Advice is user-triggered only after game over, never in the game loop.
- The provider key stays in backend environment configuration.
- The full advice flow has a 15-second deadline and at most two attempts per
  model, executed sequentially.
- Transient failures may retry once within the remaining deadline. 429 retries
  on the same model only; fallback is reserved for 408/500/502/503, timeout,
  and network failures. Auth, invalid request, quota, policy, malformed output,
  and tool/session errors do not trigger fallback.
- Model selection comes only from the fixed ordered server allowlist. Output
  budget is 256 tokens per Gemini response.
- The SDK abort signal is propagated when the deadline expires or all HTTP
  clients for a shared in-flight request disconnect. One disconnected waiter
  does not cancel work still awaited by another client. Client-side abort may
  not prevent provider billing after a request has reached the service.
- Provider output must be one complete JSON object; code fences and
  surrounding prose are malformed output.
- The backend allows only the configured local frontend origins and bounds
  in-memory sessions and usage history.
- Usage values are aggregated into a Git-ignored local file, not shown in the
  game UI or exposed through an HTTP endpoint; session IDs and provider content
  are excluded.
- Console telemetry contains only model, attempt kind, phase, status, provider
  status, latency, fallback flag, and token metadata; no raw content or stack.
- Token totals include both Gemini responses when usage metadata is returned;
  unavailable metadata is shown as unavailable, not as zero usage.
- A successful advice result is reused for the same game session so repeat
  clicks do not issue another paid request.

## Implementation map

| Area | Files | Verification |
| --- | --- | --- |
| API reliability and provider contract | `server/service.ts`, `server/provider.ts`, `server/server.ts`, `server/api.ts` | Unit tests for deadline, cancellation, per-model retry/fallback, malformed output, safe failures, and origin policy |
| Private usage report and request reuse | `server/usage.ts`, `server/server.ts`, `src/main.ts` | Aggregation, persistence privacy, and AI request reuse tests |
| W04 specification and traceability | `docs/AI_FEATURE_SPEC.md`, `docs/AI_PROVIDER_CONTRACT.md`, `docs/AI_EVALS.md`, `docs/AI_USAGE_LOG.md`, `docs/EVIDENCE_W04.md`, `specs/CONSTITUTION.md`, this plan and tasks | Claims match current code and observed results |
| Setup instructions | `README.md` | Document frontend/backend startup and the backend-only key configuration |

## Acceptance gates

1. `npm run typecheck`, `npm test`, and `npm run build` pass.
2. Tests cover valid advice, zero provider calls for invalid input, bounded
  retries, actual timeout/cancellation, malformed output, token aggregation,
  and local report privacy.
3. `server/ai-usage.local.json` reports request counts, success/failure,
   average latency, model, and input/output/total tokens when Gemini returns
   metadata; it is Git-ignored and has no public UI/API.
4. CORS is restricted to configured origins; backend errors remain generic.
5. Evidence distinguishes fake-provider results from live provider results.
  One successful live two-step tool flow is recorded for
  `gemini-3.1-flash-lite`; all other models and live fallback transitions
  remain unverified.
6. No dependency, package script, API key, database, or cloud storage is added.
  The Git-ignored `server/ai-usage.local.json` file is the explicitly allowed
  local usage report; it must remain private, bounded, and free of session
  IDs and provider content.

## Risks and known limits

Game sessions remain in memory and reset when the backend restarts. The local
usage report persists its latest 500 entries. Gemini may omit usage metadata
on failures. Client-side cancellation cannot guarantee that an accepted
provider request will not be billed. Live provider validation requires a
locally configured key and is not part of automated tests. On 2026-09-28 the
API returned high-demand 503 for direct 3.8/3.7 requests and other candidates
did not return usable text. On 2026-09-29, 3.1 Flash Lite first timed out on
two attempts and then completed one successful Advice tool round-trip. This
does not prove permanent availability, free-tier eligibility for a particular
account, or live fallback. The public price table lists free-tier input/output
for 3.1 Flash Lite, but this account's billing tier and quota remain
unverified. Provider logging is limited to sanitized attempt metadata.