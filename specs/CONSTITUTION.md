# RetroSnake project constitution

## Status

Active for Week 3 / Session 003. Amendments require explicit human approval.

## Principles

1. **Specification is authoritative.** `docs/GAME_SPEC.md` defines gameplay and
   scope. Conflicts are reported and resolved explicitly.
2. **Small, traceable changes.** Every implementation change maps to a
   requirement, task, test, and evidence entry.
3. **Validation is part of done.** Typecheck, tests, build, and applicable
   browser checks must be run and recorded.
4. **Scope is protected.** Session 004 AI Hint, tool calling, multiplayer,
   accounts, backend, audio, and unrelated dependencies are out of scope.
5. **Typed and validated contracts.** Structured data uses TypeScript types and
   runtime validation where required by the specification.
6. **Human review remains required.** The agent does not commit, push, or
   silently change scope, secrets, dependencies, or source-of-truth rules.

## Required lifecycle

`analyze → checklist → clarify → constitution → converge → specify → plan → tasks → implement → tasks-to-issues`

The lifecycle is implemented by the project skills in `.agents/skills/`.
