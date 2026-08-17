# ADR 0001: Depend on the Warmachine Host Instead of Copying Rules

## Status

Accepted on 2026-08-10.

## Context

Reverse search needs frequent, exact access to legal actions, state transitions, RNG, reactions, rule atoms, roster construction, and deployment legality. Copying those modules into a new repository would immediately create two rules authorities and make every card-data update a parity risk. Direct unversioned path imports would make checkpoint recovery unsafe, especially while the upstream worktree is dirty.

## Decision

Keep Warmachine rules and data execution in the dedicated `warmachine-strict-engine` repository. This repository loads a narrow host contract from a configured Engine root. Every run records the Engine Git revision, tracked dirty state, and SHA-256 of contract-critical modules. Search code owns no fallback rules implementation. The legacy Project D root remains a temporary compatible source layout only.

A temporary legacy bridge may call reverse-search modules still located upstream during extraction. It must be removed after source and verifier parity.

## Consequences

- Rules fixes become available without duplicating execution code.
- Checkpoints and reports can reject source drift deterministically.
- Search development can have an independent repository, issue map and release cadence.
- The host contract must eventually become an explicit Project D package/API rather than relying forever on repository-relative module paths.
