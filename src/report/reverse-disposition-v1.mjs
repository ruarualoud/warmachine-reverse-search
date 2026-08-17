export const WARMACHINE_REVERSE_DISPOSITION_V1_SCHEMA =
  "warmachine_reverse_disposition_v1";

export const WARMACHINE_REVERSE_DISPOSITION_KINDS_V1 = Object.freeze([
  "strict_rejected",
  "budget_deferred",
  "pruned_low_probability",
  "inverse_unresolved",
  "rules_unknown",
  "rules_drift",
  "proven_unreachable",
]);

const KIND_SET = new Set(WARMACHINE_REVERSE_DISPOSITION_KINDS_V1);
const ALIASES = Object.freeze({
  low_probability_unexpanded: "pruned_low_probability",
});

const PROTOCOLS = Object.freeze({
  strict_rejected: Object.freeze({
    resumableFromCheckpoint: false,
    recoveryAction: "change_predecessor_or_action_then_strict_reexecute",
    invalidatedBy: ["ruleset_change", "state_change", "action_contract_change"],
    countsAsFailure: false,
  }),
  budget_deferred: Object.freeze({
    resumableFromCheckpoint: true,
    recoveryAction: "resume_same_label_with_more_budget",
    invalidatedBy: ["ruleset_change", "search_contract_change"],
    countsAsFailure: false,
  }),
  pruned_low_probability: Object.freeze({
    resumableFromCheckpoint: true,
    recoveryAction: "lower_probability_threshold_and_resume_retained_label",
    invalidatedBy: ["ruleset_change", "probability_model_change"],
    countsAsFailure: false,
  }),
  inverse_unresolved: Object.freeze({
    resumableFromCheckpoint: true,
    recoveryAction: "add_or_select_inverse_operator_then_resume",
    invalidatedBy: ["ruleset_change", "inverse_operator_change"],
    countsAsFailure: false,
  }),
  rules_unknown: Object.freeze({
    resumableFromCheckpoint: true,
    recoveryAction: "resolve_rule_source_or_executor_then_resume",
    invalidatedBy: ["ruleset_change", "source_contract_change"],
    countsAsFailure: false,
  }),
  rules_drift: Object.freeze({
    resumableFromCheckpoint: false,
    recoveryAction: "rebuild_root_and_proof_under_current_host_receipt",
    invalidatedBy: ["host_receipt_mismatch"],
    countsAsFailure: false,
  }),
  proven_unreachable: Object.freeze({
    resumableFromCheckpoint: false,
    recoveryAction: "reopen_only_after_proof_dependency_change",
    invalidatedBy: ["ruleset_change", "terminal_cell_change", "proof_assumption_change"],
    countsAsFailure: true,
  }),
});

export function classifyWarmachineReverseDispositionV1(
  row = {},
  fallback = "inverse_unresolved",
) {
  const explicit = ALIASES[String(row.disposition || "")] ||
    String(row.disposition || "");
  if (KIND_SET.has(explicit)) return explicit;
  const reason = String(row.reason || "").toLowerCase();
  if (/rules?.?(?:et)?.?(?:dependency)?.?drift|host.?receipt.?mismatch/.test(reason)) {
    return "rules_drift";
  }
  if (/proven.?unreachable|mathematical.?contradiction/.test(reason)) {
    return "proven_unreachable";
  }
  if (/strict.?reject|not_in_strict|strict_.*rejected/.test(reason) ||
      row.strictRejected === true) return "strict_rejected";
  if (/low.?probability|pruned.?low|probability.?threshold/.test(reason)) {
    return "pruned_low_probability";
  }
  if (/budget|deferred|exhausted|page.?limit/.test(reason)) {
    return "budget_deferred";
  }
  if (/unmodeled|unknown.?rule|rules?.?unknown|wildcard|source.?contract/.test(reason)) {
    return "rules_unknown";
  }
  if (/inverse|preimage|unresolved|unsupported/.test(reason)) {
    return "inverse_unresolved";
  }
  const normalizedFallback = ALIASES[String(fallback || "")] || String(fallback || "");
  return KIND_SET.has(normalizedFallback) ? normalizedFallback : "inverse_unresolved";
}

export function warmachineReverseDispositionProtocolV1(kind = "") {
  const canonicalKind = ALIASES[String(kind || "")] || String(kind || "");
  return {
    schemaVersion: WARMACHINE_REVERSE_DISPOSITION_V1_SCHEMA,
    disposition: KIND_SET.has(canonicalKind) ? canonicalKind : "inverse_unresolved",
    ...(PROTOCOLS[canonicalKind] || PROTOCOLS.inverse_unresolved),
  };
}
