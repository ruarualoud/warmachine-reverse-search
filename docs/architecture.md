# Architecture

## Ownership

```text
warmachine-strict-engine / Warmachine Host
  rules-v1 + strict RNG + reactions + rule atoms + exact probability + roster/deployment
                    |
                    | versioned host contract + dependency receipt
                    v
warmachine-reverse-search
  terminal generators
  reverse operators
  symbolic worklist
  spatial/formation quotient
  pruning and probability bounds
  strict witness scheduler / CEGAR
  aggregation, checkpoint and report
```

The dependency points one way. This repository may inspect and invoke the host but may not redefine legality or duplicate card-rule execution.

## Migration Layers

1. **Host contract**: stable loader, API assertions, source hashes and dirty-state receipt.
2. **Pure reverse kernel**: spatial quotient, primitive contracts, rule regression, symbolic worklist and interval algebra.
3. **Search orchestration**: terminal generation, lazy dimensions, strict witness scheduler, CEGAR and result merging.
4. **Construction layer**: roster candidates, formation library, deployment proposal mass and matchup aggregation.
5. **External DAG**: content-addressed states, independent edge/label/chance/receipt ledgers, immutable DDD segments and transactional roots.
6. **Products**: checkpoint runner, ranked reports, diagrams and human review.

During extraction, `loadLegacyReverseSearchModules()` keeps the existing implementation callable for parity tests. It is migration scaffolding, not the target architecture.

The core Host loads rules, atoms, adapter behavior, and exact probability. The construction Host is lazy and additionally loads roster/deployment packing, deployment audit, and formation interaction analysis; pure reverse-kernel verification does not pay that import cost.

## Evidence Ladder

1. A terminal goal is syntactically generated.
2. A reverse operator produces typed predecessor obligations.
3. A legal opening is compatible with the symbolic frontier.
4. Engine strict execution certifies a complete route.
5. Exhausted opponent and chance branches establish a probability bound.
6. Exhausted declared roster/opening/terminal denominators support a matchup-level claim.

No layer may inherit the authority of a higher layer without its evidence.

## Persistent Search Graph

The cold graph uses the [external DAG v1 contract](external-dag-storage-v1.md). Search workers append immutable candidate segments; a partitioned single writer exact-merges them and publishes a checkpoint before acknowledgment. The checkpoint binds the Engine receipt and local source/config hashes. State convergence shares only exact canonical state payloads; routes, Chance contributions, receipts and unresolved mass retain separate identities.
