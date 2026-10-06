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
| Development | Live | 8 | 24 | 1 | 15 | One existing E07 run plus Runs A–G dated 2026-10-06; 8 of 15 development live runs used. |
| Final demo | Fake | 0 | 0 | 0 | 0 | Separate from demo live usage. |
| Final demo | Live |  |  |  |  | Limit 3 live runs. |

## Individual live-run records

Add one row only after an actual live run. Do not add fake runs here.

| # | Date | Run ID | Provider/model | Status category | Agent steps | Provider model calls (outbound attempts) | Retries (included in calls) | Tool calls | Elapsed ms | Stop reason |
|---:|---|---|---|---|---:|---:|---:|---:|---:|---:|
| 1 | 2026-10-03 | `aa364b5b-8054-4f29-9fee-eb100f2d8f79` | gemini / `gemini-3.1-flash-lite` | completed | 3 | 3 | 0 | 2 | 25,678 | `goal_completed` |
| 2 | 2026-10-06 | `d3e745fc-bb96-4f77-ae0a-de1d0c7cf96d` | gemini / `gemini-3.1-flash-lite` | failed | nije navedeno | 3 | 0 | 2 | 5,545 | `invalid_final_output` |
| 3 | 2026-10-06 | `cdc2a93d-926a-4e2f-a26b-9b55ba435cc2` | gemini / `gemini-3.1-flash-lite` | completed | nije navedeno | 3 | 0 | 2 | 5,543 | `goal_completed` |
| 4 | 2026-10-06 | `3adb0fcd-d5ab-4d1a-bf4d-1f1b08098f10` | gemini / `gemini-3.1-flash-lite` | failed | nije navedeno | 3 | 0 | 2 | 12,994 | `invalid_final_output` |
| 5 | 2026-10-06 | `edadbb74-84e8-400b-8000-486afefcedf9` | gemini / `gemini-3.1-flash-lite` | completed | nije navedeno | 3 | 0 | 2 | 15,657 | `goal_completed` |
| 6 | 2026-10-06 | `55798619-317b-4982-b0a6-f9c168915be2` | gemini / `gemini-3.1-flash-lite` | completed | nije navedeno | 4 | 1 | 2 | 25,863 | `goal_completed` |
| 7 | 2026-10-06 | `64982373-9cdc-42ce-8d28-3044471c6e8c` | gemini / `gemini-3.1-flash-lite` | completed | nije navedeno | 3 | 0 | 2 | 15,541 | `goal_completed` |
| 8 | 2026-10-06 | `7e9cda4f-633b-4915-816c-fe74a56517d2` | gemini / `gemini-3.1-flash-lite` | completed | 2 | 2 | 0 | 1 | 13,858 | `goal_completed` |

The step count is marked "nije navedeno" where the supplied sanitized run
record did not include it. Provider-attempt totals include retries. Fake E29
usage remains separate and is excluded from the live budget.

## Fake-run summary

Record test command, test count/result, logical scripted steps, simulated
provider attempts, and simulated tool calls. These are not provider usage and
must never be represented as live evidence.

| Date | Command/test group | Result | Fake agent steps | Simulated attempts | Simulated tool calls |
|---|---|---|---:|---:|---:|
| 2026-10-03 | `npm exec -- vitest run tests/agent.test.ts -t "six-attempt run budget"` | 1 passed, 60 skipped; E29 asserts the seventh attempt is unused | 3 | 6 (3 retries) | 2 |
