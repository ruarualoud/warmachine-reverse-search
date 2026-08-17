import { createHash } from "node:crypto";

import {
  applyRulesV1Action,
  enumerateRulesV1Actions,
  normalizeRulesV1State,
} from "../warmachine-host-runtime.mjs";
import {
  buildWarmachineRulesV1ActionWithStrictRngOutcome,
} from "../warmachine-host-runtime.mjs";
import { warmachineExactPrimaryAttackTerminalProbability } from "../warmachine-host-runtime.mjs";
import { regressWarmachineTerminalThroughRuleAtoms } from "../reverse/rule-regression-v1.mjs";
import {
  buildWarmachineReverseReachabilityLayers,
  canonicalWarmachineEffectiveRuleClosure,
} from "../reverse/reachability-state-v1.mjs";

export {
  buildWarmachineReverseReachabilityLayers,
  canonicalWarmachineEffectiveRuleClosure,
} from "../reverse/reachability-state-v1.mjs";

export const WARMACHINE_GOAL_CONDITIONED_SEARCH_SCHEMA = "warmachine_goal_conditioned_search_v1";
export const WARMACHINE_TERMINAL_GOAL_TEMPLATE_SCHEMA = "warmachine_terminal_goal_template_v1";

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function round(value, digits = 4) {
  const scale = 10 ** digits;
  return Math.round((numeric(value, 0) + Number.EPSILON) * scale) / scale;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function stableHash(value, length = 16) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, length);
}

function alive(piece = {}) {
  return piece.destroyed !== true && piece.removedFromPlay !== true &&
    numeric(piece.damage?.boxesRemaining ?? piece.boxesRemaining, 1) > 0;
}

function roleText(piece = {}) {
  return [
    piece.modelRole,
    piece.modelType,
    piece.cardType,
    piece.cardTypeName,
    piece.label,
    ...(piece.keywords || []),
  ].filter(Boolean).join(" ").toLowerCase();
}

function leaderLike(piece = {}) {
  return piece.assassinationTarget === true || piece.isAssassinationTarget === true ||
    piece.isWarcaster === true || piece.isWarlock === true || /warcaster|warlock/.test(roleText(piece));
}

function pointDistance(left = {}, right = {}) {
  return Math.hypot(
    numeric(left.position?.xIn, 0) - numeric(right.position?.xIn, 0),
    numeric(left.position?.yIn, 0) - numeric(right.position?.yIn, 0),
  );
}

function baseEdgeDistance(left = {}, right = {}) {
  return Math.max(0, pointDistance(left, right) - numeric(left.baseSizeIn, 1.18) / 2 - numeric(right.baseSizeIn, 1.18) / 2);
}

function attackMode(profile = {}) {
  return String(profile.mode || profile.type || "melee").toLowerCase().includes("range") ? "ranged" :
    String(profile.mode || profile.type || "melee").toLowerCase().includes("spell") ? "spell" : "melee";
}

function attackStat(piece = {}, profile = {}) {
  const mode = attackMode(profile);
  if (mode === "ranged") return numeric(profile.rat ?? piece.rat, 0);
  if (mode === "spell") return numeric(profile.aat ?? piece.arc ?? piece.aat, 0);
  return numeric(profile.mat ?? piece.mat, 0);
}

function attackPower(piece = {}, profile = {}) {
  return numeric(
    profile.pow ?? profile.power ?? profile.pAndS ?? profile.pPlusS ??
      (attackMode(profile) === "melee" ? piece.meleePower : piece.rangedPower),
    0,
  );
}

function attackRange(piece = {}, profile = {}) {
  return Math.max(0.5, numeric(
    profile.rangeIn ?? profile.range ?? profile.rng ??
      (attackMode(profile) === "melee" ? piece.meleeRangeIn : piece.rangedRangeIn),
    attackMode(profile) === "melee" ? 1 : 0,
  ));
}

export function warmachineAttackProbabilityEnvelope(attacker = {}, target = {}, profile = {}, options = {}) {
  const boostedAttack = options.boostedAttack === true;
  const boostedDamage = options.boostedDamage === true;
  const attackDice = boostedAttack ? 3 : 2;
  const damageDice = boostedDamage ? 3 : 2;
  const stat = attackStat(attacker, profile);
  const defense = numeric(target.defense ?? target.def, 10);
  const power = attackPower(attacker, profile);
  const armor = numeric(target.armor ?? target.arm, 10);
  const targetBoxes = Math.max(1, Math.ceil(numeric(
    options.targetBoxesBeforeFinal ?? target.damage?.boxesRemaining ?? target.boxesRemaining,
    1,
  )));
  const hitThreshold = Math.max(2, defense - stat);
  const damageThreshold = armor + targetBoxes - power;
  const exactBaseDice = warmachineExactPrimaryAttackTerminalProbability({
    attackDiceCount: attackDice,
    damageDiceCount: damageDice,
    attackStat: stat,
    targetDefense: defense,
    attackPower: power,
    targetArmor: armor,
    targetBoxesBeforeFinal: targetBoxes,
  });
  const hitProbability = exactBaseDice.hitProbability.probability;
  const lethalDamageProbabilityOnHit = exactBaseDice.lethalDamageProbabilityOnHit.probability;
  return {
    attackDice,
    damageDice,
    attackStat: stat,
    targetDefense: defense,
    hitThreshold,
    power,
    targetArmor: armor,
    targetBoxesBeforeFinal: targetBoxes,
    damageThreshold,
    hitProbability: round(hitProbability, 6),
    lethalDamageProbabilityOnHit: round(lethalDamageProbabilityOnHit, 6),
    singleAttackKillProbability: round(hitProbability * lethalDamageProbabilityOnHit, 6),
    exactBaseDiceEvidence: exactBaseDice,
    modelScope: "basic_2d6_or_boosted_3d6_hit_and_damage_without_card_specific_extra_dice_or_rerolls",
    boundKind: "screening_estimate_not_rules_authority",
  };
}

function deterministicFractions(seed, count) {
  const digest = createHash("sha256").update(seed).digest();
  const values = [];
  for (let index = 0; index < count; index += 1) {
    values.push((digest[index % digest.length] + 0.5) / 256);
  }
  return values;
}

function attackProfiles(piece = {}) {
  const profiles = Array.isArray(piece.attackProfiles) ? piece.attackProfiles : [];
  return profiles.filter((profile) => attackPower(piece, profile) > 0 && attackRange(piece, profile) > 0);
}

function attackProfileIdentity(profile = {}) {
  return [
    profile.profileKey,
    profile.name,
    profile.spellName,
    attackMode(profile),
    profile.rangeIn ?? profile.range ?? profile.rng,
    profile.pow ?? profile.power ?? profile.pAndS ?? profile.pPlusS,
  ].map((value) => String(value ?? "")).join("|");
}

function canBoostOwnAttack(piece = {}) {
  const text = roleText(piece);
  return piece.isWarcaster === true || piece.isWarlock === true || piece.isWarjack === true ||
    piece.isWarbeast === true || piece.canForceFury === true ||
    /warcaster|warlock|warjack|warbeast|monstrosity|colossal|gargantuan/.test(text) ||
    numeric(piece.resourceMax ?? piece.resource2Max, 0) > 0;
}

function estimatedMinimumFriendlyTurns(attacker = {}, target = {}, profile = {}) {
  const initialDistanceIn = baseEdgeDistance(attacker, target);
  const speedIn = Math.max(0, numeric(attacker.speedIn, 0));
  const rangeIn = attackRange(attacker, profile);
  const finalTurnThreatIn = attackMode(profile) === "melee"
    ? speedIn + 3 + rangeIn
    : speedIn + rangeIn;
  const setupRunIn = speedIn + 5;
  const priorDistanceIn = Math.max(0, initialDistanceIn - finalTurnThreatIn);
  const setupTurns = setupRunIn > 0 ? Math.ceil(priorDistanceIn / setupRunIn) : Number.POSITIVE_INFINITY;
  return {
    initialDistanceIn: round(initialDistanceIn),
    terminalRangeIn: round(rangeIn),
    finalTurnThreatIn: round(finalTurnThreatIn),
    setupRunIn: round(setupRunIn),
    minimumFriendlyTurns: Number.isFinite(setupTurns) ? 1 + setupTurns : null,
    estimateScope: "optimistic_open_lane_movement_bound_before_strict_path_los_and_opponent_response",
  };
}

function scenarioElements(state = {}) {
  return [
    ...(state.scenario?.zones || []).map((element) => ({
      ...element,
      elementType: "zone",
      elementKey: element.zoneKey,
      controlPoints: Math.max(1, numeric(element.controlPoints, 1)),
    })),
    ...(state.scenario?.flags || []).map((element) => ({
      ...element,
      elementType: "flag",
      elementKey: element.flagKey,
      controlPoints: Math.max(1, numeric(element.controlPoints, 1)),
    })),
    ...(state.scenario?.actionObjectives || []).map((element) => ({
      ...element,
      elementType: "action_objective",
      elementKey: element.objectiveKey || element.actionObjectiveKey,
      controlPoints: Math.max(1, numeric(element.controlPoints, 1)),
    })),
  ].filter((element) => element.elementKey);
}

function distanceToScenarioElement(piece = {}, element = {}) {
  const centerDistance = Math.hypot(
    numeric(piece.position?.xIn, 0) - numeric(element.xIn, 0),
    numeric(piece.position?.yIn, 0) - numeric(element.yIn, 0),
  );
  const pieceRadius = numeric(piece.baseSizeIn, 1.18) / 2;
  if (String(element.shape || "").toLowerCase() === "rect") {
    const dx = Math.max(0, Math.abs(numeric(piece.position?.xIn, 0) - numeric(element.xIn, 0)) - numeric(element.widthIn, 0) / 2);
    const dy = Math.max(0, Math.abs(numeric(piece.position?.yIn, 0) - numeric(element.yIn, 0)) - numeric(element.heightIn, 0) / 2);
    return Math.max(0, Math.hypot(dx, dy) - pieceRadius);
  }
  return Math.max(0, centerDistance - numeric(element.radiusIn, 0) - pieceRadius);
}

function scenarioReachability(piece = {}, element = {}) {
  const initialDistanceIn = distanceToScenarioElement(piece, element);
  const setupRunIn = Math.max(0, numeric(piece.speedIn, 0) + 5);
  return {
    initialDistanceIn: round(initialDistanceIn),
    terminalRangeIn: 0,
    finalTurnThreatIn: setupRunIn,
    setupRunIn: round(setupRunIn),
    minimumFriendlyTurns: initialDistanceIn <= 0.001 ? 1 : setupRunIn > 0 ? Math.max(1, Math.ceil(initialDistanceIn / setupRunIn)) : null,
    estimateScope: "optimistic_open_lane_scenario_presence_bound_before_strict_path_contest_and_scoring_window",
  };
}

function terminalProbability(template = {}) {
  return numeric(
    template.probability?.singleAttackKillProbability ?? template.probability?.conditionalTerminalScoreProbability,
    0,
  );
}

export function buildWarmachineTerminalGoalTemplates(inputState = {}, rawOptions = {}) {
  const state = normalizeRulesV1State(inputState);
  const options = {
    attackerSideKey: String(rawOptions.attackerSideKey || state.activeSideKey || "player1"),
    horizonFriendlyTurns: Math.max(1, Math.floor(numeric(rawOptions.horizonFriendlyTurns, 4))),
    minimumSingleAttackKillProbability: Math.max(0, Math.min(1, numeric(rawOptions.minimumSingleAttackKillProbability, 0.1))),
    maximumTemplates: Math.max(1, Math.floor(numeric(rawOptions.maximumTemplates, 64))),
    includeBoosted: rawOptions.includeBoosted !== false,
    seed: String(rawOptions.seed || "warmachine-terminal-goal-templates-v1"),
  };
  const attackerSideKey = options.attackerSideKey;
  const defenderSideKey = attackerSideKey === "player2" ? "player1" : "player2";
  const attackers = state.pieces.filter((piece) => piece.sideKey === attackerSideKey && alive(piece));
  const targets = state.pieces.filter((piece) => piece.sideKey === defenderSideKey && alive(piece) && leaderLike(piece));
  const healthFractions = [0.15, 0.35, 0.6, 1];
  const templates = [];
  for (const attacker of attackers) {
    const effectiveRuleClosure = canonicalWarmachineEffectiveRuleClosure(attacker);
    for (const target of targets) {
      for (const profile of attackProfiles(attacker)) {
        const reachability = estimatedMinimumFriendlyTurns(attacker, target, profile);
        if (!reachability.minimumFriendlyTurns || reachability.minimumFriendlyTurns > options.horizonFriendlyTurns) continue;
        for (const healthFraction of healthFractions) {
          const targetBoxesBeforeFinal = Math.max(1, Math.ceil(numeric(target.maxBoxes, target.boxesRemaining) * healthFraction));
          const boostVariants = options.includeBoosted && canBoostOwnAttack(attacker)
            ? [
              { boostedAttack: false, boostedDamage: false },
              { boostedAttack: true, boostedDamage: false },
              { boostedAttack: false, boostedDamage: true },
              { boostedAttack: true, boostedDamage: true },
            ]
            : [{ boostedAttack: false, boostedDamage: false }];
          for (const boost of boostVariants) {
            const probability = warmachineAttackProbabilityEnvelope(attacker, target, profile, {
              ...boost,
              targetBoxesBeforeFinal,
            });
            if (probability.singleAttackKillProbability + 1e-9 < options.minimumSingleAttackKillProbability) continue;
            const random = deterministicFractions(
              `${options.seed}|${attacker.pieceKey}|${target.pieceKey}|${profile.profileKey}|${healthFraction}|${JSON.stringify(boost)}`,
              3,
            );
            const identity = {
              goalType: "assassination",
              attackerPieceKey: attacker.pieceKey,
              targetPieceKey: target.pieceKey,
              profileIdentity: attackProfileIdentity(profile),
              targetBoxesBeforeFinal,
              effectiveRuleClosureKey: effectiveRuleClosure.closureKey,
              ...boost,
            };
            templates.push({
              schemaVersion: WARMACHINE_TERMINAL_GOAL_TEMPLATE_SCHEMA,
              templateKey: `assassination-${stableHash(identity)}`,
              goalType: "assassination",
              attackerSideKey,
              defenderSideKey,
              attackerPieceKey: attacker.pieceKey,
              attackerLabel: attacker.label,
              targetPieceKey: target.pieceKey,
              targetLabel: target.label,
              attackProfile: cloneJson(profile),
              attackMode: attackMode(profile),
              targetBoxesBeforeFinal,
              targetHealthFraction: round(targetBoxesBeforeFinal / Math.max(1, numeric(target.maxBoxes, target.boxesRemaining))),
              boostedAttack: boost.boostedAttack,
              boostedDamage: boost.boostedDamage,
              probability,
              reachability,
              terminalPlacementAngleDeg: round(random[0] * 360, 3),
              routeLaneBias: random[1] < 1 / 3 ? "north" : random[1] < 2 / 3 ? "center" : "south",
              opponentResponseSeed: Math.floor(random[2] * 4),
              initialEffectiveRuleClosure: effectiveRuleClosure,
              proposalProbability: round(1 / (attackers.length * Math.max(1, targets.length) * healthFractions.length * boostVariants.length), 9),
              trainingTruth: false,
              globalOptimalityProven: false,
            });
          }
        }
      }
    }
  }
  const victoryThreshold = Math.max(1, numeric(state.scenario?.victoryThreshold, 5));
  const currentScore = numeric(state.scenario?.score?.[attackerSideKey], 0);
  for (const scorer of attackers) {
    const effectiveRuleClosure = canonicalWarmachineEffectiveRuleClosure(scorer);
    for (const element of scenarioElements(state)) {
      const reachability = scenarioReachability(scorer, element);
      if (!reachability.minimumFriendlyTurns || reachability.minimumFriendlyTurns > options.horizonFriendlyTurns) continue;
      const scoreBeforeTerminal = Math.max(currentScore, victoryThreshold - element.controlPoints);
      const identity = {
        goalType: "scenario_score",
        scorerPieceKey: scorer.pieceKey,
        elementType: element.elementType,
        elementKey: element.elementKey,
        scoreBeforeTerminal,
        victoryThreshold,
        effectiveRuleClosureKey: effectiveRuleClosure.closureKey,
      };
      const random = deterministicFractions(`${options.seed}|${JSON.stringify(identity)}`, 2);
      templates.push({
        schemaVersion: WARMACHINE_TERMINAL_GOAL_TEMPLATE_SCHEMA,
        templateKey: `scenario-${stableHash(identity)}`,
        goalType: "scenario_score",
        attackerSideKey,
        defenderSideKey,
        attackerPieceKey: scorer.pieceKey,
        attackerLabel: scorer.label,
        targetPieceKey: "",
        targetLabel: "",
        scenarioElement: cloneJson(element),
        scoreBeforeTerminal,
        terminalScoreGain: element.controlPoints,
        victoryThreshold,
        scoringStartSideKey: String(state.scenario?.scoringStartSideKey || state.scenario?.defenderSideKey || "player2"),
        scoringStartTurnNumber: Math.max(1, numeric(state.scenario?.scoringStartTurnNumber, 2)),
        probability: {
          conditionalTerminalScoreProbability: 1,
          condition: "strict scoring window reached with this element secured and uncontested",
          boundKind: "conditional_not_opponent_adjusted",
        },
        reachability,
        routeLaneBias: random[0] < 1 / 3 ? "north" : random[0] < 2 / 3 ? "center" : "south",
        opponentResponseSeed: Math.floor(random[1] * 4),
        initialEffectiveRuleClosure: effectiveRuleClosure,
        proposalProbability: round(1 / Math.max(1, attackers.length * scenarioElements(state).length), 9),
        trainingTruth: false,
        globalOptimalityProven: false,
      });
    }
  }
  for (const template of templates) {
    if (template.goalType !== "assassination") continue;
    template.reverseRuleRegression = regressWarmachineTerminalThroughRuleAtoms(state, template, {
      maximumBridgeCandidates: rawOptions.maximumReverseBridgeCandidates,
    });
  }
  templates.sort((left, right) =>
    terminalProbability(right) - terminalProbability(left) ||
    left.reachability.minimumFriendlyTurns - right.reachability.minimumFriendlyTurns ||
    left.templateKey.localeCompare(right.templateKey));
  const pruned = paretoPruneWarmachineGoalTemplates(templates, options.maximumTemplates);
  const tacticalGroupCounts = new Map();
  for (const template of templates) {
    const signature = templateSignature(template);
    tacticalGroupCounts.set(signature, (tacticalGroupCounts.get(signature) || 0) + 1);
  }
  const semanticCollapseRows = pruned.pruned.filter((entry) =>
    ["duplicate_terminal_template", "same_tactical_signature_dominated"].includes(entry.reason));
  const crossEffectiveRuleClosureCollapseCount = semanticCollapseRows.filter((entry) =>
    entry.effectiveRuleClosureKey && entry.dominatorEffectiveRuleClosureKey &&
      entry.effectiveRuleClosureKey !== entry.dominatorEffectiveRuleClosureKey).length;
  return {
    schemaVersion: WARMACHINE_GOAL_CONDITIONED_SEARCH_SCHEMA,
    kind: "finite_terminal_goal_template_set",
    options,
    generatedCount: templates.length,
    retainedCount: pruned.retained.length,
    dominancePrunedCount: pruned.pruned.length,
    branchCollapseAudit: {
      generatedEffectiveRuleClosureCount: new Set(templates
        .map((template) => template.initialEffectiveRuleClosure?.closureKey)
        .filter(Boolean)).size,
      retainedEffectiveRuleClosureCount: new Set(pruned.retained
        .map((template) => template.initialEffectiveRuleClosure?.closureKey)
        .filter(Boolean)).size,
      mergeEligibleTacticalGroupCount: Array.from(tacticalGroupCounts.values()).filter((count) => count > 1).length,
      semanticCollapseCount: semanticCollapseRows.length,
      crossEffectiveRuleClosureCollapseCount,
      finiteBudgetPrunedCount: pruned.pruned.filter((entry) => entry.reason === "finite_template_budget").length,
      strictActionSpaceAuthority: "enumerateRulesV1Actions",
      interpretation: "Acquired rules first change the strict legal action set. Template candidates collapse only inside the same tactical signature and effective-rule closure; finite-budget removal is reported separately.",
    },
    templates: pruned.retained,
    prunedTemplates: pruned.pruned,
    finite: true,
  };
}

function templateSignature(template = {}) {
  if (template.goalType === "scenario_score") {
    return [
      template.goalType,
      template.attackerPieceKey,
      template.scenarioElement?.elementType,
      template.scenarioElement?.elementKey,
      template.scoreBeforeTerminal,
      template.victoryThreshold,
      template.initialEffectiveRuleClosure?.closureKey,
    ].join("|");
  }
  return [
    template.goalType,
    template.attackerPieceKey,
    template.targetPieceKey,
    attackProfileIdentity(template.attackProfile),
    template.targetBoxesBeforeFinal,
    template.initialEffectiveRuleClosure?.closureKey,
  ].join("|");
}

function dominatesTemplate(left = {}, right = {}) {
  if (left.goalType === "scenario_score" || right.goalType === "scenario_score") {
    const noWorse = terminalProbability(left) >= terminalProbability(right) &&
      numeric(left.reachability?.minimumFriendlyTurns, 99) <= numeric(right.reachability?.minimumFriendlyTurns, 99) &&
      numeric(left.terminalScoreGain, 0) >= numeric(right.terminalScoreGain, 0);
    const strictlyBetter = terminalProbability(left) > terminalProbability(right) ||
      numeric(left.reachability?.minimumFriendlyTurns, 99) < numeric(right.reachability?.minimumFriendlyTurns, 99) ||
      numeric(left.terminalScoreGain, 0) > numeric(right.terminalScoreGain, 0);
    return noWorse && strictlyBetter;
  }
  const noWorse =
    numeric(left.probability?.singleAttackKillProbability, 0) >= numeric(right.probability?.singleAttackKillProbability, 0) &&
    numeric(left.reachability?.minimumFriendlyTurns, 99) <= numeric(right.reachability?.minimumFriendlyTurns, 99) &&
    Number(left.boostedAttack) + Number(left.boostedDamage) <= Number(right.boostedAttack) + Number(right.boostedDamage);
  const strictlyBetter =
    numeric(left.probability?.singleAttackKillProbability, 0) > numeric(right.probability?.singleAttackKillProbability, 0) ||
    numeric(left.reachability?.minimumFriendlyTurns, 99) < numeric(right.reachability?.minimumFriendlyTurns, 99) ||
    Number(left.boostedAttack) + Number(left.boostedDamage) < Number(right.boostedAttack) + Number(right.boostedDamage);
  return noWorse && strictlyBetter;
}

export function paretoPruneWarmachineGoalTemplates(templates = [], maximumTemplates = 64) {
  const retained = [];
  const pruned = [];
  const retainedKeys = new Set();
  for (const template of templates) {
    if (retainedKeys.has(template.templateKey)) {
      pruned.push({
        templateKey: template.templateKey,
        reason: "duplicate_terminal_template",
        effectiveRuleClosureKey: template.initialEffectiveRuleClosure?.closureKey || "",
        dominatorEffectiveRuleClosureKey: template.initialEffectiveRuleClosure?.closureKey || "",
      });
      continue;
    }
    const signature = templateSignature(template);
    const dominator = retained.find((candidate) =>
      templateSignature(candidate) === signature && dominatesTemplate(candidate, template));
    if (dominator) {
      pruned.push({
        templateKey: template.templateKey,
        reason: "same_tactical_signature_dominated",
        dominatedByTemplateKey: dominator.templateKey,
        effectiveRuleClosureKey: template.initialEffectiveRuleClosure?.closureKey || "",
        dominatorEffectiveRuleClosureKey: dominator.initialEffectiveRuleClosure?.closureKey || "",
      });
      continue;
    }
    retained.push(template);
    retainedKeys.add(template.templateKey);
  }
  const limit = Math.max(1, maximumTemplates);
  const groups = new Map();
  for (const template of retained) {
    const key = String(template.goalType || "other");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(template);
  }
  const bounded = [];
  let depth = 0;
  while (bounded.length < limit && Array.from(groups.values()).some((rows) => depth < rows.length)) {
    for (const rows of groups.values()) {
      if (depth < rows.length && bounded.length < limit) bounded.push(rows[depth]);
    }
    depth += 1;
  }
  const boundedKeys = new Set(bounded.map((template) => template.templateKey));
  for (const template of retained.filter((row) => !boundedKeys.has(row.templateKey))) {
    pruned.push({ templateKey: template.templateKey, reason: "finite_template_budget" });
  }
  return { retained: bounded, pruned };
}

function segmentDistance(point, start, end) {
  const dx = end.xIn - start.xIn;
  const dy = end.yIn - start.yIn;
  const denominator = dx * dx + dy * dy;
  const t = denominator > 0
    ? Math.max(0, Math.min(1, ((point.xIn - start.xIn) * dx + (point.yIn - start.yIn) * dy) / denominator))
    : 0;
  return Math.hypot(point.xIn - (start.xIn + dx * t), point.yIn - (start.yIn + dy * t));
}

function directCorridorPieceKeys(state = {}, actor = {}, target = {}) {
  const width = Math.max(numeric(actor.baseSizeIn, 1.18), numeric(target.baseSizeIn, 1.18)) / 2 + 0.2;
  return state.pieces.filter((piece) =>
    piece.pieceKey !== actor.pieceKey && piece.pieceKey !== target.pieceKey && alive(piece) &&
    segmentDistance(piece.position || { xIn: 0, yIn: 0 }, actor.position, target.position) <=
      width + numeric(piece.baseSizeIn, 1.18) / 2).map((piece) => piece.pieceKey);
}

function terminalSceneKeepKeys(state, template, abstractionLevel) {
  if (abstractionLevel === "full_roster") return new Set(state.pieces.map((piece) => piece.pieceKey));
  const actor = state.pieces.find((piece) => piece.pieceKey === template.attackerPieceKey);
  const target = state.pieces.find((piece) => piece.pieceKey === template.targetPieceKey);
  const ownLeader = state.pieces.find((piece) => piece.sideKey === template.attackerSideKey && leaderLike(piece));
  const keys = new Set([actor?.pieceKey, target?.pieceKey, ownLeader?.pieceKey].filter(Boolean));
  if (abstractionLevel === "leaders_actor_blockers" || abstractionLevel === "leaders_actor_blockers_support") {
    for (const key of directCorridorPieceKeys(state, actor, target)) keys.add(key);
  }
  if (abstractionLevel === "leaders_actor_blockers_support") {
    for (const piece of state.pieces) {
      if (piece.sideKey === template.attackerSideKey && alive(piece) && baseEdgeDistance(piece, actor) <= 8) keys.add(piece.pieceKey);
    }
  }
  return keys;
}

function positionFits(state, actor, position, ignoredKeys = new Set()) {
  const radius = numeric(actor.baseSizeIn, 1.18) / 2;
  const width = numeric(state.board?.widthIn, 48);
  const height = numeric(state.board?.heightIn, 48);
  if (position.xIn < radius || position.yIn < radius || position.xIn > width - radius || position.yIn > height - radius) return false;
  return state.pieces.every((piece) => {
    if (!alive(piece) || piece.pieceKey === actor.pieceKey || ignoredKeys.has(piece.pieceKey)) return true;
    const minimum = radius + numeric(piece.baseSizeIn, 1.18) / 2;
    return Math.hypot(position.xIn - numeric(piece.position?.xIn, 0), position.yIn - numeric(piece.position?.yIn, 0)) + 0.001 >= minimum;
  });
}

function terminalActorPosition(state, actor, target, template) {
  const rangeIn = attackRange(actor, template.attackProfile);
  const desiredEdgeDistance = template.attackMode === "melee" ? Math.max(0.05, rangeIn - 0.05) : Math.max(1, rangeIn * 0.72);
  const centerDistance = desiredEdgeDistance + numeric(actor.baseSizeIn, 1.18) / 2 + numeric(target.baseSizeIn, 1.18) / 2;
  for (let index = 0; index < 32; index += 1) {
    const angleDeg = (numeric(template.terminalPlacementAngleDeg, 0) + index * 137.507764) % 360;
    const angle = angleDeg * Math.PI / 180;
    const position = {
      xIn: round(numeric(target.position?.xIn, 0) + Math.cos(angle) * centerDistance, 4),
      yIn: round(numeric(target.position?.yIn, 0) + Math.sin(angle) * centerDistance, 4),
    };
    if (positionFits(state, actor, position)) return { position, angleDeg: round(angleDeg, 3), attempt: index + 1 };
  }
  return null;
}

function pieceInsideScenarioElement(piece = {}, element = {}) {
  const x = numeric(piece.position?.xIn, 0);
  const y = numeric(piece.position?.yIn, 0);
  const radius = numeric(piece.baseSizeIn, 1.18) / 2;
  if (String(element.shape || "").toLowerCase() === "rect") {
    return Math.abs(x - numeric(element.xIn, 0)) <= numeric(element.widthIn, 0) / 2 + radius &&
      Math.abs(y - numeric(element.yIn, 0)) <= numeric(element.heightIn, 0) / 2 + radius;
  }
  return Math.hypot(x - numeric(element.xIn, 0), y - numeric(element.yIn, 0)) <= numeric(element.radiusIn, 0) + radius;
}

function scenarioScorerPosition(state, scorer, element, seedAngleDeg = 0) {
  const shape = String(element.shape || "").toLowerCase();
  const maxRadius = shape === "rect"
    ? Math.max(0, Math.min(numeric(element.widthIn, 0), numeric(element.heightIn, 0)) / 2 - numeric(scorer.baseSizeIn, 1.18) / 2 - 0.1)
    : Math.max(0, numeric(element.radiusIn, 0) - numeric(scorer.baseSizeIn, 1.18) / 2 - 0.1);
  for (let index = 0; index < 24; index += 1) {
    const angleDeg = (seedAngleDeg + index * 137.507764) % 360;
    const angle = angleDeg * Math.PI / 180;
    const radius = maxRadius * ((index % 4) / 4);
    const position = {
      xIn: round(numeric(element.xIn, 0) + Math.cos(angle) * radius, 4),
      yIn: round(numeric(element.yIn, 0) + Math.sin(angle) * radius, 4),
    };
    if (positionFits(state, scorer, position) && pieceInsideScenarioElement({ ...scorer, position }, element)) {
      return { position, angleDeg: round(angleDeg, 3), attempt: index + 1 };
    }
  }
  return null;
}

const WINDOW_FIELDS = [
  "unitActivationWindow",
  "anyTimeActivationWindow",
  "initialAttackWindow",
  "combatPurchaseWindow",
  "activationForfeitWindow",
  "vengeanceWindow",
  "pendingAttack",
  "pendingDamage",
  "pendingRuleChoiceWindow",
  "pendingRuleChoiceWindows",
];

export function buildWarmachineTerminalPredecessorScene(inputState = {}, template = {}, rawOptions = {}) {
  const abstractionLevel = String(rawOptions.abstractionLevel || "full_roster");
  const source = normalizeRulesV1State(inputState);
  const keepKeys = terminalSceneKeepKeys(source, template, abstractionLevel);
  const state = cloneJson(source);
  state.pieces = state.pieces.filter((piece) => keepKeys.has(piece.pieceKey));
  state.activeSideKey = template.attackerSideKey;
  state.phaseKey = "activation";
  state.turnNumber = Math.max(3, Math.floor(numeric(rawOptions.turnNumber, 5)));
  state.strictMode = true;
  state.enforceStrictExecutor = true;
  state.metadata = {
    ...(state.metadata || {}),
    strictMode: true,
    enforceStrictExecutor: true,
    syntheticTerminalPredecessor: true,
    syntheticTerminalTemplateKey: template.templateKey,
    abstractionLevel,
  };
  for (const field of WINDOW_FIELDS) {
    if (field === "pendingRuleChoiceWindows") state[field] = [];
    else state[field] = null;
  }
  for (const piece of state.pieces) piece.activated = piece.pieceKey !== template.attackerPieceKey;
  const actor = state.pieces.find((piece) => piece.pieceKey === template.attackerPieceKey);
  const target = state.pieces.find((piece) => piece.pieceKey === template.targetPieceKey);
  if (!actor || !target) {
    return { ok: false, reason: "terminal_scene_required_piece_missing", abstractionLevel };
  }
  target.destroyed = false;
  target.removedFromPlay = false;
  target.boxesRemaining = template.targetBoxesBeforeFinal;
  if (target.damage) {
    target.damage.boxesRemaining = template.targetBoxesBeforeFinal;
    target.damage.maxBoxes = Math.max(numeric(target.damage.maxBoxes, target.maxBoxes), template.targetBoxesBeforeFinal);
  }
  const placement = terminalActorPosition(state, actor, target, template);
  if (!placement) return { ok: false, reason: "no_nonoverlapping_terminal_actor_placement", abstractionLevel };
  actor.position = placement.position;
  actor.activated = false;
  state.stateKey = `${source.stateKey || "warmachine"}-terminal-predecessor-${template.templateKey}-${abstractionLevel}`;
  return {
    ok: true,
    abstractionLevel,
    state: normalizeRulesV1State(state),
    placement,
    retainedPieceCount: state.pieces.length,
    retainedPieceKeys: state.pieces.map((piece) => piece.pieceKey),
    disclaimer: "Synthetic predecessor state; local strict transition validity does not prove reachability from deployment.",
  };
}

export function buildWarmachineScenarioTerminalPredecessorScene(inputState = {}, template = {}, rawOptions = {}) {
  const abstractionLevel = String(rawOptions.abstractionLevel || "full_roster");
  const source = normalizeRulesV1State(inputState);
  const state = cloneJson(source);
  const scorer = state.pieces.find((piece) => piece.pieceKey === template.attackerPieceKey);
  const element = template.scenarioElement;
  if (!scorer || !element?.elementKey) {
    return { ok: false, reason: "scenario_terminal_required_piece_or_element_missing", abstractionLevel };
  }
  if (abstractionLevel !== "full_roster") {
    const ownLeader = state.pieces.find((piece) => piece.sideKey === template.attackerSideKey && leaderLike(piece));
    const keep = new Set([scorer.pieceKey, ownLeader?.pieceKey].filter(Boolean));
    state.pieces = state.pieces.filter((piece) => keep.has(piece.pieceKey));
  }
  state.activeSideKey = template.attackerSideKey;
  state.phaseKey = "control";
  state.turnNumber = template.attackerSideKey === template.scoringStartSideKey
    ? Math.max(2, numeric(template.scoringStartTurnNumber, 2))
    : Math.max(3, numeric(template.scoringStartTurnNumber, 2) + 1);
  state.strictMode = true;
  state.enforceStrictExecutor = true;
  state.scenario.score[template.attackerSideKey] = template.scoreBeforeTerminal;
  state.scenario.scoringHistory = [];
  state.metadata = {
    ...(state.metadata || {}),
    strictMode: true,
    enforceStrictExecutor: true,
    syntheticTerminalPredecessor: true,
    syntheticTerminalTemplateKey: template.templateKey,
    abstractionLevel,
  };
  for (const field of WINDOW_FIELDS) {
    if (field === "pendingRuleChoiceWindows") state[field] = [];
    else state[field] = null;
  }
  const liveScorer = state.pieces.find((piece) => piece.pieceKey === scorer.pieceKey);
  const removedContesterPieceKeys = [];
  for (const piece of state.pieces) {
    if (piece.sideKey === template.defenderSideKey && alive(piece) && pieceInsideScenarioElement(piece, element)) {
      piece.destroyed = true;
      piece.removedFromPlay = true;
      piece.boxesRemaining = 0;
      if (piece.damage) piece.damage.boxesRemaining = 0;
      removedContesterPieceKeys.push(piece.pieceKey);
    }
  }
  const placement = scenarioScorerPosition(state, liveScorer, element, numeric(template.terminalPlacementAngleDeg, 0));
  if (!placement) return { ok: false, reason: "no_nonoverlapping_scenario_scorer_placement", abstractionLevel };
  liveScorer.position = placement.position;
  state.stateKey = `${source.stateKey || "warmachine"}-scenario-terminal-${template.templateKey}-${abstractionLevel}`;
  return {
    ok: true,
    abstractionLevel,
    state: normalizeRulesV1State(state),
    placement,
    retainedPieceCount: state.pieces.length,
    removedContesterPieceKeys,
    disclaimer: "Synthetic scoring predecessor; removed contesters are explicit prior-state requirements, not a deployment witness.",
  };
}

function actionSummary(action = {}) {
  return {
    actionKey: action.actionKey,
    actionType: action.actionType,
    actorPieceKey: action.actorPieceKey || "",
    targetPieceKey: action.targetPieceKey || "",
    destination: cloneJson(action.destination || null),
    expectedDamage: numeric(action.expectedDamage, 0),
  };
}

function strictApply(state, enumeration, action, seed, sampleIndex) {
  const strictAction = {
    ...buildWarmachineRulesV1ActionWithStrictRngOutcome(action, {
      room: {
        id: `goal-conditioned-${seed}-${sampleIndex}`,
        game: {
          round: state.turnNumber,
          turnNumber: state.turnNumber,
          activeSideKey: state.activeSideKey,
        },
      },
      sourceContext: { rulesV1State: enumeration.state, rulesV1Enumeration: enumeration },
      selectedActionKey: action.actionKey,
    }),
    __warmachineTrustedRulesV1Enumeration: enumeration,
  };
  const transition = applyRulesV1Action(enumeration.state, strictAction);
  const executedAction = { ...strictAction };
  delete executedAction.__warmachineTrustedRulesV1Enumeration;
  return { ...transition, executedAction };
}

function terminalAttackAction(action = {}, template = {}) {
  return action.targetPieceKey === template.targetPieceKey && /attack|spell|strike/i.test(String(action.actionType || ""));
}

function rejectedTerminalActionSummary(action = {}) {
  return {
    actionKey: action.actionKey || "",
    actionType: action.actionType || "",
    rejectionReason: action.rejection?.reason || "",
    ruleKeys: cloneJson(action.rejection?.evidence?.ruleKeys || []),
    pendingMarkers: cloneJson(action.rejection?.pendingMarkers || []),
    blockedCheckCodes: (action.legality?.checks || action.checks || [])
      .filter((check) => check.status === "blocked")
      .map((check) => check.code),
    unmodeledEffects: (action.rejection?.evidence?.effects || []).map((effect) => ({
      ruleKey: effect.ruleKey || "",
      effectType: effect.effectType || "",
      subjectPieceKey: effect.subjectPieceKey || "",
      affectedPieceKey: effect.affectedPieceKey || "",
      pieceRole: effect.evidence?.pieceRole || "",
      atomKey: effect.evidence?.atomKey || "",
      exactWithinScope: effect.exactWithinScope === true,
    })),
  };
}

function prefixActionPriority(action = {}, template = {}) {
  if (terminalAttackAction(action, template)) return 10_000;
  if (action.actorPieceKey !== template.attackerPieceKey) return -10_000;
  const type = String(action.actionType || "");
  if (/forfeit_normal_movement|aim/.test(type)) return 900;
  if (/end_any_time|end_initial|complete.*movement|combat_action/.test(type)) return 800;
  if (/boost|force|focus|fury/.test(type)) return 650;
  if (/pass|end_activation/.test(type)) return -500;
  return 100;
}

function findTerminalAttackDecision(startState, template, maximumPrefixDepth, maximumPrefixStates) {
  const queue = [{ state: startState, prefix: [] }];
  const seen = new Set();
  const blockerMap = new Map();
  let prefixStateBudgetExhausted = false;
  let strictAccepted = 0;
  let strictRejected = 0;
  for (let depth = 0; depth <= maximumPrefixDepth && queue.length; depth += 1) {
    const layerCount = queue.length;
    for (let layerIndex = 0; layerIndex < layerCount; layerIndex += 1) {
      if (seen.size >= maximumPrefixStates) {
        prefixStateBudgetExhausted = true;
        break;
      }
      const node = queue.shift();
      const fingerprint = stableHash(node.state, 24);
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      const enumeration = enumerateRulesV1Actions(node.state, { actorPieceKeys: [template.attackerPieceKey] });
      for (const rejected of enumeration.rejectedActions || []) {
        if (!terminalAttackAction(rejected, template)) continue;
        const summary = rejectedTerminalActionSummary(rejected);
        const key = stableHash(summary, 24);
        if (!blockerMap.has(key)) blockerMap.set(key, summary);
      }
      const terminal = enumeration.actions.find((action) => terminalAttackAction(action, template));
      if (terminal) {
        return {
          found: true,
          state: node.state,
          enumeration,
          attackAction: terminal,
          prefix: node.prefix,
          exploredStates: seen.size,
          strictAccepted,
          strictRejected,
          maximumPrefixStates,
          prefixStateBudgetExhausted,
          rejectedTerminalActions: Array.from(blockerMap.values()).slice(0, 24),
        };
      }
      if (depth >= maximumPrefixDepth) continue;
      const candidates = enumeration.actions
        .filter((action) => prefixActionPriority(action, template) > 0)
        .sort((left, right) => prefixActionPriority(right, template) - prefixActionPriority(left, template) ||
          left.actionKey.localeCompare(right.actionKey))
        .slice(0, 6);
      for (const action of candidates) {
        const transition = strictApply(node.state, enumeration, action, `${template.templateKey}-prefix-${depth}`, 0);
        if (!transition.ok) {
          strictRejected += 1;
          continue;
        }
        strictAccepted += 1;
        queue.push({
          state: transition.nextState,
          prefix: [...node.prefix, {
            ...actionSummary(action),
            eventTypes: (transition.events || []).map((event) => event.eventType),
          }],
        });
      }
    }
    if (prefixStateBudgetExhausted) break;
  }
  return {
    found: false,
    exploredStates: seen.size,
    strictAccepted,
    strictRejected,
    maximumPrefixStates,
    prefixStateBudgetExhausted,
    rejectedTerminalActions: Array.from(blockerMap.values()).slice(0, 24),
  };
}

function validateScenarioTerminalGoalStrict(inputState, template, rawOptions = {}) {
  const abstractionLevels = rawOptions.abstractionLevels || ["leaders_and_actor", "full_roster"];
  const levels = [];
  for (const abstractionLevel of abstractionLevels) {
    const scene = buildWarmachineScenarioTerminalPredecessorScene(inputState, template, { abstractionLevel });
    if (!scene.ok) {
      levels.push({ abstractionLevel, sceneBuilt: false, reason: scene.reason });
      continue;
    }
    const enumeration = enumerateRulesV1Actions(scene.state);
    const action = enumeration.actions.find((candidate) =>
      candidate.actorPieceKey === template.attackerSideKey &&
      candidate.targetPieceKey === template.scenarioElement.elementKey &&
      candidate.actionType === `score_${template.scenarioElement.elementType}`);
    const rejected = enumeration.rejectedActions.find((candidate) =>
      candidate.actorPieceKey === template.attackerSideKey &&
      candidate.targetPieceKey === template.scenarioElement.elementKey &&
      candidate.actionType === `score_${template.scenarioElement.elementType}`);
    if (!action) {
      levels.push({
        abstractionLevel,
        sceneBuilt: true,
        retainedPieceCount: scene.retainedPieceCount,
        removedContesterPieceKeys: scene.removedContesterPieceKeys,
        scoringActionFound: false,
        rejectionReason: rejected?.rejection?.reason || "scoring_action_not_enumerated",
        blockedCheckCodes: (rejected?.legality?.checks || []).filter((check) => check.status === "blocked").map((check) => check.code),
      });
      continue;
    }
    const transition = strictApply(scene.state, enumeration, action, `${template.templateKey}-${abstractionLevel}`, 0);
    const terminal = (transition.events || []).find((event) => event.eventType === "terminal");
    levels.push({
      abstractionLevel,
      sceneBuilt: true,
      retainedPieceCount: scene.retainedPieceCount,
      removedContesterPieceKeys: scene.removedContesterPieceKeys,
      scoringActionFound: true,
      scoringAction: actionSummary(action),
      strictAccepted: transition.ok === true,
      strictRejectionReason: transition.ok ? "" : transition.reason || "strict_transition_rejected",
      scoreBefore: template.scoreBeforeTerminal,
      scoreAfter: numeric(transition.nextState?.scenario?.score?.[template.attackerSideKey], template.scoreBeforeTerminal),
      terminalWinnerSideKey: terminal?.winnerSideKey || "",
      eventTypes: (transition.events || []).map((event) => event.eventType),
    });
  }
  const full = levels.find((level) => level.abstractionLevel === "full_roster") || null;
  return {
    schemaVersion: WARMACHINE_GOAL_CONDITIONED_SEARCH_SCHEMA,
    templateKey: template.templateKey,
    goalType: template.goalType,
    finite: true,
    levels,
    localTerminalStrictValidated: Boolean(
      full?.strictAccepted && full.terminalWinnerSideKey === template.attackerSideKey &&
      full.scoreAfter >= template.victoryThreshold,
    ),
    fullDeploymentWitnessValidated: false,
    trainingTruth: false,
    conclusionBoundary: "This validates a bounded local strict scoring transition with explicit prior score and removed-contester requirements. It does not validate their path from deployment.",
  };
}

export function validateWarmachineTerminalGoalTemplateStrict(inputState = {}, template = {}, rawOptions = {}) {
  if (template.goalType === "scenario_score") {
    return validateScenarioTerminalGoalStrict(inputState, template, rawOptions);
  }
  const abstractionLevels = rawOptions.abstractionLevels || [
    "leaders_and_actor",
    "leaders_actor_blockers",
    "leaders_actor_blockers_support",
    "full_roster",
  ];
  const chanceSamples = Math.max(1, Math.floor(numeric(rawOptions.chanceSamples, 12)));
  const maximumPrefixDepth = Math.max(0, Math.floor(numeric(rawOptions.maximumPrefixDepth, 6)));
  const maximumPrefixStates = Math.max(1, Math.floor(numeric(rawOptions.maximumPrefixStates, 96)));
  const levels = [];
  for (const abstractionLevel of abstractionLevels) {
    const scene = buildWarmachineTerminalPredecessorScene(inputState, template, { abstractionLevel });
    if (!scene.ok) {
      levels.push({ abstractionLevel, sceneBuilt: false, reason: scene.reason });
      continue;
    }
    const decision = findTerminalAttackDecision(scene.state, template, maximumPrefixDepth, maximumPrefixStates);
    if (!decision.found) {
      levels.push({
        abstractionLevel,
        sceneBuilt: true,
        retainedPieceCount: scene.retainedPieceCount,
        attackDecisionFound: false,
        exploredPrefixStates: decision.exploredStates,
        strictPrefixAccepted: decision.strictAccepted,
        strictPrefixRejected: decision.strictRejected,
        maximumPrefixStates: decision.maximumPrefixStates,
        prefixStateBudgetExhausted: decision.prefixStateBudgetExhausted,
        reachabilityStatus: decision.prefixStateBudgetExhausted ? "unresolved_budget_exhausted" : "terminal_action_not_reached",
        rejectedTerminalActions: decision.rejectedTerminalActions,
      });
      continue;
    }
    const samples = [];
    for (let sampleIndex = 0; sampleIndex < chanceSamples; sampleIndex += 1) {
      const transition = strictApply(
        decision.state,
        decision.enumeration,
        decision.attackAction,
        `${template.templateKey}-${abstractionLevel}`,
        sampleIndex,
      );
      const target = transition.nextState?.pieces?.find((piece) => piece.pieceKey === template.targetPieceKey);
      const terminalEvent = (transition.events || []).find((event) => event.eventType === "terminal");
      samples.push({
        sampleIndex,
        ok: transition.ok === true,
        targetDestroyed: transition.ok === true && (!target || !alive(target)),
        terminalWinnerSideKey: terminalEvent?.winnerSideKey || "",
        eventTypes: (transition.events || []).map((event) => event.eventType),
        rejectionReason: transition.ok ? "" : transition.reason || "strict_transition_rejected",
      });
    }
    levels.push({
      abstractionLevel,
      sceneBuilt: true,
      retainedPieceCount: scene.retainedPieceCount,
      placement: scene.placement,
      attackDecisionFound: true,
      prefix: decision.prefix,
      attackAction: actionSummary(decision.attackAction),
      exploredPrefixStates: decision.exploredStates,
      strictPrefixAccepted: decision.strictAccepted,
      strictPrefixRejected: decision.strictRejected,
      maximumPrefixStates: decision.maximumPrefixStates,
      prefixStateBudgetExhausted: decision.prefixStateBudgetExhausted,
      reachabilityStatus: "local_terminal_action_reached",
      rejectedTerminalActions: decision.rejectedTerminalActions,
      chanceSamples,
      strictAttackAccepted: samples.filter((sample) => sample.ok).length,
      strictAttackRejected: samples.filter((sample) => !sample.ok).length,
      strictSampleKillRate: round(samples.filter((sample) => sample.targetDestroyed).length / chanceSamples, 6),
      strictSampleTerminalRate: round(samples.filter((sample) => sample.terminalWinnerSideKey === template.attackerSideKey).length / chanceSamples, 6),
      samples,
    });
  }
  const full = levels.find((level) => level.abstractionLevel === "full_roster") || null;
  return {
    schemaVersion: WARMACHINE_GOAL_CONDITIONED_SEARCH_SCHEMA,
    templateKey: template.templateKey,
    finite: true,
    chanceSamples,
    maximumPrefixDepth,
    maximumPrefixStates,
    levels,
    localTerminalStrictValidated: Boolean(full?.attackDecisionFound && full.strictAttackRejected === 0),
    fullDeploymentWitnessValidated: false,
    trainingTruth: false,
    conclusionBoundary: "This validates a bounded local terminal transition in synthetic abstraction refinements. It does not validate a path from legal deployment.",
  };
}

export function createWarmachineGoalConditionedSearchHooks(template = {}) {
  const terminalRangeIn = numeric(template.reachability?.terminalRangeIn, 1);
  const perspectiveSideKey = template.attackerSideKey;
  const opponentSideKey = perspectiveSideKey === "player2" ? "player1" : "player2";
  const scenarioGoal = template.goalType === "scenario_score";
  const stateMetrics = (state = {}) => {
    const actor = state.pieces.find((piece) => piece.pieceKey === template.attackerPieceKey);
    if (scenarioGoal) {
      const element = template.scenarioElement;
      const score = numeric(state.scenario?.score?.[perspectiveSideKey], 0);
      const edgeDistanceIn = actor && element ? distanceToScenarioElement(actor, element) : 99;
      return {
        actor,
        target: null,
        actorAlive: Boolean(actor && alive(actor)),
        targetAlive: true,
        edgeDistanceIn,
        distanceGapIn: Math.max(0, edgeDistanceIn),
        targetDamage: 0,
        scenarioScore: score,
        scenarioScoreGap: Math.max(0, numeric(template.victoryThreshold, 5) - score),
      };
    }
    const target = state.pieces.find((piece) => piece.pieceKey === template.targetPieceKey);
    const actorAlive = Boolean(actor && alive(actor));
    const targetAlive = Boolean(target && alive(target));
    const edgeDistanceIn = actor && target ? baseEdgeDistance(actor, target) : 99;
    const distanceGapIn = Math.max(0, edgeDistanceIn - terminalRangeIn);
    const targetDamage = target
      ? Math.max(0, numeric(target.maxBoxes, target.boxesRemaining) - numeric(target.boxesRemaining, 0))
      : numeric(template.targetBoxesBeforeFinal, 1);
    return { actor, target, actorAlive, targetAlive, edgeDistanceIn, distanceGapIn, targetDamage };
  };
  const stateEvaluator = (state, detail = {}) => {
    const metrics = stateMetrics(state);
    const explicitWinner = String(detail.terminalWinnerSideKey || "");
    const terminalWinnerSideKey = explicitWinner || (scenarioGoal
      ? metrics.scenarioScore >= numeric(template.victoryThreshold, 5) ? perspectiveSideKey : !metrics.actorAlive ? opponentSideKey : ""
      : !metrics.targetAlive ? perspectiveSideKey : !metrics.actorAlive ? opponentSideKey : "");
    const terminalValue = terminalWinnerSideKey
      ? terminalWinnerSideKey === perspectiveSideKey ? 1_000_000 : -1_000_000
      : 0;
    const defaultScore = numeric(detail.defaultEvaluation?.score, 0);
    const goalProgress = scenarioGoal
      ? -metrics.distanceGapIn * 30 - metrics.scenarioScoreGap * 120
      : -metrics.distanceGapIn * 35 + metrics.targetDamage * 18 +
        numeric(template.probability?.singleAttackKillProbability, 0) * 80;
    const score = terminalValue || round(defaultScore * 0.15 + goalProgress);
    return {
      schemaVersion: "warmachine_goal_conditioned_state_evaluation_v1",
      perspectiveSideKey,
      opponentSideKey,
      score,
      terminal: Boolean(terminalWinnerSideKey),
      winnerSideKey: terminalWinnerSideKey,
      breakdown: {
        terminalValue,
        defaultStateUtilityContribution: round(defaultScore * 0.15),
        goalProgress: round(goalProgress),
        edgeDistanceIn: round(metrics.edgeDistanceIn),
        distanceGapIn: round(metrics.distanceGapIn),
        targetDamage: round(metrics.targetDamage),
        scenarioScore: round(metrics.scenarioScore),
        scenarioScoreGap: round(metrics.scenarioScoreGap),
      },
      note: "Goal-conditioned ordering utility only; rules legality and mutation remain strict rules-v1 authority.",
    };
  };
  const actionScore = (action, state) => {
    const metrics = stateMetrics(state);
    const actorMatch = action.actorPieceKey === template.attackerPieceKey;
    const targetMatch = scenarioGoal
      ? action.targetPieceKey === template.scenarioElement?.elementKey
      : action.targetPieceKey === template.targetPieceKey;
    let score = actorMatch ? 2_000 : 0;
    if (targetMatch) score += 4_000;
    if (/attack|spell|strike/i.test(String(action.actionType || ""))) score += targetMatch ? 3_000 : 300;
    if (action.destination && actorMatch) {
      const projected = { ...metrics.actor, position: action.destination };
      const projectedDistance = scenarioGoal
        ? distanceToScenarioElement(projected, template.scenarioElement)
        : metrics.target ? baseEdgeDistance(projected, metrics.target) : metrics.edgeDistanceIn;
      score += Math.max(-1_000, (metrics.edgeDistanceIn - projectedDistance) * 120);
    }
    if (/run|advance|charge|reposition/i.test(String(action.actionType || ""))) score += 250;
    if (/pass|end_turn/i.test(String(action.actionType || ""))) score -= 700;
    return round(score + numeric(action.expectedDamage, 0) * 40);
  };
  return {
    perspectiveSideKey,
    stateEvaluator,
    actionScore,
    stateEvaluatorLabel: "goal_funnel_distance_damage_terminal_v1",
    actionScoreLabel: "goal_actor_target_distance_action_order_v1",
    metrics: stateMetrics,
  };
}

export function buildWarmachineGoalTacticalSignature(state = {}, template = {}, rawOptions = {}) {
  const positionBucketIn = Math.max(0.25, numeric(rawOptions.positionBucketIn, 1));
  const relevantKeys = new Set([
    template.attackerPieceKey,
    template.targetPieceKey,
    ...(rawOptions.relevantPieceKeys || []),
  ].filter(Boolean));
  const pieces = state.pieces.filter((piece) => relevantKeys.has(piece.pieceKey)).map((piece) => ({
    pieceKey: piece.pieceKey,
    alive: alive(piece),
    xBucket: Math.round(numeric(piece.position?.xIn, 0) / positionBucketIn),
    yBucket: Math.round(numeric(piece.position?.yIn, 0) / positionBucketIn),
    boxesRemaining: numeric(piece.damage?.boxesRemaining ?? piece.boxesRemaining, 0),
    activated: piece.activated === true,
    effectiveRuleClosureKey: canonicalWarmachineEffectiveRuleClosure(piece).closureKey,
  })).sort((left, right) => left.pieceKey.localeCompare(right.pieceKey));
  const payload = {
    goalType: template.goalType,
    templateKey: template.templateKey,
    activeSideKey: state.activeSideKey,
    phaseKey: state.phaseKey,
    turnNumber: numeric(state.turnNumber, 0),
    score: cloneJson(state.scenario?.score || {}),
    scoringHistoryKeys: (state.scenario?.scoringHistory || []).map((entry) => String(entry.key || "")).sort(),
    pieces,
  };
  return {
    schemaVersion: "warmachine_goal_tactical_signature_v1",
    signatureKey: stableHash(payload, 24),
    payload,
    positionBucketIn,
    mergeSafeOnlyWithinDeclaredAbstraction: true,
    mergeBoundary: "Same signature is mergeable only for this bounded goal abstraction; full rules-v1 states remain distinct evidence.",
  };
}

export function compareWarmachineGoalProgress(beforeState = {}, afterState = {}, template = {}) {
  const hooks = createWarmachineGoalConditionedSearchHooks(template);
  const before = hooks.metrics(beforeState);
  const after = hooks.metrics(afterState);
  return {
    templateKey: template.templateKey,
    edgeDistanceBeforeIn: round(before.edgeDistanceIn),
    edgeDistanceAfterIn: round(after.edgeDistanceIn),
    edgeDistanceDeltaIn: round(after.edgeDistanceIn - before.edgeDistanceIn),
    distanceGapBeforeIn: round(before.distanceGapIn),
    distanceGapAfterIn: round(after.distanceGapIn),
    targetDamageDelta: round(after.targetDamage - before.targetDamage),
    scenarioScoreBefore: round(before.scenarioScore),
    scenarioScoreAfter: round(after.scenarioScore),
    scenarioScoreGapBefore: round(before.scenarioScoreGap),
    scenarioScoreGapAfter: round(after.scenarioScoreGap),
    actorSurvived: after.actorAlive,
    targetDestroyed: template.goalType === "assassination" ? !after.targetAlive : false,
    goalAchieved: template.goalType === "scenario_score"
      ? numeric(after.scenarioScore, 0) >= numeric(template.victoryThreshold, 5)
      : !after.targetAlive,
  };
}
