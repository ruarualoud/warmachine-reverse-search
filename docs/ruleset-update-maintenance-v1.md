# Warmachine ruleset update maintenance v1

The reviewed ruleset is not a single version number. It is a composite of the
strict Host sources, card data, atom/operator registry, hook families, typed
interaction graph, Steamroller profiles, construction pool and strict evidence.

## Update path

1. Sync the upstream bundle and its local mirror.
2. Run `npm run prepare:ruleset-update`. This writes a current semantic index, a
   candidate baseline and an impact report under `.scratch/ruleset-update-v1`.
   It never overwrites the reviewed baseline.
3. Review changes by entity instead of by raw file hash:
   - a new card using already mapped sources still needs card-specific positive
     and negative strict scenes;
   - an exact semantic fingerprint match may propose reuse of an atom, but the
     source binding and strict scenes must authorize it;
   - a new semantic source remains fail-closed until it is classified as a core
     or generic strict behavior, or implemented as a new atom, hooks and
     interactions;
   - a rule, timing, scenario or core executor change invalidates the wider
     witness and checkpoint set identified by the report;
   - a points, field allowance, attachment or army-membership change rebuilds
     construction pools and legal openings even when combat execution is
     unchanged.
4. Regenerate the typed interaction graph and run focused source-contract,
   strict positive/negative, rejection and interaction tests for every impacted
   card and atom. Review-neighbor atoms are audit candidates, not proof that an
   interaction exists.
5. Run all reverse-search gates and fixed benchmarks. Old checkpoints remain
   frozen and old witnesses remain historical evidence until the new composite
   receipt passes.
6. Re-run ctx2skill/skill2ctx for impacted rule and strategy skills. Rules
   memory, LLM explanations and old search routes cannot promote the new rules.
7. Record the candidate semantic-index hash, impact hash, strict gate evidence
   and skill gate evidence in a `warmachine_ruleset_update_review_v1` receipt.
   Promote both reviewed files together with
   `npm run promote:ruleset-update -- --review-receipt=<path>`. The command
   rejects a candidate key, missing evidence, a mismatched receipt, or drift
   after review. A changed version string alone is never sufficient.

## Compatibility contract

Each atom owns one rule meaning. Hooks are phase/event attachment points and an
atom can use several hooks. Interactions record cross-rule timing, inhibition,
replacement, resource and geometry relations. Units bind source IDs to atoms;
they do not receive bespoke execution code when existing atoms compose the
rule. This makes the common update additive and local while keeping unfamiliar
semantics explicit.

The committed semantic index stores hashes and dependency references, not a
second copy of rule text. Exact text/fingerprint matching is a maintenance hint
only. Strict Host execution remains the sole legality and transition authority.
