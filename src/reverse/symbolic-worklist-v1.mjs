import { createHash } from "node:crypto";

import {
  buildWarmachineReverseReachabilityLayers,
  canonicalWarmachineEffectiveRuleClosure,
} from "./reachability-state-v1.mjs";
import { buildWarmachineTerminalReverseOperatorScope } from "./primitive-contracts-v1.mjs";

export const WARMACHINE_SYMBOLIC_REVERSE_WORKLIST_SCHEMA = "warmachine_symbolic_reverse_worklist_v1";

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function round(value, digits = 6) {
  const scale = 10 ** digits;
  return Math.round((numeric(value, 0) + Number.EPSILON) * scale) / scale;
}

function clampProbability(value, fallback = 0) {
  return Math.max(0, Math.min(1, numeric(value, fallback)));
}

function probabilityInterval(raw = {}, fallback = { lowerBound: 0, upperBound: 1, complete: false }) {
  const lowerBound = clampProbability(raw?.lowerBound, fallback.lowerBound);
  const upperBound = Math.max(lowerBound, clampProbability(raw?.upperBound, fallback.upperBound));
  return {
    lowerBound: round(lowerBound),
    upperBound: round(upperBound),
    complete: raw?.complete === true || Math.abs(upperBound - lowerBound) <= 1e-9,
  };
}

function logicalAndIntervals(intervals = []) {
  if (!intervals.length) return probabilityInterval({ lowerBound: 1, upperBound: 1, complete: true });
  const normalized = intervals.map((entry) => probabilityInterval(entry));
  const lowerBound = Math.max(0,
    normalized.reduce((sum, entry) => sum + entry.lowerBound, 0) - (normalized.length - 1));
  const upperBound = Math.min(...normalized.map((entry) => entry.upperBound));
  return probabilityInterval({
    lowerBound,
    upperBound,
    complete: normalized.every((entry) => entry.complete) || Math.abs(upperBound - lowerBound) <= 1e-9,
  });
}

function controlledChoiceIntervals(intervals = [], mode = "max", truncated = false) {
  if (!intervals.length) {
    return probabilityInterval({
      lowerBound: 0,
      upperBound: truncated ? 1 : 0,
      complete: !truncated,
    });
  }
  const normalized = intervals.map((entry) => probabilityInterval(entry));
  if (truncated) normalized.push(probabilityInterval());
  const maximizing = mode === "max";
  const lowerBound = maximizing
    ? Math.max(...normalized.map((entry) => entry.lowerBound))
    : Math.min(...normalized.map((entry) => entry.lowerBound));
  const upperBound = maximizing
    ? Math.max(...normalized.map((entry) => entry.upperBound))
    : Math.min(...normalized.map((entry) => entry.upperBound));
  return probabilityInterval({
    lowerBound,
    upperBound,
    complete: normalized.every((entry) => entry.complete) || Math.abs(upperBound - lowerBound) <= 1e-9,
  });
}

function chanceMassInterval(outcomes = [], cursorExhausted = false) {
  if (!outcomes.length) return cursorExhausted
    ? probabilityInterval({ lowerBound: 1, upperBound: 1, complete: true })
    : probabilityInterval();
  let processedMass = 0;
  let lowerBound = 0;
  let upperBound = 0;
  let allComplete = true;
  for (const outcome of outcomes) {
    const mass = clampProbability(
      outcome.mass,
      numeric(outcome.massNumerator, 0) / Math.max(1, numeric(outcome.massDenominator, 1)),
    );
    const interval = probabilityInterval(outcome.interval || outcome);
    processedMass += mass;
    lowerBound += mass * interval.lowerBound;
    upperBound += mass * interval.upperBound;
    allComplete = allComplete && interval.complete;
  }
  processedMass = Math.min(1, processedMass);
  const unresolvedMass = Math.max(0, 1 - processedMass);
  return probabilityInterval({
    lowerBound,
    upperBound: upperBound + unresolvedMass,
    complete: cursorExhausted && unresolvedMass <= 1e-9 && allComplete,
  });
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function stableHash(value, length = 24) {
  return createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex").slice(0, length);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function alive(piece = {}) {
  return piece.destroyed !== true && piece.removedFromPlay !== true && piece.offTable !== true &&
    numeric(piece.damage?.boxesRemaining ?? piece.boxesRemaining, 1) > 0;
}

function position(piece = {}) {
  return {
    xIn: numeric(piece.position?.xIn ?? piece.xIn ?? piece.x, 0),
    yIn: numeric(piece.position?.yIn ?? piece.yIn ?? piece.y, 0),
  };
}

function baseEdgeDistance(left = {}, right = {}) {
  const leftPosition = position(left);
  const rightPosition = position(right);
  return Math.max(0, Math.hypot(
    leftPosition.xIn - rightPosition.xIn,
    leftPosition.yIn - rightPosition.yIn,
  ) - numeric(left.baseSizeIn, 1.18) / 2 - numeric(right.baseSizeIn, 1.18) / 2);
}

function distanceToScenarioElement(piece = {}, element = {}) {
  const piecePosition = position(piece);
  const xIn = numeric(element.xIn ?? element.x, 0);
  const yIn = numeric(element.yIn ?? element.y, 0);
  const radius = numeric(element.radiusIn ?? element.radius, 0);
  const width = numeric(element.widthIn ?? element.width, 0);
  const height = numeric(element.heightIn ?? element.height, 0);
  const pieceRadius = numeric(piece.baseSizeIn, 1.18) / 2;
  if (radius > 0) {
    return Math.max(0, Math.hypot(piecePosition.xIn - xIn, piecePosition.yIn - yIn) - radius - pieceRadius);
  }
  return Math.max(0, Math.hypot(
    Math.max(0, Math.abs(piecePosition.xIn - xIn) - width / 2),
    Math.max(0, Math.abs(piecePosition.yIn - yIn) - height / 2),
  ) - pieceRadius);
}

function probabilityBoundExact(boundKind = "") {
  return /exact|exhaustive|conservative_(?:upper|lower)_bound|rules_authoritative/i.test(String(boundKind || ""));
}

function terminalAlternatives(template = {}) {
  if (template.goalType === "scenario_score") {
    return [{
      alternativeKey: `scenario-score-${stableHash({
        templateKey: template.templateKey,
        elementKey: template.scenarioElement?.elementKey || template.scenarioElement?.flagKey || template.scenarioElement?.zoneKey,
      })}`,
      predecessorKind: "scenario_control_then_score",
      actorPieceKey: template.attackerPieceKey || "",
      terminalTargetPieceKey: "",
      strictForwardWitnessRequired: true,
    }];
  }
  const alternatives = template.reverseRuleRegression?.searchAlternatives ||
    template.reverseRuleRegression?.alternatives || [];
  if (alternatives.length) return cloneJson(alternatives);
  return [{
    alternativeKey: `direct-${stableHash({
      templateKey: template.templateKey,
      actorPieceKey: template.attackerPieceKey,
      targetPieceKey: template.targetPieceKey,
    })}`,
    predecessorKind: "direct_terminal_attack",
    actorPieceKey: template.attackerPieceKey || "",
    terminalTargetPieceKey: template.targetPieceKey || "",
    strictForwardWitnessRequired: true,
  }];
}

function probabilityConstraint(template = {}, resourceBranch = null) {
  const evidence = resourceBranch?.probabilityEvidence || template.probability || {};
  const boundKind = String(resourceBranch?.probabilityBoundKind || evidence.boundKind || "unknown");
  const estimate = numeric(
    resourceBranch?.terminalProbability ?? evidence.singleAttackKillProbability ??
      evidence.conditionalTerminalScoreProbability,
    0,
  );
  const exactForHardPruning = probabilityBoundExact(boundKind);
  const lowerBound = exactForHardPruning
    ? numeric(evidence.lowerBound, estimate)
    : numeric(evidence.lowerBound, 0);
  const upperBound = exactForHardPruning
    ? numeric(evidence.upperBound, estimate)
    : numeric(evidence.upperBound, 1);
  return {
    kind: "terminal_probability",
    estimate: round(estimate),
    boundKind,
    exactForHardPruning,
    conservativeInterval: probabilityInterval({
      lowerBound,
      upperBound,
      complete: exactForHardPruning && Math.abs(upperBound - lowerBound) <= 1e-9,
    }),
    chanceMassExpansionComplete: false,
  };
}

function resourceConstraint(template = {}, resourceBranch = null, layer = 0) {
  const demand = resourceBranch?.resourceDemand || {};
  const source = resourceBranch?.resourceSource || {};
  const total = Math.max(0, numeric(demand.total,
    Number(template.boostedAttack === true) + Number(template.boostedDamage === true)));
  return {
    kind: "resource_payment",
    resourceKind: String(demand.resourceKind || ""),
    requiredAtTerminal: total,
    paymentModel: String(demand.paymentModel || (total ? "unresolved_payment" : "no_resource_payment")),
    sourceKind: String(source.sourceKind || (total ? "unresolved_source" : "no_resource_required")),
    sourceActionRequired: source.strictSourceActionRequired === true,
    openingFeasibleForDeclaredSource: source.openingFeasible === true || total === 0,
    layerMeaning: layer === 0 ? "terminal_payment_available" : "resource_source_reachable_before_terminal",
  };
}

function pieceResourceCount(piece = {}, resourceKind = "") {
  const kind = String(resourceKind || "").toLowerCase();
  if (kind === "soul") return Math.max(0, numeric(piece.soulTokens ?? piece.souls, 0));
  if (kind === "corpse") return Math.max(0, numeric(piece.corpseTokens ?? piece.corpses, 0));
  if (kind === "mind") return Math.max(0, numeric(piece.mindTokens ?? piece.mind, 0));
  if (kind === "hunger") return Math.max(0, numeric(piece.hungerTokens ?? piece.hunger, 0));
  if (kind === "essence" && String(piece.resourceKind || "").toLowerCase() === "essence") {
    return Math.max(0, numeric(piece.resourcePoints ?? piece.essencePoints ?? piece.essence, 0));
  }
  return Math.max(0, numeric(piece.resourceState?.[`${kind}Tokens`] ?? piece.resourceState?.[kind], 0));
}

function resourceSourceRelationMatches(piece = {}, actor = {}, relation = "any") {
  if (!piece?.pieceKey || piece.pieceKey === actor?.pieceKey) return false;
  if (relation === "enemy") return piece.sideKey !== actor.sideKey;
  if (["friendly", "friendly_faction"].includes(relation)) return piece.sideKey === actor.sideKey;
  return true;
}

function lifecycleConstraint(alternative = {}) {
  if (!alternative.damageLifecycleObligation) return null;
  return {
    kind: "destroyed_lifecycle_bridge",
    bridgeTargetPieceKey: alternative.bridgeTargetPieceKey || alternative.predecessorTargetPieceKey || "",
    requiredFinalStage: alternative.damageLifecycleObligation?.requiredFinalStage || "destroyed",
    toughBranchRequirement: alternative.damageLifecycleObligation?.toughBranchRequirement || "not_applicable",
    disabledAndBoxedReplacementsMustBeResolved:
      alternative.damageLifecycleObligation?.disabledAndBoxedReplacementsMustBeResolved === true,
    removedFromPlayWithoutDestroyedIsInsufficient:
      alternative.damageLifecycleObligation?.removedFromPlayWithoutDestroyedIsInsufficient === true,
    mandatoryAdditionalMeleeAfterAdvance:
      alternative.predecessorKind === "killing_spree_destroy_advance_additional_melee",
  };
}

function symbolicConstraints(template, resourceBranch, alternative, layer, terminalReverseOperatorScope = {}) {
  const reachability = template.reachability || {};
  const reverseLayers = buildWarmachineReverseReachabilityLayers(template, {
    horizonFriendlyTurns: Math.max(layer + 1, numeric(reachability.minimumFriendlyTurns, layer + 1)),
  });
  const reachLayer = reverseLayers.layers[layer] || reverseLayers.layers.at(-1) || {};
  const rulePosition = alternative.previousActorPositionConstraint || {};
  const maximumTerminalDistance = layer === 0
    ? Math.max(
      numeric(reachLayer.optimisticMaxEdgeDistanceIn, 0),
      numeric(rulePosition.terminalTargetMaximumEdgeDistanceBeforeAdvanceIn, 0),
    )
    : numeric(reachLayer.optimisticMaxEdgeDistanceIn, 0);
  const scenario = template.goalType === "scenario_score" ? {
    kind: "scenario_control_and_score",
    elementType: template.scenarioElement?.elementType || "",
    elementKey: template.scenarioElement?.elementKey || template.scenarioElement?.flagKey ||
      template.scenarioElement?.zoneKey || template.scenarioElement?.objectiveKey || "",
    requiredScoreBeforeTerminal: numeric(template.scoreBeforeTerminal, 0),
    terminalScoreGain: numeric(template.terminalScoreGain, 0),
    victoryThreshold: numeric(template.victoryThreshold, 5),
    scoringStartSideKey: String(template.scoringStartSideKey || ""),
    scoringStartTurnNumber: Math.max(1, numeric(template.scoringStartTurnNumber, 2)),
    uncontestedAtScoringWindowRequired: true,
  } : null;
  return {
    actorAvailability: {
      kind: "actor_available",
      pieceKey: alternative.actorPieceKey || template.attackerPieceKey || "",
      alive: true,
      executableByAttackerSide: template.attackerSideKey || "",
    },
    terminalTarget: template.goalType === "scenario_score" ? null : {
      kind: "terminal_target_state",
      pieceKey: alternative.terminalTargetPieceKey || template.targetPieceKey || "",
      aliveBeforeTerminal: true,
      maximumBoxesBeforeTerminal: layer === 0 ? numeric(template.targetBoxesBeforeFinal, 1) : null,
      openingMayExceedTerminalBoxesBecauseOfPriorDamage:
        layer === 0 && alternative.terminalTargetMayHavePriorDamage === true,
      strictPriorDamageTransitionRequired:
        layer === 0 && alternative.terminalTargetMayHavePriorDamage === true,
    },
    spatial: {
      kind: layer === 0 ? "terminal_action_region" : "earlier_friendly_turn_reach_region",
      maximumActorToTerminalEdgeDistanceIn: maximumTerminalDistance,
      robustMaximumEdgeDistanceIn: numeric(reachLayer.robustMaxEdgeDistanceIn, 0),
      bridgeTargetPieceKey: alternative.bridgeTargetPieceKey || alternative.predecessorTargetPieceKey || "",
      bridgeTargetMaximumEdgeDistanceIn: rulePosition.bridgeTargetMaximumEdgeDistanceIn ?? null,
      bridgeToTerminalMaximumEdgeDistanceIn: rulePosition.bridgeToTerminalMaximumEdgeDistanceIn ?? null,
      terminalTargetMaximumEdgeDistanceAfterAdvanceIn:
        rulePosition.terminalTargetMaximumEdgeDistanceAfterAdvanceIn ?? null,
      ignoreActorToTerminalRange: rulePosition.ignoreActorToTerminalRange === true,
      ignoresLineOfSightForTerminalAttack: rulePosition.ignoresLineOfSightForTerminalAttack === true,
      maximumRuleAdvanceIn: rulePosition.maximumAdvanceIn ?? null,
      intermediateCollectionRangeIn: rulePosition.intermediateCollectionRangeIn ?? null,
      bridgeRangeOccursAtIntermediateEvent: rulePosition.bridgeRangeOccursAtIntermediateEvent === true,
      intermediateRelationKind: String(rulePosition.intermediateRelationKind || ""),
      movementType: rulePosition.movementType || "",
      directionPolicy: rulePosition.directionPolicy || "",
      exactDirectionalLandingRequired: rulePosition.exactDirectionalLandingRequired === true,
      movementDistanceFromRuleTextRequiresStrictContext:
        rulePosition.movementDistanceFromRuleTextRequiresStrictContext === true,
      requiresActorTerminalLineOfSightBlockerRelation:
        rulePosition.requiresActorTerminalLineOfSightBlockerRelation === true,
      exactCoordinatesKnown: false,
      strictPathAndPlacementWitnessRequired: true,
    },
    resource: resourceConstraint(template, resourceBranch, layer),
    additionalAttackResource: layer === 0 ? cloneJson(alternative.resourceObligation || null) : null,
    additionalAttackSequence: layer === 0 ? cloneJson(alternative.actionSequenceObligation || null) : null,
    predecessorTargetState: layer === 0 ? cloneJson(alternative.predecessorTargetStateObligation || null) : null,
    terminalStatusEffect: layer === 0 ? cloneJson(alternative.terminalStatusEffectObligation || null) : null,
    resourceAcquisition: layer === 0 ? cloneJson(alternative.resourceAcquisitionObligation || null) : null,
    activationSequence: layer === 0 ? cloneJson(alternative.activationSequenceObligation || null) : null,
    explosionTrigger: layer === 0 ? cloneJson(alternative.explosionTriggerObligation || null) : null,
    terminalSecondaryDamage: layer === 0
      ? cloneJson(alternative.terminalSecondaryDamageObligation || null) : null,
    sourceLifecycle: layer === 0 ? cloneJson(alternative.sourceLifecycleObligation || null) : null,
    predecessorChance: layer === 0 ? cloneJson(alternative.predecessorChanceObligation || null) : null,
    scenario: layer === 0 ? scenario : null,
    timing: {
      kind: "turn_and_window",
      friendlyTurnsBeforeTerminal: layer,
      terminalActionWindow: template.goalType === "scenario_score" ? "legal_scenario_scoring_window" : "legal_attack_window",
    },
    ruleClosure: {
      kind: "effective_rule_closure",
      closureKey: String(template.initialEffectiveRuleClosure?.closureKey || ""),
      sourceDurationUseAndResourceLedgerBound: true,
    },
    lifecycle: layer === 0 ? lifecycleConstraint(alternative) : null,
    chance: layer === 0 ? probabilityConstraint(template, resourceBranch) : {
      kind: "no_new_chance_at_reach_regression",
      exactForHardPruning: true,
      conservativeInterval: probabilityInterval({ lowerBound: 1, upperBound: 1, complete: true }),
      chanceMassExpansionComplete: true,
    },
    opponentResponse: {
      kind: "adversarial_interference",
      allRequiredResponsesResolved: false,
      unresolved: true,
    },
    terminalRuleOperators: layer === 0 ? {
      kind: "evaluate_exact_source_operators_if_applicable",
      scopeKey: String(terminalReverseOperatorScope.scopeKey || ""),
      operators: cloneJson(terminalReverseOperatorScope.operators || []),
      counts: cloneJson(terminalReverseOperatorScope.counts || {}),
      predicatesMustBeEvaluatedInStrictContext: true,
      noOperatorIsAssumedActiveFromSourcePresenceAlone: true,
    } : null,
  };
}

function defaultDeterministicConstraintInterval(node = {}) {
  const constraints = node.constraints || {};
  const requiredActor = constraints.actorAvailability || {};
  if (!requiredActor.pieceKey || !requiredActor.executableByAttackerSide) {
    return probabilityInterval({ lowerBound: 0, upperBound: 0, complete: true });
  }
  const target = constraints.terminalTarget;
  if (target && !target.pieceKey) return probabilityInterval({ lowerBound: 0, upperBound: 0, complete: true });
  const scenario = constraints.scenario;
  if (scenario && (scenario.terminalScoreGain <= 0 ||
    scenario.requiredScoreBeforeTerminal + scenario.terminalScoreGain < scenario.victoryThreshold)) {
    return probabilityInterval({ lowerBound: 0, upperBound: 0, complete: true });
  }
  const resource = constraints.resource || {};
  if (resource.requiredAtTerminal === 0 && !constraints.spatial?.strictPathAndPlacementWitnessRequired &&
    !constraints.lifecycle && !scenario) {
    return probabilityInterval({ lowerBound: 1, upperBound: 1, complete: true });
  }
  return probabilityInterval();
}

function nodeChanceInterval(node = {}, evidence = {}) {
  if (Array.isArray(evidence.chanceOutcomes)) {
    return chanceMassInterval(evidence.chanceOutcomes, evidence.chanceCursorExhausted === true);
  }
  const chance = node.constraints?.chance || {};
  if (chance.exactForHardPruning === true && chance.conservativeInterval) {
    return probabilityInterval(chance.conservativeInterval);
  }
  return probabilityInterval();
}

function nodeOpponentInterval(node = {}, evidence = {}) {
  if (Array.isArray(evidence.opponentResponseIntervals)) {
    if (!evidence.opponentResponseIntervals.length && evidence.opponentResponseCursorExhausted === true) {
      return probabilityInterval({ lowerBound: 1, upperBound: 1, complete: true });
    }
    return controlledChoiceIntervals(
      evidence.opponentResponseIntervals,
      "min",
      evidence.opponentResponseCursorExhausted !== true,
    );
  }
  if (node.constraints?.opponentResponse?.unresolved !== true) {
    return probabilityInterval({ lowerBound: 1, upperBound: 1, complete: true });
  }
  return probabilityInterval();
}

export function evaluateWarmachineSymbolicReverseWorklist(worklist = {}, rawEvidence = {}) {
  const nodes = Array.isArray(worklist.nodes) ? worklist.nodes : [];
  const edges = Array.isArray(worklist.edges) ? worklist.edges : [];
  const nodeByKey = new Map(nodes.map((node) => [node.nodeKey, node]));
  const outgoing = new Map();
  for (const edge of edges) {
    if (!outgoing.has(edge.fromNodeKey)) outgoing.set(edge.fromNodeKey, []);
    outgoing.get(edge.fromNodeKey).push(edge);
  }
  const evidenceByNodeKey = rawEvidence.evidenceByNodeKey || {};
  const memo = new Map();
  const visiting = new Set();
  const rows = [];

  const evaluateNode = (nodeKey) => {
    if (memo.has(nodeKey)) return memo.get(nodeKey);
    if (visiting.has(nodeKey)) {
      const cyclic = {
        ...probabilityInterval(),
        status: "unresolved_cycle",
        hardPrunable: false,
      };
      return cyclic;
    }
    const node = nodeByKey.get(nodeKey);
    if (!node) return { ...probabilityInterval(), status: "unresolved_missing_node", hardPrunable: false };
    visiting.add(nodeKey);
    const childEdges = outgoing.get(nodeKey) || [];
    let result;
    if (node.nodeKind === "terminal_outcome") {
      const childIntervals = childEdges.map((edge) => evaluateNode(edge.toNodeKey));
      result = controlledChoiceIntervals(
        childIntervals,
        "max",
        numeric(worklist.counts?.remainingRuleAlternativeCount, 0) > 0 ||
          numeric(worklist.counts?.nodeBudgetUnresolvedExpansionCount, 0) > 0,
      );
    } else {
      const evidence = evidenceByNodeKey[nodeKey] || {};
      const deterministic = evidence.deterministicInterval
        ? probabilityInterval(evidence.deterministicInterval)
        : defaultDeterministicConstraintInterval(node);
      const chance = nodeChanceInterval(node, evidence);
      const opponent = nodeOpponentInterval(node, evidence);
      const requiredPredecessors = childEdges.map((edge) => evaluateNode(edge.toNodeKey));
      result = logicalAndIntervals([deterministic, chance, opponent, ...requiredPredecessors]);
      result.components = {
        deterministic,
        chance,
        opponent,
        requiredPredecessorCount: requiredPredecessors.length,
      };
    }
    visiting.delete(nodeKey);
    const hardPrunable = result.complete === true && result.upperBound <= 1e-9;
    const status = hardPrunable ? "disproven"
      : result.complete === true && result.lowerBound >= 1 - 1e-9 ? "proven"
        : result.complete === true ? "exact_probability_bound"
        : "unresolved";
    const evaluated = { ...result, status, hardPrunable };
    memo.set(nodeKey, evaluated);
    rows.push({ nodeKey, nodeKind: node.nodeKind, ...evaluated });
    return evaluated;
  };

  const root = evaluateNode(worklist.rootNodeKey);
  return {
    schemaVersion: "warmachine_symbolic_reverse_interval_evaluation_v1",
    rootInterval: {
      lowerBound: root.lowerBound,
      upperBound: root.upperBound,
      complete: root.complete,
      status: root.status,
    },
    nodeRows: rows.sort((left, right) => left.nodeKey.localeCompare(right.nodeKey)),
    counts: {
      evaluatedNodeCount: rows.length,
      provenNodeCount: rows.filter((row) => row.status === "proven").length,
      disprovenNodeCount: rows.filter((row) => row.status === "disproven").length,
      exactProbabilityBoundNodeCount: rows.filter((row) => row.status === "exact_probability_bound").length,
      unresolvedNodeCount: rows.filter((row) => row.status === "unresolved").length,
      safelyHardPrunableNodeCount: rows.filter((row) => row.hardPrunable).length,
    },
    quantifierContract: {
      attackerPredecessorRoutes: "max_over_or_choices",
      routeRequirements: "frechet_safe_and_interval",
      opponentResponses: "min_over_exhausted_responses",
      chanceOutcomes: "mass_weighted_sum_with_unseen_mass_zero_to_one",
    },
    strictForwardAuthorityUsed: rawEvidence.strictForwardAuthorityUsed === true,
    globalOptimalityProven: false,
    claimBoundary: "Only complete strict-forward receipts may turn this symbolic interval into a route proof. Missing opponent, chance, geometry, resource, lifecycle, or predecessor evidence remains unresolved.",
  };
}

export function evaluateWarmachineSymbolicReverseFrontierMeet(
  inputState = {},
  template = {},
  worklist = {},
  rawOptions = {},
) {
  const state = inputState || {};
  const actor = (state.pieces || []).find((piece) => piece.pieceKey === template.attackerPieceKey) || null;
  const target = (state.pieces || []).find((piece) => piece.pieceKey === template.targetPieceKey) || null;
  const actorClosure = actor ? canonicalWarmachineEffectiveRuleClosure(actor) : null;
  const resourceBranch = rawOptions.resourceBranch || null;
  const requiredResource = numeric(resourceBranch?.resourceDemand?.total,
    Number(template.boostedAttack === true) + Number(template.boostedDamage === true));
  const availableResource = numeric(actor?.resourcePoints ?? actor?.focus ?? actor?.fury, 0);
  const potentialResource = Math.max(availableResource, numeric(actor?.resourceMax ?? actor?.resource2Max, 0));
  const closureMatches = Boolean(actorClosure?.closureKey &&
    actorClosure.closureKey === template.initialEffectiveRuleClosure?.closureKey);
  const terminalDistanceIn = actor
    ? template.goalType === "scenario_score"
      ? distanceToScenarioElement(actor, template.scenarioElement || {})
      : target ? baseEdgeDistance(actor, target) : Number.POSITIVE_INFINITY
    : Number.POSITIVE_INFINITY;
  const matches = (worklist.nodes || []).filter((node) => node.nodeKind === "symbolic_predecessor_state")
    .map((node) => {
      const constraints = node.constraints || {};
      const terminalPredecessor = node.friendlyTurnsBeforeTerminal === 0;
      const resolvedBridgeTargetPieceKey = constraints.lifecycle?.bridgeTargetPieceKey ||
        constraints.spatial?.bridgeTargetPieceKey || "";
      const bridgeTarget = resolvedBridgeTargetPieceKey
        ? (state.pieces || []).find((piece) =>
          piece.pieceKey === resolvedBridgeTargetPieceKey) || null
        : null;
      const bridgeDistanceIn = actor && bridgeTarget ? baseEdgeDistance(actor, bridgeTarget) : null;
      const bridgeIdentityCompatible = !resolvedBridgeTargetPieceKey || Boolean(bridgeTarget && alive(bridgeTarget));
      const actorCompatible = Boolean(actor && alive(actor) &&
        actor.sideKey === constraints.actorAvailability?.executableByAttackerSide);
      const targetCompatible = template.goalType === "scenario_score" || Boolean(target && alive(target));
      const targetHealthCompatible = !terminalPredecessor || template.goalType === "scenario_score" ||
        constraints.terminalTarget?.openingMayExceedTerminalBoxesBecauseOfPriorDamage === true ||
        numeric(target?.damage?.boxesRemaining ?? target?.boxesRemaining, 0) <=
          numeric(constraints.terminalTarget?.maximumBoxesBeforeTerminal, Number.POSITIVE_INFINITY);
      const distanceCompatible = constraints.spatial?.ignoreActorToTerminalRange === true || terminalDistanceIn <=
        numeric(constraints.spatial?.maximumActorToTerminalEdgeDistanceIn, 0) + 0.001;
      const bridgeCompatible = constraints.spatial?.bridgeTargetMaximumEdgeDistanceIn == null || Boolean(
        bridgeTarget && alive(bridgeTarget) && bridgeDistanceIn <=
          numeric(constraints.spatial.bridgeTargetMaximumEdgeDistanceIn, 0) + 0.001,
      );
      const predecessorTargetStateCompatible = !constraints.predecessorTargetState || Boolean(
        bridgeTarget && alive(bridgeTarget) &&
        (!constraints.predecessorTargetState.targetMustRemainInPlay || bridgeTarget.removedFromPlay !== true),
      );
      const statusRecipient = constraints.terminalStatusEffect?.statusRecipientPieceKey
        ? (state.pieces || []).find((piece) =>
          piece.pieceKey === constraints.terminalStatusEffect.statusRecipientPieceKey) || null
        : null;
      const terminalStatusEffectCompatible = !constraints.terminalStatusEffect || Boolean(
        statusRecipient && alive(statusRecipient) &&
        pieceResourceCount(actor, "corpse") >=
          numeric(constraints.terminalStatusEffect.minimumSourceCorpseTokens, 0),
      );
      const bridgeToTerminalDistanceIn = bridgeTarget && target ? baseEdgeDistance(bridgeTarget, target) : null;
      const bridgeToTerminalCompatible = constraints.spatial?.bridgeToTerminalMaximumEdgeDistanceIn == null || Boolean(
        bridgeTarget && target && bridgeToTerminalDistanceIn <=
          numeric(constraints.spatial.bridgeToTerminalMaximumEdgeDistanceIn, 0) + 0.001,
      );
      const forcePayment = resourceBranch?.resourceDemand?.paymentModel === "force_adds_fury";
      const resourceCompatible = requiredResource <= 0 || (terminalPredecessor
        ? forcePayment
          ? availableResource + requiredResource <= potentialResource
          : availableResource >= requiredResource
        : resourceBranch
          ? resourceBranch.openingResourceFeasible === true
          : potentialResource >= requiredResource);
      const resourceAcquisition = constraints.resourceAcquisition;
      const acquisitionSource = resourceAcquisition?.soulSourcePieceKey
        ? (state.pieces || []).find((piece) => piece.pieceKey === resourceAcquisition.soulSourcePieceKey) || null
        : null;
      const acquisitionCapacity = numeric(resourceAcquisition?.maximumTokenCount, 0);
      const resourceAcquisitionCompatible = !terminalPredecessor || !resourceAcquisition || Boolean(
        acquisitionSource && alive(acquisitionSource) && acquisitionSource.generatesSoul !== false &&
        resourceSourceRelationMatches(acquisitionSource, actor, resourceAcquisition.targetRelation) &&
        numeric(resourceAcquisition.amountRequired, 1) <= 1 &&
        (acquisitionCapacity <= 0 || pieceResourceCount(actor, "soul") < acquisitionCapacity),
      );
      const activationSequence = constraints.activationSequence;
      const activationSequenceCompatible = !terminalPredecessor || !activationSequence ||
        numeric(activationSequence.tokenCost, 0) <= 0 ||
        pieceResourceCount(actor, activationSequence.tokenKind) >= numeric(activationSequence.tokenCost, 0);
      const terminalSecondaryDamage = constraints.terminalSecondaryDamage;
      const terminalSecondaryDamageCompatible = !terminalPredecessor || !terminalSecondaryDamage || Boolean(
        target && alive(target) && target.pieceKey === terminalSecondaryDamage.targetPieceKey &&
        target.pieceKey !== actor?.pieceKey &&
        (terminalSecondaryDamage.targetAllegiance !== "enemy_models" || target.sideKey !== actor?.sideKey) &&
        (terminalSecondaryDamage.targetAllegiance !== "friendly_models" || target.sideKey === actor?.sideKey),
      );
      const sourceLifecyclePiece = constraints.sourceLifecycle?.sourcePieceKey
        ? (state.pieces || []).find((piece) =>
          piece.pieceKey === constraints.sourceLifecycle.sourcePieceKey) || null
        : null;
      const sourceLifecycleCompatible = !terminalPredecessor || !constraints.sourceLifecycle || Boolean(
        sourceLifecyclePiece && alive(sourceLifecyclePiece),
      );
      const additionalResource = constraints.additionalAttackResource;
      let additionalAttackResourceCompatible = true;
      if (terminalPredecessor && additionalResource?.paymentKind === "resource_token_spend") {
        additionalAttackResourceCompatible = (additionalResource.tokenKinds || []).some((kind) =>
          pieceResourceCount(actor, kind) >= numeric(additionalResource.tokenCostPerAttack, 1) ||
          kind === resourceAcquisition?.resourceKind && resourceAcquisitionCompatible);
      } else if (terminalPredecessor && additionalResource?.paymentKind === "friendly_model_removed_from_play") {
        additionalAttackResourceCompatible = (state.pieces || []).some((piece) =>
          alive(piece) && piece.sideKey === actor?.sideKey && piece.pieceKey !== actor?.pieceKey &&
          (!additionalResource.sacrificeMustShareUnitWithActor ||
            Boolean(actor?.unitGroupId) && piece.unitGroupId === actor.unitGroupId) &&
          (!additionalResource.sacrificeModelKind ||
            String(piece.modelRole || piece.unitRole || "").toLowerCase().includes(
              String(additionalResource.sacrificeModelKind).toLowerCase(),
            )));
      }
      const scenarioCompatible = template.goalType !== "scenario_score" || !terminalPredecessor ||
        numeric(state.scenario?.score?.[template.attackerSideKey], 0) >=
          numeric(constraints.scenario?.requiredScoreBeforeTerminal, 0);
      const terminalRuleOperatorCounts = constraints.terminalRuleOperators?.counts || {};
      const terminalRuleOperatorsCompatible = !terminalPredecessor ||
        numeric(terminalRuleOperatorCounts.unknownFailClosedCount, 0) === 0;
      const closureCompatible = rawOptions.requireInitialClosure === true ? closureMatches : true;
      const compatible = actorCompatible && targetCompatible && targetHealthCompatible && distanceCompatible &&
        bridgeIdentityCompatible && bridgeCompatible && bridgeToTerminalCompatible && predecessorTargetStateCompatible &&
        terminalStatusEffectCompatible && resourceCompatible && resourceAcquisitionCompatible &&
        activationSequenceCompatible && terminalSecondaryDamageCompatible && sourceLifecycleCompatible &&
        additionalAttackResourceCompatible && scenarioCompatible &&
        terminalRuleOperatorsCompatible &&
        closureCompatible;
      const unresolvedReasons = [
        constraints.spatial?.strictPathAndPlacementWitnessRequired ? "strict_path_and_placement" : "",
        constraints.lifecycle ? "damage_lifecycle" : "",
        constraints.predecessorTargetState ? "predecessor_target_state" : "",
        constraints.terminalStatusEffect?.strictDurationAndInteractionProofRequired
          ? "terminal_status_duration_and_interactions" : "",
        constraints.resourceAcquisition?.strictCollectionAndOrderingProofRequired
          ? "resource_acquisition_collection_and_ordering" : "",
        constraints.activationSequence?.strictTriggerTimingAndTargetProofRequired
          ? "activation_sequence_trigger_timing_and_target" : "",
        constraints.explosionTrigger?.exactTriggerActionAndTimingProofRequired
          ? "explosion_trigger_action_timing" : "",
        (constraints.terminalSecondaryDamage?.strictBatchOrderingDamageAndTerminalProofRequired ||
          constraints.terminalSecondaryDamage?.strictTargetPolicyBatchOrderingDamageAndTerminalProofRequired)
          ? "secondary_damage_batch_ordering_and_terminal" : "",
        constraints.sourceLifecycle?.strictPostBatchSourceLifecycleProofRequired
          ? "post_batch_source_lifecycle" : "",
        constraints.spatial?.movementDistanceFromRuleTextRequiresStrictContext
          ? "activation_sequence_movement_distance" : "",
        constraints.spatial?.bridgeRangeOccursAtIntermediateEvent
          ? constraints.spatial.intermediateRelationKind === "secondary_damage_origin_range"
            ? "secondary_damage_origin_range"
            : "intermediate_collection_range"
          : "",
        constraints.spatial?.requiresActorTerminalLineOfSightBlockerRelation
          ? "line_of_sight_blocker_relation" : "",
        constraints.terminalTarget?.strictPriorDamageTransitionRequired ? "terminal_target_prior_damage" : "",
        constraints.additionalAttackSequence ? "action_sequence" : "",
        numeric(terminalRuleOperatorCounts.terminalConstraintOperatorCount, 0) > 0
          ? "terminal_constraint_operator_context" : "",
        numeric(terminalRuleOperatorCounts.conservativeBoundOperatorCount, 0) > 0
          ? "strict_numeric_bound_context" : "",
        numeric(terminalRuleOperatorCounts.typedObligationOnlyCount, 0) > 0
          ? "typed_rule_operator_obligations" : "",
        numeric(terminalRuleOperatorCounts.unknownFailClosedCount, 0) > 0
          ? "unknown_rule_operator_fail_closed" : "",
        constraints.opponentResponse?.unresolved ? "opponent_response" : "",
        constraints.chance?.chanceMassExpansionComplete === false ? "chance_mass" : "",
        constraints.predecessorChance?.exactChanceMassRequired ? "predecessor_chance_mass" : "",
      ].filter(Boolean);
      return {
        nodeKey: node.nodeKey,
        alternativeKey: node.alternativeKey,
        predecessorKind: node.predecessorKind,
        friendlyTurnsBeforeTerminal: node.friendlyTurnsBeforeTerminal,
        compatible,
        actorCompatible,
        targetCompatible,
        targetHealthCompatible,
        distanceCompatible,
        terminalDistanceIn: Number.isFinite(terminalDistanceIn) ? round(terminalDistanceIn) : null,
        maximumTerminalDistanceIn: numeric(constraints.spatial?.maximumActorToTerminalEdgeDistanceIn, 0),
        bridgeTargetPieceKey: bridgeTarget?.pieceKey || "",
        bridgeIdentityCompatible,
        bridgeDistanceIn: bridgeDistanceIn == null ? null : round(bridgeDistanceIn),
        bridgeCompatible,
        bridgeToTerminalDistanceIn: bridgeToTerminalDistanceIn == null ? null : round(bridgeToTerminalDistanceIn),
        bridgeToTerminalCompatible,
        predecessorTargetStateCompatible,
        terminalStatusEffectCompatible,
        resourceCompatible,
        resourceAcquisitionCompatible,
        activationSequenceCompatible,
        terminalSecondaryDamageCompatible,
        sourceLifecycleCompatible,
        additionalAttackResourceCompatible,
        scenarioCompatible,
        terminalRuleOperatorsCompatible,
        closureCompatible,
        unresolvedReasons,
        strictForwardWitnessRequired: true,
      };
    }).filter((entry) => entry.compatible)
    .sort((left, right) =>
      left.friendlyTurnsBeforeTerminal - right.friendlyTurnsBeforeTerminal ||
      left.unresolvedReasons.length - right.unresolvedReasons.length ||
      left.terminalDistanceIn - right.terminalDistanceIn ||
      left.nodeKey.localeCompare(right.nodeKey));
  return {
    schemaVersion: "warmachine_symbolic_reverse_frontier_meet_v1",
    worklistKey: String(worklist.worklistKey || ""),
    templateKey: String(template.templateKey || ""),
    compatibleNodeCount: matches.length,
    compatibleAlternativeCount: new Set(matches.map((entry) => entry.alternativeKey)).size,
    matches,
    bestMatch: matches[0] || null,
    openingCompatible: matches.length > 0,
    strictPredecessorPathProven: false,
    claimBoundary: "A symbolic meet checks typed necessary constraints for a specific predecessor route. Geometry paths, lifecycle, opponent responses, chance, and the full action sequence still require strict forward proof.",
  };
}

export function buildWarmachineSymbolicReverseWorklist(inputState = {}, template = {}, resourceBranch = null, rawOptions = {}) {
  const horizonFriendlyTurns = Math.max(1, Math.floor(numeric(
    rawOptions.horizonFriendlyTurns,
    template.reachability?.minimumFriendlyTurns || 4,
  )));
  const maximumNodes = Math.max(2, Math.floor(numeric(rawOptions.maximumNodes, 128)));
  const allAlternatives = terminalAlternatives(template);
  const maximumAlternatives = Math.max(1, Math.floor(numeric(rawOptions.maximumAlternatives, allAlternatives.length || 1)));
  const selectedAlternatives = allAlternatives.slice(0, maximumAlternatives);
  const terminalReverseOperatorScope = buildWarmachineTerminalReverseOperatorScope(inputState, template);
  const remainingRuleAlternativeCount = Math.max(0,
    allAlternatives.length - selectedAlternatives.length + numeric(template.reverseRuleRegression?.remainingCandidateCount, 0));
  const nodes = [];
  const edges = [];
  const nodeByCanonicalKey = new Map();
  const queue = [];
  let nodeBudgetUnresolvedExpansionCount = 0;
  let semanticDeduplicationCount = 0;

  const rootNode = {
    nodeKind: "terminal_outcome",
    goalType: template.goalType,
    attackerSideKey: template.attackerSideKey,
    templateKey: template.templateKey,
    quantifierToPredecessorAlternatives: "or",
  };
  rootNode.canonicalStateKey = `symbolic-${stableHash(rootNode)}`;
  rootNode.nodeKey = `reverse-node-${stableHash({ root: rootNode.canonicalStateKey })}`;
  nodes.push(rootNode);
  nodeByCanonicalKey.set(rootNode.canonicalStateKey, rootNode);

  const addSymbolicNode = (alternative, layer, parentNodeKey, edgeQuantifier) => {
      const constraints = symbolicConstraints(
        template,
        resourceBranch,
        alternative,
        layer,
        terminalReverseOperatorScope,
      );
    const canonical = {
      nodeKind: "symbolic_predecessor_state",
      goalType: template.goalType,
      alternativeKey: alternative.alternativeKey,
      predecessorKind: alternative.predecessorKind,
      friendlyTurnsBeforeTerminal: layer,
      constraints,
    };
    const canonicalStateKey = `symbolic-${stableHash(canonical)}`;
    let node = nodeByCanonicalKey.get(canonicalStateKey);
    if (!node) {
      if (nodes.length >= maximumNodes) {
        nodeBudgetUnresolvedExpansionCount += 1;
        return null;
      }
      node = {
        ...canonical,
        nodeKey: `reverse-node-${stableHash({ canonicalStateKey })}`,
        canonicalStateKey,
        quantifierWithinState: "and",
        strictForwardWitnessRequired: true,
        proposalMass: round(1 / Math.max(1, allAlternatives.length)),
      };
      nodes.push(node);
      nodeByCanonicalKey.set(canonicalStateKey, node);
      queue.push({ node, alternative });
    } else {
      semanticDeduplicationCount += 1;
    }
    edges.push({
      fromNodeKey: parentNodeKey,
      toNodeKey: node.nodeKey,
      direction: "effect_to_precondition",
      relation: layer === 0 ? "alternative_terminal_predecessor" : "requires_earlier_friendly_turn_state",
      quantifier: edgeQuantifier,
      operatorKey: layer === 0 ? `terminal_inverse:${alternative.predecessorKind}` : "friendly_turn_reach_inverse",
    });
    return node;
  };

  for (const alternative of selectedAlternatives) addSymbolicNode(alternative, 0, rootNode.nodeKey, "one_of");
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const { node, alternative } = queue[cursor];
    const nextLayer = node.friendlyTurnsBeforeTerminal + 1;
    if (nextLayer >= horizonFriendlyTurns) continue;
    addSymbolicNode(alternative, nextLayer, node.nodeKey, "all_required");
  }

  const frontierNodes = nodes.filter((node) => node.nodeKind === "symbolic_predecessor_state" &&
    !edges.some((edge) => edge.fromNodeKey === node.nodeKey));
  const worklistCompleteForDeclaredOperators = remainingRuleAlternativeCount === 0 &&
    nodeBudgetUnresolvedExpansionCount === 0;
  const worklist = {
    schemaVersion: WARMACHINE_SYMBOLIC_REVERSE_WORKLIST_SCHEMA,
    worklistKey: `reverse-worklist-${stableHash({
      templateKey: template.templateKey,
      terminalBranchKey: resourceBranch?.terminalBranchKey || "",
      nodeKeys: nodes.map((node) => node.nodeKey),
    })}`,
    templateKey: template.templateKey || "",
    terminalBranchKey: resourceBranch?.terminalBranchKey || template.templateKey || "",
    rootNodeKey: rootNode.nodeKey,
    nodes,
    edges,
    frontierNodeKeys: frontierNodes.map((node) => node.nodeKey),
    counts: {
      terminalAlternativeCount: allAlternatives.length,
      selectedTerminalAlternativeCount: selectedAlternatives.length,
      symbolicPredecessorStateCount: nodes.filter((node) => node.nodeKind === "symbolic_predecessor_state").length,
      edgeCount: edges.length,
      frontierCount: frontierNodes.length,
      semanticDeduplicationCount,
      remainingRuleAlternativeCount,
      nodeBudgetUnresolvedExpansionCount,
    },
    finiteContract: {
      maximumNodes,
      maximumAlternatives,
      horizonFriendlyTurns,
      worklistCompleteForDeclaredOperators,
      inverseRulesV1StateGenerated: false,
      fullRulesPredecessorOperatorCoverage: false,
      budgetExhaustionMeaning: "unresolved_symbolic_predecessor_mass",
    },
    quantifierContract: {
      terminalPredecessorAlternatives: "or",
      constraintsWithinOneSymbolicState: "and",
      opponentResponses: "and_or_min_in_strict_forward_search",
      chanceOutcomes: "chance_mass_in_strict_forward_search",
    },
    terminalReverseOperatorScope,
    sourceStateModelCount: Array.isArray(inputState.pieces) ? inputState.pieces.length : 0,
    trainingTruth: false,
    globalOptimalityProven: false,
    claimBoundary: "The worklist recursively regresses typed symbolic constraints, not complete inverse rules-v1 states. It is finite and canonical, but every path remains unresolved until a bound legal opening meets the frontier and strict forward replay certifies the action, reaction, lifecycle, and chance chain.",
  };
  worklist.symbolicEvaluation = evaluateWarmachineSymbolicReverseWorklist(worklist);
  return worklist;
}
