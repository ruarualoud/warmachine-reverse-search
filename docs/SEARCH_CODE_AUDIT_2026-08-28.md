# Warmachine Reverse Search Code Audit

Date: 2026-08-28

## Scope

This audit covers the independent `warmachine-reverse-search` repository at
`origin/main@65e87e7` plus the current recovery worktree. It checks repository
boundaries, Engine Host authority, source receipts, state identity, exact Chance,
opponent response ownership, reverse-state invariants, checkpoint recovery and the
project completion gate. It does not certify all Warmachine rules or strategy
optimality.

## Repository And Ticket Control

- The Search and Strict Engine directories are independent Git repositories with
  independent remotes.
- The canonical Wayfinder ledger contains all 23 tickets: 14 closed and 9 open,
  with no missing blocker, unmapped ticket or dependency cycle.
- Ledger publication commit: `4882d10` on
  `origin/codex/post-audit-mainline-recovery`.
- GitHub web Issues are not a second source of truth. The versioned ticket files
  and `map.md` remain authoritative until an authenticated issue projection is
  deliberately added.

## Resolved Findings And Open Debt

### 1. Resolved: post-response damage-layout Chance

Search now applies the defender-owned damage-transfer decision first and opens a
nested damage-layout Chance node only for the resulting recipient. The focused
Host receipt conserves 12 primary Chance classes, two transfer responses and six
post-transfer life-spiral branches; all six resulting outcomes execute in Engine.
This preserves the information boundary because the defender cannot observe a
location die that is not required until after its response.

### 2. Resolved: Dragoon replacement replay

The lifecycle window now preserves original damage suffered, recorded damage and
discarded excess separately. Sealed replay retains five discarded damage for a
15-damage hit on a ten-box mounted form. The parameterized Host boundary also
executes an arbitrary legal full-base-contained dismount point and rejects an
illegal point without mutating caller state.

### 3. Resolved: public Search normalization boundary

`evaluateWarmachineMatchupState()` and `buildWarmachineActivationGroups()` now
normalize every public input instead of trusting a truthy `schemaVersion`.
Forged, legacy and already-normalized fixtures pass the focused boundary verifier.

### 4. Aggregate verifier inventory is stale

The repository currently discovers 157 `verify-*.mjs` scripts excluding the two
aggregate wrappers, while the completion gate declares 82. The exact inventory
guard therefore rejects the repository before an aggregate readiness report can be
issued. The remaining 75 undeclared scripts include current execution-receipt, run-contract,
geometry, complete-activation, opponent-response, recovery and Ticket 05-19 gates.

Disposition: confirmed Ticket 23 Slice 23.11 debt. Classify every verifier as a
required bounded gate, long experiment or operational probe, then make the declared
inventory exhaustive for the chosen completion denominator. Do not silently ignore
new verifier files.

### 5. Resolved: independent Engine root selection

`resolveWarmachineEngineRoot()` now accepts an explicit `WARMACHINE_ENGINE_ROOT` or
the sibling `warmachine-strict-engine` and fails closed otherwise. Historical
monolith fallbacks no longer participate in current Search execution.

## Verified Working Boundaries

- All current `src` and `scripts` MJS files pass `node --check`.
- All 176 package script targets exist.
- Search execution receipt closure, drift invalidation and path containment pass.
- Search run-contract identity changes with semantic budgets and ignores only
  runtime callbacks/checkpoint payloads.
- Reverse-state invariant and invariant-coverage gates pass.
- Terminal transition recovery and two-worker resume gates pass, including stale
  writer, unpublished checkpoint and interruption cases.
- Exact probability DAG and adversarial frontier mass conservation pass.
- Complete activation and opponent-response domains run but correctly remain
  incomplete for continuous destination and reaction-Chance complements.
- Strict Unit movement witness passes accepted and rejected execution; its joint
  continuous parameter domain remains explicitly incomplete.
- `explicitMovementPaths` are deliberately excluded from semantic state identity:
  they are transient execution hints removed before predecessor publication, and a
  focused regression proves this boundary.

## Ticket 23.5 Bounded Certification

The certified core registry contains 29 attack/damage semantics, 32 primitives, 90
literal oracle fixtures, 36 executor-evidence cases and 97 mutation obligations.
Fourteen Engine focused verifiers pass. Engine source receipt is
`d08f2225...b8fb`; current Search/Host parity report is `555d460b...f5f5` under
Host receipt `9bcbd810...202b`. Current card-specific attack templates and missing card-provided
life-spiral topology remain Slice 23.8 work; continuous Dragoon-placement quotient
coverage remains Ticket 20 work; full runtime publication parity remains Slice
23.10 work.

## Ticket 23.6 Initial Historical Audit

The first duplicate-safe inventory exercises 15 existing rule/harness paths across
Focus/Fury control sequencing, threshold/frenzy, resource manipulation, spells,
upkeeps, target tokens, souls/corpses and warbeast systems. One real cross-runtime
defect was found: the Layer3 adapter omitted explicit token/card ARC while mapping
combat stats, so an ARC-7 warcaster silently used the Engine default of 6 and
replenished one Focus short. The adapter now preserves ARC; full-turn replay proves
Focus `5 -> 7`, while the warlock Fury control case remains `5 -> 5` through exact
token patches and state rebuilds.

Two other failures were verifier drift rather than executor defects: current
automatic-hit semantics allow an explicit choice to relinquish the automatic hit
and roll, and strict damage fixtures now require coherent life-spiral topology,
damage-column Chance and selected healing cells. The Playwright spell-stat display
check was not run because Chromium is absent and remains UI-only evidence. This
inventory starts Slice 23.6; it does not provide the still-missing source-bound
semantic denominator, independent oracles, interaction obligations or mutations.

The bounded Slice 23.6a follow-up closes the ordinary Maintenance/Focus subset:
five official-source semantics, six shared pure primitives, 22 literal fixtures
and 12/12 killed mutations. Engine control replay passes 42 assertions, Layer3
ARC/target-token replay passes 200 assertions, and micro battles pass 108/108.
The audit found one additional real legacy defect: a caller-declared warjack
`resourceMax=4` could authorize a fourth Focus point. Power Up, allocation
enumeration and allocation mutation now share the source-fixed cap of three and
record the primitive disposition in replay. Slice receipt is
`7b6b5d0630e580d33e5f295f90879c705185f8d7ad1c991ba8f39f560376c934`.

The bounded Slice 23.6b follow-up recertifies the existing ordinary Fury
executors; it does not count their historical implementation as new work. Eight
source-bound semantics now share nine pure primitives, 35 independent literal
fixtures and 13/13 killed mutations. Seven historical Fury-focused paths plus
the defender-owned damage-transfer continuation and micro battles 108/108 pass
under corrected receipt `47e7422b74d244c439f642f0c298a89980a1df63711479551d41cbe2bffdef5e`,
bound to authority `54ab5d64...e394`.

The recertification found real legacy boundary defects: leech/life-force/Spirit
Bond/pre-threshold/reaving capacity could follow declared `resourceMax` instead
of current ARC; threshold application accepted less than exactly 2d6; ordinary
Construct warbeast healing was not rejected; transfer-recipient damage-layout
Chance was prepared for the original warlock rather than the defender-selected
warbeast; and a Wild warbeast could receive non-force Fury. Those paths are now
shared-primitive-backed and replay tested. Provoke's full spell/second-frenzy/
once-per-turn chain, Elemental Mastery's explicit Construct-healing exception and
special reavers remain named exact-owner debts for Slice 23.6d/23.8. Essence and
parent Slice 23.6 remain open.

The bounded Slice 23.6c follow-up recertifies ordinary spell, upkeep, animus,
feat and channeling behavior with seven source semantics, eight shared pure
primitives, 26 independent literal fixtures and 9/9 killed mutations. The
aggregate passes 15 core executor cases, 36 command/channel cases, 172 card-text
cases and micro battles 108/108 under Engine receipt
`f7f7ab871f61479dc6074b940686c65619283029499f415a51cea6624f6da2f4`,
bound to authority `54ab5d64...e394`.
Real repairs cover fixed one-point upkeep maintenance, current-data warbeast
spell classification, own/battlegroup animus access, warbeast once-per-activation
use, same-caster/same-side/whole-Unit effect replacement, numeric effect reversal
on replacement/expiry and structured leader identity taking precedence over
misleading labels. Card-specific COST/target replacement and Magic Ability timing
remain Slice 23.8 debts rather than ordinary spell completion.

The affected Search Host parity was reissued against current Host
`860839a1...a931`. Slice 23.6c report `dda66ab1...e182` binds the exact Engine
rules/primitives/adapter hashes and proves representative upkeep/animus positive
and negative behavior with zero Search-owned spell rules. Reissued Slice 23.5
report `96243cdf...d37c` retains 12 primary Chance classes, two defender responses,
six post-transfer life-spiral classes and zero Search-side rule implementation.
The longer `f4634cec...2603` tree remains provenance under its older receipt and
will be reissued after parent Slice 23.6 source freeze.

With both repositories frozen on Host `9bcbd810...202b`, the full Search
probability/recovery gate also passes at report `f4634cec...2603`: 1,927 nodes,
2,674 edges, 68 Chance audits, 816 owner-response audits and exact value 1225/1296.
Threshold mass is conserved, external-DAG restore/stitch succeeds, and sequential
and parallel continuation batches are equivalent. The earlier parallel report-hash
failure was caused by Engine receipt drift while parent and child processes were
running; it was not a branch-loss or search-algorithm defect.

## Claim Boundary

These results certify the registered Slice 23.5 core and bounded Slice 23.6a Focus,
23.6b ordinary Fury and 23.6c ordinary spell subsets, and close the concrete defects
found by this audit. They do not imply parent Slice 23.6, the complete action space,
continuous geometry, all opponent responses, all card interactions, global Strict
readiness or any strategy optimum has been proven.
