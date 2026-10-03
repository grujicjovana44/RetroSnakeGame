# W05 Live Smoke Runbook

The first live smoke ran on 2026-10-03 (see `AI_USAGE_LOG.md`); this runbook
also applies to subsequent runs.

## Limits and first run

- Development maximum: 15 live Practice Plan runs total.
- Final demo maximum: 3 live runs total.
- The first smoke is one completed game, one selected goal, and one click on
  Practice Plan. Do not run both goals or retry the smoke unless the team has
  counted the additional run against the limit.
- One user click is one logical run. Provider attempts and tool executions are
  counted separately; per run the hard limits are 6 provider attempts and 2
  tool calls.
- Fake tests do not consume live-run budget and are not live evidence.

## Configure and start

1. Confirm `npm run typecheck`, `npm test`, `npm run build`, and
   `npm run test:e2e` pass before the live call.
2. In the ignored local file `server/.env`, set `GEMINI_API_KEY` and
   `GEMINI_MODEL_CHAIN`. Never paste the key into a command, document, browser
   input, or usage log. `GEMINI_MODEL_CHAIN` is comma-separated and must use
   supported models in the order enforced by `server/provider.ts`; for this
   first smoke configure one supported model only.
3. In terminal 1, from the repository root, run:

   ```sh
   npm run dev:backend
   ```

   Wait for `RetroSnake backend listening on http://127.0.0.1:3001`.
   If `server/.env` changes after the backend starts, stop and restart the
   backend before testing so it reloads the configuration.
4. In terminal 2, from the repository root, run:

   ```sh
   npm run dev -- --host 127.0.0.1
   ```

   Open the frontend URL printed by Vite. Keep its origin consistent with
   `FRONTEND_ORIGINS` if that variable is configured in `server/.env`.

## Perform one run

1. Start or restart one game and collect at least a few food pieces before it
   reaches Game Over.
2. Do not use AI Advice during this smoke; select exactly one goal
   (`Preživi duže` or `Sakupi više hrane`) and click Practice Plan once.
3. Record one logical live run in `AI_USAGE_LOG.md`, whether it succeeds or
   fails. Do not include the session ID, game statistics, key, prompts, raw
   provider response, or provider error body.
4. Read the backend's single `[ai.practice-plan]` JSON record for the run. It
   is sanitized and contains run-level `providerAttemptCount`,
   `providerHttpStatus`, `retryCount`, `toolCallCount`, `status`, `stopReason`,
   and `steps[]`. Read `providerHttpStatus` as a number only, then read the
   selected `provider` and `model` from each step. The status contains no error
   text, headers or response body. Record:
   - logical runs: one per Practice Plan click;
   - model calls: `providerAttemptCount` (actual outbound attempts);
   - retries: `retryCount` (already included in model calls);
   - tool calls: `toolCallCount`;
   - agent steps: `steps.length`.
5. Add an individual live row and update the live aggregate in
   `AI_USAGE_LOG.md`. Increment the development or demo budget before another
   run. Record only a status category and stop reason, not private payloads.

## Provider HTTP status interpretation

Use only the numeric `providerHttpStatus` to classify a provider failure:

| HTTP status | Interpretation | Action |
|---:|---|---|
| 400 | Schema or configuration issue | Stop and report it to the project owner; do not change code or schema without approval. |
| 401/403 | Key or quota issue | Stop and report the configuration/quota issue. |
| 429 | Provider rate limit | Stop; do not retry as a workaround. |
| 5xx | Provider-side failure | Stop and report the failure. |

Preserve the generic user-facing failure. Do not copy provider response text,
headers, key, prompt, or session data into logs or evidence. Any further live
run consumes the approved run budget.

## Stop and close

- Stop after the first successful or failed smoke unless the owner authorizes
  another counted run.
- Stop the frontend and backend processes after recording the sanitized
  outcome.
- Keep fake and live rows separate. Never infer a live success from mocked
  transport or fake-model tests.