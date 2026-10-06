# W05 Demo Script (7 Minutes)

Draft based on the approved W05 scope. Pair members should divide the speaking
parts and verify the evidence before the demo. This draft contains questions,
not prepared answers.

| Time | Segment | Demonstration/evidence |
|---|---|---|
| 0:00–0:45 | User goal | Show Game Over, the two Serbian fixed goals, and one selected practice goal. Explain that the output is a next-game target grounded in the finished game's bounded facts. |
| 0:45–1:30 | Request path | Trace UI → `POST /api/ai/practice-plan` → preflight → orchestrator → provider-neutral boundary. Use `server/server.ts` and `server/agent.ts`. |
| 1:30–3:00 | Candidate and evaluator | Present live E01 as the normal-success provider example: Step 1 evaluation, Step 2 valid final, 2 steps, 1 tool, 2 attempts, no retry. Keep the fake E01 automated test visibly separate; use it for deterministic UI/evidence assertions. Point to `EVIDENCE_W05.md` and `tests/agent.test.ts`. |
| 3:00–4:00 | Bounded behavior and deadline | Show the 3-step, 2-tool, 6-attempt limits and production 30-second total deadline. Demonstrate E14 from the deterministic fake test: the active provider attempt is aborted, no further attempt or tool execution occurs, and the user gets the generic safe failure. Say explicitly that E14 is not a live timeout test. Explain Step-2 revision and Step-3 final/refusal boundaries using `server/agent.ts` and `AGENT_FLOW.md`. |
| 4:00–5:00 | Rejection proof | Show an unknown/invalid proposal or repeated proposal and the assertion that rejected proposals do not execute another tool call. Use `tests/agent.test.ts` and `AGENT_EVALS.md`. |
| 5:00–6:00 | Failure and privacy | Show generic safe errors, sanitized run logging, and fake-first validation. Do not display credentials, prompts, raw provider errors, session IDs, or game statistics. Use `PLAN.md` security evidence. |
| 6:00–7:00 | Evidence and limitations | State fake, development, and final-demo counts separately: 8 of 15 development runs and Final Demo Live #1 of 3 are recorded. Run E (25,863 ms, one retry) shows bounded retry succeeding within 30 seconds, not behavior after deadline expiry. Show the active-duration correction and anonymous-session limitation, then invite questions. Use `EVIDENCE_W05.md` and `AI_USAGE_LOG.md`. |

## Five pair-review questions

Both members should be able to explain these in their own words. Record answers
and review date in `EVIDENCE_W05.md`; this draft intentionally supplies no
answers.

1. Why is `evaluate_practice_goal` the only allowed tool, and what evidence does it evaluate? References: `server/agentTools.ts`, `specs/specweek05/TOOL_CONTRACTS.md`.
2. Why are the run bounded to 3 agent steps, 2 tool calls, and 6 provider attempts? References: `server/agent.ts`, `specs/specweek05/SPEC.md`.
3. Where are model proposals, tool arguments/results, and final evidence validated? References: `server/agentContracts.ts`, `server/agent.ts`, `server/agentTools.ts`.
4. Where does the run stop for a repeated call, a Step-3 tool request, exhausted tool budget, and deadline? References: `server/agent.ts`, `specs/specweek05/AGENT_FLOW.md`.
5. Which test proves that a rejected tool proposal did not execute the tool? References: `tests/agent.test.ts`, `specs/specweek05/AGENT_EVALS.md`.
