#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  bindWarmachineBenchmarkExplicitMovementPathV2,
  buildWarmachineBenchmarkMaximumStrictRollOutcomeV2,
  buildWarmachineBenchmarkMovementScopeV2,
  buildWarmachineBenchmarkStrictRollOutcomeV2,
  chooseWarmachineBenchmarkActionV2,
  enumerateWarmachineBenchmarkActionsV2,
  executeWarmachineBenchmarkActivationV2,
  executeWarmachineBenchmarkAssassinationRouteV2,
  executeWarmachineBenchmarkControlPhaseV2,
  executeWarmachineBenchmarkHoldTurnsToTerminalV2,
  executeWarmachineBenchmarkTurnV2,
  summarizeWarmachineBenchmarkActionV2,
} from "../src/benchmark/fixed-steamroller-benchmark-v2.mjs";
import { buildWarmachineFixedSteamrollerFixtureV2 } from
  "../src/benchmark/fixed-steamroller-fixture-v2.mjs";
import { buildWarmachineActivationGroups } from "../src/search/matchup-search-v1.mjs";
import { buildWarmachineReverseReachabilityCandidateSetV2 } from
  "../src/reverse/reachability-contract-v2.mjs";
import { certifyWarmachineExecutedTerminalRouteStrictV2 } from
  "../src/reverse/strict-route-witness-v2.mjs";
import { buildWarmachineTypedInteractionGraphV2 } from
  "../src/graph/typed-interaction-graph-v2.mjs";
import { stableGraphHash } from "../src/graph/typed-facts-v2.mjs";
import {
  normalizeRulesV1State,
} from "../src/warmachine-host-runtime.mjs";

const fixture = buildWarmachineFixedSteamrollerFixtureV2({
  seed: "fixed-steamroller-benchmark-v2",
});
const { cryxList, faneList, nested, opening, bound } = fixture;
assert.equal(nested.counts.strictLegalOpeningCount, 1);
assert.ok(opening);
assert.equal(opening.strictDeploymentLegal, true);
assert.equal(opening.rosterProvenance.completeForHardPruning, true);
assert.equal(opening.rosterPointLedger.sides.player1.rosterPoints, 100);
assert.equal(opening.rosterPointLedger.sides.player2.rosterPoints, 100);

assert.equal(bound.scenarioKey, "two_fronts");
assert.equal(bound.objectiveCount, 4);
assert.equal(bound.scenarioTerrainCount, 1);
assert.equal(bound.selectedScenarioTerrainKey, "center_obstruction");
assert.equal(bound.scenarioTerrainFallbackUsed, false);
const selectedScenarioTerrain = bound.state.terrain.find((terrain) =>
  terrain.isScenarioTerrain);
assert.equal(selectedScenarioTerrain?.terrainKey, "center_obstruction");
assert.equal(selectedScenarioTerrain?.sourceFlagKey, "center-terrain");
assert.equal(selectedScenarioTerrain?.scenarioTerrainSetupChoiceResolved, true);
assert.equal(selectedScenarioTerrain?.scenarioTerrainFallbackUsed, false);
assert.ok(Number(selectedScenarioTerrain?.scenarioTerrainSelectionDistanceIn) <= 5);
assert.equal(bound.mechanithrallSwarmGroupCount, 6);
assert.equal(bound.modelCount, opening.modelCount);
assert.equal(bound.strictMode, true);
assert.equal(bound.firstPlayerSideKey, "player1");

const openingRaptor = bound.state.pieces.find((piece) =>
  piece.sideKey === "player1" && /raptor/i.test(`${piece.label || ""} ${piece.name || ""}`));
assert.ok(openingRaptor);
const openingRouteState = bindWarmachineBenchmarkExplicitMovementPathV2(
  bound.state,
  {
    actorPieceKey: openingRaptor.pieceKey,
    actionType: "run",
    pathKey: "raptor-north-of-center-obstruction-run-v2",
    label: "Raptor north-side run around the center obstruction",
    waypoints: [
      { xIn: 21, yIn: 28.3 },
      { xIn: 26.35, yIn: 29.25 },
    ],
  },
);
const cryxOpeningControl = executeWarmachineBenchmarkControlPhaseV2(openingRouteState, {
  routeKey: "fixed-steamroller-player1-opening-control-v2",
  selectAction: ({ state, scoped }) => {
    const raptor = state.pieces.find((piece) => piece.pieceKey === openingRaptor.pieceKey);
    const allocation = scoped.enumeration.actions.find((action) =>
      action.actionType === "allocate_resource" && action.targetPieceKey === openingRaptor.pieceKey);
    if (allocation && Number(raptor?.resourcePoints || 0) < 1) return allocation;
    if (Number(raptor?.resourcePoints || 0) >= 1) {
      return scoped.enumeration.actions.find((action) => action.actionType === "end_control_phase") || null;
    }
    return null;
  },
});
assert.equal(cryxOpeningControl.ok, true, JSON.stringify(cryxOpeningControl.failures));
assert.equal(cryxOpeningControl.state.phaseKey, "activation");
assert.ok(Number(cryxOpeningControl.state.pieces.find((piece) =>
  piece.pieceKey === openingRaptor.pieceKey)?.resourcePoints || 0) >= 1, JSON.stringify({
  openingRaptor: {
    pieceKey: openingRaptor.pieceKey,
    label: openingRaptor.label,
    canReceiveFocus: openingRaptor.canReceiveFocus,
    battlegroupControllerPieceKey: openingRaptor.battlegroupControllerPieceKey,
    resourceKind: openingRaptor.resourceKind,
    resourceMax: openingRaptor.resourceMax,
  },
  selectedActions: cryxOpeningControl.selectionAudit.map((row) => row.selectedAction),
}));

const openingActivationState = cryxOpeningControl.state;
if (process.env.WARMACHINE_BENCHMARK_PROBE === "opening") {
  const repeatedNormalizationHashes = [];
  let repeatedNormalizationState = openingRouteState;
  for (let index = 0; index < 6; index += 1) {
    repeatedNormalizationState = normalizeRulesV1State(repeatedNormalizationState);
    repeatedNormalizationHashes.push(stableGraphHash(repeatedNormalizationState));
  }
  const probeEnumerationState = enumerateWarmachineBenchmarkActionsV2(openingRouteState).state;
  const enumerationMutationPaths = [];
  const collectDiffPaths = (left, right, pathParts = []) => {
    if (enumerationMutationPaths.length >= 80 || Object.is(left, right)) return;
    if (!left || !right || typeof left !== "object" || typeof right !== "object") {
      enumerationMutationPaths.push({ path: pathParts.join("."), left, right });
      return;
    }
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
    for (const key of keys) collectDiffPaths(left[key], right[key], [...pathParts, key]);
  };
  collectDiffPaths(openingRouteState, probeEnumerationState);
  console.log(JSON.stringify({
    stateHashProbe: {
      openingRouteState: stableGraphHash(openingRouteState),
      controlStartingState: cryxOpeningControl.startingStateHash,
      firstReceiptBefore: cryxOpeningControl.receipts[0]?.stateHashBefore || "",
      firstReceiptInput: cryxOpeningControl.receipts[0]?.stateHashInput || "",
      firstReceiptAfter: cryxOpeningControl.receipts[0]?.stateHashAfter || "",
      secondReceiptBefore: cryxOpeningControl.receipts[1]?.stateHashBefore || "",
      secondReceiptInput: cryxOpeningControl.receipts[1]?.stateHashInput || "",
      repeatedNormalizationHashes,
      enumerationMutationPaths,
    },
    openingControl: cryxOpeningControl.selectionAudit.map((row) => row.selectedAction),
    raptor: ((piece) => ({
      pieceKey: piece?.pieceKey,
      position: piece?.position,
      speedIn: piece?.speedIn,
      resourcePoints: piece?.resourcePoints,
      resourceMax: piece?.resourceMax,
      controllerPieceKey: piece?.controllerPieceKey,
      specialRules: (piece?.specialRules || []).map((rule) => ({
        ruleKey: rule.ruleKey,
        name: rule.name,
        implementationStatus: rule.implementationStatus,
      })),
    }))(openingActivationState.pieces.find((piece) => piece.pieceKey === openingRaptor.pieceKey)),
    faneStrygons: openingActivationState.pieces.filter((piece) =>
      piece.sideKey === "player2" && /strygon/i.test(`${piece.label || ""} ${piece.name || ""}`))
      .map((piece) => ({
        pieceKey: piece.pieceKey,
        position: piece.position,
        speedIn: piece.speedIn,
        specialRules: (piece.specialRules || []).map((rule) => ({
          ruleKey: rule.ruleKey,
          name: rule.name,
          description: rule.description,
          implementationStatus: rule.implementationStatus,
          sourceKinds: rule.sourceKinds,
          sourceIds: rule.sourceIds,
          sourceTexts: rule.sourceTexts,
        })),
        attackProfiles: (piece.attackProfiles || []).map((profile) => ({
          profileKey: profile.profileKey,
          name: profile.name,
          mode: profile.mode,
          specialRules: (profile.specialRules || []).map((rule) => ({
            ruleKey: rule.ruleKey,
            name: rule.name,
            description: rule.description,
            implementationStatus: rule.implementationStatus,
            sourceKinds: rule.sourceKinds,
            sourceIds: rule.sourceIds,
            sourceTexts: rule.sourceTexts,
          })),
        })),
      })),
    terrain: (openingActivationState.terrain || []).map((feature) => ({
      terrainKey: feature.terrainKey,
      type: feature.type,
      xIn: feature.xIn,
      yIn: feature.yIn,
      widthIn: feature.widthIn,
      heightIn: feature.heightIn,
      blocksMovement: feature.blocksMovement,
      blocksLOS: feature.blocksLOS,
    })),
  }, null, 2));
  process.exit(0);
}
const groups = buildWarmachineActivationGroups(openingActivationState);
assert.ok(groups.length > 0);
const leader = openingActivationState.pieces.find((piece) => piece.sideKey === "player1" &&
  (piece.isWarcaster || piece.isWarlock));
assert.ok(leader && /sepsira/i.test(`${leader.label || ""} ${leader.name || ""}`));
const leaderGroup = groups.find((group) => group.actorPieceKeys.includes(leader.pieceKey));
assert.ok(leaderGroup);
const leaderMovement = enumerateWarmachineBenchmarkActionsV2(openingActivationState, {
  activationGroupKey: leaderGroup.groupKey,
  actionFamilyKeys: ["movement"],
});
assert.equal(leaderMovement.enumeration.actorScopeApplied, true);
assert.ok(leaderMovement.enumeration.actions.some((action) => action.actionType === "run"));

const swarmGroup = groups.find((group) => group.actorPieceKeys.some((pieceKey) => {
  const piece = openingActivationState.pieces.find((candidate) => candidate.pieceKey === pieceKey);
  return /mechanithrall swarm/i.test(`${piece?.label || ""} ${piece?.name || ""}`);
}));
assert.ok(swarmGroup);
const swarmMovementScope = buildWarmachineBenchmarkMovementScopeV2(
  openingActivationState,
  swarmGroup.actorPieceKeys,
  { xIn: 21, yIn: 24 },
);
const swarmMovement = enumerateWarmachineBenchmarkActionsV2(openingActivationState, {
  activationGroupKey: swarmGroup.groupKey,
  ...swarmMovementScope,
});
assert.equal(swarmMovement.enumeration.actorScopeApplied, true);
assert.ok(swarmMovement.enumeration.actions.length > 0);

const raptorGroup = groups.find((group) => group.groupFamily === "battlegroup");
assert.ok(raptorGroup);
const raptorStart = openingActivationState.pieces.find((piece) =>
  piece.pieceKey === raptorGroup.actorPieceKeys[0]);
const raptorWaypoint = { xIn: 28, yIn: 30 };
const raptorMovementScope = buildWarmachineBenchmarkMovementScopeV2(
  openingActivationState,
  raptorGroup.actorPieceKeys,
  raptorWaypoint,
  { maximumTargetsPerActionType: 8 },
);
assert.ok(raptorMovementScope.generatedMovementTargetKeys.length >= 2);
if (process.env.WARMACHINE_BENCHMARK_PROBE === "1") {
  console.error(JSON.stringify({
    probe: "raptor_movement_scope",
    raptorGroupKey: raptorGroup.groupKey,
    startPosition: raptorStart.position,
    selectedDescriptors: raptorMovementScope.selectedDescriptors,
  }, null, 2));
}
const raptorActivation = executeWarmachineBenchmarkActivationV2(
  openingActivationState,
  raptorGroup.groupKey,
  {
    routeKey: "fixed-steamroller-raptor-progress-proof-v2",
    enumerationScope: raptorMovementScope,
    intent: { preferMovement: true, waypoint: raptorWaypoint },
    rejectedAuditLimit: 16,
    onProgress: process.env.WARMACHINE_BENCHMARK_PROBE === "1"
      ? (event) => console.error(JSON.stringify(event))
      : undefined,
  },
);
assert.equal(raptorActivation.ok, true, raptorActivation.reason);
assert.ok(raptorActivation.transitionCount >= 1);
const raptorEnd = raptorActivation.state.pieces.find((piece) =>
  piece.pieceKey === raptorGroup.actorPieceKeys[0]);
if (process.env.WARMACHINE_BENCHMARK_PROBE === "raptor") {
  console.log(JSON.stringify({
    startPosition: raptorStart.position,
    endPosition: raptorEnd.position,
    selectedDescriptors: raptorMovementScope.selectedDescriptors,
    selectedActions: raptorActivation.selectionAudit.map((row) => row.selectedAction),
    movementRejections: raptorActivation.selectionAudit[0]?.rejectedActions || [],
  }, null, 2));
  process.exit(0);
}
assert.ok(raptorEnd.position.xIn > raptorStart.position.xIn);

const firstTurn = executeWarmachineBenchmarkTurnV2(openingActivationState, {
  routeKey: "fixed-steamroller-player1-full-turn-v2",
  selectActivationGroup: ({ groups, activationIndex }) =>
    activationIndex === 0 && groups.some((group) => group.groupKey === raptorGroup.groupKey)
      ? raptorGroup.groupKey
      : groups[0].groupKey,
  intentForActivationGroup: ({ group }) => group.groupKey === raptorGroup.groupKey
    ? { preferMovement: true, waypoint: raptorWaypoint, avoidFeat: true }
    : { completionOnly: true, avoidFeat: true },
  onProgress: process.env.WARMACHINE_BENCHMARK_PROBE === "1"
    ? (event) => console.error(JSON.stringify(event))
    : undefined,
});
assert.equal(firstTurn.ok, true, JSON.stringify(firstTurn.failures));
assert.equal(firstTurn.startingSideKey, "player1");
assert.equal(firstTurn.endingActiveSideKey, "player2");
assert.equal(firstTurn.activationCount, groups.length);
assert.equal(firstTurn.remainingActivationGroupKeys.length, 0);

const faneControl = executeWarmachineBenchmarkControlPhaseV2(firstTurn.state, {
  routeKey: "fixed-steamroller-player2-control-v2",
  onProgress: process.env.WARMACHINE_BENCHMARK_PROBE === "1"
    ? (event) => console.error(JSON.stringify(event))
    : undefined,
});
assert.equal(faneControl.ok, true, JSON.stringify(faneControl.failures));
const faneGroups = buildWarmachineActivationGroups(faneControl.state);
assert.ok(faneGroups.length > 0);
const faneLeader = faneControl.state.pieces.find((piece) => piece.sideKey === "player2" &&
  (piece.isWarcaster || piece.isWarlock));
assert.ok(faneLeader && /nymara/i.test(`${faneLeader.label || ""} ${faneLeader.name || ""}`));
const faneLeaderGroup = faneGroups.find((group) => group.actorPieceKeys.includes(faneLeader.pieceKey));
assert.ok(faneLeaderGroup);
if (process.env.WARMACHINE_BENCHMARK_PROBE === "assassination-setup") {
  const leaderMovementScope = buildWarmachineBenchmarkMovementScopeV2(
    faneControl.state,
    faneLeaderGroup.actorPieceKeys,
    faneControl.state.pieces.find((piece) => piece.pieceKey === raptorGroup.actorPieceKeys[0])?.position || {},
    { actionTypes: ["advance", "run", "charge"], maximumTargetsPerActionType: 12 },
  );
  const leaderEnumeration = enumerateWarmachineBenchmarkActionsV2(faneControl.state, {
    activationGroupKey: faneLeaderGroup.groupKey,
    ...leaderMovementScope,
  });
  console.log(JSON.stringify({
    faneLeader: {
      pieceKey: faneLeader.pieceKey,
      position: faneLeader.position,
      speedIn: faneLeader.speedIn,
      boxesRemaining: faneLeader.damage?.boxesRemaining,
      resourcePoints: faneLeader.resourcePoints,
      resourceMax: faneLeader.resourceMax,
    },
    cryxRaptor: ((piece) => ({
      pieceKey: piece?.pieceKey,
      position: piece?.position,
      resourcePoints: piece?.resourcePoints,
    }))(faneControl.state.pieces.find((piece) => piece.pieceKey === raptorGroup.actorPieceKeys[0])),
    group: faneLeaderGroup,
    movementScope: leaderMovementScope,
    legalActions: leaderEnumeration.enumeration.actions.map(summarizeWarmachineBenchmarkActionV2),
    rejectedActions: leaderEnumeration.enumeration.rejectedActions
      .slice(0, 80)
      .map((action) => ({
        actionKey: action.actionKey,
        actionType: action.actionType,
        destination: action.destination || null,
        reason: action.rejection?.reason || action.metadata?.rejectionReason || "",
        reasons: action.rejection?.reasons || [],
        issues: action.rejection?.issues || [],
      })),
  }, null, 2));
  process.exit(0);
}
const exchangeGroup = faneGroups.find((group) => /strygon_11_1/.test(group.groupKey)) ||
  faneGroups.find((group) => group.groupFamily === "battlegroup") || faneGroups[0];
const exchangeTarget = faneControl.state.pieces.find((piece) => piece.pieceKey === raptorGroup.actorPieceKeys[0]);
assert.ok(exchangeTarget);

function groupCentroid(state, group) {
  const pieces = group.actorPieceKeys.map((pieceKey) =>
    state.pieces.find((piece) => piece.pieceKey === pieceKey)).filter(Boolean);
  return {
    xIn: pieces.reduce((sum, piece) => sum + piece.position.xIn, 0) / pieces.length,
    yIn: pieces.reduce((sum, piece) => sum + piece.position.yIn, 0) / pieces.length,
  };
}

function pointDistance(left, right) {
  return Math.hypot(left.xIn - right.xIn, left.yIn - right.yIn);
}

const exchangeStartCentroid = groupCentroid(faneControl.state, exchangeGroup);
const exchangeStartDistance = pointDistance(exchangeStartCentroid, exchangeTarget.position);
let faneExchangeProbe = null;
const faneTurn = executeWarmachineBenchmarkTurnV2(faneControl.state, {
  routeKey: "fixed-steamroller-player2-full-turn-v2",
  selectActivationGroup: ({ groups, activationIndex }) =>
    activationIndex === 0 && groups.some((group) => group.groupKey === exchangeGroup.groupKey)
      ? exchangeGroup.groupKey
      : groups[0].groupKey,
  intentForActivationGroup: ({ group }) => group.groupKey === exchangeGroup.groupKey
    ? {
      preferAttack: true,
      targetPieceKey: exchangeTarget.pieceKey,
      requireTargetMatch: true,
      avoidFeat: true,
      selectAction: ({ state, scoped, intent }) => {
        const selected = chooseWarmachineBenchmarkActionV2(scoped.enumeration.actions, state, intent);
        if (!selected?.metadata?.attackResolution) return selected;
        return {
          actionKey: selected.actionKey,
          actionPatch: {
            strictRollOutcome: buildWarmachineBenchmarkStrictRollOutcomeV2(selected, {
              attackDie: 4,
              damageDie: 2,
              locationDie: 3,
            }),
          },
        };
      },
      onEnumeration: ({ scoped, stepIndex }) => {
        if (stepIndex !== 0) return null;
        faneExchangeProbe = {
          attackerPosition: scoped.state.pieces.find((piece) =>
            piece.pieceKey === exchangeGroup.actorPieceKeys[0])?.position || null,
          targetPosition: scoped.state.pieces.find((piece) =>
            piece.pieceKey === exchangeTarget.pieceKey)?.position || null,
          legalActions: scoped.enumeration.actions.map(summarizeWarmachineBenchmarkActionV2),
          targetedRejectedActions: scoped.enumeration.rejectedActions
            .filter((action) => action.targetPieceKey === exchangeTarget.pieceKey)
            .slice(0, 24)
            .map((action) => ({
              actionKey: action.actionKey,
              actionType: action.actionType,
              reason: action.rejection?.reason || action.metadata?.rejectionReason || "",
              reasons: action.rejection?.reasons || [],
              closestDistanceIn: action.metadata?.closestDistanceIn ?? null,
              blockerKind: action.rejection?.evidence?.losGeometry?.blockerKind || "",
              blockerKeys: action.rejection?.evidence?.losGeometry?.blockerKeys || [],
              specialRuleEffects: (action.metadata?.specialRuleAnalysis?.effects || []).map((effect) => ({
                ruleKey: effect.ruleKey,
                atomKey: effect.evidence?.atomKey || effect.atomKey || "",
                effectType: effect.effectType,
                exactWithinScope: effect.exactWithinScope === true,
                active: effect.active !== false,
                reason: effect.reason || "",
              })),
              ruleAtomEffects: (action.metadata?.ruleAtomEffects || []).map((effect) => ({
                ruleKey: effect.ruleKey,
                atomKey: effect.atomKey,
                effectType: effect.effectType,
                active: effect.active !== false,
                inactiveReason: effect.inactiveReason || "",
              })),
            })),
        };
      },
    }
    : { completionOnly: true, avoidFeat: true },
});
if (!faneTurn.ok && process.env.WARMACHINE_BENCHMARK_PROBE === "exchange") {
  console.error(JSON.stringify({
    failures: faneTurn.failures,
    activationReceipts: faneTurn.activationReceipts,
    faneExchangeProbe,
  }, null, 2));
}
assert.equal(faneTurn.ok, true, JSON.stringify(faneTurn.failures));
assert.equal(faneTurn.endingActiveSideKey, "player1");
const exchangedGroupAfterTurn = {
  ...exchangeGroup,
  actorPieceKeys: exchangeGroup.actorPieceKeys.filter((pieceKey) =>
    faneTurn.state.pieces.some((piece) => piece.pieceKey === pieceKey)),
};
const exchangeEndCentroid = groupCentroid(faneTurn.state, exchangedGroupAfterTurn);
const exchangeEndDistance = pointDistance(exchangeEndCentroid,
  faneTurn.state.pieces.find((piece) => piece.pieceKey === exchangeTarget.pieceKey).position);
assert.ok(exchangeEndDistance < exchangeStartDistance);
const cryxControl = executeWarmachineBenchmarkControlPhaseV2(faneTurn.state, {
  routeKey: "fixed-steamroller-player1-second-control-v2",
});
assert.equal(cryxControl.ok, true, JSON.stringify(cryxControl.failures));
const exchangeAttackerGroup = buildWarmachineActivationGroups(cryxControl.state)
  .find((group) => group.groupKey === raptorGroup.groupKey);
assert.ok(exchangeAttackerGroup);
const exchangeTargetPieceKey = exchangeGroup.actorPieceKeys[0];
const exchangeTargetBefore = cryxControl.state.pieces.find((piece) =>
  piece.pieceKey === exchangeTargetPieceKey);
assert.ok(exchangeTargetBefore);
const boxesRemaining = (piece) => Number(piece?.boxesRemaining ?? piece?.damage?.boxesRemaining ?? 0);

const holdActorBefore = cryxControl.state.pieces.find((piece) =>
  piece.pieceKey === exchangeAttackerGroup.actorPieceKeys[0]);
assert.ok(holdActorBefore);
const holdActivation = executeWarmachineBenchmarkActivationV2(
  cryxControl.state,
  exchangeAttackerGroup.groupKey,
  {
    routeKey: "fixed-steamroller-hold-current-position-v2",
    intent: { completionOnly: true, avoidFeat: true },
  },
);
assert.equal(holdActivation.ok, true, holdActivation.reason);
assert.equal(holdActivation.completed, true);
const holdActorAfter = holdActivation.state.pieces.find((piece) =>
  piece.pieceKey === holdActorBefore.pieceKey);
const holdTargetAfter = holdActivation.state.pieces.find((piece) =>
  piece.pieceKey === exchangeTargetPieceKey);
assert.deepEqual(holdActorAfter?.position, holdActorBefore.position);
assert.equal(boxesRemaining(holdTargetAfter), boxesRemaining(exchangeTargetBefore));
assert.equal(holdActivation.selectionAudit.some((row) =>
  /attack|charge|slam|throw|headbutt|trample|spell|animus/.test(row.selectedAction.actionType)), false);

let exchangeSelectionProbe = null;
const exchangeActivation = executeWarmachineBenchmarkActivationV2(
  cryxControl.state,
  exchangeAttackerGroup.groupKey,
  {
    routeKey: "fixed-steamroller-deliberate-exchange-v2",
    repeatIntent: true,
    enumerationScopeForStep: ({ state, stepIndex, initialGroup }) => stepIndex === 0
      ? {
        ...buildWarmachineBenchmarkMovementScopeV2(
          state,
          initialGroup.actorPieceKeys,
          state.pieces.find((piece) => piece.pieceKey === exchangeTargetPieceKey)?.position || {},
          { actionTypes: ["advance"], maximumTargetsPerActionType: 3 },
        ),
        targetPieceKeys: [exchangeTargetPieceKey],
        includeUntargetedActions: true,
        actionFamilyKeys: ["movement", "attack_or_effect", "timing", "resource"],
      }
      : {
        targetPieceKeys: [exchangeTargetPieceKey],
        includeUntargetedActions: true,
        actionFamilyKeys: ["attack_or_effect", "timing", "resource"],
      },
    intent: ({ stepIndex }) => stepIndex === 0
      ? {
        preferAttack: true,
        preferMovement: true,
        waypoint: exchangeTargetBefore.position,
        targetPieceKey: exchangeTargetPieceKey,
        requireTargetMatch: false,
        avoidFeat: true,
      }
      : {
        preferAttack: true,
        targetPieceKey: exchangeTargetPieceKey,
        requireTargetMatch: false,
        avoidFeat: true,
      },
    selectAction: ({ scoped, stepIndex }) => {
      if (stepIndex === 0) {
        exchangeSelectionProbe = {
          stepIndex,
          legalActions: scoped.enumeration.actions.map(summarizeWarmachineBenchmarkActionV2),
          rejectedActions: scoped.enumeration.rejectedActions.slice(0, 24).map((action) => ({
            actionKey: action.actionKey,
            actionType: action.actionType,
            reason: action.rejection?.reason || action.metadata?.rejectionReason || "",
            reasons: action.rejection?.reasons || [],
            issues: action.rejection?.issues || [],
          })),
        };
        const targeted = scoped.enumeration.actions.filter((action) =>
          action.targetPieceKey === exchangeTargetPieceKey &&
          /attack|charge|slam|throw|headbutt|trample|spell|animus/.test(action.actionType));
        const attack = targeted.sort((left, right) =>
          Number(right.actionType === "charge") - Number(left.actionType === "charge") ||
          Number(right.expectedDamage || 0) - Number(left.expectedDamage || 0) ||
          left.actionKey.localeCompare(right.actionKey))[0];
        if (attack) return {
          actionKey: attack.actionKey,
          actionPatch: {
            strictRollOutcome: buildWarmachineBenchmarkMaximumStrictRollOutcomeV2(attack),
          },
        };
        const advance = scoped.enumeration.actions
          .filter((action) => action.actionType === "advance")
          .sort((left, right) => left.actionKey.localeCompare(right.actionKey))[0];
        return advance || scoped.enumeration.actions.find((action) =>
          action.actionType === "forfeit_normal_movement") || null;
      }
      const targeted = scoped.enumeration.actions.filter((action) =>
        action.targetPieceKey === exchangeTargetPieceKey &&
        /attack|charge|slam|throw|headbutt|trample|spell|animus/.test(action.actionType));
      exchangeSelectionProbe = {
        legalActions: scoped.enumeration.actions.map(summarizeWarmachineBenchmarkActionV2),
        targetedRejectedActions: scoped.enumeration.rejectedActions
          .filter((action) => action.targetPieceKey === exchangeTargetPieceKey)
          .slice(0, 24)
          .map((action) => ({
            actionKey: action.actionKey,
            actionType: action.actionType,
            reason: action.rejection?.reason || action.metadata?.rejectionReason || "",
            reasons: action.rejection?.reasons || [],
            issues: action.rejection?.issues || [],
            blockerKind: action.rejection?.evidence?.losGeometry?.blockerKind || "",
            blockerKeys: action.rejection?.evidence?.losGeometry?.blockerKeys || [],
            closestDistanceIn: action.metadata?.closestDistanceIn ?? null,
          })),
      };
      const action = targeted.sort((left, right) =>
        Number(right.actionType === "charge") - Number(left.actionType === "charge") ||
        left.actionKey.localeCompare(right.actionKey))[0];
      return action ? {
        actionKey: action.actionKey,
        actionPatch: {
          strictRollOutcome: buildWarmachineBenchmarkMaximumStrictRollOutcomeV2(action),
        },
      } : null;
    },
  },
);
if (!exchangeActivation.ok && process.env.WARMACHINE_BENCHMARK_PROBE === "exchange") {
  console.error(JSON.stringify({
    reason: exchangeActivation.reason,
    selectionAudit: exchangeActivation.selectionAudit,
    exchangeSelectionProbe,
  }, null, 2));
}
assert.equal(exchangeActivation.ok, true, exchangeActivation.reason);
const exchangeTargetAfter = exchangeActivation.state.pieces.find((piece) =>
  piece.pieceKey === exchangeTargetPieceKey);
const exchangeTargetAttackSelected = exchangeActivation.selectionAudit.some((row) =>
  row.selectedAction.targetPieceKey === exchangeTargetPieceKey &&
  /attack|charge|slam|throw|headbutt|trample|spell|animus/.test(row.selectedAction.actionType));
assert.equal(exchangeTargetAttackSelected, true, "the deliberate exchange must execute an attack against the selected target");
assert.ok(
  !exchangeTargetAfter || boxesRemaining(exchangeTargetAfter) < boxesRemaining(exchangeTargetBefore),
  "the deliberate exchange must damage, destroy, or remove the selected target",
);

const successorReachability = buildWarmachineReverseReachabilityCandidateSetV2([
  {
    candidateKey: "cryx-raptor-attack-strygon",
    successorKind: "attack_or_exchange",
    strictWitness: true,
    strictReceiptHash: exchangeActivation.activationReceiptHash,
    transitionActionKey: exchangeActivation.selectionAudit.find((row) =>
      row.selectedAction.targetPieceKey === exchangeTargetPieceKey)?.selectedAction?.actionKey || "",
    provenance: { routeKey: "fixed-steamroller-deliberate-exchange-v2" },
    annotations: { deliberateExchange: true },
  },
  {
    candidateKey: "cryx-raptor-hold-current-position",
    successorKind: "hold_or_block",
    strictWitness: true,
    strictReceiptHash: holdActivation.activationReceiptHash,
    transitionActionKey: holdActivation.selectionAudit[0]?.selectedAction?.actionKey || "",
    provenance: { routeKey: "fixed-steamroller-hold-current-position-v2" },
    annotations: { deliberateExchange: false },
  },
], {
  queryKey: "cryx-second-turn-raptor-successor-reachability",
  successorStateKey: "multiple_declared_successor_states",
});
assert.equal(successorReachability.reachabilityContractOk, true);
assert.equal(successorReachability.counts.strictReachableWitnessCount, 2);
assert.equal(successorReachability.strategyEvaluationApplied, false);
assert.equal(successorReachability.candidateRankingApplied, false);

const scoreContinuation = executeWarmachineBenchmarkHoldTurnsToTerminalV2(
  firstTurn.state,
  {
    routeKey: "fixed-two-fronts-score-route-v2",
    maximumTurns: 5,
    expectedWinnerSideKey: "player2",
  },
);
assert.equal(scoreContinuation.ok, true, JSON.stringify(scoreContinuation.failures));
assert.equal(scoreContinuation.completedTurnCount, 4);
assert.deepEqual(scoreContinuation.checkpoints.map((checkpoint) => ({
  endingSideKey: checkpoint.endingSideKey,
  endingTurnNumber: checkpoint.endingTurnNumber,
  score: checkpoint.score,
})), [
  { endingSideKey: "player2", endingTurnNumber: 1, score: { player1: 0, player2: 0 } },
  { endingSideKey: "player1", endingTurnNumber: 2, score: { player1: 0, player2: 0 } },
  { endingSideKey: "player2", endingTurnNumber: 2, score: { player1: 1, player2: 3 } },
  { endingSideKey: "player1", endingTurnNumber: 3, score: { player1: 2, player2: 6 } },
]);
assert.equal(scoreContinuation.terminalEvent.winnerSideKey, "player2");
assert.equal(scoreContinuation.terminalEvent.reason,
  "steamroller_2026_lead_three_after_scoring_on_opponent_turn");
const scoreRouteReceipts = [
  ...cryxOpeningControl.receipts,
  ...firstTurn.stepReceipts,
  ...scoreContinuation.receipts,
];
assert.equal(scoreRouteReceipts.length, 140);
const interactionGraph = buildWarmachineTypedInteractionGraphV2();
const scoreRouteWitness = certifyWarmachineExecutedTerminalRouteStrictV2(
  openingRouteState,
  scoreContinuation.state,
  scoreRouteReceipts,
  {
    goalType: "scenario_score",
    winnerSideKey: "player2",
    endingSideKey: "player1",
    scoringSideKey: "player2",
  },
  {
    routeKey: "fixed-two-fronts-score-route-v2",
    graph: interactionGraph,
    searchMode: "long_horizon",
  },
);
assert.equal(scoreRouteWitness.routeExecutionValidated, true,
  JSON.stringify(scoreRouteWitness.issues));
assert.equal(scoreRouteWitness.strictWitness, true,
  JSON.stringify(scoreRouteWitness.proof));
assert.equal(scoreRouteWitness.proof.status, "strict_certified");
assert.equal(scoreRouteWitness.proof.absoluteTerminalTime.roundNumber, 3);
assert.equal(scoreRouteWitness.proof.absoluteTerminalTime.endingSideKey, "player1");
const tamperedScoreReceipts = structuredClone(scoreRouteReceipts);
tamperedScoreReceipts[0].persistedAction.metadata = {
  ...(tamperedScoreReceipts[0].persistedAction.metadata || {}),
  tampered: true,
};
const tamperedScoreWitness = certifyWarmachineExecutedTerminalRouteStrictV2(
  openingRouteState,
  scoreContinuation.state,
  tamperedScoreReceipts,
  {
    goalType: "scenario_score",
    winnerSideKey: "player2",
    endingSideKey: "player1",
    scoringSideKey: "player2",
  },
  {
    routeKey: "fixed-two-fronts-score-route-tamper-negative-v2",
    graph: interactionGraph,
    searchMode: "long_horizon",
  },
);
assert.equal(tamperedScoreWitness.strictWitness, false);
assert.ok(tamperedScoreWitness.issues.some((issue) =>
  issue.reason === "strict_receipt_hash_mismatch"));
if (process.env.WARMACHINE_BENCHMARK_PROBE === "score") {
  console.log(JSON.stringify({
    ok: true,
    schemaVersion: "warmachine_fixed_steamroller_score_route_v2_verification",
    routeTransitionCount: scoreRouteReceipts.length,
    terminalEvent: scoreContinuation.terminalEvent,
    scoreTimeline: scoreContinuation.checkpoints.map((checkpoint) => ({
      endingSideKey: checkpoint.endingSideKey,
      endingTurnNumber: checkpoint.endingTurnNumber,
      score: checkpoint.score,
    })),
    witnessHash: scoreRouteWitness.witnessHash,
    proofStatus: scoreRouteWitness.proof.status,
    tamperedReceiptRejected: !tamperedScoreWitness.strictWitness,
    claimBoundary: scoreRouteWitness.claimBoundary,
  }, null, 2));
  process.exit(0);
}

const assassinationRoute = executeWarmachineBenchmarkAssassinationRouteV2(
  openingRouteState,
  {
    routeKey: "fixed-two-fronts-assassination-route-v2",
    raptorPieceKey: openingRaptor.pieceKey,
    attackerLeaderPieceKey: leader.pieceKey,
    targetLeaderPieceKey: faneLeader.pieceKey,
    raptorWaypoint: { xIn: 26.35, yIn: 29.25 },
    attackerLeaderWaypoint: { xIn: 14, yIn: 24 },
  },
);
assert.equal(assassinationRoute.ok, true, JSON.stringify(assassinationRoute.failures));
assert.equal(assassinationRoute.terminalEvents.length, 1);
assert.equal(assassinationRoute.terminalEvents[0].winnerSideKey, "player1");
assert.equal(assassinationRoute.adversarialOpponentDefenseProven, false);
const assassinationRouteReceipts = assassinationRoute.receipts;
const assassinationTerminalEvents = assassinationRoute.terminalEvents;
const assassinationSepsiraActivation = assassinationRoute.stages.casterActivation;
const assassinationRaptorActivation = assassinationRoute.stages.raptorActivation;
const assassinationSepsiraAfterTurnOne = assassinationRoute.stages.attackerFirstTurn.state.pieces
  .find((piece) => piece.pieceKey === leader.pieceKey);
const assassinationTargetAfterFaneTurn = assassinationRoute.stages.defenderTurn.state.pieces
  .find((piece) => piece.pieceKey === faneLeader.pieceKey);
assert.ok(assassinationSepsiraAfterTurnOne.position.xIn > leader.position.xIn);
assert.ok(pointDistance(
  assassinationTargetAfterFaneTurn.position,
  assassinationRoute.stages.defenderTurn.state.pieces.find((piece) =>
    piece.pieceKey === openingRaptor.pieceKey).position,
) < 12);
const assassinationRouteWitness = certifyWarmachineExecutedTerminalRouteStrictV2(
  openingRouteState,
  assassinationRoute.state,
  assassinationRouteReceipts,
  {
    goalType: "assassination",
    winnerSideKey: "player1",
    endingSideKey: "player1",
  },
  {
    routeKey: "fixed-two-fronts-assassination-route-v2",
    graph: interactionGraph,
    searchMode: "long_horizon",
  },
);
assert.equal(assassinationRouteWitness.routeExecutionValidated, true,
  JSON.stringify(assassinationRouteWitness.issues));
assert.equal(assassinationRouteWitness.strictWitness, true,
  JSON.stringify(assassinationRouteWitness.proof));
assert.equal(assassinationRouteWitness.proof.status, "strict_certified");

const result = {
  schemaVersion: "warmachine_fixed_steamroller_benchmark_v2_initial_verification",
  roster: {
    cryxListKey: cryxList.key,
    cryxLeader: cryxList.leader,
    faneListKey: faneList.key,
    faneLeader: faneList.leader,
    cryxPoints: opening.rosterPointLedger.sides.player1.rosterPoints,
    fanePoints: opening.rosterPointLedger.sides.player2.rosterPoints,
  },
  opening: {
    openingKey: opening.openingKey,
    formationKey: opening.formationKey,
    deploymentLegal: opening.strictDeploymentLegal,
    modelCount: bound.modelCount,
    bindingHash: bound.bindingHash,
    scenarioKey: bound.scenarioKey,
    mechanithrallSwarmGroupCount: bound.mechanithrallSwarmGroupCount,
    openingControlTransitionCount: cryxOpeningControl.transitionCount,
    openingControlSelectedActions: cryxOpeningControl.selectionAudit.map((row) => row.selectedAction),
  },
  localEnumeration: {
    activationGroupCount: groups.length,
    activationGroups: groups.map((group) => ({
      groupKey: group.groupKey,
      groupFamily: group.groupFamily,
      pieceCount: group.pieceCount,
      nearestEnemyIn: group.nearestEnemyIn,
      nearestScenarioIn: group.nearestScenarioIn,
    })),
    leaderGroupKey: leaderGroup.groupKey,
    leaderActionCount: leaderMovement.enumeration.actionCount,
    leaderActions: leaderMovement.enumeration.actions.slice(0, 12)
      .map(summarizeWarmachineBenchmarkActionV2),
    swarmGroupKey: swarmGroup.groupKey,
    swarmActionCount: swarmMovement.enumeration.actionCount,
    swarmMovementPlanCandidateCount: swarmMovementScope.planCandidateCount,
    swarmRequestedMovementTargetCount: swarmMovementScope.generatedMovementTargetKeys.length,
    swarmRejectedActionCount: swarmMovement.enumeration.rejectedActionCount,
    swarmRejectedActions: swarmMovement.enumeration.rejectedActions.slice(0, 12).map((action) => ({
      actionKey: action.actionKey,
      actionType: action.actionType,
      reasons: action.rejection?.reasons || [],
      issues: action.rejection?.issues || [],
    })),
    swarmActions: swarmMovement.enumeration.actions.slice(0, 12)
      .map(summarizeWarmachineBenchmarkActionV2),
    raptorActivation: {
      groupKey: raptorGroup.groupKey,
      completed: raptorActivation.completed,
      transitionCount: raptorActivation.transitionCount,
      startPosition: raptorStart.position,
      endPosition: raptorEnd.position,
      movementPlanCandidateCount: raptorMovementScope.planCandidateCount,
      requestedMovementTargetCount: raptorMovementScope.generatedMovementTargetKeys.length,
      selectedActions: raptorActivation.selectionAudit.map((row) => row.selectedAction),
      activationReceiptHash: raptorActivation.activationReceiptHash,
    },
    firstTurn: {
      turnCompleted: firstTurn.turnCompleted,
      activationCount: firstTurn.activationCount,
      transitionCount: firstTurn.stepReceipts.length,
      endingActiveSideKey: firstTurn.endingActiveSideKey,
      endingPhaseKey: firstTurn.endingPhaseKey,
      endingTurnNumber: firstTurn.endingTurnNumber,
      turnReceiptHash: firstTurn.turnReceiptHash,
    },
    faneControl: {
      controlCompleted: faneControl.controlCompleted,
      transitionCount: faneControl.transitionCount,
      selectedActions: faneControl.selectionAudit.map((row) => row.selectedAction),
      endingPhaseKey: faneControl.endingPhaseKey,
      controlReceiptHash: faneControl.controlReceiptHash,
      exchangeProbe: {
        groupKey: exchangeGroup.groupKey,
        targetPieceKey: exchangeTarget.pieceKey,
        nearestEnemyInBeforeAdvance: exchangeGroup.nearestEnemyIn,
        targetedAttackEnumerationDeferredUntilAfterAdvance: true,
      },
      activationGroups: faneGroups.map((group) => ({
        groupKey: group.groupKey,
        groupFamily: group.groupFamily,
        pieceCount: group.pieceCount,
        nearestEnemyIn: group.nearestEnemyIn,
        actorPieces: group.actorPieceKeys.map((pieceKey) => {
          const piece = faneControl.state.pieces.find((candidate) => candidate.pieceKey === pieceKey);
          return { pieceKey, label: piece?.label || "", position: piece?.position || null };
        }),
      })),
    },
    faneTurn: {
      turnCompleted: faneTurn.turnCompleted,
      activationCount: faneTurn.activationCount,
      transitionCount: faneTurn.stepReceipts.length,
      endingActiveSideKey: faneTurn.endingActiveSideKey,
      endingPhaseKey: faneTurn.endingPhaseKey,
      endingTurnNumber: faneTurn.endingTurnNumber,
      exchangeStartDistance,
      exchangeEndDistance,
      turnReceiptHash: faneTurn.turnReceiptHash,
    },
    cryxSecondControl: {
      controlCompleted: cryxControl.controlCompleted,
      transitionCount: cryxControl.transitionCount,
      endingPhaseKey: cryxControl.endingPhaseKey,
      endingTurnNumber: cryxControl.endingTurnNumber,
      controlReceiptHash: cryxControl.controlReceiptHash,
    },
    deliberateExchange: {
      reachabilityWitnessOnly: true,
      strategyPreferenceClaimed: false,
      claimBoundary: "This route proves that the declared exchange successor is strictly reachable. It does not rank exchanging above holding a lane, denying scenario presence, withdrawing, or any other reachable successor.",
      attackerGroupKey: exchangeAttackerGroup.groupKey,
      targetPieceKey: exchangeTargetPieceKey,
      targetBoxesBefore: boxesRemaining(exchangeTargetBefore),
      targetBoxesAfter: boxesRemaining(exchangeTargetAfter),
      targetAttackSelected: exchangeTargetAttackSelected,
      selectionProbe: exchangeSelectionProbe,
      selectedActions: exchangeActivation.selectionAudit.map((row) => row.selectedAction),
      transitionCount: exchangeActivation.transitionCount,
      activationReceiptHash: exchangeActivation.activationReceiptHash,
    },
    holdCurrentPosition: {
      reachabilityWitnessOnly: true,
      strategyPreferenceClaimed: false,
      claimBoundary: "This route proves that completing the activation without moving or attacking is strictly reachable. It does not claim that holding is better than exchanging, withdrawing, scoring, or any other reachable successor.",
      actorGroupKey: exchangeAttackerGroup.groupKey,
      actorPositionBefore: holdActorBefore.position,
      actorPositionAfter: holdActorAfter.position,
      targetBoxesBefore: boxesRemaining(exchangeTargetBefore),
      targetBoxesAfter: boxesRemaining(holdTargetAfter),
      selectedActions: holdActivation.selectionAudit.map((row) => row.selectedAction),
      transitionCount: holdActivation.transitionCount,
      activationReceiptHash: holdActivation.activationReceiptHash,
    },
    successorReachability,
    scoreTerminalRoute: {
      candidateKey: "cryx-two-fronts-hold-to-three-vp",
      reachabilityWitnessOnly: true,
      strategyPreferenceClaimed: false,
      strictWitness: scoreRouteWitness.strictWitness,
      routeExecutionValidated: scoreRouteWitness.routeExecutionValidated,
      routeTransitionCount: scoreRouteReceipts.length,
      witnessHash: scoreRouteWitness.witnessHash,
      terminalReceiptHash: scoreRouteWitness.terminalReceiptHash,
      proofStatus: scoreRouteWitness.proof.status,
      terminalEvent: scoreContinuation.terminalEvent,
      scoreTimeline: scoreContinuation.checkpoints.map((checkpoint) => ({
        endingSideKey: checkpoint.endingSideKey,
        endingTurnNumber: checkpoint.endingTurnNumber,
        score: checkpoint.score,
      })),
      scoringPieceKey: openingRaptor.pieceKey,
      scoringPieceFinalPosition: scoreContinuation.state.pieces.find((piece) =>
        piece.pieceKey === openingRaptor.pieceKey)?.position || null,
      unresolvedObligationCount: scoreRouteWitness.algebra.unresolved.length,
      strategyRobustnessProven: scoreRouteWitness.strategyRobustnessProven,
      chanceMassComplete: scoreRouteWitness.chanceMassComplete,
      opponentResponseSetComplete: scoreRouteWitness.opponentResponseSetComplete,
      tamperedReceiptRejected: !tamperedScoreWitness.strictWitness,
      claimBoundary: scoreRouteWitness.claimBoundary,
    },
    assassinationTerminalRoute: {
      candidateKey: "cryx-two-fronts-arc-node-raptor-assassination",
      reachabilityWitnessOnly: true,
      strategyPreferenceClaimed: false,
      strictWitness: assassinationRouteWitness.strictWitness,
      routeExecutionValidated: assassinationRouteWitness.routeExecutionValidated,
      routeTransitionCount: assassinationRouteReceipts.length,
      witnessHash: assassinationRouteWitness.witnessHash,
      terminalReceiptHash: assassinationRouteWitness.terminalReceiptHash,
      proofStatus: assassinationRouteWitness.proof.status,
      terminalEvent: assassinationTerminalEvents[0],
      targetPieceKey: faneLeader.pieceKey,
      targetStartingBoxes: boxesRemaining(faneLeader),
      targetFinalBoxes: boxesRemaining(assassinationRoute.state.pieces.find((piece) =>
        piece.pieceKey === faneLeader.pieceKey)),
      sepsiraPositionAfterTurnOne: assassinationSepsiraAfterTurnOne.position,
      targetPositionAfterOpponentTurn: assassinationTargetAfterFaneTurn.position,
      sepsiraSelectedActions: assassinationSepsiraActivation.selectionAudit.map((row) => row.selectedAction),
      raptorSelectedActions: assassinationRaptorActivation.selectionAudit.map((row) => row.selectedAction),
      unresolvedObligationCount: assassinationRouteWitness.algebra.unresolved.length,
      strategyRobustnessProven: assassinationRouteWitness.strategyRobustnessProven,
      chanceMassComplete: assassinationRouteWitness.chanceMassComplete,
      opponentResponseSetComplete: assassinationRouteWitness.opponentResponseSetComplete,
      claimBoundary: assassinationRouteWitness.claimBoundary,
    },
  },
};

console.log(JSON.stringify(
  process.env.WARMACHINE_BENCHMARK_PROBE === "exchange"
    ? result.localEnumeration.deliberateExchange
    : result,
  null,
  2,
));
