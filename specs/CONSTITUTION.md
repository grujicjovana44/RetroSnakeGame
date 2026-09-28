# RetroSnake project constitution

## Status

Active for Week 3 / Session 003 and the approved Week 4 / Session 004 scope.
Amendments require explicit human approval.

## Principles

1. **Specification is authoritative.** `docs/GAME_SPEC.md` defines W03 gameplay;
   `docs/AI_FEATURE_SPEC.md` defines the approved W04 AI feature. Conflicts are
   reported and resolved explicitly.
2. **Small, traceable changes.** Every implementation change maps to a
   requirement, task, test, and evidence entry.
3. **Validation is part of done.** Typecheck, tests, build, and applicable
   browser checks must be run and recorded.
4. **Scope is protected.** W04 includes post-game AI Advice, its TypeScript
   backend, the read-only Gemini stats tool, and a private local usage report.
   Real-time AI Hint, autonomous tool access, multiplayer, accounts, deployment,
   and unrelated dependencies remain out of scope.
5. **Typed and validated contracts.** Structured data uses TypeScript types and
   runtime validation where required by the specification.
6. **Human review remains required.** The agent does not commit, push, or
   silently change scope, secrets, dependencies, or source-of-truth rules.

## Required lifecycle

`analyze → checklist → clarify → constitution → converge → specify → plan → tasks → implement → tasks-to-issues`

The lifecycle is implemented by the project skills in `.agents/skills/`.

## Amendment

On 2026-09-27 the human owner approved the W04 assignment scope and the local
usage report. This amendment supersedes the earlier Session 003 statement
that backend and tool calling were out of scope; it does not change W03 gameplay
rules or authorize additional dependencies.
