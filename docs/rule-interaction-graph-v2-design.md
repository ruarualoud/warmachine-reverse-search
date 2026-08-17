# Warmachine Typed Interaction Graph V2

## Why This Must Be Rebuilt

Project D currently exposes two different graph-shaped artifacts:

- The evidence graph in `data/warmachine-rule-interaction-graph-v20260701.json` has 67 core-rule nodes and 186 manually curated source/code/test interactions.
- The current atom registry exports 375 atom nodes, 458 hook operators, and 490 atom interactions over 761 normalized related-rule keys.

The existing terminal relevance closure joins both artifacts through untyped normalized strings. Shared hook and lifecycle names such as `attack_hit`, `model_destroyed`, and `reaction` become high-degree hubs. In the historical verifier, 24 assassination seeds reached 2,666 keys and selected 368 of 374 atoms. This was useful as a fail-open audit but ineffective as a relevance proof or pruning graph.

The fixed 106-model construction fixture reports 102 unique roster rule sources over 351 model occurrences: 36 sources map exactly by ID to 35 atoms and 66 remain unmapped. The complete classification denominator adds 18 Host core-rule advantages, four base-geometry tags, and two basic attack-profile facts for 126 total entries. Unmapped sources correctly remain wildcard relevant, so the denominator is explicit but not closed enough for hard pruning.

## Ownership Boundary

Project D remains the authority for:

- rule and card source data;
- rules-v1 legality and transitions;
- rule atom definitions, hooks, source contracts, and execution markers;
- focused strict verifier and replay evidence.

This repository owns the derived search graph:

- typed dependency edges used by reverse regression;
- roster and terminal-query projections;
- relevance closure and ordering;
- proof-graph links to strict forward witnesses;
- pruning eligibility and unresolved-mass accounting.

The derived graph is versioned by a Warmachine Host dependency receipt. It must not copy or redefine executor semantics.

## Separate Graph Products

### 1. Canonical Semantic Graph

Generated from current Host facts. Stable node kinds:

- `rule_source`
- `core_rule`
- `rule_atom`
- `hook_contract`
- `execution_primitive`
- `state_field`
- `timing_window`
- `resource_kind`
- `lifecycle_stage`
- `geometry_predicate`
- `status_kind`

Edges are directional and typed. Initial edge vocabulary:

- `source_maps_to_atom`
- `atom_executes_hook`
- `hook_invokes_primitive`
- `reads_state`
- `writes_state`
- `requires`
- `triggers`
- `prevents`
- `overrides`
- `grants`
- `expires_at`
- `precedes`
- `replaces_transition`
- `creates_choice_window`

Every semantic edge carries subject scope, target scope, timing, polarity, quantifier, structured applicability predicate, provenance, and reverse-search policy. Equality of normalized text keys does not create a semantic edge.

### 2. Evidence Overlay

The existing 67-node evidence graph is imported as evidence, not as the semantic topology. It attaches:

- rulebook/card source excerpts or source IDs;
- executor markers and integration surfaces;
- focused verifier and fixture identifiers;
- later strict replay and online trace receipts.

Evidence may validate an edge but cannot create an otherwise untyped executor dependency.

### 3. Roster Projection

For one concrete matchup, source contracts map card, model, weapon, spell, feat, animus, attachment, and acquired-rule sources to atoms. Every source is classified as:

- exact mapped;
- inherited or granted with exact provenance;
- core rule represented outside card atoms;
- descriptive/non-executable data;
- unresolved wildcard.

Unresolved wildcard sources remain relevant and disable hard pruning for affected branches.

### 4. Terminal Query Projection

A terminal goal selects typed obligations, not global string seeds. An assassination query starts from targeting, attack resolution, damage, lifecycle, terminal winner, relevant resources, and the exact actor/target source contracts. A scenario query starts from scoring timing, control/contest predicates, model presence, score transition, and terminal winner.

Traversal follows only edge types whose direction and reverse policy are valid for the obligation. Hook membership alone does not connect all atoms sharing that hook.

### 5. Search Proof Graph

The OR/AND/Chance worklist, opening/frontier meet, CEGAR refinements, strict forward transitions, and probability-mass ledger remain a separate per-run graph. It references semantic graph node IDs and evidence receipts, but it is not written back as universal rules truth.

## Generation Pipeline

1. Load a source-bound Warmachine Host receipt.
2. Import all atom definitions, hooks, source contracts, structured predicates, parameters, and declared interactions.
3. Normalize the core evidence graph into an evidence overlay.
4. Materialize typed state/timing/resource/lifecycle/geometry nodes from hook contracts and primitive parameter schemas.
5. Resolve declared interaction keys to typed endpoints; unresolved or ambiguous endpoints become generation issues.
6. Emit canonical, evidence, and coverage artifacts with deterministic hashes.
7. Build roster and query projections on demand without mutating the canonical graph.

## Initial Gates

- All 375 atoms and 458 hooks are represented exactly once.
- All 490 declared atom interactions resolve to typed endpoints; the current three interactions without `relatedRuleKeys` must be explicitly typed or quarantined.
- All 67 core evidence nodes and 186 evidence interactions attach to existing semantic nodes or report a blocking orphan.
- No dangling source, hook, primitive, state-field, timing, or evidence endpoint.
- Damage lifecycle order distinguishes disabled, boxed, destroyed, removed from play, exploded, replacement, and resource-generation timing.
- Resource edges distinguish possession, allocation, forcing, spending, leeching, reaving, transfer, capacity, and timing.
- Generic hook nodes are never used as unrestricted transitive bridges.
- A data update rebuilds the graph and fails when a new source, atom, hook, primitive, or interaction cannot be classified.

## Pruning Boundary

V2 starts as ordering and omission-audit evidence. Hard pruning is enabled only for a query branch when:

- every roster source in the branch has an exact classification;
- all traversed edges have structured applicability and direction;
- opponent action dependencies and reactions are closed;
- held-out strict traces prove terminal-reachability preservation under the proposed projection;
- truncated graph, action, chance, opening, and formation mass remains explicitly unresolved.

## Open Decisions

## Implemented Prototype

The V2 prototype is implemented in:

- `src/graph/typed-facts-v2.mjs`
- `src/graph/typed-interaction-graph-v2.mjs`
- `src/graph/capability-query-v2.mjs`

The Host receipt now directly hashes the Steamroller 2026 profile source in addition to rules-v1, the Layer3 adapter, rule atoms, and exact dice probability. A profile-only update therefore invalidates the graph and every derived projection.

The canonical graph currently contains 375 atoms, 458 hook operators, 194 primitives, 490 declared interactions, seven Steamroller profiles, 67 evidence rules, and 186 evidence interactions. All 458 operators have a typed family, predecessor obligation, capability contribution, primitive, integration surface, and complete structured-leaf representation. Three declarations without `relatedRuleKeys` have explicit quarantine endpoints. All evidence rules attach through evidence-only execution surfaces, with no evidence or declaration edge allowed to provide semantic topology.

Every semantic edge carries direction, scope, timing, polarity, quantifier, applicability, provenance, traversal class, and reverse policy. Structured leaves are classified as action, resource, timing, event, geometry, lifecycle, status, model, context/state, or generic operator constraints. Generic constraints preserve their exact path and value but are not traversable; they keep hard pruning disabled instead of being silently discarded.

The fixed 106-model projection is reproducibly `102 / 351 / 36 / 35 / 66 / 126` for unique sources, occurrences, exactly mapped sources, mapped atoms, unresolved sources, and the full denominator. Assassination currently returns seven obligations, 30 relevant operators, 26 exact atoms, 20 core facts, and 106 candidate models. Scenario returns six obligations, six core facts, and 44 exact core-fact model candidates; unknown card effects remain attached to 50 wildcard models.

`orderWarmachineActionsByTerminalQueryV2` is deliberately a stable ordering transform. The focused verifier proves set equality on a current 106-model strict transition and six held-out micro scenarios covering movement, boost/damage, focus allocation, frenzy, spray/Stealth, and Steamroller scoring. Shared hook names and shared declared strings cannot reach a second atom in the directed semantic graph.

## Decisions

1. Host core rules and rule atoms coexist as distinct providers. No synthetic atom is invented merely to represent a core action.
2. Structured operator data is extracted automatically. Known semantic categories create typed facts; residual fields become exact non-traversable operator constraints.
3. The source denominator permits explicit Host-core and structured non-atom classifications. Text similarity never counts as an exact mapping.
4. The current preservation corpus is sufficient for ordering-only use, not hard pruning. Hard pruning additionally requires source closure, opponent/reaction closure, and route-level strict witnesses.
5. Structural graph completeness is a prototype gate. Matchup claims still depend on the separate search proof graph and may not inherit completeness from this graph.

## Current Boundary

`hardPruningEnabled` remains `false`. The remaining blockers are 66 unresolved source entries, 454 generic operator constraints that have not been promoted to narrower semantics, opponent/reaction preservation, and broader held-out route preservation. Capability bottlenecks may rank unique exact providers, but never remove a branch while wildcard providers remain.

The compact reproducible evidence receipt is in `docs/research/typed-interaction-graph-v2-verification.json`; complete generated graph and projection artifacts are produced by `npm run generate:interaction-graph` under `build/typed-interaction-graph-v2/`.
