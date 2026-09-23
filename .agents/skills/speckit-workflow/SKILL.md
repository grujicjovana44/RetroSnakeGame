---
name: speckit-workflow
description: Orchestrate the local SpecKit lifecycle from analysis through implementation and task-to-issue drafts.
---

# SpecKit workflow

Use the phases in this order:

`analyze → checklist → clarify → constitution → converge → specify → plan → tasks → implement → tasks-to-issues`

Rules:

- `analyze`, `checklist`, `clarify`, `constitution`, `converge`, `specify`, `plan`, and `tasks` are planning/documentation phases.
- `implement` requires an approved specification, plan, and task list.
- `tasks-to-issues` is optional and produces local drafts unless external issue creation is explicitly authorized.
- Every requirement must be traceable to code, tests, and evidence.
- The repository's `AGENTS.md` and source-of-truth documents remain binding.
- Session-specific scope must be stated explicitly; later-session features cannot be pulled into an earlier session.
