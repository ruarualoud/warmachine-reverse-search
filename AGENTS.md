# AGENTS.md

## Scope

This repository owns Warmachine reverse-search planning, algorithms, checkpoints, reports, and verifiers.

It does not own or fork Warmachine rules execution. The independent `warmachine-strict-engine` repository, selected through the receipt-bound Host loader, owns rules-v1 action enumeration, strict transitions, RNG materialization, reactions, rule atoms, roster construction, and deployment legality. Project D is an integration consumer, not an alternate Search rules implementation.

## Required Reads

Before editing:

1. Read `PROJECT_MEMORY.md`.
2. Read `TASKS.md`.
3. Read `.scratch/warmachine-custom-matchup-wayfinder-v1/map.md` and the current ticket, including its inline OPT development/acceptance checklist. Older Wayfinder maps are historical references.
4. On task resume, rule-batch work, or strategy-advisor planning, follow `docs/AGENT_TASK_GUIDE.md`; it routes to the authoritative standard and task-specific contract without duplicating their checklists.

## Engineering Boundaries

- Reverse constraints and heuristics may propose, order, bound, or refute only under declared evidence.
- Only upstream strict forward execution can certify a route.
- Never copy Warmachine rule logic into this repository.
- Bind every checkpoint and report to an upstream dependency receipt and local source/config hash.
- Budget exhaustion and incomplete terminal/operator/chance/opponent coverage remain unresolved.
- Update `TASKS.md` after implementation work. Update `PROJECT_MEMORY.md` only for durable invariants.
