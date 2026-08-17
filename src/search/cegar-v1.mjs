import { createHash } from "node:crypto";

export const WARMACHINE_SEARCH_CEGAR_SCHEMA = "warmachine_search_cegar_v1";

function stableHash(value, length = 24) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, length);
}

function compactText(value) {
  return String(value || "").trim().toLowerCase();
}

function predicate(predicateKey, dimensions, detail = {}) {
  return { predicateKey, dimensions, ...detail };
}

function reasonPredicates(reason = "", eventTypes = []) {
  const text = `${compactText(reason)} ${eventTypes.map(compactText).join(" ")}`;
  const predicates = [];
  if (/line.?of.?sight|\blos\b|intervening|cloud/.test(text)) {
    predicates.push(predicate("line_of_sight_clear", ["actor", "target", "terrain", "intervening_models"]));
  }
  if (/range|distance|too_far|out_of/.test(text)) {
    predicates.push(predicate("target_within_effective_range", ["actor_position", "target_position", "range_modifiers", "point_of_origin"]));
  }
  if (/collision|overlap|placement|destination|board_edge|obstacle|obstruction/.test(text)) {
    predicates.push(predicate("destination_geometry_legal", ["destination", "base_size", "terrain", "live_models", "board"]));
  }
  if (/focus|fury|resource|force|leech|upkeep|hunger|corpse|soul/.test(text)) {
    predicates.push(predicate("resource_ledger_satisfies_payment", ["resource_kind", "amount", "capacity", "source", "timing", "controller"]));
  }
  if (/control_range|controller|ownership|battlegroup|jack_marshal/.test(text)) {
    predicates.push(predicate("controller_and_control_range_valid", ["controller", "ownership", "control_range", "line_of_sight_independence"]));
  }
  if (/reaction|free_strike|countercharge|admonition|shield_guard/.test(text)) {
    predicates.push(predicate("reaction_choice_space_resolved", ["reactor", "owner_side", "choice", "destination", "once_per_round"]));
  }
  if (/damage.?grid|damage.?column|damage.?branch|life.?spiral|aspect|system/.test(text)) {
    predicates.push(predicate("damage_structure_outcome_resolved", ["damage_amount", "column_or_branch", "grid_or_spiral", "system_or_aspect"]));
  }
  if (/phase|window|activation|turn|timing|forfeit|already_used|once_per/.test(text)) {
    predicates.push(predicate("lifecycle_window_open", ["turn", "phase", "activation", "usage_ledger", "forfeit_state"]));
  }
  if (/unknown|unmodeled|unsupported|source_contract|rule_atom|special_rule/.test(text)) {
    predicates.push(predicate("rule_source_and_interaction_closure_complete", ["source_id", "atom_key", "hook", "related_rules", "executor"]));
  }
  if (/roll_outcome|required_outcome|rng|random|tough|critical/.test(text)) {
    predicates.push(predicate("chance_outcome_mass_resolved", ["roll_kind", "dice", "critical", "tough", "derived_outcomes"]));
  }
  if (!predicates.length) predicates.push(predicate("exact_transition_preconditions", ["full_state", "action", "strict_executor"]));
  return Array.from(new Map(predicates.map((entry) => [entry.predicateKey, entry])).values());
}

export function buildWarmachineStrictRejectionRefinement(input = {}) {
  const reason = String(input.reason || input.transition?.reason || "strict_transition_rejected");
  const eventTypes = (input.eventTypes || input.transition?.events?.map((event) => event.eventType) || []).map(String);
  const text = compactText(reason);
  const missingStochasticOrChoiceInput = /pending|outcome_required|required_outcome|roll_outcome|rng|reaction.*required|choice.*required/.test(text);
  const unknownRuleOrExecutorCoverage = /unknown|unmodeled|unsupported|source_contract|rule_atom/.test(text);
  const trustedEnumeratedLegalAction = input.trustedEnumeratedLegalAction === true;
  const disposition = missingStochasticOrChoiceInput
    ? "unresolved_missing_stochastic_or_choice_input"
    : unknownRuleOrExecutorCoverage
      ? "unresolved_rule_or_executor_coverage"
      : trustedEnumeratedLegalAction
        ? "enumerator_executor_contract_drift"
        : "exact_transition_rejected_needs_independent_replay";
  const predicates = reasonPredicates(reason, eventTypes);
  return {
    schemaVersion: WARMACHINE_SEARCH_CEGAR_SCHEMA,
    refinementKey: `strict-rejection-refinement-${stableHash({
      stateFingerprint: input.stateFingerprint || "",
      actionKey: input.actionKey || input.action?.actionKey || "",
      reason,
      eventTypes,
      predicates,
    })}`,
    stateFingerprint: input.stateFingerprint || "",
    actionKey: String(input.actionKey || input.action?.actionKey || ""),
    actionType: String(input.actionType || input.action?.actionType || ""),
    reason,
    eventTypes,
    predicates,
    disposition,
    exactScope: {
      sameStateFingerprintOnly: true,
      sameActionKeyOnly: true,
      sameOutcomeAndReactionInputsOnly: true,
    },
    hardPruneAllowed: false,
    hardPruneBlockers: [
      "independent_refutation_not_recorded",
      ...(trustedEnumeratedLegalAction ? ["enumerator_executor_contract_drift_must_be_repaired_or_explained"] : []),
      ...(missingStochasticOrChoiceInput ? ["missing_probability_or_choice_mass"] : []),
      ...(unknownRuleOrExecutorCoverage ? ["rule_or_executor_coverage_incomplete"] : []),
    ],
    claimBoundary: "A strict rejection refines the exact state/action obligation. It does not delete sibling actions, actors, targets, parameters, or future states without an independent conservative proof.",
  };
}

export function promoteWarmachineCegarExactRejectionProof(refinement = {}, proof = {}) {
  const exactBinding = Boolean(
    refinement.stateFingerprint &&
    refinement.stateFingerprint === proof.stateFingerprint &&
    refinement.actionKey &&
    refinement.actionKey === proof.actionKey,
  );
  const hardPruneAllowed = exactBinding && proof.exactRejectProven === true && proof.hardPruneAllowed === true;
  return {
    ...refinement,
    disposition: hardPruneAllowed
      ? "exact_strict_rejection_replay_proven"
      : refinement.disposition,
    hardPruneAllowed,
    hardPruneScope: hardPruneAllowed ? proof.hardPruneScope : refinement.exactScope,
    hardPruneBlockers: hardPruneAllowed
      ? []
      : Array.from(new Set([
          ...(refinement.hardPruneBlockers || []),
          ...(!exactBinding ? ["replay_proof_binding_mismatch"] : []),
          ...(proof.blockers || []),
        ])),
    replayProof: {
      schemaVersion: proof.schemaVersion || "",
      proofKey: proof.proofKey || "",
      exactBinding,
      exactRejectProven: proof.exactRejectProven === true,
    },
    claimBoundary: hardPruneAllowed
      ? "The replay proof removes only this exact state/action/enumeration-input branch. It does not generalize to sibling actions, parameter values, actors, future states, or rules revisions."
      : refinement.claimBoundary,
  };
}

export function summarizeWarmachineCegarRefinements(refinements = []) {
  const rows = refinements.filter(Boolean);
  const countByDisposition = {};
  const countByPredicate = {};
  for (const row of rows) {
    countByDisposition[row.disposition] = (countByDisposition[row.disposition] || 0) + 1;
    for (const entry of row.predicates || []) {
      countByPredicate[entry.predicateKey] = (countByPredicate[entry.predicateKey] || 0) + 1;
    }
  }
  return {
    schemaVersion: WARMACHINE_SEARCH_CEGAR_SCHEMA,
    refinementCount: rows.length,
    countByDisposition,
    countByPredicate,
    hardPruneCount: rows.filter((row) => row.hardPruneAllowed === true).length,
    contractDriftCount: rows.filter((row) => row.disposition === "enumerator_executor_contract_drift").length,
    unresolvedCount: rows.filter((row) => row.disposition.startsWith("unresolved_")).length,
  };
}
