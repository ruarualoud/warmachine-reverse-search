#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyRulesV1Action,
  buildWarmachineRulesV1ActionWithStrictRngOutcome,
  enumerateRulesV1Actions,
  resolveWarmachineHostPath,
  warmachineHost,
} from "../src/warmachine-host-runtime.mjs";

const SEARCH_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RAPID_STRIKE_SOURCE_ID = "55762169-e9db-45bb-93d7-8e595fa55de8";
const RAPID_STRIKE_ATOM_KEY = "rapid_strike_combat_action_additional_melee_attack";
const RAPID_STRIKE_SLOT_IDENTITY = `fixed:${RAPID_STRIKE_ATOM_KEY}:additional-1`;

function findObjectById(value, id) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findObjectById(entry, id);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  if (value.id === id) return value;
  for (const entry of Object.values(value)) {
    const found = findObjectById(entry, id);
    if (found) return found;
  }
  return null;
}

function sourceBoundTrooper({ pieceKey, card, model, unitGroupId, xIn, yIn }) {
  const isolatedModel = {
    ...model,
    abilities: (model.abilities || []).filter((ability) =>
      ability.id === RAPID_STRIKE_SOURCE_ID),
    weapons: (model.weapons || []).map((weapon) => ({
      ...weapon,
      abilities: [],
      qualities: [],
    })),
  };
  const isolatedCard = { ...card, models: [isolatedModel] };
  return {
    pieceKey,
    label: `${card.name} ${model.name}`,
    sideKey: "player1",
    factionKey: card.factionName,
    modelRole: "trooper",
    modelType: "trooper",
    unitGroupId,
    cardSnapshot: isolatedCard,
    modelId: isolatedModel.id,
    modelName: isolatedModel.name,
    unitModelName: isolatedModel.name,
    position: { xIn, yIn },
    baseSizeIn: 30 / 25.4,
    boxesRemaining: 8,
    maxBoxes: 8,
    canBoost: false,
    canPurchaseAdditionalAttacks: false,
    canCombinedMeleeAttack: true,
  };
}

function enemy() {
  return {
    pieceKey: "enemy-heavy",
    label: "Enemy heavy",
    sideKey: "player2",
    modelRole: "warjack",
    modelType: "warjack",
    isWarjack: true,
    position: { xIn: 18, yIn: 10 },
    baseSizeIn: 50 / 25.4,
    defense: 12,
    armor: 18,
    boxesRemaining: 80,
    maxBoxes: 80,
  };
}

function allMjsFiles(root) {
  const rows = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) rows.push(...allMjsFiles(absolutePath));
    else if (entry.isFile() && entry.name.endsWith(".mjs")) rows.push(absolutePath);
  }
  return rows;
}

const data = JSON.parse(fs.readFileSync(
  resolveWarmachineHostPath("android-shell/assets/default/warmachine-lite-data.json"),
  "utf8",
));
const rapidStrikeCard = findObjectById(data, "3d5ab84b-1e6b-4a5d-bef6-6a43f1267a99");
const rapidStrikeModel = rapidStrikeCard?.models?.[0];
assert.ok(rapidStrikeCard && rapidStrikeModel, "real Great Bears source missing");
assert.ok((rapidStrikeModel.abilities || []).some((ability) =>
  ability.id === RAPID_STRIKE_SOURCE_ID &&
    ability.name === "Rapid Strike" &&
    ability.description.includes("one additional melee attack each Combat Action")));

const unitGroupId = "search-host-rapid-strike-cma-unit";
const actorKeys = ["great-bear-a", "great-bear-b"];
let state = {
  stateKey: "search-host-rapid-strike-fixed-additional-cma",
  activeSideKey: "player1",
  phaseKey: "activation",
  turnNumber: 3,
  strictMode: true,
  enforceStrictExecutor: true,
  ruleAtomRuntimeMode: "authoritative",
  board: { widthIn: 48, heightIn: 48 },
  terrain: [],
  pieces: [
    sourceBoundTrooper({
      pieceKey: actorKeys[0], card: rapidStrikeCard, model: rapidStrikeModel,
      unitGroupId, xIn: 16, yIn: 10,
    }),
    sourceBoundTrooper({
      pieceKey: actorKeys[1], card: rapidStrikeCard, model: rapidStrikeModel,
      unitGroupId, xIn: 16, yIn: 12,
    }),
    enemy(),
  ],
  scenario: {
    zones: [], flags: [], objectives: [], caches: [], actionObjectives: [],
    score: { player1: 0, player2: 0 }, victoryThreshold: 5,
  },
  unitActivationWindow: {
    active: true,
    sideKey: "player1",
    unitGroupId,
    selectedModelPieceKey: actorKeys[0],
    phase: "combat_actions",
    normalMovementUsed: true,
    sourceActionType: "unit_group_advance",
    sourceActionKey: `${unitGroupId}:unit-group-advance:v1`,
    pendingTrooperPieceKeys: actorKeys,
    completedTrooperPieceKeys: [],
    forfeitedTrooperPieceKeys: [],
  },
};

for (const actorPieceKey of actorKeys) {
  const enumeration = enumerateRulesV1Actions(state, {
    actorPieceKeys: [actorPieceKey],
    actionFamilyKeys: ["attack_or_effect"],
  });
  const initial = enumeration.actions.find((action) =>
    action.actorPieceKey === actorPieceKey &&
      action.actionType === "melee_attack" &&
      action.metadata?.attackProfile?.name === "Great Axe" &&
      !action.metadata?.combinedAttackKind);
  assert.ok(initial, `initial Great Axe missing for ${actorPieceKey}`);
  const layer3Action = buildWarmachineRulesV1ActionWithStrictRngOutcome(initial, {
    room: { id: "search-host-rapid-strike-parity" },
    sourceContext: { rulesV1State: enumeration.state },
    selectedActionKey: initial.actionKey,
  });
  const transition = applyRulesV1Action(enumeration.state, {
    ...layer3Action,
    __warmachineTrustedRulesV1Enumeration: enumeration,
  });
  assert.equal(transition.ok, true, transition.reason || `initial attack ${actorPieceKey}`);
  state = transition.nextState;
}

const combinedEnumeration = enumerateRulesV1Actions(state, {
  actorPieceKeys: actorKeys,
  actionFamilyKeys: ["attack_or_effect"],
});
const fixedCma = combinedEnumeration.actions.find((action) =>
  action.actionType === "combined_melee_attack" &&
    action.metadata?.combinedAttackContributions?.length === 2 &&
    action.metadata.combinedAttackContributions.every((row) =>
      row.attackSlotOrigin === "additional" &&
      row.additionalAttackIdentityKey === RAPID_STRIKE_SLOT_IDENTITY));
assert.ok(fixedCma, "Host must expose a CMA composed from both Rapid Strike slots");
const fixedSlotKeys = fixedCma.metadata.combinedAttackContributions
  .map((row) => row.attackSlotKey)
  .sort();
assert.equal(new Set(fixedSlotKeys).size, 2, "each member must contribute its own slot");

const cmaLayer3Action = buildWarmachineRulesV1ActionWithStrictRngOutcome(fixedCma, {
  room: { id: "search-host-rapid-strike-parity" },
  sourceContext: { rulesV1State: combinedEnumeration.state },
  selectedActionKey: fixedCma.actionKey,
});
const combinedTransition = applyRulesV1Action(combinedEnumeration.state, {
  ...cmaLayer3Action,
  __warmachineTrustedRulesV1Enumeration: combinedEnumeration,
});
assert.equal(combinedTransition.ok, true, combinedTransition.reason || "fixed-slot CMA");
assert.equal(combinedTransition.nextState.unitActivationWindow, null);
const consumptionEvent = combinedTransition.events.find((event) =>
  event.eventType === "unit_combined_attack_slots_consumed" &&
    event.contributions?.length === 2 &&
    event.contributions.every((row) => row.attackSlotOrigin === "additional"));
assert.ok(consumptionEvent, "combined slot consumption audit event missing");
assert.deepEqual(
  consumptionEvent.contributions.map((row) => row.attackSlotKey).sort(),
  fixedSlotKeys,
);
assert.ok(combinedTransition.events.some((event) =>
  event.eventType === "strict_roll_outcome_applied"));

const searchRuntimeSource = allMjsFiles(path.join(SEARCH_ROOT, "src"))
  .map((absolutePath) => fs.readFileSync(absolutePath, "utf8"))
  .join("\n");
const forbiddenImplementations = [
  "resolvePlacedUnitTrooperCombatActionV1",
  "resolveSelectedUnitChargeFirstMeleeConstraintV1",
  "reconcileUnitCombatPendingModelsV1",
  "resolveActivationStartTokenGainV1",
  "resolveFixedAdditionalBasicAttackSlotV1",
  "resolveUnitActivationTemporaryRuleGrantV1",
];
for (const implementationName of forbiddenImplementations) {
  assert.doesNotMatch(
    searchRuntimeSource,
    new RegExp(`function\\s+${implementationName}|const\\s+${implementationName}\\s*=`),
    `Search must not implement ${implementationName}`,
  );
}

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_activation_unit_host_parity_v1",
  sliceKey: "23.3",
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  authorityDisposition:
    warmachineHost.ruleSemanticsAuthority?.disposition || "rules_semantics_unreviewed",
  realSource: {
    cardName: rapidStrikeCard.name,
    ruleName: "Rapid Strike",
    sourceId: RAPID_STRIKE_SOURCE_ID,
  },
  engineInitialAttackCount: 2,
  layer3RngAppliedToInitialAndCombinedAttacks: true,
  fixedAdditionalCombinedAttack: {
    actionType: fixedCma.actionType,
    contributionCount: fixedCma.metadata.combinedAttackContributions.length,
    additionalAttackIdentityKey: RAPID_STRIKE_SLOT_IDENTITY,
    fixedSlotKeys,
    slotsConsumedExactlyOnce: true,
  },
  searchSideUnitRuleImplementationCount: 0,
  globalStrictReady: false,
  trainingTruth: false,
}, null, 2));
