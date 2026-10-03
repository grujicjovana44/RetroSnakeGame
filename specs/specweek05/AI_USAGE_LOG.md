# W05 AI Usage Log

This is a **manual, privacy-safe ledger** for the W05 development and demo
budget. It is not a runtime provider log and must not contain keys, prompts,
raw outputs, session IDs, private game statistics or chain-of-thought.

## Guardrails

- Maximum 15 live agent runs during development.
- Maximum 3 live agent runs during the final demo.
- Expected 2–3 model steps per run; this feature normally uses 2, with a
  one-time revision path using 3.
- Fake runs/tests are unlimited for budget accounting, but report separately.
- Keep these counts distinct: logical agent runs, provider model calls,
  retries/secondary attempts, and tool executions.
- `MAX_PROVIDER_ATTEMPTS=6` and `MAX_TOOL_CALLS=2` are per-run hard limits.

## Aggregate ledger

| Period | Run class | Agent runs | Provider model calls (all outbound attempts) | Retries/secondary attempts, included above | Tool calls | Notes |
|---|---|---:|---:|---:|---:|---|
| Development | Fake (E29 representative trace) | 1 | 6 | 3 | 2 | One measured fake run from the passing six-attempt budget test; not a suite-wide aggregate. |
| Development | Live | 1 | 3 | 0 | 2 | 3 steps; 25,678 ms; `goal_completed`; 1 of 15 live runs used. |
| Final demo | Fake | 0 | 0 | 0 | 0 | Separate from demo live usage. |
| Final demo | Live |  |  |  |  | Limit 3 live runs. |

## Individual live-run records

Add one row only after an actual live run. Do not add fake runs here.

| # | Date | Run ID | Provider/model | Status category | Agent steps | Provider model calls (outbound attempts) | Retries (included in calls) | Tool calls | Elapsed ms | Stop reason |
|---:|---|---|---|---|---:|---:|---:|---:|---:|---:|
| 1 | 2026-10-03 | `aa364b5b-8054-4f29-9fee-eb100f2d8f79` | gemini / `gemini-3.1-flash-lite` | completed | 3 | 3 | 0 | 2 | 25,678 | `goal_completed` |

## Fake-run summary

Record test command, test count/result, logical scripted steps, simulated
provider attempts, and simulated tool calls. These are not provider usage and
must never be represented as live evidence.

| Date | Command/test group | Result | Fake agent steps | Simulated attempts | Simulated tool calls |
|---|---|---|---:|---:|---:|
| 2026-10-03 | `npm exec -- vitest run tests/agent.test.ts -t "six-attempt run budget"` | 1 passed, 60 skipped; E29 asserts the seventh attempt is unused | 3 | 6 (3 retries) | 2 |