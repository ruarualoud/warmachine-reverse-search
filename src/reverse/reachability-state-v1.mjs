import { createHash } from "node:crypto";

const WARMACHINE_GOAL_CONDITIONED_SEARCH_SCHEMA = "warmachine_goal_conditioned_search_v1";

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

function normalizedRuleRow(sourceKind, value = {}) {
  const sourceIds = [
    value.id,
    value.sourceId,
    value.ruleKey,
    value.atomKey,
    ...(value.sourceIds || []),
  ].filter(Boolean).map(String).sort();
  return {
    sourceKind,
    key: String(value.ruleKey || value.atomKey || value.id || value.name || value.effectType || value.status || ""),
    sourceIds,
    name: String(value.name || value.ruleName || value.effectType || value.status || ""),
    duration: String(value.durationKind || value.duration || value.expiresAt || value.expiry || ""),
    active: value.active !== false,
    amount: Number.isFinite(Number(value.amount ?? value.value ?? value.modifier))
      ? Number(value.amount ?? value.value ?? value.modifier)
      : null,
    usedCount: Math.max(0, Math.floor(numeric(value.usedCount ?? value.useCount ?? value.timesUsed, 0))),
  };
}

export function canonicalWarmachineEffectiveRuleClosure(piece = {}) {
  const rows = [];
  for (const rule of piece.specialRules || []) rows.push(normalizedRuleRow("owned_rule", rule));
  for (const effect of piece.statusEffects || []) rows.push(normalizedRuleRow("status_effect", effect));
  for (const effect of piece.activeSupportEffects || []) {
    rows.push(normalizedRuleRow("support_effect", effect));
    for (const nested of effect.effects || []) rows.push(normalizedRuleRow("support_nested_effect", nested));
    for (const nested of effect.ruleAtomStatusEffects || []) rows.push(normalizedRuleRow("support_atom_effect", nested));
  }
  for (const upkeep of piece.activeUpkeeps || []) rows.push(normalizedRuleRow("upkeep", upkeep));
  if (piece.ruleAtomState && typeof piece.ruleAtomState === "object") {
    for (const [key, value] of Object.entries(piece.ruleAtomState)) {
      rows.push(normalizedRuleRow("rule_atom_state", {
        ...(value && typeof value === "object" ? value : {}),
        atomKey: key,
        value: value && typeof value === "object" ? value.value : value,
      }));
    }
  }
  for (const tag of piece.statusTags || []) rows.push(normalizedRuleRow("status_tag", { name: tag }));
  const deduped = Array.from(new Map(rows.filter((row) => row.active && row.key).map((row) => [
    JSON.stringify(row),
    row,
  ])).values()).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const resourceLedger = {
    resourceKind: String(piece.resourceKind || ""),
    resourcePoints: numeric(piece.resourcePoints ?? piece.focus ?? piece.fury, 0),
    resourceMax: numeric(piece.resourceMax ?? piece.resource2Max, 0),
    soulTokens: numeric(piece.soulTokens, 0),
    corpseTokens: numeric(piece.corpseTokens, 0),
    hungerTokens: numeric(piece.hungerTokens, 0),
    featUsed: piece.featUsed === true || piece.hasUsedFeat === true,
  };
  return {
    schemaVersion: "warmachine_effective_rule_closure_v1",
    pieceKey: String(piece.pieceKey || ""),
    rules: deduped,
    resourceLedger,
    closureKey: stableHash({ rules: deduped, resourceLedger }, 24),
    mergeBoundary: "Branches may merge only when tactical signature, active rule closure, duration/source/use ledgers, and resources match.",
  };
}

export function buildWarmachineReverseReachabilityLayers(template = {}, rawOptions = {}) {
  const horizonFriendlyTurns = Math.max(
    1,
    Math.floor(numeric(rawOptions.horizonFriendlyTurns, template.reachability?.minimumFriendlyTurns || 4)),
  );
  const speedIn = Math.max(0, numeric(rawOptions.speedIn, 0));
  const setupRunIn = Math.max(0, numeric(template.reachability?.setupRunIn, speedIn + 5));
  const terminalRangeIn = Math.max(0, numeric(template.reachability?.terminalRangeIn, 1));
  const finalTurnThreatIn = Math.max(terminalRangeIn, numeric(template.reachability?.finalTurnThreatIn, terminalRangeIn));
  const targetRetreatPerReplyIn = Math.max(0, numeric(rawOptions.targetRetreatPerReplyIn, 0));
  const layers = [];
  for (let turnsBeforeTerminal = 0; turnsBeforeTerminal < horizonFriendlyTurns; turnsBeforeTerminal += 1) {
    const optimisticMaxEdgeDistanceIn = turnsBeforeTerminal === 0
      ? terminalRangeIn
      : finalTurnThreatIn + (turnsBeforeTerminal - 1) * setupRunIn;
    const robustMaxEdgeDistanceIn = Math.max(
      terminalRangeIn,
      optimisticMaxEdgeDistanceIn - turnsBeforeTerminal * targetRetreatPerReplyIn,
    );
    layers.push({
      layer: turnsBeforeTerminal,
      meaning: turnsBeforeTerminal === 0 ? "terminal_action_predecessor" : "earlier_friendly_turn_constraint",
      optimisticMaxEdgeDistanceIn: round(optimisticMaxEdgeDistanceIn),
      robustMaxEdgeDistanceIn: round(robustMaxEdgeDistanceIn),
      targetRetreatPerReplyIn: round(targetRetreatPerReplyIn),
      requiredActorPieceKey: template.attackerPieceKey,
      requiredTargetPieceKey: template.targetPieceKey,
      requiredResourceBand: {
        boostedAttack: template.boostedAttack === true,
        boostedDamage: template.boostedDamage === true,
      },
      causalPredecessorAlternatives: turnsBeforeTerminal === 0
        ? cloneJson(template.reverseRuleRegression?.searchAlternatives || template.reverseRuleRegression?.alternatives || [])
        : [],
      causalPredecessorCursorExhausted: template.reverseRuleRegression?.cursorExhausted !== false,
      causalPredecessorCandidatesRemaining: numeric(template.reverseRuleRegression?.remainingCandidateCount, 0),
    });
  }
  return {
    schemaVersion: WARMACHINE_GOAL_CONDITIONED_SEARCH_SCHEMA,
    templateKey: template.templateKey,
    horizonFriendlyTurns,
    finite: true,
    layerCount: layers.length,
    layers,
    interpretation: "Backward layers are constraints, not inverse rules-v1 state transitions. A full-state forward strict witness is still required.",
  };
}
