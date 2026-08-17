import {
  buildWarmachineExternalDagContentIdentity,
} from "../storage/content-address-v1.mjs";
import {
  buildWarmachineTerminalQueryProjectionV2,
} from "../graph/capability-query-v2.mjs";
import {
  sortedUnique,
  stableGraphHash,
  stableGraphValue,
} from "../graph/typed-facts-v2.mjs";
import { buildWarmachineTypedInteractionGraphV2 } from "../graph/typed-interaction-graph-v2.mjs";
import { normalizeRulesV1State, warmachineHost } from "../warmachine-host-runtime.mjs";
import {
  buildWarmachineMinimalTerminalProofV2,
  buildWarmachineRosterProvenanceV2,
  buildWarmachineStrategicExchangeV2,
} from "./terminal-proof-v2.mjs";

export const WARMACHINE_TERMINAL_PREDECESSOR_ALGEBRA_V2_SCHEMA =
  "warmachine_terminal_predecessor_algebra_v2";
export const WARMACHINE_PREDECESSOR_ALGEBRA_EVALUATION_V2_SCHEMA =
  "warmachine_predecessor_algebra_evaluation_v2";
export const WARMACHINE_PREDECESSOR_ALGEBRA_STORAGE_LABEL_V2_SCHEMA =
  "warmachine_predecessor_algebra_storage_label_v2";

const TEMPORAL_LAYER_SPECS = Object.freeze([
  Object.freeze({
    layerKey: "victory_event",
    relativeIndex: 0,
    inverseKind: "terminal_event_inverse",
    requirement: "the exact victory event and settlement immediately before the terminal certificate",
  }),
  Object.freeze({
    layerKey: "activation",
    relativeIndex: -1,
    inverseKind: "activation_action_sequence_inverse",
    requirement: "a legal activation/action sequence establishes the victory-event preconditions",
  }),
  Object.freeze({
    layerKey: "turn",
    relativeIndex: -1,
    inverseKind: "turn_activation_order_inverse",
    requirement: "earlier legal activations, resources and positions establish the terminal activation",
  }),
  Object.freeze({
    layerKey: "previous_turn",
    relativeIndex: -2,
    inverseKind: "opponent_turn_inverse",
    requirement: "the route survives the complete preceding opposing turn and its scoring/maintenance",
  }),
  Object.freeze({
    layerKey: "previous_round",
    relativeIndex: -3,
    inverseKind: "round_preparation_inverse",
    requirement: "prior-round deployment, exchanges, resources and persistent effects establish the previous turn",
  }),
]);

const ASSASSINATION_RESPONSE_FAMILIES = Object.freeze([
  "leader_reposition_or_screen",
  "attack_or_spell_denial",
  "focus_fury_damage_transfer",
  "tough_or_damage_removal",
  "disabled_boxed_destroyed_replacement",
  "reaction_or_trigger_order",
  "attacker_removal_or_resource_denial",
]);

const SCENARIO_RESPONSE_FAMILIES = Object.freeze([
  "contest_or_secure_scenario_element",
  "remove_or_displace_scorer",
  "score_on_both_sides",
  "kill_box_or_scenario_special_rule",
  "controller_decision_or_reaction",
  "leader_assassination_before_settlement",
]);

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampProbability(value, fallback = 0) {
  return Math.max(0, Math.min(1, numeric(value, fallback)));
}

function probabilityInterval(raw = {}) {
  const lowerBound = clampProbability(raw.lowerBound, 0);
  const upperBound = Math.max(lowerBound, clampProbability(raw.upperBound, 1));
  return {
    lowerBound,
    upperBound,
    complete: raw.complete === true || Math.abs(upperBound - lowerBound) <= 1e-12,
  };
}

function andIntervals(intervals = []) {
  if (!intervals.length) return probabilityInterval({ lowerBound: 1, upperBound: 1, complete: true });
  const rows = intervals.map(probabilityInterval);
  return probabilityInterval({
    lowerBound: Math.max(0, rows.reduce((sum, row) => sum + row.lowerBound, 0) - (rows.length - 1)),
    upperBound: Math.min(...rows.map((row) => row.upperBound)),
    complete: rows.every((row) => row.complete),
  });
}

function choiceIntervals(intervals = [], mode = "max", complete = false) {
  const rows = intervals.map(probabilityInterval);
  if (!complete) rows.push(probabilityInterval());
  if (!rows.length) return probabilityInterval({ lowerBound: 0, upperBound: 0, complete: true });
  const selector = mode === "min" ? Math.min : Math.max;
  return probabilityInterval({
    lowerBound: selector(...rows.map((row) => row.lowerBound)),
    upperBound: selector(...rows.map((row) => row.upperBound)),
    complete: complete && rows.every((row) => row.complete),
  });
}

function chanceIntervals(outcomes = [], cursorExhausted = false) {
  let processedMass = 0;
  let lowerBound = 0;
  let upperBound = 0;
  let complete = true;
  for (const outcome of outcomes) {
    const mass = clampProbability(
      outcome.mass,
      numeric(outcome.massNumerator, 0) / Math.max(1, numeric(outcome.massDenominator, 1)),
    );
    const interval = probabilityInterval(outcome.interval || outcome);
    processedMass += mass;
    lowerBound += mass * interval.lowerBound;
    upperBound += mass * interval.upperBound;
    complete = complete && interval.complete;
  }
  const unseenMass = Math.max(0, 1 - Math.min(1, processedMass));
  return probabilityInterval({
    lowerBound,
    upperBound: upperBound + unseenMass,
    complete: cursorExhausted && unseenMass <= 1e-12 && complete,
  });
}

function graphBuilder() {
  const nodes = new Map();
  const edges = new Map();
  const unresolved = [];

  const addNode = (rawNode) => {
    const canonical = stableGraphValue(rawNode);
    const canonicalKey = stableGraphHash(canonical, 32);
    const nodeKey = `predecessor-node-${canonicalKey}`;
    if (!nodes.has(nodeKey)) nodes.set(nodeKey, { nodeKey, ...canonical });
    return nodes.get(nodeKey);
  };
  const addEdge = (from, to, detail = {}) => {
    const core = {
      fromNodeKey: from.nodeKey,
      toNodeKey: to.nodeKey,
      direction: "effect_to_precondition",
      relation: detail.relation || "requires",
      quantifier: detail.quantifier || from.quantifier || "all_required",
      controller: detail.controller || from.controller || "rules",
      timingLayerKey: detail.timingLayerKey || to.timingLayerKey || from.timingLayerKey || "",
      provenanceKey: detail.provenanceKey || "",
    };
    const edgeKey = `predecessor-edge-${stableGraphHash(core, 32)}`;
    if (!edges.has(edgeKey)) edges.set(edgeKey, { edgeKey, ...core });
    return edges.get(edgeKey);
  };
  const addUnresolved = (reason, detail = {}) => {
    const row = {
      unresolvedKey: `predecessor-unresolved-${stableGraphHash({ reason, detail }, 24)}`,
      reason,
      massKind: detail.massKind || "unknown_branch_count",
      mass: detail.mass ?? null,
      ...stableGraphValue(detail),
    };
    if (!unresolved.some((entry) => entry.unresolvedKey === row.unresolvedKey)) unresolved.push(row);
    return row;
  };
  return { nodes, edges, unresolved, addNode, addEdge, addUnresolved };
}

function layerCountForMode(mode = "long_horizon") {
  if (mode === "victory_event") return 1;
  if (mode === "activation") return 2;
  if (mode === "current_turn") return 3;
  if (mode === "previous_turn") return 4;
  return 5;
}

function absoluteLayerConstraint(proof = {}, layer = {}) {
  const terminal = proof.absoluteTerminalTime || {};
  return {
    terminalRoundNumber: terminal.roundNumber,
    terminalEndingSideKey: terminal.endingSideKey,
    terminalPhaseKey: terminal.phaseKey,
    relativeIndex: layer.relativeIndex,
    exactEarlierRoundNumber: layer.layerKey === "previous_round"
      ? Math.max(1, numeric(terminal.roundNumber, 1) - 1)
      : null,
    earlierSidePolicy: layer.layerKey === "previous_turn"
      ? "opponent_of_terminal_route_controller"
      : layer.layerKey === "activation" || layer.layerKey === "turn"
        ? "terminal_route_controller"
        : "terminal_event_bound",
    strictTimingWitnessRequired: true,
  };
}

function defaultNodeInterval(node = {}) {
  if (node.localStatus === "satisfied") {
    return probabilityInterval({ lowerBound: 1, upperBound: 1, complete: true });
  }
  if (node.localStatus === "refuted" && node.hardRefutationEligible === true) {
    return probabilityInterval({ lowerBound: 0, upperBound: 0, complete: true });
  }
  if (node.nodeKind === "provider_route" && node.providerKind !== "wildcard") {
    return probabilityInterval({ lowerBound: 1, upperBound: 1, complete: true });
  }
  return probabilityInterval();
}

function providerNode(builder, provider, capabilityKey, timingLayerKey) {
  if (provider.providerKind === "host_core") {
    return builder.addNode({
      nodeKind: "provider_route",
      algebraKind: "LEAF",
      quantifier: "one_provider",
      controller: "rules",
      timingLayerKey,
      capabilityKey,
      providerKind: "host_core",
      providerNodeId: provider.providerNodeId,
      pieceKeys: [],
      localStatus: "satisfied",
      strictForwardWitnessRequired: true,
    });
  }
  return builder.addNode({
    nodeKind: "provider_route",
    algebraKind: "LEAF",
    quantifier: "one_provider",
    controller: "route_controller",
    timingLayerKey,
    capabilityKey,
    providerKind: provider.providerKind,
    providerNodeId: provider.providerNodeId,
    atomNodeId: provider.atomNodeId || "",
    atomKey: provider.atomKey || "",
    factKey: provider.factKey || "",
    pieceKeys: provider.pieceKeys || [],
    localStatus: "satisfied",
    strictForwardWitnessRequired: true,
  });
}

function obligationLayerKey(obligationKind = "") {
  if (/terminal|settlement|scenario_profile|score_transition|timing/.test(obligationKind)) {
    return "victory_event";
  }
  if (/action|damage|lifecycle|chance|resource/.test(obligationKind)) return "activation";
  if (/geometry|control/.test(obligationKind)) return "turn";
  return "activation";
}

function materializeCapabilityObligations(builder, root, queryProjection) {
  const obligationNodeKeys = [];
  for (const obligation of queryProjection.obligations || []) {
    const timingLayerKey = obligationLayerKey(obligation.obligationKind);
    const obligationNode = builder.addNode({
      nodeKind: "terminal_obligation",
      algebraKind: "AND",
      quantifier: "all_capabilities_required",
      controller: "rules",
      timingLayerKey,
      obligationKey: obligation.obligationKey,
      obligationKind: obligation.obligationKind,
      localStatus: obligation.exactProviderComplete ? "satisfied" : "unresolved",
      strictForwardWitnessRequired: true,
    });
    obligationNodeKeys.push(obligationNode.nodeKey);
    builder.addEdge(root, obligationNode, {
      relation: "terminal_requires_obligation",
      quantifier: "all_required",
      timingLayerKey,
    });
    for (const requirement of obligation.capabilityRequirements || []) {
      const capabilityNode = builder.addNode({
        nodeKind: "capability_choice",
        algebraKind: "OR",
        quantifier: "one_provider_sufficient",
        controller: "route_controller",
        timingLayerKey,
        capabilityKey: requirement.capabilityKey,
        providerCursorExhausted: requirement.wildcardPieceKeys?.length === 0,
        localStatus: "satisfied",
        strictForwardWitnessRequired: true,
      });
      builder.addEdge(obligationNode, capabilityNode, {
        relation: "obligation_requires_capability",
        quantifier: "all_required",
        timingLayerKey,
      });
      const providers = [
        ...(requirement.coreProviders || []),
        ...(requirement.exactOperatorProviders || []),
        ...(requirement.exactCoreFactProviders || []),
      ];
      for (const provider of providers) {
        const routeNode = providerNode(builder, provider, requirement.capabilityKey, timingLayerKey);
        builder.addEdge(capabilityNode, routeNode, {
          relation: "capability_may_use_provider",
          quantifier: "one_of",
          controller: "route_controller",
          timingLayerKey,
        });
      }
      if (requirement.wildcardPieceKeys?.length) {
        const wildcardNode = builder.addNode({
          nodeKind: "provider_route",
          algebraKind: "UNRESOLVED",
          quantifier: "unknown_provider",
          controller: "unknown",
          timingLayerKey,
          capabilityKey: requirement.capabilityKey,
          providerKind: "wildcard",
          pieceKeys: requirement.wildcardPieceKeys,
          localStatus: "unresolved",
          strictForwardWitnessRequired: true,
        });
        builder.addEdge(capabilityNode, wildcardNode, {
          relation: "capability_may_use_wildcard_provider",
          quantifier: "one_of",
          controller: "unknown",
          timingLayerKey,
        });
        builder.addUnresolved("wildcard_provider_semantics", {
          capabilityKey: requirement.capabilityKey,
          pieceKeys: requirement.wildcardPieceKeys,
          massKind: "wildcard_piece_count",
          mass: requirement.wildcardPieceKeys.length,
        });
      }
      if (!providers.length && !requirement.wildcardPieceKeys?.length) {
        const missingNode = builder.addNode({
          nodeKind: "provider_route",
          algebraKind: "UNRESOLVED",
          quantifier: "missing_provider",
          controller: "unknown",
          timingLayerKey,
          capabilityKey: requirement.capabilityKey,
          providerKind: "missing",
          pieceKeys: [],
          localStatus: "unresolved",
          strictForwardWitnessRequired: true,
        });
        builder.addEdge(capabilityNode, missingNode, {
          relation: "capability_provider_missing",
          quantifier: "one_of",
          controller: "unknown",
          timingLayerKey,
        });
        builder.addUnresolved("capability_provider_missing", {
          capabilityKey: requirement.capabilityKey,
          massKind: "missing_capability_count",
          mass: 1,
        });
      }
    }
  }
  return obligationNodeKeys;
}

function materializeTemporalLayers(builder, root, proof, mode) {
  const specs = TEMPORAL_LAYER_SPECS.slice(0, layerCountForMode(mode));
  const rows = [];
  let parent = root;
  for (const spec of specs) {
    const node = builder.addNode({
      nodeKind: "temporal_predecessor_layer",
      algebraKind: "AND",
      quantifier: "all_layer_requirements",
      controller: "rules",
      timingLayerKey: spec.layerKey,
      layerKey: spec.layerKey,
      relativeIndex: spec.relativeIndex,
      inverseKind: spec.inverseKind,
      requirement: spec.requirement,
      absoluteConstraint: absoluteLayerConstraint(proof, spec),
      localStatus: spec.layerKey === "victory_event" && proof.strictCertified
        ? "satisfied"
        : "unresolved",
      exactInverseStateGenerated: false,
      strictForwardWitnessRequired: true,
    });
    rows.push(node);
    builder.addEdge(parent, node, {
      relation: parent === root ? "terminal_requires_temporal_predecessor" : "requires_earlier_layer",
      quantifier: "all_required",
      timingLayerKey: spec.layerKey,
    });
    if (spec.layerKey !== "victory_event") {
      const inverse = builder.addNode({
        nodeKind: "unresolved_inverse",
        algebraKind: "UNRESOLVED",
        quantifier: "unknown_predecessor_set",
        controller: "unknown",
        timingLayerKey: spec.layerKey,
        inverseKind: spec.inverseKind,
        reason: "rules_v1_has_no_complete_inverse_transition_operator",
        localStatus: "unresolved",
        strictForwardWitnessRequired: true,
      });
      builder.addEdge(node, inverse, {
        relation: "layer_inverse_remains_unresolved",
        quantifier: "all_required",
        timingLayerKey: spec.layerKey,
      });
      builder.addUnresolved("complete_inverse_transition_not_available", {
        layerKey: spec.layerKey,
        inverseKind: spec.inverseKind,
        massKind: "unknown_predecessor_count",
      });
    }
    parent = node;
  }
  return rows;
}

function materializeInteractionNodes(builder, root, proof) {
  const goalType = proof.goalType;
  const responseFamilies = goalType === "scenario_score"
    ? SCENARIO_RESPONSE_FAMILIES
    : ASSASSINATION_RESPONSE_FAMILIES;
  const opponent = builder.addNode({
    nodeKind: "opponent_response_set",
    algebraKind: "ADVERSARIAL_AND",
    quantifier: "all_material_responses_required",
    controller: "opponent",
    timingLayerKey: goalType === "scenario_score" ? "previous_turn" : "turn",
    responseFamilies,
    responseCursorExhausted: false,
    localStatus: "unresolved",
    strictForwardWitnessRequired: true,
  });
  builder.addEdge(root, opponent, {
    relation: "route_must_survive_opponent_responses",
    quantifier: "all_required",
    controller: "opponent",
  });
  builder.addUnresolved("opponent_response_cursor_not_exhausted", {
    responseFamilies,
    massKind: "unknown_response_count",
  });

  const chanceKinds = goalType === "scenario_score"
    ? proof.scenarioProfile?.scenarioKey === "high_stakes"
      ? ["high_stakes_fuse_roll", "high_stakes_blast_damage"]
      : []
    : ["attack_roll", "damage_roll", "tough_or_lifecycle_roll", "random_rule_effect"];
  const chance = builder.addNode({
    nodeKind: "chance_outcome_set",
    algebraKind: "CHANCE",
    quantifier: "probability_mass_weighted",
    controller: "chance",
    timingLayerKey: goalType === "scenario_score" ? "victory_event" : "activation",
    chanceKinds,
    chanceCursorExhausted: chanceKinds.length === 0,
    outcomes: [],
    localStatus: chanceKinds.length ? "unresolved" : "satisfied",
    strictForwardWitnessRequired: chanceKinds.length > 0,
  });
  builder.addEdge(root, chance, {
    relation: "route_requires_chance_mass_accounting",
    quantifier: "all_required",
    controller: "chance",
  });
  if (chanceKinds.length) {
    builder.addUnresolved("chance_mass_not_expanded", {
      chanceKinds,
      massKind: "probability_mass",
      mass: 1,
    });
  }

  const triggerKinds = goalType === "scenario_score"
    ? ["turn_end_scoring", "scenario_bonus", "terminal_settlement"]
    : ["disabled", "boxed", "destroyed", "removed_from_play", "replacement", "terminal_settlement"];
  const triggers = builder.addNode({
    nodeKind: "trigger_order_set",
    algebraKind: "TRIGGER_AND_OR",
    quantifier: "mandatory_triggers_all_controller_order_one",
    controller: "mixed",
    timingLayerKey: "victory_event",
    triggerKinds,
    triggerOrderComplete: false,
    localStatus: "unresolved",
    strictForwardWitnessRequired: true,
  });
  builder.addEdge(root, triggers, {
    relation: "route_requires_trigger_order",
    quantifier: "all_required",
    controller: "mixed",
  });
  builder.addUnresolved("trigger_order_not_materialized", {
    triggerKinds,
    massKind: "unknown_trigger_order_count",
  });

  const reactions = builder.addNode({
    nodeKind: "reaction_window_set",
    algebraKind: "ADVERSARIAL_REACTION",
    quantifier: "all_legal_opponent_reactions_and_selected_friendly_reactions",
    controller: "mixed",
    timingLayerKey: "activation",
    reactionFamilies: [
      "movement_contact_or_free_strike",
      "attack_target_or_damage_redirection",
      "damage_transfer_or_prevention",
      "lifecycle_replacement_or_return",
    ],
    reactionCursorExhausted: false,
    localStatus: "unresolved",
    strictForwardWitnessRequired: true,
  });
  builder.addEdge(root, reactions, {
    relation: "route_requires_reaction_windows",
    quantifier: "all_required",
    controller: "mixed",
  });
  builder.addUnresolved("reaction_window_cursor_not_exhausted", {
    reactionFamilies: reactions.reactionFamilies,
    massKind: "unknown_reaction_count",
  });

  return { opponent, chance, triggers, reactions };
}

export function buildWarmachineTerminalPredecessorAlgebraV2(
  inputState = {},
  rawSpecification = {},
  rawOptions = {},
) {
  const state = normalizeRulesV1State(inputState);
  const graph = rawOptions.graph || buildWarmachineTypedInteractionGraphV2();
  const proof = rawOptions.proof || buildWarmachineMinimalTerminalProofV2(
    state,
    rawSpecification,
    rawOptions,
  );
  const queryTemplate = {
    templateKey: String(rawSpecification.templateKey || `terminal-${proof.proofHash.slice(0, 16)}`),
    goalType: proof.goalType,
    attackerSideKey: proof.winnerSideKey,
    defenderSideKey: proof.loserSideKey,
    attackerPieceKey: String(rawSpecification.attackerPieceKey || ""),
    targetPieceKey: String(rawSpecification.targetPieceKey || ""),
  };
  const query = rawOptions.queryProjection || buildWarmachineTerminalQueryProjectionV2(
    state,
    queryTemplate,
    graph,
  );
  const rosterProvenance = rawOptions.rosterProvenance || buildWarmachineRosterProvenanceV2(state);
  const exchange = rawOptions.exchange || buildWarmachineStrategicExchangeV2(
    rawOptions.exchangeBeforeState || state,
    rawOptions.exchangeAfterState || state,
    {
      perspectiveSideKey: proof.winnerSideKey,
      deliberateExchange: rawOptions.deliberateExchange,
      strategicIntent: rawOptions.strategicIntent,
    },
  );
  const mode = ["victory_event", "activation", "current_turn", "previous_turn", "long_horizon"]
    .includes(rawOptions.searchMode)
    ? rawOptions.searchMode
    : "long_horizon";
  const builder = graphBuilder();
  const root = builder.addNode({
    nodeKind: "terminal_goal",
    algebraKind: "AND",
    quantifier: "all_terminal_requirements",
    controller: "mixed",
    timingLayerKey: "victory_event",
    proofHash: proof.proofHash,
    goalType: proof.goalType,
    winnerSideKey: proof.winnerSideKey,
    localStatus: proof.strictCertified ? "satisfied" : "unresolved",
    strictForwardWitnessRequired: true,
  });

  for (const fact of proof.facts || []) {
    const factNode = builder.addNode({
      nodeKind: "terminal_fact",
      algebraKind: "LEAF",
      quantifier: "all_required",
      controller: "rules",
      timingLayerKey: "victory_event",
      factKey: fact.factKey,
      factKind: fact.factKind,
      requirement: fact.requirement,
      localStatus: fact.status === "satisfied"
        ? "satisfied"
        : fact.status === "contradicted" ? "refuted" : "unresolved",
      hardRefutationEligible: fact.hardRefutationEligible,
      strictForwardWitnessRequired: fact.strictWitnessRequired,
    });
    builder.addEdge(root, factNode, {
      relation: "terminal_goal_requires_fact",
      quantifier: "all_required",
      timingLayerKey: "victory_event",
      provenanceKey: fact.factKey,
    });
  }

  materializeCapabilityObligations(builder, root, query);
  const temporalLayers = materializeTemporalLayers(builder, root, proof, mode);
  const interactions = materializeInteractionNodes(builder, root, proof);
  const strictWitness = builder.addNode({
    nodeKind: "strict_forward_witness",
    algebraKind: "STRICT_WITNESS",
    quantifier: "one_complete_route_receipt",
    controller: "rules_v1",
    timingLayerKey: "victory_event",
    proofHash: proof.proofHash,
    localStatus: rawOptions.completeRouteStrictWitness === true ? "satisfied" : "unresolved",
    strictForwardWitnessRequired: true,
  });
  builder.addEdge(root, strictWitness, {
    relation: "terminal_goal_requires_complete_strict_route",
    quantifier: "all_required",
    controller: "rules_v1",
  });
  if (rawOptions.completeRouteStrictWitness !== true) {
    builder.addUnresolved("complete_route_strict_witness_missing", {
      massKind: "route_witness_count",
      mass: 1,
    });
  }

  if (graph.counts.genericOperatorConstraintCount > 0) {
    builder.addUnresolved("generic_operator_constraints_not_narrowly_typed", {
      constraintCount: graph.counts.genericOperatorConstraintCount,
      massKind: "constraint_count",
      mass: graph.counts.genericOperatorConstraintCount,
    });
  }
  if (!rosterProvenance.completeForHardPruning) {
    builder.addUnresolved("roster_provenance_incomplete", {
      unknownModelCount: rosterProvenance.unknownModelCount,
      massKind: "model_count",
      mass: rosterProvenance.unknownModelCount,
    });
  }

  const nodes = Array.from(builder.nodes.values()).sort((left, right) =>
    left.nodeKey.localeCompare(right.nodeKey));
  const edges = Array.from(builder.edges.values()).sort((left, right) =>
    left.edgeKey.localeCompare(right.edgeKey));
  const nodeKeySet = new Set(nodes.map((node) => node.nodeKey));
  const danglingEdges = edges.filter((edge) =>
    !nodeKeySet.has(edge.fromNodeKey) || !nodeKeySet.has(edge.toNodeKey));
  const core = {
    schemaVersion: WARMACHINE_TERMINAL_PREDECESSOR_ALGEBRA_V2_SCHEMA,
    upstreamReceiptHash: warmachineHost.receipt.receiptHash,
    graphHash: graph.graphHash,
    proof,
    queryProjectionHash: query.projectionHash,
    rosterProvenance,
    strategicExchange: exchange,
    searchMode: mode,
    rootNodeKey: root.nodeKey,
    nodes,
    edges,
    temporalLayerNodeKeys: temporalLayers.map((node) => node.nodeKey),
    interactionNodeKeys: Object.fromEntries(Object.entries(interactions)
      .map(([key, node]) => [key, node.nodeKey])),
    strictWitnessNodeKey: strictWitness.nodeKey,
    unresolved: builder.unresolved.sort((left, right) =>
      left.unresolvedKey.localeCompare(right.unresolvedKey)),
    counts: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      temporalLayerCount: temporalLayers.length,
      orNodeCount: nodes.filter((node) => node.algebraKind === "OR").length,
      andNodeCount: nodes.filter((node) => node.algebraKind === "AND").length,
      adversarialNodeCount: nodes.filter((node) =>
        ["ADVERSARIAL_AND", "ADVERSARIAL_REACTION"].includes(node.algebraKind)).length,
      chanceNodeCount: nodes.filter((node) => node.algebraKind === "CHANCE").length,
      triggerNodeCount: nodes.filter((node) => node.algebraKind === "TRIGGER_AND_OR").length,
      providerRouteCount: nodes.filter((node) => node.nodeKind === "provider_route").length,
      unresolvedNodeCount: nodes.filter((node) =>
        node.algebraKind === "UNRESOLVED" || node.localStatus === "unresolved").length,
      unresolvedRecordCount: builder.unresolved.length,
      danglingEdgeCount: danglingEdges.length,
    },
    quantifierContract: {
      controlledChoices: "max_over_generated_routes_without_completeness_claim",
      routeRequirements: "all_required_with_frechet_safe_probability_interval",
      opponentResponses: "min_over_material_responses_plus_unseen_unknown",
      chanceOutcomes: "mass_weighted_sum_plus_unseen_probability_mass",
      triggerOrdering: "all_mandatory_triggers_and_one_controller_order_per_choice_window",
      reactions: "all_legal_opponent_reactions_and_selected_friendly_reaction_route",
    },
    structuralOk: danglingEdges.length === 0,
    exactInverseRulesStateGenerated: false,
    hardPruningEnabled: false,
    trainingTruth: false,
    globalOptimalityProven: false,
    claimBoundary: "This graph regresses terminal facts into typed multi-layer obligations. It does not invent inverse rules-v1 states. Every unknown provider, inverse transition, opponent response, chance outcome, trigger order, reaction and missing strict route remains unresolved.",
  };
  const algebra = { ...core, algebraHash: stableGraphHash(core) };
  algebra.evaluation = evaluateWarmachineTerminalPredecessorAlgebraV2(algebra);
  return algebra;
}

export function evaluateWarmachineTerminalPredecessorAlgebraV2(algebra = {}, rawEvidence = {}) {
  const nodeByKey = new Map((algebra.nodes || []).map((node) => [node.nodeKey, node]));
  const outgoing = new Map();
  for (const edge of algebra.edges || []) {
    if (!outgoing.has(edge.fromNodeKey)) outgoing.set(edge.fromNodeKey, []);
    outgoing.get(edge.fromNodeKey).push(edge);
  }
  const evidenceByNodeKey = rawEvidence.evidenceByNodeKey || {};
  const memo = new Map();
  const visiting = new Set();
  const rows = [];

  const evaluate = (nodeKey) => {
    if (memo.has(nodeKey)) return memo.get(nodeKey);
    if (visiting.has(nodeKey)) return {
      ...probabilityInterval(),
      status: "unresolved_cycle",
      hardPrunable: false,
    };
    const node = nodeByKey.get(nodeKey);
    if (!node) return {
      ...probabilityInterval(),
      status: "unresolved_missing_node",
      hardPrunable: false,
    };
    visiting.add(nodeKey);
    const evidence = evidenceByNodeKey[nodeKey] || {};
    const childIntervals = (outgoing.get(nodeKey) || []).map((edge) => evaluate(edge.toNodeKey));
    const local = evidence.interval
      ? probabilityInterval(evidence.interval)
      : defaultNodeInterval(node);
    let interval;
    if (node.algebraKind === "OR") {
      interval = andIntervals([
        local,
        choiceIntervals(childIntervals, "max", node.providerCursorExhausted === true ||
          evidence.cursorExhausted === true),
      ]);
    } else if (["ADVERSARIAL_AND", "ADVERSARIAL_REACTION"].includes(node.algebraKind)) {
      const responseRows = Array.isArray(evidence.responseIntervals)
        ? evidence.responseIntervals
        : childIntervals;
      interval = andIntervals([
        local,
        choiceIntervals(responseRows, "min", evidence.cursorExhausted === true),
      ]);
    } else if (node.algebraKind === "CHANCE") {
      interval = andIntervals([
        local,
        chanceIntervals(
          evidence.outcomes || node.outcomes || [],
          evidence.cursorExhausted === true || node.chanceCursorExhausted === true,
        ),
      ]);
    } else if (node.algebraKind === "TRIGGER_AND_OR") {
      interval = andIntervals([
        local,
        evidence.interval || evidence.cursorExhausted
          ? probabilityInterval(evidence.interval || { lowerBound: 1, upperBound: 1, complete: true })
          : probabilityInterval(),
        ...childIntervals,
      ]);
    } else {
      interval = andIntervals([local, ...childIntervals]);
    }
    visiting.delete(nodeKey);
    const hardPrunable = interval.complete && interval.upperBound <= 1e-12 &&
      node.hardRefutationEligible === true;
    const status = hardPrunable ? "disproven"
      : interval.complete && interval.lowerBound >= 1 - 1e-12 ? "proven"
        : interval.complete ? "exact_probability_bound"
          : "unresolved";
    const result = { ...interval, status, hardPrunable };
    memo.set(nodeKey, result);
    rows.push({ nodeKey, nodeKind: node.nodeKind, algebraKind: node.algebraKind, ...result });
    return result;
  };

  const root = evaluate(algebra.rootNodeKey);
  const strictRouteEvidence = rawEvidence.completeRouteStrictWitness === true;
  const fullyCertified = root.complete && root.lowerBound >= 1 - 1e-12 && strictRouteEvidence;
  return {
    schemaVersion: WARMACHINE_PREDECESSOR_ALGEBRA_EVALUATION_V2_SCHEMA,
    algebraHash: String(algebra.algebraHash || ""),
    rootInterval: root,
    nodeRows: rows.sort((left, right) => left.nodeKey.localeCompare(right.nodeKey)),
    counts: {
      evaluatedNodeCount: rows.length,
      provenNodeCount: rows.filter((row) => row.status === "proven").length,
      disprovenNodeCount: rows.filter((row) => row.status === "disproven").length,
      unresolvedNodeCount: rows.filter((row) => row.status === "unresolved").length,
    },
    completeRouteStrictWitness: strictRouteEvidence,
    fullyCertified,
    hardPruningEnabled: false,
    trainingTruth: fullyCertified,
    claimBoundary: "Intervals preserve unknown opponent, chance and inverse mass. Even an exact interval is not a route witness unless a complete rules-v1 strict replay receipt is attached.",
  };
}

export function appendWarmachinePredecessorAlgebraToExternalDagV2(
  writer,
  inputState = {},
  algebra = {},
  rawRouteLabel = {},
) {
  if (!writer || typeof writer.append !== "function") {
    throw new TypeError("predecessor_algebra_storage_writer_required");
  }
  const state = normalizeRulesV1State(inputState);
  const stateIdentity = buildWarmachineExternalDagContentIdentity("state", state, {
    hostReceiptHash: warmachineHost.receipt.receiptHash,
  });
  const stateResult = writer.append("state", state);
  const labelPayload = {
    schemaVersion: WARMACHINE_PREDECESSOR_ALGEBRA_STORAGE_LABEL_V2_SCHEMA,
    stateId: stateIdentity.id,
    algebraHash: String(algebra.algebraHash || ""),
    proofHash: String(algebra.proof?.proofHash || ""),
    searchMode: String(algebra.searchMode || ""),
    rootNodeKey: String(algebra.rootNodeKey || ""),
    strategicExchangeHash: String(algebra.strategicExchange?.exchangeHash || ""),
    unresolvedKeys: (algebra.unresolved || []).map((row) => row.unresolvedKey).sort(),
    routeLabel: stableGraphValue(rawRouteLabel),
    trainingTruth: false,
  };
  const labelResult = writer.append("label", labelPayload, { parentStateId: stateIdentity.id });
  const unresolvedResults = (algebra.unresolved || []).map((row) => writer.append("unresolved", {
    schemaVersion: "warmachine_predecessor_algebra_unresolved_storage_v2",
    stateId: stateIdentity.id,
    algebraHash: String(algebra.algebraHash || ""),
    ...row,
  }));
  return {
    stateId: stateIdentity.id,
    stateResult,
    labelResult,
    unresolvedResults,
    acceptedUnresolvedCount: unresolvedResults.filter((row) => row.accepted).length,
  };
}
