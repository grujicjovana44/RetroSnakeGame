# W05 AI Usage Log

This is a **manual, privacy-safe ledger** for the W05 development and demo
budget. It is not a runtime provider log and must not contain keys, prompts,
raw outputs, session IDs, private game statistics or chain-of-thought.

## Guardrails

- Maximum 15 live agent runs during development.
- Maximum 3 live agent runs during the final demo.
- Expected 2–4 model steps per run; this feature normally uses 2, with a
  one-time revision path using 3.
- Fake runs/tests are unlimited for budget accounting, but report separately.
- Keep these counts distinct: logical agent runs, provider model calls,
  retries/secondary attempts, and tool executions.
- `MAX_PROVIDER_ATTEMPTS=6` and `MAX_TOOL_CALLS=2` are per-run hard limits.

## Aggregate ledger

| Period | Run class | Agent runs | Provider model calls (all outbound attempts) | Retries/secondary attempts, included above | Tool calls | Notes |
|---|---|---:|---:|---:|---:|---|
| Development | Fake | 0 | 0 | 0 | 0 | Fill from test results; do not count individual assertions as live calls. |
| Development | Live | 0 | 0 | 0 | 0 | Limit 15 live runs. |
| Final demo | Fake | 0 | 0 | 0 | 0 | Separate from demo live usage. |
| Final demo | Live | 0 | 0 | 0 | 0 | Limit 3 live runs. |

## Individual live-run records

Add one row only after an actual live run. Do not add fake runs here.

| # | Date | Provider/model | Status category | Agent steps | Provider model calls (outbound attempts) | Retries (included in calls) | Tool calls | Elapsed ms | Stop reason |
|---:|---|---|---|---:|---:|---:|---:|---:|---|

## Fake-run summary

Record test command, test count/result, logical scripted steps, simulated
provider attempts, and simulated tool calls. These are not provider usage and
must never be represented as live evidence.

| Date | Command/test group | Result | Fake agent steps | Simulated attempts | Simulated tool calls |
|---|---|---|---:|---:|---:|