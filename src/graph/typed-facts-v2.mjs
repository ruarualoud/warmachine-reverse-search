import { createHash } from "node:crypto";

export const WARMACHINE_TYPED_FACT_CLASSIFIER_V2 =
  "warmachine_typed_fact_classifier_v2";

const RESOURCE_TERMS = Object.freeze([
  "focus",
  "fury",
  "hunger",
  "soul",
  "corpse",
  "essence",
  "mind",
  "rage",
  "token",
]);

export const WARMACHINE_LIFECYCLE_STAGE_KEYS_V2 = Object.freeze([
  "disabled",
  "boxed",
  "destroyed",
  "exploded",
  "removed_from_play",
  "remove_from_play",
  "rfp",
  "replaced",
  "returned_to_play",
  "dormant",
  "inert",
  "wild",
]);

export const WARMACHINE_RESOURCE_OPERATION_KEYS_V2 = Object.freeze([
  "possession",
  "allocation",
  "forcing",
  "spending",
  "leeching",
  "reaving",
  "transfer",
  "generation",
  "collection",
  "capacity",
]);

const BASE_CAPABILITIES_BY_FAMILY = Object.freeze({
  action_generation: ["action:generate"],
  action_parameterization: ["action:parameterize"],
  attack_legality: ["attack:legality"],
  attack_numeric_bound: ["attack:numeric"],
  damage_lifecycle: ["lifecycle:transition"],
  damage_numeric_bound: ["damage:numeric"],
  geometry_state: ["geometry:state"],
  movement_contact_branch: ["movement:contact"],
  movement_legality: ["movement:legality"],
  movement_numeric_bound: ["movement:numeric"],
  post_attack_branch: ["event:attack_resolved"],
  post_damage_branch: ["event:damage_applied"],
  post_hit_branch: ["event:attack_hit"],
  roster_legality: ["roster:legality"],
  source_lifecycle: ["lifecycle:source_leave_play"],
  status_transition: ["status:transition"],
  timing_transition: ["timing:transition"],
});

const CAPABILITIES_BY_HOOK = Object.freeze({
  model_disabled: ["lifecycle:disabled"],
  model_boxed: ["lifecycle:boxed"],
  model_destroyed: ["lifecycle:destroyed"],
  model_exploded: ["lifecycle:exploded"],
  source_leave_play: ["lifecycle:source_leave_play"],
  tough_validation: ["lifecycle:tough_resolution"],
  attack_hit: ["event:attack_hit"],
  attack_resolved: ["event:attack_resolved"],
  damage_applied: ["event:damage_applied"],
  movement_contact: ["event:movement_contact"],
  after_move: ["event:after_move"],
  activation_start: ["timing:activation_start"],
  activation_end: ["timing:activation_end"],
  control_phase_start: ["timing:control_phase_start"],
  turn_start: ["timing:turn_start"],
  turn_end: ["timing:turn_end"],
});

export const WARMACHINE_TERMINAL_OBLIGATIONS_V2 = Object.freeze({
  assassination: Object.freeze([
    Object.freeze({
      obligationKey: "assassination:leader_roster",
      obligationKind: "model_identity",
      requiredCapabilityKeys: Object.freeze(["terminal:leader_roster"]),
      requiredFactKinds: Object.freeze(["model_scope"]),
    }),
    Object.freeze({
      obligationKey: "assassination:legal_attack_source",
      obligationKind: "action_legality",
      requiredCapabilityKeys: Object.freeze(["action:attack", "attack:legality"]),
      requiredFactKinds: Object.freeze(["action_kind", "context_predicate"]),
    }),
    Object.freeze({
      obligationKey: "assassination:reachable_target",
      obligationKind: "geometry",
      requiredCapabilityKeys: Object.freeze(["geometry:state", "movement:legality"]),
      requiredFactKinds: Object.freeze(["geometry_constraint"]),
    }),
    Object.freeze({
      obligationKey: "assassination:attack_success",
      obligationKind: "chance_and_resource",
      requiredCapabilityKeys: Object.freeze(["attack:resolve", "attack:numeric"]),
      requiredFactKinds: Object.freeze(["resource_kind", "operator_constraint"]),
    }),
    Object.freeze({
      obligationKey: "assassination:terminal_damage",
      obligationKind: "damage",
      requiredCapabilityKeys: Object.freeze(["damage:resolve", "damage:numeric"]),
      requiredFactKinds: Object.freeze(["operator_constraint"]),
    }),
    Object.freeze({
      obligationKey: "assassination:lifecycle_completion",
      obligationKind: "lifecycle",
      requiredCapabilityKeys: Object.freeze(["lifecycle:destroyed", "lifecycle:removed_from_play"]),
      requiredFactKinds: Object.freeze(["lifecycle_stage", "event_kind"]),
    }),
    Object.freeze({
      obligationKey: "assassination:settlement",
      obligationKind: "terminal_settlement",
      requiredCapabilityKeys: Object.freeze(["terminal:assassination_settlement"]),
      requiredFactKinds: Object.freeze(["timing_window", "scenario_state_field"]),
    }),
  ]),
  scenario_score: Object.freeze([
    Object.freeze({
      obligationKey: "scenario:profile",
      obligationKind: "scenario_profile",
      requiredCapabilityKeys: Object.freeze(["scenario:profile_exact"]),
      requiredFactKinds: Object.freeze(["scenario_state_field"]),
    }),
    Object.freeze({
      obligationKey: "scenario:scoring_timing",
      obligationKind: "timing",
      requiredCapabilityKeys: Object.freeze(["scenario:scoring_timing"]),
      requiredFactKinds: Object.freeze(["timing_window", "scenario_state_field"]),
    }),
    Object.freeze({
      obligationKey: "scenario:element_access",
      obligationKind: "geometry_and_control",
      requiredCapabilityKeys: Object.freeze(["scenario:element_control", "movement:legality"]),
      requiredFactKinds: Object.freeze(["geometry_constraint", "model_scope"]),
    }),
    Object.freeze({
      obligationKey: "scenario:score_transition",
      obligationKind: "score_transition",
      requiredCapabilityKeys: Object.freeze(["scenario:score_transition"]),
      requiredFactKinds: Object.freeze(["scenario_state_field", "event_kind"]),
    }),
    Object.freeze({
      obligationKey: "scenario:victory_lead",
      obligationKind: "terminal_settlement",
      requiredCapabilityKeys: Object.freeze(["scenario:victory_lead_three"]),
      requiredFactKinds: Object.freeze(["scenario_state_field", "timing_window"]),
    }),
    Object.freeze({
      obligationKey: "scenario:round_limit_tiebreaker",
      obligationKind: "tiebreaker",
      requiredCapabilityKeys: Object.freeze(["scenario:round_limit_tiebreaker"]),
      requiredFactKinds: Object.freeze(["scenario_state_field"]),
    }),
  ]),
});

export const WARMACHINE_CORE_CAPABILITY_PROVIDERS_V2 = Object.freeze([
  Object.freeze({
    providerKey: "rules_v1_core",
    providerKind: "host_rules",
    capabilityKeys: Object.freeze([
      "action:attack",
      "action:movement",
      "attack:legality",
      "attack:resolve",
      "damage:resolve",
      "geometry:state",
      "lifecycle:disabled",
      "lifecycle:boxed",
      "lifecycle:destroyed",
      "lifecycle:removed_from_play",
      "movement:legality",
      "resource:focus",
      "resource:fury",
      "terminal:leader_roster",
      "terminal:assassination_settlement",
    ]),
  }),
  Object.freeze({
    providerKey: "steamroller_2026",
    providerKind: "host_scenario",
    capabilityKeys: Object.freeze([
      "scenario:profile_exact",
      "scenario:scoring_timing",
      "scenario:element_control",
      "scenario:score_transition",
      "scenario:victory_lead_three",
      "scenario:round_limit_tiebreaker",
    ]),
  }),
]);

export function arrayValues(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

export function normalizeGraphKey(value) {
  return String(value ?? "").trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function stableGraphValue(value) {
  if (Array.isArray(value)) return value.map(stableGraphValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort()
    .map((key) => [key, stableGraphValue(value[key])]));
}

export function stableGraphHash(value, length = 64) {
  return createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(stableGraphValue(value)))
    .digest("hex")
    .slice(0, length);
}

export function sortedUnique(values = []) {
  const entries = values && typeof values !== "string" &&
    typeof values[Symbol.iterator] === "function"
    ? Array.from(values)
    : arrayValues(values);
  return Array.from(new Set(entries.filter((value) =>
    value !== undefined && value !== null && value !== "").map(String))).sort();
}

function normalizedText(path, value) {
  return normalizeGraphKey(`${path} ${Array.isArray(value) ? value.join(" ") : value}`);
}

function termsFromText(terms, text) {
  return terms.filter((term) => text.includes(term));
}

function classifyLeaf(path, value) {
  const text = normalizedText(path, value);
  if (/resource|token|focus|fury|hunger|soul|corpse|essence|reav|leech|allocat|forc|spend/.test(text)) {
    return "resource_constraint";
  }
  if (/disabled|boxed|destroyed|explod|remove_from_play|removed_from_play|rfp|replace|return_to_play|dormant|inert|wild|lifecycle/.test(text)) {
    return "lifecycle_constraint";
  }
  if (/timing|duration|phase|turn|activation|window|expires|expiry|once_per|control_phase|combat_action|normal_movement/.test(text)) {
    return "timing_constraint";
  }
  if (/event_type|event_types|event_prefix|trigger_kind|trigger_kinds|trigger_event|after_|before_/.test(text)) {
    return "event_constraint";
  }
  if (/range|distance|movement|move|advance|push|slam|throw|place|position|terrain|line_of_sight|\blos\b|base|contact|direction|template|area|path|edge|overlap|cover|conceal|stealth/.test(text)) {
    return "geometry_constraint";
  }
  if (/status|continuous|knockdown|stationary|blind|grievous|dug_in|marked|fire|corrosion/.test(text)) {
    return "status_constraint";
  }
  if (/action|attack|spell|animus|feat|aim|run|charge|target|weapon|boost|damage|roll|granted/.test(text)) {
    return "action_constraint";
  }
  if (/model|trait|faction|allegiance|unit|warrior|warjack|warbeast|leader|battlegroup|recipient|controller|source_scope/.test(text)) {
    return "model_constraint";
  }
  if (/context_path|metadata_key|outcome_key|state_field|memory_key|marker/.test(text)) {
    return "state_field_constraint";
  }
  return "operator_constraint";
}

export function flattenStructuredLeaves(value, rootPath = "value", output = [], depth = 0) {
  if (depth > 16) {
    output.push({ path: rootPath, value: "depth_limit", valueKind: "sentinel" });
    return output;
  }
  if (Array.isArray(value)) {
    if (!value.length) output.push({ path: `${rootPath}[]`, value: [], valueKind: "empty_array" });
    for (const entry of value) flattenStructuredLeaves(entry, `${rootPath}[]`, output, depth + 1);
    return output;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    if (!entries.length) output.push({ path: rootPath, value: {}, valueKind: "empty_object" });
    for (const [key, entry] of entries) {
      flattenStructuredLeaves(entry, `${rootPath}.${key}`, output, depth + 1);
    }
    return output;
  }
  output.push({
    path: rootPath,
    value,
    valueKind: value === null ? "null" : typeof value,
  });
  return output;
}

function semanticTermFacts(path, value) {
  const text = normalizedText(path, value);
  const facts = [];
  for (const resourceKind of termsFromText(RESOURCE_TERMS, text)) {
    facts.push({ nodeKind: "resource_kind", semanticKey: resourceKind });
  }
  for (const operation of termsFromText(WARMACHINE_RESOURCE_OPERATION_KEYS_V2, text)) {
    facts.push({ nodeKind: "resource_operation", semanticKey: operation });
  }
  for (const stage of termsFromText(WARMACHINE_LIFECYCLE_STAGE_KEYS_V2, text)) {
    facts.push({ nodeKind: "lifecycle_stage", semanticKey: stage });
  }
  return facts;
}

export function typedFactsForOperator(operator = {}) {
  const leaves = [
    ...flattenStructuredLeaves(operator.parameters || {}, "parameters"),
    ...flattenStructuredLeaves(operator.applicabilityPredicate || {}, "applicabilityPredicate"),
    ...flattenStructuredLeaves(operator.predicate || {}, "predicate"),
  ];
  const facts = [];
  for (const contextKey of sortedUnique(operator.requiredContextKeys)) {
    facts.push({
      nodeKind: "context_field",
      semanticKey: contextKey,
      path: "requiredContextKeys",
      value: contextKey,
      valueKind: "string",
      factRole: "precondition",
    });
  }
  for (const leaf of leaves) {
    const category = classifyLeaf(leaf.path, leaf.value);
    facts.push({
      nodeKind: category === "state_field_constraint" ? "state_field" : category,
      semanticKey: stableGraphHash({ category, path: leaf.path, value: stableGraphValue(leaf.value) }, 24),
      ...leaf,
      factRole: leaf.path.startsWith("parameters") ? "parameter" : "precondition",
    });
    for (const termFact of semanticTermFacts(leaf.path, leaf.value)) {
      facts.push({
        ...termFact,
        path: leaf.path,
        value: leaf.value,
        valueKind: leaf.valueKind,
        factRole: "semantic_reference",
      });
    }
  }
  return Array.from(new Map(facts.map((fact) => [
    `${fact.nodeKind}|${fact.semanticKey}|${fact.path}|${JSON.stringify(stableGraphValue(fact.value))}`,
    fact,
  ])).values());
}

export function capabilityKeysForOperator(operator = {}, facts = []) {
  const capabilities = new Set([
    ...(BASE_CAPABILITIES_BY_FAMILY[operator.operatorFamily] || []),
    ...(CAPABILITIES_BY_HOOK[operator.hookKey] || []),
  ]);
  const text = normalizeGraphKey(JSON.stringify({
    primitiveKey: operator.primitiveKey,
    parameters: operator.parameters,
  }));
  if (text.includes("attack")) capabilities.add("action:attack");
  if (/spell|animus/.test(text)) capabilities.add("action:spell");
  if (/move|movement|advance|run|charge|place|push|slam|throw/.test(text)) {
    capabilities.add("action:movement");
  }
  for (const fact of facts) {
    if (fact.nodeKind === "resource_kind") capabilities.add(`resource:${fact.semanticKey}`);
    if (fact.nodeKind === "lifecycle_stage") {
      const stage = fact.semanticKey === "rfp" || fact.semanticKey === "remove_from_play"
        ? "removed_from_play"
        : fact.semanticKey;
      capabilities.add(`lifecycle:${stage}`);
    }
  }
  return Array.from(capabilities).sort();
}

export function typedInteractionRelation(interaction = {}) {
  const text = normalizeGraphKey(`${interaction.interactionKey} ${interaction.relation}`);
  if (/replace|instead/.test(text)) return "replacement_relation";
  if (/prevent|suppress|ignore|cannot|prohibit|disable/.test(text)) return "inhibition_relation";
  if (/before|after|during|start|end|timing|window/.test(text)) return "timing_relation";
  if (/disabled|boxed|destroyed|remove|rfp|explod|lifecycle/.test(text)) return "lifecycle_relation";
  if (/focus|fury|hunger|soul|corpse|token|resource|spend|gain/.test(text)) return "resource_relation";
  if (/line_of_sight|\blos\b|range|distance|move|place|terrain|contact/.test(text)) return "geometry_relation";
  if (/grant|gain|add|enable|allow/.test(text)) return "enabling_relation";
  if (/require|depends|only|when|if_/.test(text)) return "precondition_relation";
  return "related_rule_reference";
}

export function terminalObligationsForGoal(goalType = "") {
  return WARMACHINE_TERMINAL_OBLIGATIONS_V2[goalType] ||
    WARMACHINE_TERMINAL_OBLIGATIONS_V2.assassination;
}
