# W05 Tool Contracts

## `evaluate_practice_goal`

| Contract field | Definition |
|---|---|
| **Name** | `evaluate_practice_goal` |
| **Purpose** | Deterministically evaluate whether one numeric target for one fixed practice goal is too easy, realistic or too ambitious against the selected completed game's bounded stats. It makes the Candidate → Evaluate → optional Revise flow meaningful. |
| **Read/Write** | Read-only deterministic local operation. No mutation of the session, canonical game state, score, difficulty, rules, or persistence. |
| **Allowed caller** | The W05 backend orchestrator only. No frontend, W04 Advice provider, arbitrary model tool dispatcher or direct HTTP caller can invoke the function. |
| **Authorization/scope** | Orchestrator passes the canonical `sessionId` validated from the original request; tool verifies that it exists in the server-owned session map and is unchanged. Current sessions are anonymous; exact UUID binding and existence are the available scope check, not identity-based ownership. No account ownership claim is made. |
| **Timeout** | 250 ms watchdog. Operation is synchronous, constant-size over one validated session record, and has no blocking IO. Because JavaScript cannot preempt synchronous code, implementation remains bounded; if it returns after 250 ms, discard its result and stop as `tool_timeout`. |
| **Maximum result size** | 4,096 UTF-8 bytes after normalization. Oversize output is rejected and never sent to a model. |
| **Failure behavior** | Return an internal typed result category (`invalid_tool_args`, `forbidden`, `tool_error`, `tool_timeout`, `invalid_tool_result`) to the orchestrator. Do not return raw exception/provider details to the model or client. No automatic re-execution. |

### Effective input schema

The model proposes only `{ goal, targetValue }`. In Step 1 it sees the selected
goal and allowed numeric candidate interval, but not the rating enum, threshold
values or evaluation formula. The backend binds the canonical session ID, so
the actual tool receives:

```ts
{
  sessionId: string; // UUID from the original validated request, server-bound
  goal: "survive_longer" | "collect_more_food";
  targetValue: number; // finite integer within session-derived goal range
}
```

Validation rules:

- Exact object shape; reject unknown keys, missing fields, non-UUID session ID,
  non-enum goal, non-finite/fractional target, or target outside the derived
  allowed range.
- `goal` must equal the user-selected goal for this run.
- The backend looks up the session itself. The model does not supply stats or
  control session scope.
- `survive_longer` uses integer seconds; candidate range is defined in
  `SPEC.md` and capped by the W04 schema maximum. W04 frontend rounds duration,
  but the W04 Zod schema accepts finite decimals; W05 rounds the validated
  session duration with `Math.round` to obtain its integer baseline.
- `collect_more_food` uses whole item count; candidate range is defined in
  `SPEC.md` and capped by the W04 schema maximum.
- Candidate range includes `targetValue === baseline` to make a `too_easy`
  proposal representable. A completed/recommended plan must have a positive
  delta and a `realistic` rating.
- Repeated normalized `{toolName, sessionId, goal, targetValue}` tuples are
  rejected before tool execution.

### Normalized output schema

```ts
type PracticeEvaluation = {
  tool: "evaluate_practice_goal";
  goal: "survive_longer" | "collect_more_food";
  targetValue: number;
  goalBaseline: number;
  rating: "too_easy" | "realistic" | "too_ambitious";
  metrics: {
    score: number;
    durationSeconds: number;
    foodCollected: number;
    foodPerMinute: number | null;
    scorePerFood: number | null;
    targetRatio: number;
  };
  evidence: Array<{
    field: string; // stable ID
    value: string | number | null;
  }>;
};
```

Stable evidence IDs:

| ID | Value source |
|---|---|
| `candidate.goal` | Validated fixed goal enum |
| `candidate.targetValue` | Validated numeric candidate |
| `evaluation.rating` | Deterministic threshold result |
| `evaluation.targetRatio` | `targetValue / max(goal baseline, 1)`, rounded to exactly 2 decimal places for display/evidence |
| `goal.baseline` | Integer baseline used for candidate bounds and rating (`Math.round(durationSeconds)` for survival, validated integer food count for food goal) |
| `session.score` | W04 validated session score |
| `session.durationSeconds` | W04 validated session duration |
| `session.foodCollected` | W04 validated food count |
| `evaluation.foodPerMinute` | Derived when duration is positive and the finite result is representable; otherwise `null` |
| `evaluation.scorePerFood` | Derived only when food count is positive; otherwise `null` |

`collisions` is deliberately absent. W04's frontend records only a terminal
0/1 collision flag, so it is neither an event count nor useful comparative
evidence. No other session fields may be copied into the output.

### Result validation before model forwarding

1. Validate exact shape, required fields and no unknown properties.
2. Validate all numeric values are finite, within their documented bounds,
  and the rating is from the fixed enum. Recompute the candidate range and
  reject candidates outside it.
3. Recompute `delta` as an integer. Rate `delta <= 0` as `too_easy`, positive
  delta up to `max(2, ceil(goalBaseline / 2))` as `realistic`, and larger delta
  as `too_ambitious`. The realistic bound is checked without floating point:
  `2 * delta <= max(4, goalBaseline + (goalBaseline % 2))`.
  The tool is the sole source of the rating; do not ask the model to classify
  or echo a rating in its Step-1 proposal.
4. Recompute decimal metrics/rates and ratios, round each displayed derived
  decimal value to exactly two places, and reject mismatches. If a positive
  duration produces a rate outside finite JavaScript number range, normalize
  that rate to `null`; evidence stores the normalized scalar and is compared
  exactly. Rating never depends on rounded `targetRatio`.
5. Validate evidence IDs are in the stable allowlist and each evidence value
   equals the corresponding normalized metric/candidate field.
6. Serialize and enforce the 4,096-byte limit.
7. Project only allowlisted fields into the model context; never forward raw
  session objects, secret-bearing objects, error text or unrelated state.

Step 1 context contains the selected goal, bounded session facts, allowed
candidate interval and tool-call schema, but no rating enum, thresholds or
evaluation formula. `evaluate_practice_goal` is the sole authority that rates
a candidate; later model steps receive the rating only from its validated
normalized result. When a tool execution succeeds, the API returns this same
validated normalized object as `evaluation` alongside the plan. Clients render
evaluator metrics only from that field. A preflight `goal_unavailable`
response has `evaluation: null` because no tool execution occurred.

No secrets are expected in this pure tool; schema projection also prevents
unexpected properties from being forwarded. If any validation fails, no
second model step occurs.

### Forbidden behavior

- No filesystem, shell, network, database, browser, URL fetch or provider call.
- No dynamic dispatch based on an arbitrary model-provided function name.
- No score, game state, difficulty, rules, session map or persistent state
  mutation.
- No access to another session, previous sessions, account data or full game
  state.
- No collision-frequency, movement-pattern or causal claim; those observations
  are not present in the source data.
- No secret, raw request, private telemetry, stack trace or arbitrary object in
  the result.

## Tool registry

The compiled backend registry contains exactly:

```ts
const ALLOWED_AGENT_TOOLS = {
  evaluate_practice_goal,
} as const;
```

The orchestrator validates the proposed name against this fixed registry,
parses arguments with the tool's runtime schema, validates run/session scope
and all budgets, then invokes the single function. Unknown names are rejected;
the registry never evaluates a model-supplied expression.