import { createHash } from "node:crypto";

export const WARMACHINE_TERMINAL_OBLIGATION_GRAPH_SCHEMA = "warmachine_terminal_obligation_graph_v1";

const EXACT_PROBABILITY_BOUND_KINDS = new Set([
  "exact_fixture_probability",
  "exact_rules_pmf",
  "strict_exhaustive_probability",
  "strict_exhaustive_probability_upper_bound",
]);

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, digits = 6) {
  const scale = 10 ** digits;
  return Math.round((numeric(value, 0) + Number.EPSILON) * scale) / scale;
}

function stableHash(value, length = 24) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, length);
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
  if (radius > 0) return Math.max(0, Math.hypot(piecePosition.xIn - xIn, piecePosition.yIn - yIn) - radius - pieceRadius);
  return Math.max(0, Math.hypot(
    Math.max(0, Math.abs(piecePosition.xIn - xIn) - width / 2),
    Math.max(0, Math.abs(piecePosition.yIn - yIn) - height / 2),
  ) - pieceRadius);
}

function probabilityEvidence(template = {}, resourceBranch = {}, minimumProbability = 0) {
  const declaration = resourceBranch.probabilityEvidence || template.probability || {};
  const boundKind = String(resourceBranch.probabilityBoundKind || declaration.boundKind || "unknown");
  const pointEstimate = Math.max(0, Math.min(1, numeric(
    resourceBranch.terminalProbability ?? declaration.singleAttackKillProbability ??
      declaration.conditionalTerminalScoreProbability,
    0,
  )));
  const exact = EXACT_PROBABILITY_BOUND_KINDS.has(boundKind);
  const upperBound = Math.max(0, Math.min(1, numeric(declaration.upperBound, exact ? pointEstimate : 1)));
  const lowerBound = Math.max(0, Math.min(upperBound, numeric(declaration.lowerBound, exact ? pointEstimate : 0)));
  const safelyRefuted = exact && upperBound + 1e-9 < minimumProbability;
  const safelySatisfied = exact && lowerBound + 1e-9 >= minimumProbability;
  return {
    boundKind,
    pointEstimate: round(pointEstimate),
    lowerBound: round(lowerBound),
    upperBound: round(upperBound),
    minimumProbability: round(minimumProbability),
    exact,
    verdict: safelyRefuted ? "refuted" : safelySatisfied ? "satisfied" : "unresolved",
    hardRefutationEligible: exact,
    safelyRefuted,
    claimBoundary: exact
      ? "The declared probability interval is exact for this branch shape."
      : "Screening estimates cannot delete a branch; card rules, rerolls, extra dice, criticals, Tough, and derived attacks remain unresolved.",
  };
}

function addNode(nodes, kind, requirement, detail = {}) {
  const node = {
    nodeKey: `obligation-${stableHash({ kind, requirement, detail, index: nodes.length })}`,
    kind,
    requirement,
    verdict: detail.verdict || "unresolved",
    hardRefutationEligible: detail.hardRefutationEligible === true,
    safelyRefuted: detail.safelyRefuted === true,
    preconditionPolarity: detail.preconditionPolarity || "must_hold",
    refutationScope: detail.refutationScope || "same_terminal_branch",
    evidence: detail.evidence || {},
    claimBoundary: String(detail.claimBoundary || "A strict forward witness is required."),
  };
  nodes.push(node);
  return node;
}

function addDependency(edges, parent, child, relation = "requires", detail = {}) {
  edges.push({
    fromNodeKey: parent.nodeKey,
    toNodeKey: child.nodeKey,
    relation,
    direction: "effect_to_precondition",
    effectKind: parent.kind,
    preconditionKind: child.kind,
    quantifier: detail.quantifier || "all_required",
    branchScope: detail.branchScope || "same_terminal_branch",
    claimBoundary: String(detail.claimBoundary ||
      "The precondition is regressed from this effect; only complete conservative evidence may refute the bound branch."),
  });
}

export function buildWarmachineTerminalObligationGraph(inputState = {}, template = {}, resourceBranch = null, rawOptions = {}) {
  const state = inputState || {};
  const minimumProbability = Math.max(0, Math.min(1, numeric(
    rawOptions.minimumTerminalProbability,
    resourceBranch?.minimumTerminalProbability,
  )));
  const actor = (state.pieces || []).find((piece) => piece.pieceKey === template.attackerPieceKey) || null;
  const target = (state.pieces || []).find((piece) => piece.pieceKey === template.targetPieceKey) || null;
  const nodes = [];
  const edges = [];
  let terminalMechanicNode = null;
  const outcome = addNode(nodes, "terminal_outcome", template.goalType || "unknown", {
    verdict: "unresolved",
    evidence: {
      attackerSideKey: template.attackerSideKey || "",
      defenderSideKey: template.defenderSideKey || "",
    },
    claimBoundary: "Only a strict terminal event or exact scenario score transition proves the outcome.",
  });

  const actorAvailability = addNode(nodes, "actor_availability", "fixed terminal actor remains executable", {
    verdict: actor && alive(actor) ? "satisfied" : "unresolved",
    evidence: {
      attackerPieceKey: template.attackerPieceKey || "",
      present: Boolean(actor),
      alive: Boolean(actor && alive(actor)),
    },
    claimBoundary: actor && alive(actor)
      ? "The actor is currently present and alive; future opponent interaction remains unresolved."
      : "Absence or destruction is not hard-refuted because a card rule may return, replace, or create an actor until strict rule closure proves otherwise.",
  });
  addDependency(edges, outcome, actorAvailability);

  if (template.goalType === "scenario_score") {
    const score = numeric(state.scenario?.score?.[template.attackerSideKey], 0);
    const victoryThreshold = Math.max(1, numeric(template.victoryThreshold, state.scenario?.victoryThreshold || 5));
    const scoreTransition = addNode(nodes, "scenario_score_transition", "reach the victory threshold in a legal scoring window", {
      verdict: score >= victoryThreshold ? "satisfied" : "unresolved",
      evidence: {
        currentScore: score,
        scoreBeforeTerminal: numeric(template.scoreBeforeTerminal, 0),
        terminalScoreGain: numeric(template.terminalScoreGain, 0),
        victoryThreshold,
        scoringStartSideKey: template.scoringStartSideKey || "",
        scoringStartTurnNumber: numeric(template.scoringStartTurnNumber, 2),
      },
      claimBoundary: "Scoring time, control eligibility, contesting, and end-of-turn sequencing require strict scenario execution.",
    });
    const secureElement = addNode(nodes, "scenario_control", "secure the specified element without an eligible contesting model", {
      evidence: {
        elementType: template.scenarioElement?.elementType || "",
        elementKey: template.scenarioElement?.elementKey || "",
      },
      claimBoundary: "Opponent removal, contesting, objective eligibility, and scoring ownership remain adversarial obligations.",
    });
    addDependency(edges, outcome, scoreTransition);
    addDependency(edges, scoreTransition, secureElement);
    terminalMechanicNode = secureElement;
  } else {
    const targetTransition = addNode(nodes, "target_terminal_transition", "the fixed opposing leader becomes destroyed or removed", {
      verdict: target && alive(target) ? "unresolved" : "satisfied",
      evidence: {
        targetPieceKey: template.targetPieceKey || "",
        present: Boolean(target),
        alive: Boolean(target && alive(target)),
        boxesRemaining: numeric(target?.damage?.boxesRemaining ?? target?.boxesRemaining, 0),
        targetBoxesBeforeFinal: numeric(template.targetBoxesBeforeFinal, 1),
      },
      claimBoundary: "Damage, transfers, Tough, disabled/destroyed/boxed ordering, and removal replacements require strict execution.",
    });
    const attackResolution = addNode(nodes, "attack_resolution", "a legal attack/effect produces the terminal transition", {
      evidence: {
        attackMode: template.attackMode || template.attackProfile?.mode || "",
        attackProfileKey: template.attackProfile?.profileKey || "",
        boostedAttack: template.boostedAttack === true,
        boostedDamage: template.boostedDamage === true,
        additionalAttackCount: numeric(template.additionalAttackCount, 0),
      },
      claimBoundary: "Target legality, LOS, attack modifiers, damage stages, reactions, and generated attacks require strict execution.",
    });
    addDependency(edges, outcome, targetTransition);
    addDependency(edges, targetTransition, attackResolution);
    const reverseRegression = template.reverseRuleRegression || {};
    if ((reverseRegression.alternatives || []).length) {
      const causalOrigin = addNode(nodes, "terminal_attack_causal_origin", "select and prove one direct or rule-derived predecessor route", {
        evidence: {
          regressionKey: reverseRegression.regressionKey || "",
          alternativeCount: numeric(reverseRegression.alternativeCount, 0),
          ruleDerivedAlternativeCount: numeric(reverseRegression.ruleDerivedAlternativeCount, 0),
          remainingCandidateCount: numeric(reverseRegression.remainingCandidateCount, 0),
          cursorExhausted: reverseRegression.cursorExhausted === true,
          alternatives: (reverseRegression.alternatives || []).map((entry) => ({
            alternativeKey: entry.alternativeKey,
            predecessorKind: entry.predecessorKind,
            bridgeTargetPieceKey: entry.bridgeTargetPieceKey || "",
            previousActorPositionConstraint: entry.previousActorPositionConstraint || null,
            damageLifecycleObligation: entry.damageLifecycleObligation || null,
          })),
        },
        claimBoundary: "One causal predecessor is sufficient, but every selected direct or rule-derived route still requires a concrete strict forward witness.",
      });
      addDependency(edges, attackResolution, causalOrigin, "requires_one_causal_origin", {
        quantifier: "one_alternative_sufficient",
      });
    }
    terminalMechanicNode = attackResolution;
  }

  const edgeDistanceIn = actor
    ? template.goalType === "scenario_score"
      ? distanceToScenarioElement(actor, template.scenarioElement || {})
      : target ? baseEdgeDistance(actor, target) : 0
    : Number.POSITIVE_INFINITY;
  const horizonFriendlyTurns = Math.max(1, Math.floor(numeric(
    rawOptions.horizonFriendlyTurns,
    template.reachability?.minimumFriendlyTurns || 1,
  )));
  const terminalThreatIn = Math.max(0, numeric(
    resourceBranch?.reachability?.finalTurnThreatIn,
    template.reachability?.finalTurnThreatIn,
  ));
  const setupRunIn = Math.max(0, numeric(
    resourceBranch?.reachability?.setupRunIn,
    template.reachability?.setupRunIn,
  ));
  const optimisticReachIn = terminalThreatIn + Math.max(0, horizonFriendlyTurns - 1) * setupRunIn;
  const movementBoundComplete = rawOptions.movementUpperBoundComplete === true;
  const movementRefuted = movementBoundComplete && edgeDistanceIn > optimisticReachIn + 0.001;
  const spatial = addNode(nodes, "spatial_reachability", "reach a legal terminal position with required range and LOS", {
    verdict: movementRefuted ? "refuted" : edgeDistanceIn <= optimisticReachIn + 0.001 ? "unresolved" : "unresolved",
    hardRefutationEligible: movementBoundComplete,
    safelyRefuted: movementRefuted,
    evidence: {
      edgeDistanceIn: Number.isFinite(edgeDistanceIn) ? round(edgeDistanceIn) : null,
      optimisticReachIn: round(optimisticReachIn),
      horizonFriendlyTurns,
      movementUpperBoundComplete: movementBoundComplete,
    },
    claimBoundary: movementBoundComplete
      ? "The movement upper bound declares all rule-granted place, push, throw, speed, and range effects covered."
      : "The open-lane estimate is ordering evidence only; rule-granted movement, terrain, intervening models, LOS, and displacement are unresolved.",
  });
  addDependency(edges, terminalMechanicNode || outcome, spatial);

  const probability = probabilityEvidence(template, resourceBranch || {}, minimumProbability);
  const probabilityNode = addNode(nodes, "terminal_probability", "terminal probability meets the configured threshold", {
    verdict: probability.verdict,
    hardRefutationEligible: probability.hardRefutationEligible,
    safelyRefuted: probability.safelyRefuted,
    evidence: probability,
    claimBoundary: probability.claimBoundary,
  });
  addDependency(edges, terminalMechanicNode || outcome, probabilityNode);

  const demand = resourceBranch?.resourceDemand || {};
  const source = resourceBranch?.resourceSource || {};
  const resourceSourceImpossible = resourceBranch && source.openingFeasible === false;
  const resource = addNode(nodes, "resource_payment", "compose the declared resource source and terminal payment", {
    verdict: resourceSourceImpossible ? "refuted" : numeric(demand.total, 0) <= 0 ? "satisfied" : "unresolved",
    hardRefutationEligible: resourceSourceImpossible,
    safelyRefuted: resourceSourceImpossible,
    evidence: {
      resourceKind: demand.resourceKind || "",
      total: numeric(demand.total, 0),
      paymentModel: demand.paymentModel || "",
      sourceKind: source.sourceKind || "",
      openingFeasible: source.openingFeasible !== false,
      strictSourceActionRequired: source.strictSourceActionRequired === true,
    },
    refutationScope: "same_declared_resource_source_branch",
    claimBoundary: resourceSourceImpossible
      ? "This exact declared source branch cannot pay its demand; other rule-granted resource sources are not disproved."
      : "Allocation, leech, forcing, upkeep, transfers, and rule-granted resource changes must compose in strict forward execution.",
  });
  addDependency(edges, terminalMechanicNode || outcome, resource);

  const interactionClosure = addNode(nodes, "rule_interaction_closure", "all enabling, disabling, replacement, and reaction rules are included", {
    verdict: "unresolved",
    evidence: {
      initialEffectiveRuleClosureKey: template.initialEffectiveRuleClosure?.closureKey || "",
      sourceModelComplete: rawOptions.sourceModelComplete === true,
    },
    claimBoundary: "The current terminal template does not yet prove complete transitive rule-interaction closure.",
  });
  const opponent = addNode(nodes, "opponent_interference", "the line survives every required opposing choice", {
    verdict: "unresolved",
    claimBoundary: "Opponent movement, attacks, transfers, reactions, contesting, and denial are AND obligations.",
  });
  const strictWitness = addNode(nodes, "strict_forward_witness", "rules-v1 strict replay reaches the terminal event", {
    verdict: "unresolved",
    claimBoundary: "No abstract or regressed branch is a witness until strict forward replay succeeds.",
  });
  addDependency(edges, outcome, interactionClosure);
  addDependency(edges, outcome, opponent);
  addDependency(edges, outcome, strictWitness);

  const safeRefutations = nodes.filter((node) => node.safelyRefuted && node.hardRefutationEligible);
  const effectToPreconditionIndex = Object.fromEntries(nodes.map((node) => [
    node.nodeKey,
    edges.filter((edge) => edge.fromNodeKey === node.nodeKey).map((edge) => ({
      preconditionNodeKey: edge.toNodeKey,
      preconditionKind: edge.preconditionKind,
      quantifier: edge.quantifier,
      branchScope: edge.branchScope,
    })),
  ]));
  return {
    schemaVersion: WARMACHINE_TERMINAL_OBLIGATION_GRAPH_SCHEMA,
    graphKey: `terminal-obligation-${stableHash({
      templateKey: template.templateKey || "",
      terminalBranchKey: resourceBranch?.terminalBranchKey || "",
      nodes: nodes.map((node) => [node.kind, node.requirement, node.evidence]),
    })}`,
    templateKey: template.templateKey || "",
    terminalBranchKey: resourceBranch?.terminalBranchKey || "",
    goalType: template.goalType || "",
    nodes,
    edges,
    directionalContract: {
      direction: "effect_to_precondition",
      graphKind: "and_obligation_branch",
      resourceAlternativesAcrossGraphs: true,
      completeForDeclaredNodes: edges.every((edge) =>
        edge.direction === "effect_to_precondition" && edge.effectKind && edge.preconditionKind),
      effectToPreconditionIndex,
      claimBoundary: "This proves the direction of the declared obligation edges, not completeness of every card rule, opponent response, or terminal predecessor.",
    },
    safeRefutations,
    safelyRefuted: safeRefutations.length > 0,
    status: safeRefutations.length ? "safely_refuted" : "unresolved_until_strict_witness",
    hardPruneReasons: safeRefutations.map((node) => node.kind === "terminal_probability"
      ? "terminal_probability_upper_bound_below_threshold"
      : node.kind === "resource_payment"
        ? "declared_resource_source_infeasible"
        : `${node.kind}_upper_bound_refutation`),
    unresolvedNodeCount: nodes.filter((node) => node.verdict === "unresolved").length,
    claimBoundary: "Only a node with complete evidence and a conservative upper-bound refutation may hard-prune. Every other missing proof remains unresolved.",
  };
}

export function warmachineTerminalProbabilityBoundIsExact(boundKind = "") {
  return EXACT_PROBABILITY_BOUND_KINDS.has(String(boundKind));
}
