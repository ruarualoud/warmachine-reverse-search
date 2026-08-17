# Domain Glossary

## 2026-08-18 Team Handoff

- Rules authority is the sibling `warmachine-strict-engine` repository snapshot.
- New environments use `WARMACHINE_ENGINE_ROOT`; `WARMACHINE_PROJECT_D_ROOT` remains a compatibility alias.
- Wayfinder Tickets 01-04 are complete. Ticket 05 remains active at the fully verified `37/64` baseline.
- The six-task Gorman WIP is not complete: only the terrain-blocked strict rejection was run after the latest edits.
- Large `.scratch` runs are not source and are intentionally excluded from Git.
- Read `docs/HANDOFF_STATUS.md`, `docs/DEVELOPMENT_DESIGN.md`, and `docs/DEVELOPMENT_PLAN.md` before continuing.

## Warmachine Host

The external Project D capability that owns Warmachine rules-v1 state normalization, legal action enumeration, strict action application, RNG materialization, opponent reactions, rule atoms, roster construction, and deployment legality.

## Terminal Goal

A typed winning condition such as leader assassination or legal scenario-score victory. A terminal goal is a result family, not a scalar position score.

## Minimal Victory Certificate

The smallest rules-valid set of facts and transitions sufficient to establish a Steamroller assassination or scenario-score victory. It is the seed of reverse search, not a complete battlefield state.

## Scenario Envelope

The declared rules, construction space, battlefield conditions, victory conditions, uncertainty model, and abstraction limits within which a search result is evaluated.

## Scenario-Optimal Result

A best result proved within one Scenario Envelope. It is not a claim that a faction, army list, or strategy is globally optimal across Warmachine.

## Best Discovered Candidate

The highest-ranked certified route among the candidates actually generated inside a Scenario Envelope. It makes no claim that a pruned or ungenerated route could not be better.

## Terminal-Conditioned Route

A candidate history reconstructed backward from a Terminal Goal toward a legal opening and then certified in the forward direction. It is one route to the result, not evidence that all alternatives were considered.

## Opening Basin

The set of legal opening states from which at least one certified route reaches a specified Terminal Goal under the Scenario Envelope.

## Deployment Opening

A legal post-deployment game state for fixed army lists, scenario conditions, terrain, and starting-player choices.

## Construction Opening

A legal army-list choice for a fixed faction and construction contract. Its reachable Deployment Openings form the next layer of the reverse-search result.

## Efficiency Floor

The declared minimum strategic efficiency required for a candidate branch to remain in the proposal universe. It is a subjective search boundary, not a proof that discarded branches cannot win.

## Forward Completion

Goal-directed forward search launched from a fixed reverse-search branch to recover useful continuations that the backward efficiency filter cannot represent reliably.

## Causal Support

State, models, resources, actions, and prior events required for a candidate route to remain legal and reach its Minimal Victory Certificate.

## Potentially Interfering Context

Legal battlefield content outside the current Causal Support that could change legality, choices, probabilities, scoring, or strategic value. It may not be discarded as noise without analysis.

## Proven Inert Context

Legal battlefield content proved not to change a candidate route under the declared abstraction and Scenario Envelope. Equivalent inert completions may be grouped rather than enumerated individually.

## Victory-Relative Time

A temporal coordinate measured backward from the winning turn: the terminal transition, the winning activation, the winning turn, prior turns, and prior rounds. It avoids assuming a fixed absolute game length before a route is generated.

## Convergent Predecessor Histories

Distinct legal action histories that reach the same complete rules-relevant state. Their state may be shared for future search while their separate costs, intentions, and training provenance remain available.

## Strategic Exchange

A deliberate trade of models, position, resources, tempo, or scenario pressure that improves a later terminal route. It is causal strategy, not inert noise, even when it does not directly perform the winning action.

## Capability Bottleneck

A terminal or predecessor obligation that only a restricted subset of models, rules, resources, or positions can satisfy. Resolving the bottleneck can lock a branch and safely exclude actors that cannot meet it.

## Current-Turn Search

A search mode optimized for completing obligations within the active turn, using exact remaining activations, resources, positions, and probabilities.

## Long-Horizon Search

A search mode that permits setup, exchanges, scenario pressure, and opponent-turn interaction across multiple turns before reaching a Terminal Goal.

## Symbolic Predecessor

A set of typed necessary obligations that could precede a terminal goal. It is not an inverse rules state and is not proof that an executable history exists.

## Strict Witness

A complete action, reaction, lifecycle, and chance chain that begins from a supplied legal opening and is accepted by the Warmachine Host through the terminal result.

## Unresolved Mass

Declared proposal, action, opponent, chance, or abstraction mass that was not proved or refuted within the finite contract. It is neither a win nor a loss.

## Dependency Receipt

The immutable identity of the Warmachine Host used for a run, including repository path, Git revision, dirty state, and hashes of critical source modules.
