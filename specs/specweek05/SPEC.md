# W05 Feature Specification: AI Practice Plan

## Status and source of truth

Status: **APPROVED AND IMPLEMENTED — human approval and final review recorded
2026-10-03.** The implementation, verification results, pair review and final
acceptance are documented in `EVIDENCE_W05.md`.

Precedence: `docs/GAME_SPEC.md` is authoritative for game behavior;
`docs/AI_FEATURE_SPEC.md` and `docs/AI_PROVIDER_CONTRACT.md` remain authoritative
for W04 AI Advice and must not be changed by this feature. This document defines
only the W05 Practice Plan. The W05 assignment is the acceptance
source for the agentic requirements.

## User value and bounded scenario

After game over, the player selects one of two fixed practice goals. A bounded
backend agent proposes a numeric target for the next game, evaluates it with a
deterministic local tool against the just-finished game's statistics, and
returns a short plan grounded in the validated tool result. The agent may revise
the target once after an `too_easy` or `too_ambitious` evaluation.

The UI control is available only after game over. The existing `AI Advice`
endpoint and behavior remain separate and unchanged.

## Answers to the ten pre-implementation questions

1. **Problem:** after a game, the player sees a score but has no bounded,
   measurable practice target for the next attempt.
2. **User request:** select exactly one fixed goal, `survive_longer` or
   `collect_more_food`, for the next game.
3. **Result:** a short structured plan containing a numeric target, a
   recommendation, evidence tied to evaluated session facts, confidence, and a
   completion flag. `completed: true` means a valid plan was produced; it does
   not claim the player has achieved the target in a future game.
4. **Allowed data:** the selected goal and the current session's `score`,
   `durationSeconds`, and `foodCollected`; plus the current run's validated
   candidate and normalized evaluator results. `collisions` is excluded (see
   Known limitations). No previous sessions or repository data are provided.
5. **Allowed tool:** only the backend allowlisted
   `evaluate_practice_goal`, a read-only deterministic local operation.
6. **Forbidden tools/actions:** arbitrary functions, URLs/network, filesystem,
   shell, database/SQL, provider/model selection by the model, changes to game
   state, score, difficulty, rules, persistent state, or any other write action.
7. **Maximum:** at most 3 agent decision steps, 2 tool executions, and 6 total
   provider attempts. Each step has at most 1 retry/secondary attempt.
8. **Goal achieved:** the agent run is complete only when a schema-valid final
   plan has at least one evidence item whose source, field, and value match a
   validated tool result from this run. Player achievement is measured later:
   next-game duration must be at least the target for `survive_longer`, or
   next-game food count at least the target for `collect_more_food`.
9. **Mandatory stops:** invalid or forbidden proposal; invalid arguments or
   tool result; refusal; repeated tool+normalized-argument pair; step/tool
   budget exhaustion; provider/tool failure; cancellation; or total deadline.
   The backend, not the model, enforces every stop.
10. **Final validation:** Zod validates the exact response schema, string and
    array bounds, confidence enum, and boolean completion flag. A second
    semantic validator checks each evidence reference against values returned
    by this run's validated tool calls. Invalid output is never returned as a
    successful plan.

## Fixed goals and measures

The frontend presents exactly these enum values; free-text goals are not
accepted.

| Goal | `targetValue` unit | Allowed candidate range | Future-game success measure |
|---|---|---|---|
| `survive_longer` | Whole seconds | `lowerBound = B`; `upperBound = min(86,400, B + max(3, ceil(2 * max(B, 1))))`. A target equal to baseline is permitted only as a `too_easy` candidate; a completed plan must target above baseline. | Next completed game's `durationSeconds >= targetValue`. |
| `collect_more_food` | Whole food items | `lowerBound = F`; `upperBound = min(10,000, F + max(3, ceil(2 * max(F, 1))))`. A target equal to baseline is permitted only as a `too_easy` candidate; a completed plan must target above baseline. | Next completed game's `foodCollected >= targetValue`. |

Session duration is captured when the game first transitions to `game-over` and
is `round((gameEndedAt - gameStartedAt - pausedMs) / 1000)`. Time spent paused
and time spent on the game-over screen are excluded. This makes the
`survive_longer` baseline represent active play rather than the delay before
the player requests Advice or a Practice Plan.

`B = round(durationSeconds)` and `F = foodCollected`. W04 frontend applies
`Math.round` before submitting duration, but the confirmed `server/api.ts`
schema accepts finite `durationSeconds` in `[0, 86,400]` without `.int()`; it
accepts integer `foodCollected` in `[0, 10,000]`. W05 explicitly rounds a
validated duration to the nearest second for its target baseline; food is
already an integer. The lower bound
allows a zero-delta candidate so the tool can rate it `too_easy`; only a
positive-delta `realistic` candidate can become a completed practice target.
The upper bound allows ambitious candidates, including at small baselines,
while respecting W04 schema maxima. A candidate outside this interval is
rejected before execution. If the baseline is already at its schema maximum,
there is no representable improvement and `goal_unavailable` stops before any
provider or tool call.

The evaluator computes `foodPerMinute = foodCollected / (durationSeconds / 60)`
when duration is positive, `scorePerFood = score / foodCollected` when food is
positive, and `targetRatio = targetValue / max(goalBaseline, 1)`. A missing
denominator or a derived value that cannot be represented as a finite JavaScript
number produces `null`, not zero. All displayed derived decimal metrics
and ratios are rounded to exactly two decimal places before they enter
normalized tool output or evidence. Ratings are computed from integer values
before display rounding:

Let `delta = targetValue - goalBaseline` and
`realisticDeltaMax = max(2, ceil(goalBaseline / 2))`.

| Integer condition | Rating |
|---|---|
| `delta <= 0` | `too_easy` |
| `1 <= delta <= realisticDeltaMax` | `realistic` |
| `delta > realisticDeltaMax` | `too_ambitious` |

For exact integer-only implementation, the realistic upper-bound check is
`2 * delta <= max(4, goalBaseline + (goalBaseline % 2))`; do not classify from
the rounded `targetRatio`. For every baseline `0..50`, `targetValue =
goalBaseline + 1` is in range and rates `realistic`. This is an explicit test
in `AGENT_EVALS.md`.

The model is not told these rating thresholds or the rating enum before making
its Step-1 proposal. It receives only the selected goal, bounded session facts,
the candidate's allowed numeric interval, and the tool-call schema. The
deterministic tool alone calculates and returns the rating after the candidate
is validated and executed. This prevents self-rating, threshold gaming and
model-driven evaluation; the rating is reproducible from the validated inputs.
These thresholds classify candidate difficulty; they do not guarantee future
performance. The tool returns stable evidence field IDs for all inputs and
derived values. The model may explain those values, but may not invent a
measurement.

## Agent protocol and state limits

One user click is one logical run. A step is one new model decision using the
current bounded context; a provider attempt is one actual request to an
allowlisted Gemini model. A retry/fallback attempt does not increment the
agent-step count.

| Limit | Value | Rationale |
|---|---:|---|
| `MAX_AGENT_STEPS` | 3 | Step 1 proposes and evaluates a candidate; Step 2 can finalize or request one revision; Step 3 can finalize only. This is the smallest bound that permits Candidate → Evaluate → Revise → Evaluate → Final. |
| `MAX_TOOL_CALLS` | 2 | One initial evaluation plus at most one meaningful revised-candidate evaluation. A third evaluation adds no required capability. |
| `MAX_PROVIDER_ATTEMPTS` | 6 | Hard ceiling of 3 steps × (1 initial request + 1 retry/secondary attempt). The run-wide counter is authoritative even if a code path changes. |
| Attempts per step | 2 | At most one retry/secondary attempt. A retry or same-provider model fallback uses that same second slot; no multiplicative per-model retries. |
| Total deadline | 30,000 ms | Bounds the full run, including provider attempts, retry delay and tool work, while leaving a useful interactive window. |
| Configured provider-call timeout | 10,000 ms | Bounds one provider attempt; effective timeout is `min(10,000 ms, remaining run deadline)`. |
| Tool timeout | 250 ms | The tool is local, deterministic and bounded over one small session record; this is a failure guard, not permission for network work. |
| Maximum serialized tool result | 4,096 bytes | Allows the fixed metric/evidence schema while preventing oversized model context. |
| Maximum final strings | 500 characters each | Keeps UI output short and provider output bounded. |

Attempts and tool-call counts are incremented only at the actual provider/tool
execution boundary. A proposal rejected at any validation gate has
`toolCallCount === 0` for that proposal. Retries/fallbacks consume the same
global attempt budget and remaining deadline. They retry only the current
model-decision request; they never rerun a completed tool or restart the whole
agent run. Cross-provider fallback is out of scope; any permitted fallback is
only to another model already in the W04 Gemini allowlist.
Provider SDK-internal retries must be disabled or explicitly counted as
attempts; the six-attempt counter must represent actual outbound provider
requests, not only logical adapter calls.

### Step rules

- Step 1 accepts only a valid `tool_request` or `refusal`; it must not return a
  final plan before evaluation.
- Step 2 accepts `final`, `refusal`, or one `tool_request` for a revised
  candidate only if the preceding rating was not `realistic`. A repeated
  proposal is rejected first; otherwise a tool request after a `realistic`
  rating stops as `tool_not_justified`. The revised target must be different
  from the previous normalized `{toolName, goal, targetValue, sessionId}` tuple.
- Step 3 accepts only `final` or `refusal`. Any `tool_request` stops before
  execution as `max_steps`; the step-kind ceiling is primary at that boundary.
- The independent tool dispatcher rejects any request when
  `toolCallCount >= MAX_TOOL_CALLS` as `tool_limit` before execution.
- A second request with the same tool and normalized arguments stops as
  `repeated_call` before execution, even if a tool slot remains.
- Proposal gate order is fixed: (1) step-kind rule, (2) strict proposal and
  argument parsing/canonicalization, (3) repeated-call check, (4) Step-2
  justification check (`tool_not_justified` after `realistic`), (5) tool limit,
  (6) session scope/deadline/global budgets, (7) tool execution. Unknown tool
  names and malformed args are rejected during gate 2; nothing executes before
  gate 7.
- A provider retry/fallback is an attempt for the same step, not a new step.

The Gemini adapter encodes these steps as follows: Step 1 declares only
`evaluate_practice_goal` and uses function-calling mode `ANY` restricted to that
name; ordinary text output is rejected. Step 2 declares the tool only when the
latest rating is non-realistic, and may combine that declaration with the
structured JSON decision schema so the model can request its one revision or
return a final/refusal. After a realistic rating Step 2 has no tool. Step 3
never declares tools and accepts only the structured JSON final/refusal
schema. JSON parsing accepts an optional outer Markdown JSON fence, but the
backend schemas and semantic checks remain authoritative. The adapter sets a
low thinking level because `maxOutputTokens` also includes thinking tokens.

## Allowed context and tool boundary

The first model step receives only the fixed goal, the three permitted session
metrics, the allowed numeric candidate interval, tool-call schema, and
remaining budget. It is not told the rating enum, rating thresholds, or
evaluation formula. Only later steps receive the rating and normalized
evaluation returned by the validated tool. The model does not receive raw HTTP
payloads, other sessions, secrets, provider diagnostics, source code, or a
complete game state.
The backend revalidates the session record at run preflight even though W04
validates it at creation; missing or corrupted required facts stop before any
provider or tool call.

The model proposes `{ goal, targetValue }`; it does not choose or supply a
session ID. The orchestrator binds the canonical session ID from the original
validated request and calls the tool with `{ sessionId, goal, targetValue }`.
This prevents the model from changing the data scope.

Tool allowlist is compiled into backend code and contains exactly
`evaluate_practice_goal`. No model-provided name is dynamically invoked. Tool
arguments, scope, budget, timeout, output shape, size and allowed values are
validated before the normalized result is sent back to the model.

### Anonymous-session scope

W04 stores up to 500 sessions in a backend in-memory map. The current app has
no login, account ID or per-user ownership record. W05 can verify that the
session ID exists and exactly matches the original request's server-bound ID;
the UUID is an unguessable bearer-like scope token. It cannot prove a human
owner's identity. The UI must use only its own returned session ID; stronger
ownership guarantees require accounts/session authentication and are out of
scope. Invalid UUID and missing session must have the same external HTTP status
and generic response so the endpoint does not disclose session existence. This
limitation must be stated in evidence and not described as authenticated
ownership.

## Final response and outcomes

The provider's final response is validated using Zod:

```ts
type PracticePlanResult = {
  goal: "survive_longer" | "collect_more_food";
  targetValue: number;
  summary: string;
  recommendation: string;
  evidence: Array<{
    source: "evaluate_practice_goal";
    field: string;
    value: string | number | null;
    finding: string;
  }>;
  confidence: "low" | "medium" | "high";
  completed: boolean;
};
```

Every model-generated final must set `goal` to the user-selected goal and
`targetValue` to the exact candidate in the latest validated
`evaluate_practice_goal` result in this run. Neither field can be substituted
from a prior run or a different candidate. The UI displays the target from
these validated fields, never from prose. `goal_unavailable` makes no model or
tool call; the backend returns this app-only type with fixed text:

```ts
type PracticePlanPreflightIncomplete = {
  goal: "survive_longer" | "collect_more_food";
  targetValue: null;
  summary: "Za izabrani cilj trenutno nema višeg dostižnog praga.";
  recommendation: "Odigrati novu partiju ili izabrati drugi cilj.";
  evidence: [];
  confidence: "low";
  completed: false;
};

type PracticePlanApiResponse =
  | {
      success: true;
      plan: PracticePlanResult & { completed: true };
      evaluation: PracticeEvaluation;
    }
  | {
      success: true;
      plan: PracticePlanResult & { completed: false };
      evaluation: PracticeEvaluation;
      incompleteMessage: IncompleteStatusMessage;
    }
  | { success: true; plan: PracticePlanPreflightIncomplete; evaluation: null }
  | { success: false; message: string };

type IncompleteStatusMessage =
  | "Cilj je ocenjen kao realističan, ali plan nije dovršen. Možeš koristiti prikazani cilj za sledeću partiju."
  | "Cilj nije preporučen: alat ga je ocenio kao prelak ili preambiciozan.";
```

The API's `evaluation` is the normalized, schema-validated output of
`evaluate_practice_goal`; it contains the fixed metrics/rating and is returned
only after output validation. For an incomplete result after evaluation, UI
renders those metrics directly from this object, never from model prose. A
preflight `goal_unavailable` has `evaluation: null` and therefore renders no
tool metrics.

For Step-2/3 refusal, the backend similarly synthesizes a partial result from
the latest validated tool result; it preserves that evaluated numeric target,
sets `completed:false` and low confidence, and uses fixed app-authored text.
The API uses one of exactly two fixed status messages according to the latest
tool rating:

| Latest rating | Fixed incomplete message |
|---|---|
| `realistic` | `Cilj je ocenjen kao realističan, ali plan nije dovršen. Možeš koristiti prikazani cilj za sledeću partiju.` |
| `too_easy` or `too_ambitious` | `Cilj nije preporučen: alat ga je ocenio kao prelak ili preambiciozan.` |

For either incomplete result, the UI displays validated evaluator metrics
alongside the fixed status message and does not render model-generated
recommendation prose. For a realistic rating, it must not say that the goal is
not recommended. The separate `goal_unavailable` preflight message remains the
fixed no-higher-target message and has no tool metrics to display.

Schema limits: non-empty `summary` and `recommendation` up to 500 characters;
0–5 evidence items (a completed result requires at least one); `source` is the fixed tool name; `field` is a stable
evidence ID; `value` is a bounded scalar; `finding` is non-empty and at most
300 characters; `confidence` is the stated enum; `completed` is boolean;
unknown properties are rejected. The semantic validator accepts an evidence
item only when the same source, field and deeply equal scalar value appeared
in the latest normalized tool result from this run. Evidence values are compared
with exact scalar equality, not floating tolerance; rounded ratios are the
values that are validated. `source`, `field`, and `value` are copied from or
matched against the evaluator; `finding` is a short model-written Serbian
(Latin-script) explanation, not copied from the evaluator, and is not
machine-verified. Arbitrary references are rejected. The final
`goal` and `targetValue` must exactly match that same latest tool result. At
least one valid evidence item is required for `completed: true`.

Completion is additionally tied to the last rating: only a `realistic`
candidate may be returned with `completed: true` or as a recommended target.
If the last rating is `too_easy` or `too_ambitious`, a final must have
`completed: false` and confidence other than `high`; the UI suppresses its
free-form recommendation and displays one of two fixed messages according to
the evaluator rating: for `too_easy` or `too_ambitious`,
`Cilj nije preporučen: alat ga je ocenio kao prelak ili preambiciozan.`; for
`realistic`, `Cilj je ocenjen kao realističan, ali plan nije dovršen. Možeš
koristiti prikazani cilj za sledeću partiju.` A mismatched final is rejected as
`invalid_final_output`.

| Outcome | Definition | User-visible behavior |
|---|---|---|
| Success | Final output passes schema and evidence checks and has `completed: true`. | Render the practice plan and validated evidence. |
| Partial/incomplete | A validated app-generated preflight result for unavailable goal; an app-generated refusal result at step 2/3 bound to the latest tool candidate; or a schema-valid model final for a non-realistic latest rating with `completed:false` and confidence not high. | HTTP 200 with correct fixed message and validated tool metrics when evaluation exists. Preflight target is `null` and has no tool metrics; evaluated non-realistic targets are never recommendations. Model recommendation prose is suppressed; never present incomplete output as success. |
| Failure | Invalid input/scope, step-1 refusal, step-1 final, invalid proposal/tool/result/final, provider/tool failure, repeated call, unjustified tool request, exhausted budget, deadline or cancellation. | No PracticePlanResult is shown as success; return safe error/status mapping in `AGENT_FLOW.md`. |

The application can verify response structure and evidence references/values,
but cannot prove the truth of free-form `summary`, `recommendation` or
`finding` prose. This is a known limitation; UI wording must not present those
sentences as independently proven facts.

## Stop conditions and failure policy

The backend stops when the goal is unavailable, the model refuses, a
proposal/argument/result/final output is invalid, a tool or provider fails
without an eligible remaining retry, a repeated action is proposed, a budget
is exhausted, the deadline expires, or the client cancels. Success stops after
a valid completed final result. Stop reasons and user-safe behavior are mapped
in `AGENT_FLOW.md` and `AGENT_EVALS.md`.

Human approval points: **none**. Core is read-only and permits zero write
actions. If a future feature proposes writes, it needs a separate scope/spec
and explicit human approval before execution.

## Approved narrow constitution amendment

Approved by the human owner on 2026-10-03 and applied to
`specs/CONSTITUTION.md`:

> The W05 AI Practice Plan may run only through its approved backend endpoint
> and orchestrator, with the fixed two-goal enum, the single read-only
> deterministic `evaluate_practice_goal` tool, server-bound session scope,
> validated model proposals/results/final output, and the limits in
> `specs/specweek05/SPEC.md`. It may not alter W03 game behavior, W04 AI Advice,
> game state, score, difficulty, rules, files or network state. All other
> autonomous tool access remains out of scope. This exception expires if the
> approved feature scope changes and requires a further human amendment.

## Stop-reason taxonomy

The full retry, terminal-state and user-message mapping is in `AGENT_FLOW.md`.
Additional domain reasons `goal_unavailable` and `model_refusal` are included
because a valid request can be infeasible at the current measurement cap or
the model may decline without producing an unsafe action.

## Out of scope

- Changing or replacing W04 `POST /api/ai/advice` or its response contract.
- New game events, collision history, telemetry of player movement, or extra
  game statistics.
- Any write tool, game-state/score/difficulty/rule change, or approval UI for
  writes.
- A second tool, cross-provider fallback, browser/shell/filesystem/network
  tools, RAG, accounts, database/cloud storage, deployment, background jobs,
  multi-agent orchestration, or unbounded loops.
- Claims that the agent knows collision frequency, movement patterns, or
  future-game success.
- New dependencies, build tools, or package script changes.

## Known limitations

1. W04 submits `collisions: state.collision ? 1 : 0`; in the game-over flow this
   represents only whether the terminal state has a collision, not a count of
   collision events. W03 ends on the first obstacle or self collision. It is
   therefore excluded from W05 model context, evaluator metrics, evidence and
   claims. Do not change W04 storage or add events in this feature.
2. Only score, duration, food count and this non-informative terminal flag are
  currently recorded; they cannot support movement-level causal claims.
  `durationSeconds` is now captured at game-over with paused time removed and
  is rounded before submission. The W04 Zod schema still accepts any finite
  number in range; W05 uses `Math.round(durationSeconds)` for the integer
  target baseline. This correction is required because duration is the
  `survive_longer` baseline and must not include pauses or post-game waiting.
3. Anonymous UUID session scope proves existence and exact request binding, not
   authenticated ownership.
4. Evidence references (`source`, `field`, and scalar `value`) are
  machine-verifiable; model-written Serbian `finding` prose is not
  semantically provable by this application. The evaluator contract is
  unchanged.
5. Live provider availability is external and must be recorded separately from
  fake-provider tests. The first live development run on
  `gemini-3.1-flash-lite` completed in 25,678 ms of the 30,000 ms deadline,
  about 8.5 seconds per step. One retry or a slower step may consume the
  remaining time and produce a `deadline` stop with the generic safe error.
  A larger deadline or faster model is a possible later proposal only; it
  requires approval and updates to this SPEC, `AGENT_FLOW.md`, and tests.
6. A synchronous local tool cannot be interrupted mid-execution; if it returns
  after the 250 ms watchdog, discard the result and stop as `tool_timeout`.
7. `tool_limit` is tested only by injecting the exhausted counter at the
  dispatcher guard: the normal three-step protocol rejects a Step-3 tool
  request as `max_steps` first.
8. Hidden SDK retries depend on adapter behavior; the Gemini adapter must
  disable or account for each actual outbound request.

## Acceptance criteria

- The existing W04 feature remains unchanged and its regression suite passes.
- The W05 UI submits exactly one of the two fixed goals after game over.
- One backend-controlled run uses bounded context, the provider-neutral model
  boundary, a validated model proposal and the allowlisted deterministic tool.
- The success flow has at least two agent steps and a real tool execution; the
  one-revision path uses no more than 3 steps and 2 tool calls.
- Input, proposal, arguments, tool result and final output are validated.
- `MAX_AGENT_STEPS=3`, `MAX_TOOL_CALLS=2`, `MAX_PROVIDER_ATTEMPTS=6`, one
  secondary attempt per step, 30s total deadline, per-call timeout and repeated
  action protection are explicit and tested.
- Tests include the required invalid/rejected paths with tool call count zero,
  separate repeated-call and max-step cases, deadline, failure taxonomy and
  safe user response.
- Required W05 spec/plan/tasks/flow/tool-contract/evals/evidence/usage artifacts
  exist; fake and live evidence remain distinct; pair review questions are
  answered by both members.
- `npm run typecheck`, `npm test`, `npm run build`, and `npm run test:e2e` pass.
- Live demo is bounded by the assignment budgets: at most 15 live runs during
  development and at most 3 during the final demo.