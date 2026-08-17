# AGENTS.md

## Scope

This repository owns Warmachine reverse-search planning, algorithms, checkpoints, reports, and verifiers.

It does not own or fork Warmachine rules execution. The adjacent `project-d` repository remains the source of truth for rules-v1 action enumeration, strict transitions, RNG materialization, reactions, rule atoms, roster construction, and deployment legality.

## Required Reads

Before editing:

1. Read `PROJECT_MEMORY.md`.
2. Read `TASKS.md`.
3. Read `.scratch/warmachine-reverse-search-wayfinder/map.md` and the current frontier ticket.

## Engineering Boundaries

- Reverse constraints and heuristics may propose, order, bound, or refute only under declared evidence.
- Only upstream strict forward execution can certify a route.
- Never copy Warmachine rule logic into this repository.
- Bind every checkpoint and report to an upstream dependency receipt and local source/config hash.
- Budget exhaustion and incomplete terminal/operator/chance/opponent coverage remain unresolved.
- Update `TASKS.md` after implementation work. Update `PROJECT_MEMORY.md` only for durable invariants.
