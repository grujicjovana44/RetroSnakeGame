# W04 Implementation Plan - Reliable AI Advice and Private Usage Report

## Status

Approved for implementation on 2026-09-27. `docs/AI_FEATURE_SPEC.md` is the
feature specification and `docs/AI_PROVIDER_CONTRACT.md` is the provider
contract. `docs/GAME_SPEC.md` remains authoritative for W03 gameplay behavior.

## Scope

Harden the existing post-game AI Advice flow and write a private local report
for backend-recorded provider token usage. Preserve the selected Gemini model
`gemini-3.8-flash`, the read-only game-stats tool, existing TypeScript stack,
and the current fake-provider approach. Do not add dependencies.

## Decisions and constraints

- AI Advice is user-triggered only after game over, never in the game loop.
- The provider key stays in backend environment configuration.
- The full advice flow has a 15-second deadline and at most two attempts.
- Transient failures may retry once within the remaining deadline; malformed
  output and invalid local input do not retry.
- The SDK abort signal is propagated when the deadline expires. The SDK notes
  cancellation is client-side and may not prevent provider billing after a
  request has reached the service.
- The backend allows only the configured local frontend origins and bounds
  in-memory sessions and usage history.
- Usage values are aggregated into a Git-ignored local file, not shown in the
  game UI or exposed through an HTTP endpoint; session IDs and provider content
  are excluded.
- Token totals include both Gemini responses when usage metadata is returned;
  unavailable metadata is shown as unavailable, not as zero usage.
- A successful advice result is reused for the same game session so repeat
  clicks do not issue another paid request.

## Implementation map

| Area | Files | Verification |
| --- | --- | --- |
| API reliability and provider contract | `server/service.ts`, `server/provider.ts`, `server/server.ts`, `server/api.ts` | Unit tests for deadline, cancellation, retry, malformed output, safe failures, and origin policy |
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
   A successful live `gemini-3.8-flash` call remains unclaimed until observed.
6. No dependency, package script, API key, database, or cloud storage is added.
  The Git-ignored `server/ai-usage.local.json` file is the explicitly allowed
  local usage report; it must remain private, bounded, and free of session
  IDs and provider content.

## Risks and known limits

Game sessions remain in memory and reset when the backend restarts. The local
usage report persists its latest 500 entries. Gemini may omit usage metadata
on failures. Client-side cancellation stops the
local request but cannot guarantee that an accepted provider request is not
billed. Live provider validation requires a locally configured key and is not
part of automated tests. On 2026-09-28 the API returned 503 high-demand for a
direct `gemini-3.8-flash` request; `gemini-3.1-flash-lite` was listed but its
exploratory advice-flow call also returned provider 503. Automated tests do
not establish live service availability. The provider currently emits debug
console output containing session/game data and response/error details, which
does not meet the intended private logging contract and remains open.