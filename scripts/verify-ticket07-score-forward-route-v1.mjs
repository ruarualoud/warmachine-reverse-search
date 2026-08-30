#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadWarmachineMatchupTemplateRoomV1 } from
  "./load-matchup-template-room-v1.mjs";
import {
  bindWarmachineBenchmarkExplicitMovementPathV2,
  enumerateWarmachineBenchmarkActionsV2,
  executeWarmachineBenchmarkActionV2,
  executeWarmachineBenchmarkActivationV2,
  executeWarmachineBenchmarkControlPhaseV2,
} from "../src/benchmark/fixed-steamroller-benchmark-v2.mjs";
import { warmachineBenchmarkGameStateHashV2 } from
  "../src/benchmark/benchmark-game-state-hash-v2.mjs";
import { stableGraphHash, stableGraphValue } from
  "../src/graph/typed-facts-v2.mjs";
import { materializeWarmachineRepresentativeOpeningsV1 } from
  "../src/matchup/representative-opening-materializer-v1.mjs";
import {
  buildUnitRingSlotsV1,
  rankUnitRingTrajectoryAssignmentsV1,
} from "../src/matchup/unit-ring-trajectory-v1.mjs";
import { buildWarmachineSteamrollerFallbackOpeningBindersV1 } from
  "../src/matchup/steamroller-opening-binders-v1.mjs";
import { buildWarmachineSteamrollerOpeningMapTemplateV1 } from
  "../src/matchup/steamroller-opening-map-template-v1.mjs";
import { certifyWarmachineExecutedTerminalRouteStrictV2 } from
  "../src/reverse/strict-route-witness-v2.mjs";
import { auditWarmachineLegalDeploymentReachabilityV1 } from
  "../src/reverse/deployment-reachability-v1.mjs";
import { buildWarmachineActivationGroups } from
  "../src/search/matchup-search-v1.mjs";
import {
  auditRulesV1StaticPlacement,
  auditRulesV1StaticUnitFormation,
  buildRulesV1MovementPathProposalPlan,
  normalizeRulesV1State,
  warmachineHost,
} from "../src/warmachine-host-runtime.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const evidenceRoot = path.join(
  repositoryRoot,
  ".scratch/custom-matchup-reports/sepsira-six-swarms-vs-fane-v1",
);

function argumentValue(name, fallback = "") {
  const prefix = `--${name}=`;
  const argument = process.argv.find((value) => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : fallback;
}

const routeId = argumentValue("route-id", "ticket07-score");
const subjectRosterKey = argumentValue(
  "subject-roster-key",
  "necrofactorium_master-necrosurgeon-sepsira_dd9d1c850a8c",
);
const challengerRosterKey = argumentValue(
  "challenger-roster-key",
  "fane-of-nyrro_hysene-the-executioner_9f7ff06af218",
);
const challengerLeaderPieceKey = argumentValue(
  "challenger-leader-piece-key",
  "player2_hysene_the_executioner_1_1",
);
const scenarioTerrainSetupClassKey = argumentValue(
  "scenario-terrain-setup-class-key",
  "all_selected_from_single_candidate",
);
const fixturePath = path.join(
  evidenceRoot,
  `${routeId}-forward-route-fixture-v1.json`,
);
const openingFixturePath = path.join(
  evidenceRoot,
  `${routeId}-opening-fixture-v1.json`,
);
const progressPath = path.join(
  evidenceRoot,
  `${routeId}-forward-progress-v1.json`,
);

const pieceKeys = Object.freeze({
  hysene: challengerLeaderPieceKey,
  sepsira: "player1_master_necrosurgeon_sepsira_1_1",
});
const groupKeys = Object.freeze({
  left40: "player1_mechanithrall_brutes_24",
  right40: "player1_necrosurgeon_initiates_20",
});

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function fileHash(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function sourcePool(poolKey, section, sourceContentHash, sourceSchemaVersion) {
  return {
    poolKey,
    lists: section.rosters,
    sourceContentHash,
    sourceSchemaVersion,
    exactListLegality: section.quality.exactListLegality,
    forceBuilderContract: section.algorithm.finalLegality,
    remoteVersion: section.source.remoteVersion,
    exhaustiveAllFactionRosters: false,
  };
}

function materializeOpening() {
  const report = readJson(path.join(evidenceRoot, "report.json"));
  const poolPath = path.join(evidenceRoot, "goal-conditioned-roster-pool.json");
  const pool = readJson(poolPath);
  assert.ok(pool.subjectPool.rosters.some((roster) =>
    roster.key === subjectRosterKey), `Missing subject roster ${subjectRosterKey}`);
  assert.ok(pool.challengerPool.rosters.some((roster) =>
    roster.key === challengerRosterKey), `Missing challenger roster ${challengerRosterKey}`);
  const { loadedRoomStore, templateRoom } =
    loadWarmachineMatchupTemplateRoomV1();
  const templateHash = createHash("sha256").update(JSON.stringify({
    roomStoreContentHash: loadedRoomStore.contentHash,
    roomId: templateRoom.id,
    shapes: templateRoom.shapes,
    deployments: templateRoom.deployments,
  })).digest("hex");
  const materializationContractHash = stableGraphHash({
    schemaVersion: "ticket07_score_opening_materialization_contract_v1",
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    routeId,
    subjectRosterKey,
    challengerRosterKey,
    challengerLeaderPieceKey,
    scenarioTerrainSetupClassKey,
    task: report.task,
    poolContentHash: fileHash(poolPath),
    templateHash,
    implementationHashes: {
      representativeOpeningMaterializer: fileHash(path.join(
        repositoryRoot,
        "src/matchup/representative-opening-materializer-v1.mjs",
      )),
      openingBinders: fileHash(path.join(
        repositoryRoot,
        "src/matchup/steamroller-opening-binders-v1.mjs",
      )),
      openingMapTemplate: fileHash(path.join(
        repositoryRoot,
        "src/matchup/steamroller-opening-map-template-v1.mjs",
      )),
      templateLoader: fileHash(path.join(
        repositoryRoot,
        "scripts/load-matchup-template-room-v1.mjs",
      )),
    },
  });
  if (fs.existsSync(openingFixturePath)) {
    const cached = readJson(openingFixturePath);
    if (cached.schemaVersion === "ticket07_score_opening_fixture_v1" &&
        cached.materializationContractHash === materializationContractHash) {
      return {
        opening: cached.opening,
        materializationHash: cached.materializationHash,
        materializationCacheHit: true,
      };
    }
  }
  const result = materializeWarmachineRepresentativeOpeningsV1({
    task: report.task,
    poolsByTaskSideKey: {
      subject: sourcePool(
        report.task.sides.subject.sourcePoolKey,
        pool.subjectPool,
        fileHash(poolPath),
        pool.schemaVersion,
      ),
      challenger: sourcePool(
        report.task.sides.challenger.sourcePoolKey,
        pool.challengerPool,
        fileHash(poolPath),
        pool.schemaVersion,
      ),
    },
    openingTasks: [{
      subjectRosterKey,
      challengerRosterKey,
      pairReason: `${routeId}_route_existence_witness`,
      scenarioKey: "two_fronts",
      mapKey: "mixed_table",
      firstPlayerTaskSideKey: "challenger",
      deploymentSeedKey: "balanced",
      scenarioTerrainSetupClassKey,
    }],
    resolveExactMapTemplate: (row) =>
      buildWarmachineSteamrollerOpeningMapTemplateV1({
        templateRoom,
        baseTemplateHash: templateHash,
        mapKey: row.mapKey,
        scenarioKey: row.scenarioKey,
        firstPlayerSideKey: "player2",
        scenarioTerrainSetupClassKey: row.scenarioTerrainSetupClassKey,
      }),
    scenarioBindersByKey: buildWarmachineSteamrollerFallbackOpeningBindersV1(),
    includeFullStates: true,
    maximumMaterializedOpenings: 1,
  });
  assert.equal(result.strictOpeningCount, 1, JSON.stringify(result.rejected, null, 2));
  assert.equal(result.strictRejectedCount, 0, JSON.stringify(result.rejected, null, 2));
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const fixture = stableGraphValue({
    schemaVersion: "ticket07_score_opening_fixture_v1",
    materializationContractHash,
    materializationHash: result.materializationHash,
    opening: result.openings[0],
  });
  const temporaryPath = `${openingFixturePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(fixture)}\n`);
  fs.renameSync(temporaryPath, openingFixturePath);
  return {
    opening: result.openings[0],
    materializationHash: result.materializationHash,
    materializationCacheHit: false,
  };
}

function piece(state, pieceKey) {
  const result = (state.pieces || []).find((candidate) =>
    candidate.pieceKey === pieceKey);
  assert.ok(result, `Missing piece ${pieceKey}`);
  return result;
}

function groupMembers(state, groupKey) {
  const members = (state.pieces || []).filter((candidate) =>
    candidate.unitGroupId === groupKey || candidate.unitId === groupKey)
    .sort((left, right) => left.pieceKey.localeCompare(right.pieceKey));
  assert.equal(members.length > 0, true, `Missing group ${groupKey}`);
  return members;
}

function deploymentRectangles(state) {
  return Object.fromEntries((state.deploymentZones || []).map((zone) => [
    zone.zoneKey || zone.deploymentZoneKey,
    {
      id: zone.zoneKey || zone.deploymentZoneKey,
      x: Number(zone.xIn ?? zone.x),
      y: Number(zone.yIn ?? zone.y),
      width: Number(zone.widthIn ?? zone.width),
      height: Number(zone.heightIn ?? zone.height),
    },
  ]));
}

function stripTransientMovementPaths(stateInput = {}) {
  const state = structuredClone(stateInput);
  delete state.explicitMovementPaths;
  for (const entry of state.pieces || []) {
    delete entry.explicitMovementPaths;
    if (entry.metadata && typeof entry.metadata === "object") {
      delete entry.metadata.explicitMovementPaths;
    }
  }
  return normalizeRulesV1State(state);
}

function assertGameStateReceiptChain(initialState, finalState, receipts, label) {
  let expectedHash = warmachineBenchmarkGameStateHashV2(initialState);
  receipts.forEach((receipt, stepIndex) => {
    assert.equal(receipt.gameStateHashInput, expectedHash, JSON.stringify({
      label,
      stepIndex,
      reason: "game_state_receipt_input_chain_mismatch",
      expectedHash,
      observedHash: receipt.gameStateHashInput,
      actionKey: receipt.actionKey,
    }, null, 2));
    assert.equal(typeof receipt.gameStateHashBefore, "string");
    assert.equal(receipt.gameStateHashBefore.length > 0, true);
    expectedHash = receipt.gameStateHashAfter;
  });
  assert.equal(expectedHash, warmachineBenchmarkGameStateHashV2(finalState),
    JSON.stringify({
      label,
      reason: "game_state_receipt_final_chain_mismatch",
      expectedHash,
      observedHash: warmachineBenchmarkGameStateHashV2(finalState),
    }, null, 2));
}

function injectFrontDeployment(openingState) {
  const xCandidates = Array.from({ length: 47 }, (_, index) => index + 1)
    .sort((left, right) => Math.abs(left - 35) - Math.abs(right - 35) ||
      left - right);
  for (const xIn of xCandidates) {
    const state = structuredClone(openingState);
    piece(state, pieceKeys.hysene).position = { xIn, yIn: 5 };
    for (const yIn of [38, 38.25, 38.5, 39, 39.5, 40]) {
      const sepsiraXCandidates = Array.from({ length: 93 }, (_, index) =>
        1 + index * 0.5).sort((left, right) =>
        Math.abs(left - 15.5) - Math.abs(right - 15.5) || left - right);
      for (const sepsiraXIn of sepsiraXCandidates) {
        const candidate = structuredClone(state);
        piece(candidate, pieceKeys.sepsira).position = {
          xIn: sepsiraXIn,
          yIn,
        };
        const normalized = normalizeRulesV1State(candidate);
        if (!auditRulesV1StaticPlacement(normalized).ok ||
            !auditRulesV1StaticUnitFormation(normalized).ok) continue;
        const deployment = auditWarmachineLegalDeploymentReachabilityV1(normalized, {
          firstPlayerSideKey: "player2",
          deployments: deploymentRectangles(normalized),
        });
        if (!deployment.ok) continue;
        return {
          state: normalized,
          deployment,
          hysenePosition: { xIn, yIn: 5 },
          sepsiraPosition: { xIn: sepsiraXIn, yIn },
        };
      }
    }
  }
  assert.fail("No strict front deployment slots for Hysene and Sepsira");
}

function baseRadius(model = {}) {
  return Number(model.baseDiameterIn || model.baseSizeIn || 1.2) / 2;
}

function objective(state, objectiveKey) {
  const result = state.scenario?.objectives?.find((entry) =>
    entry.objectiveKey === objectiveKey);
  assert.ok(result, `Missing objective ${objectiveKey}`);
  return result;
}

function placeUnitNearObjective(state, groupKey, objectiveKey, seed = 0) {
  const members = groupMembers(state, groupKey);
  const target = objective(state, objectiveKey);
  const original = members.map((model) => structuredClone(model.position));
  const ringRadius = Number(target.baseRadiusIn) +
    Math.max(...members.map(baseRadius)) + 0.15;
  for (let rotation = 0; rotation < 48; rotation += 1) {
    const offset = (seed + rotation) * Math.PI / 24;
    const slots = buildUnitRingSlotsV1({
      center: target,
      radiusIn: ringRadius,
      modelCount: members.length,
      offsetRadians: offset,
    });
    const candidates = rankUnitRingTrajectoryAssignmentsV1({ members, slots });
    for (const candidate of candidates) {
      if (!candidate.trajectoryAudit.ok) continue;
      members.forEach((model) => {
        model.position = structuredClone(
          candidate.destinationsByPieceKey[model.pieceKey],
        );
      });
      if (auditRulesV1StaticPlacement(state).ok &&
          auditRulesV1StaticUnitFormation(state).ok) {
        return candidate.destinationsByPieceKey;
      }
    }
    members.forEach((model, index) => {
      model.position = structuredClone(original[index]);
    });
  }
  members.forEach((model, index) => {
    model.position = original[index];
  });
  assert.fail(`No strict objective placement for ${groupKey}`);
}

function placeSoloNearObjective(state, pieceKey, objectiveKey, seed = 0) {
  const model = piece(state, pieceKey);
  const target = objective(state, objectiveKey);
  const original = structuredClone(model.position);
  const ringRadius = Number(target.baseRadiusIn) + baseRadius(model) + 0.1;
  for (let index = 0; index < 48; index += 1) {
    const angle = (seed + index) * Math.PI / 24;
    model.position = {
      xIn: Number(target.xIn) + Math.cos(angle) * ringRadius,
      yIn: Number(target.yIn) + Math.sin(angle) * ringRadius,
    };
    if (auditRulesV1StaticPlacement(state).ok) {
      return structuredClone(model.position);
    }
  }
  model.position = original;
  assert.fail(`No strict objective placement for ${pieceKey}`);
}

function legalPathProposal(state, actorPieceKey, actionType, destination, ignoredPieceKeys = []) {
  const plan = buildRulesV1MovementPathProposalPlan(state, {
    actorPieceKey,
    actionType,
    destination,
    ignoredPieceKeys,
    keyBase: `ticket07-preflight:${actorPieceKey}`,
  });
  return plan.proposals.find((candidate) =>
    candidate.proposalKind === "host_auto_routed" &&
    candidate.precheckPassed === true) ||
    plan.proposals.find((candidate) => candidate.precheckPassed === true) || null;
}

function setPositions(state, positionsByPieceKey) {
  for (const [pieceKey, position] of Object.entries(positionsByPieceKey)) {
    piece(state, pieceKey).position = structuredClone(position);
  }
}

function selectSepsiraTwoTurnTarget(openingState, {
  left40,
  right40,
  hysene,
}) {
  const start = structuredClone(piece(openingState, pieceKeys.sepsira).position);
  const xOffsets = [0, -2, 2, -4, 4, -6, 6, -8, 8];
  const yOffsets = [0, 1, -1, 2, -2, 3, -3];
  const rejected = [];
  for (const yOffset of yOffsets) {
    for (const xOffset of xOffsets) {
      const destination = { xIn: 24 + xOffset, yIn: 31 + yOffset };
      const firstState = structuredClone(openingState);
      setPositions(firstState, destinationsForFraction(firstState, left40, 0.5));
      setPositions(firstState, destinationsForFraction(firstState, right40, 0.5));
      piece(firstState, pieceKeys.hysene).position = interpolate(
        piece(firstState, pieceKeys.hysene).position,
        hysene,
        1 / 3,
      );
      const firstDestination = interpolate(start, destination, 0.5);
      const firstProposal = legalPathProposal(
        normalizeRulesV1State(firstState),
        pieceKeys.sepsira,
        "run",
        firstDestination,
        [pieceKeys.sepsira],
      );
      if (!firstProposal) {
        rejected.push({ destination, stage: "player1_turn_1" });
        continue;
      }

      const secondState = structuredClone(openingState);
      setPositions(secondState, left40);
      setPositions(secondState, right40);
      piece(secondState, pieceKeys.hysene).position = interpolate(
        piece(secondState, pieceKeys.hysene).position,
        hysene,
        2 / 3,
      );
      piece(secondState, pieceKeys.sepsira).position = firstDestination;
      const secondProposal = legalPathProposal(
        normalizeRulesV1State(secondState),
        pieceKeys.sepsira,
        "run",
        destination,
        [pieceKeys.sepsira],
      );
      if (!secondProposal) {
        rejected.push({ destination, stage: "player1_turn_2" });
        continue;
      }
      const finalState = structuredClone(secondState);
      piece(finalState, pieceKeys.sepsira).position = destination;
      if (!auditRulesV1StaticPlacement(finalState).ok ||
          !auditRulesV1StaticUnitFormation(finalState).ok) {
        rejected.push({ destination, stage: "final_static" });
        continue;
      }
      return {
        destination,
        firstProposalKind: firstProposal.proposalKind,
        secondProposalKind: secondProposal.proposalKind,
        rejectedCandidateCount: rejected.length,
      };
    }
  }
  assert.fail(JSON.stringify({
    reason: "no_two_turn_strict_sepsira_target",
    rejected,
  }, null, 2));
}

function buildTargetPositions(openingState) {
  const targetState = structuredClone(openingState);
  const left40 = placeUnitNearObjective(
    targetState,
    groupKeys.left40,
    "left-40",
  );
  const right40 = placeUnitNearObjective(
    targetState,
    groupKeys.right40,
    "right-40",
    8,
  );
  const hysene = placeSoloNearObjective(
    targetState,
    pieceKeys.hysene,
    "left-50",
    12,
  );
  const sepsiraTarget = selectSepsiraTwoTurnTarget(openingState, {
    left40,
    right40,
    hysene,
  });
  piece(targetState, pieceKeys.sepsira).position = sepsiraTarget.destination;
  assert.equal(auditRulesV1StaticPlacement(targetState).ok, true);
  assert.equal(auditRulesV1StaticUnitFormation(targetState).ok, true);
  return {
    left40,
    right40,
    hysene,
    sepsira: sepsiraTarget.destination,
    sepsiraPreflight: sepsiraTarget,
  };
}

function interpolate(start, end, fraction) {
  return {
    xIn: Number(start.xIn) + (Number(end.xIn) - Number(start.xIn)) * fraction,
    yIn: Number(start.yIn) + (Number(end.yIn) - Number(start.yIn)) * fraction,
  };
}

function destinationsForFraction(state, finalByPieceKey, fraction) {
  return Object.fromEntries(Object.entries(finalByPieceKey).map(([pieceKey, end]) => [
    pieceKey,
    interpolate(piece(state, pieceKey).position, end, fraction),
  ]));
}

function strictPath(state, actorPieceKey, actionType, destination, ignoredPieceKeys, keyBase) {
  const plan = buildRulesV1MovementPathProposalPlan(state, {
    actorPieceKey,
    actionType,
    destination,
    ignoredPieceKeys,
    keyBase,
  });
  const proposal = plan.proposals.find((candidate) =>
    candidate.proposalKind === "host_auto_routed" &&
    candidate.precheckPassed === true) ||
    plan.proposals.find((candidate) => candidate.precheckPassed === true);
  assert.ok(proposal, JSON.stringify({
    actorPieceKey,
    actionType,
    destination,
    failedProposalCount: plan.proposals.length,
    proposals: plan.proposals,
  }, null, 2));
  return proposal.waypoints;
}

function prepareMovement(state, {
  groupKey,
  destinationsByPieceKey,
  actionType = "run",
  pathKey,
}) {
  const actorPieceKeys = groupKey.includes("player1_") || groupKey.includes("player2_")
    ? (state.pieces || []).filter((model) =>
      model.pieceKey === groupKey || model.unitGroupId === groupKey ||
      model.unitId === groupKey).map((model) => model.pieceKey).sort()
    : [];
  assert.equal(actorPieceKeys.length > 0, true, `No actors for ${groupKey}`);
  const pathsByModel = actorPieceKeys.map((actorPieceKey) => ({
    pieceKey: actorPieceKey,
    waypoints: strictPath(
      state,
      actorPieceKey,
      actionType,
      destinationsByPieceKey[actorPieceKey],
      actorPieceKeys,
      `${pathKey}:${actorPieceKey}`,
    ),
  }));
  const actorPieceKey = actorPieceKeys[0];
  const isUnit = actorPieceKeys.length > 1;
  const bound = bindWarmachineBenchmarkExplicitMovementPathV2(state, {
    actorPieceKey,
    actionType,
    pathKey,
    waypoints: pathsByModel[0].waypoints,
    ...(isUnit ? { pathsByModel } : {}),
    proposalSource: "ticket07_score_forward_route_v1",
  });
  return {
    state: bound,
    actorPieceKey,
    actorPieceKeys,
    actionKey: isUnit
      ? `${actorPieceKey}:${actionType}-unit-path:${pathKey}:v1`
      : `${actorPieceKey}:${actionType}-path:${pathKey}:v1`,
    pathsByModel,
  };
}

function executeMovementActivation(state, plan, routeKey) {
  const prepared = prepareMovement(state, plan);
  const firstScope = {
    activationGroupKey: plan.groupKey,
    actionFamilyKeys: ["movement", "timing", "resource"],
    movementPathKindKeys: ["explicit_path"],
  };
  const firstEnumeration = enumerateWarmachineBenchmarkActionsV2(
    prepared.state,
    firstScope,
  );
  const expectedAction = firstEnumeration.enumeration.actions.find((action) =>
    action.actionKey === prepared.actionKey);
  const matchingRejectedAction = firstEnumeration.enumeration.rejectedActions.find(
    (action) => action.actionKey === prepared.actionKey,
  );
  assert.ok(expectedAction, JSON.stringify({
    label: "ticket07_explicit_movement_action_preflight",
    groupKey: plan.groupKey,
    expectedActionKey: prepared.actionKey,
    legalActionKeys: firstEnumeration.enumeration.actions.map((action) =>
      action.actionKey),
    matchingRejectedAction: matchingRejectedAction ? {
      actionKey: matchingRejectedAction.actionKey,
      reason: matchingRejectedAction.metadata?.rejection?.reason || null,
      issues: matchingRejectedAction.metadata?.rejection?.issues || null,
      failedChecks: matchingRejectedAction.legality?.checks?.filter((check) =>
        check.status === "failed") || [],
    } : null,
    explicitMovementRejectedActions:
      firstEnumeration.enumeration.rejectedActions.filter((action) =>
        /unit-path|path:/.test(String(action.actionKey || ""))).slice(0, 20),
  }, null, 2));
  const activation = executeWarmachineBenchmarkActivationV2(
    prepared.state,
    plan.groupKey,
    {
      routeKey,
      maxSteps: 12,
      enumerationScopeForStep: ({ stepIndex }) => stepIndex === 0
        ? {
          actionFamilyKeys: ["movement", "timing", "resource"],
          movementPathKindKeys: ["explicit_path"],
        }
        : {},
      selectAction: ({ scoped, stepIndex }) => stepIndex === 0
        ? scoped.enumeration.actions.find((action) =>
          action.actionKey === prepared.actionKey) || null
        : null,
    },
  );
  assert.equal(activation.ok, true, JSON.stringify({
    groupKey: plan.groupKey,
    expectedActionKey: prepared.actionKey,
    reason: activation.reason,
    audit: activation.selectionAudit,
  }, null, 2));
  assert.equal(
    activation.selectionAudit.some((row) =>
      row.selectedAction.actionKey === prepared.actionKey),
    true,
  );
  return {
    ...activation,
    state: stripTransientMovementPaths(activation.state),
    movementEvidence: {
      groupKey: plan.groupKey,
      actionKey: prepared.actionKey,
      pathsByModel: prepared.pathsByModel,
    },
  };
}

function runMovementActionPreflight(openingState, targets) {
  const p2Control = executeWarmachineBenchmarkControlPhaseV2(openingState, {
    routeKey: "ticket07-score-action-preflight:p2-control",
  });
  assert.equal(p2Control.ok, true, JSON.stringify(p2Control.failures, null, 2));
  const hysenePlan = routeMovementPlans(
    p2Control.state,
    targets,
    "player2",
    1,
  )[0];
  const hyseneActivation = executeMovementActivation(
    p2Control.state,
    hysenePlan,
    "ticket07-score-action-preflight:hysene",
  );
  const p2EndInput = stripTransientMovementPaths(hyseneActivation.state);
  for (const model of p2EndInput.pieces || []) {
    model.activated = model.sideKey === "player2";
  }
  const p2End = executeWarmachineBenchmarkActionV2(
    normalizeRulesV1State(p2EndInput),
    { actionType: "end_turn" },
    {
      routeKey: "ticket07-score-action-preflight:p2-end",
      enumerationScope: {
        actionFamilyKeys: ["timing"],
        includeActorlessActions: true,
      },
    },
  );
  assert.equal(p2End.ok, true, JSON.stringify(p2End, null, 2));
  const p1Control = executeWarmachineBenchmarkControlPhaseV2(p2End.state, {
    routeKey: "ticket07-score-action-preflight:p1-control",
  });
  assert.equal(p1Control.ok, true, JSON.stringify(p1Control.failures, null, 2));
  let state = p1Control.state;
  const movementEvidence = [hyseneActivation.movementEvidence];
  for (const plan of routeMovementPlans(state, targets, "player1", 1)) {
    const activation = executeMovementActivation(
      state,
      plan,
      `ticket07-score-action-preflight:${plan.groupKey}`,
    );
    state = activation.state;
    movementEvidence.push(activation.movementEvidence);
  }
  return stableGraphValue({
    schemaVersion: "ticket07_score_movement_action_preflight_v1",
    movementActionCount: movementEvidence.length,
    movementEvidence,
    endingStateHash: stableGraphHash(state),
  });
}

function executeTurn(stateInput, { routeKey, movementPlans = [] }) {
  const control = executeWarmachineBenchmarkControlPhaseV2(stateInput, {
    routeKey: `${routeKey}:control`,
  });
  assert.equal(control.ok, true, JSON.stringify(control.failures, null, 2));
  let state = control.state;
  const plannedActivations = [];
  const passActivations = [];
  const receipts = [...control.receipts];
  const activatedGroupKeys = [];
  for (const plan of movementPlans) {
    const activation = executeMovementActivation(
      state,
      plan,
      `${routeKey}:${plan.groupKey}`,
    );
    state = activation.state;
    plannedActivations.push(activation);
    activatedGroupKeys.push(plan.groupKey);
    receipts.push(...activation.receipts);
  }
  while (true) {
    const group = buildWarmachineActivationGroups(state)[0];
    if (!group) break;
    const activation = executeWarmachineBenchmarkActivationV2(
      state,
      group.groupKey,
      {
        routeKey: `${routeKey}:pass:${passActivations.length}`,
        enumerationScope: { actionFamilyKeys: ["timing"] },
        intent: { completionOnly: true, avoidFeat: true },
      },
    );
    assert.equal(activation.ok, true, JSON.stringify({
      groupKey: group.groupKey,
      reason: activation.reason,
      audit: activation.selectionAudit,
    }, null, 2));
    assert.equal(activation.selectionAudit.every((row) =>
      /pass|end_|complete|forfeit|skip|decline_|resolve_|choose_|continue/i.test(
        String(row.selectedAction?.actionType || ""),
      )), true, JSON.stringify({
      groupKey: group.groupKey,
      selectionAudit: activation.selectionAudit,
    }, null, 2));
    state = activation.state;
    passActivations.push(activation);
    activatedGroupKeys.push(group.groupKey);
    receipts.push(...activation.receipts);
  }
  const preEndState = state;
  const endTurn = executeWarmachineBenchmarkActionV2(
    preEndState,
    { actionType: "end_turn" },
    {
      routeKey: `${routeKey}:end-turn`,
      enumerationScope: {
        actionFamilyKeys: ["timing"],
        includeActorlessActions: true,
      },
    },
  );
  assert.equal(endTurn.ok, true, JSON.stringify(endTurn, null, 2));
  receipts.push(endTurn.receipt);
  assertGameStateReceiptChain(stateInput, endTurn.state, receipts, routeKey);
  return {
    control,
    plannedActivations,
    passActivations,
    activatedGroupKeys,
    preEndState,
    endTurn,
    state: endTurn.state,
    receipts,
  };
}

function routeMovementPlans(state, targets, sideKey, turnNumber) {
  if (sideKey === "player2") {
    const remainingTurns = 4 - turnNumber;
    return [{
      groupKey: pieceKeys.hysene,
      destinationsByPieceKey: {
        [pieceKeys.hysene]: interpolate(
          piece(state, pieceKeys.hysene).position,
          targets.hysene,
          1 / remainingTurns,
        ),
      },
      pathKey: `ticket07-hysene-turn-${turnNumber}-run`,
    }];
  }
  const remainingTurns = 3 - turnNumber;
  return [
    {
      groupKey: groupKeys.left40,
      destinationsByPieceKey: destinationsForFraction(
        state,
        targets.left40,
        1 / remainingTurns,
      ),
      pathKey: `ticket07-left40-turn-${turnNumber}-run`,
    },
    {
      groupKey: groupKeys.right40,
      destinationsByPieceKey: destinationsForFraction(
        state,
        targets.right40,
        1 / remainingTurns,
      ),
      pathKey: `ticket07-right40-turn-${turnNumber}-run`,
    },
    {
      groupKey: pieceKeys.sepsira,
      destinationsByPieceKey: {
        [pieceKeys.sepsira]: interpolate(
          piece(state, pieceKeys.sepsira).position,
          targets.sepsira,
          1 / remainingTurns,
        ),
      },
      pathKey: `ticket07-sepsira-turn-${turnNumber}-run`,
    },
  ];
}

function terminalEvents(stage) {
  return stage.receipts.flatMap((receipt) => receipt.events || [])
    .filter((event) => event.eventType === "terminal");
}

function scoreRows(stage) {
  return stage.receipts.flatMap((receipt) => receipt.events || [])
    .filter((event) => event.eventType === "scenario_score");
}

function compactStage(stage) {
  return {
    control: { state: stripTransientMovementPaths(stage.control.state) },
    plannedActivations: stage.plannedActivations.map((activation) => ({
      activationGroupKey: activation.movementEvidence.groupKey,
      state: stripTransientMovementPaths(activation.state),
      movementEvidence: activation.movementEvidence,
    })),
    activatedGroupKeys: stage.activatedGroupKeys,
    preEndState: stripTransientMovementPaths(stage.preEndState),
    state: stripTransientMovementPaths(stage.state),
    scoreRows: scoreRows(stage),
    terminalEvents: terminalEvents(stage),
  };
}

function resumableStage(stage, sideKey, turnNumber) {
  return stableGraphValue({
    schemaVersion: "ticket07_score_forward_resumable_stage_v1",
    sideKey,
    turnNumber,
    control: { state: stripTransientMovementPaths(stage.control.state) },
    plannedActivations: stage.plannedActivations.map((activation) => ({
      activationGroupKey: activation.movementEvidence.groupKey,
      state: stripTransientMovementPaths(activation.state),
      movementEvidence: activation.movementEvidence,
    })),
    activatedGroupKeys: stage.activatedGroupKeys,
    preEndState: stripTransientMovementPaths(stage.preEndState),
    state: stripTransientMovementPaths(stage.state),
    receipts: stage.receipts,
    endTurn: { receipt: stage.endTurn.receipt },
  });
}

function loadForwardProgress(routeContractHash, schedule) {
  if (!fs.existsSync(progressPath)) return null;
  const progress = readJson(progressPath);
  if (progress.schemaVersion !== "ticket07_score_forward_progress_v1" ||
      progress.routeContractHash !== routeContractHash) return null;
  assert.equal(progress.completedStageCount, progress.stages.length);
  assert.equal(progress.completedStageCount <= schedule.length, true);
  progress.stages.forEach((stage, index) => {
    assert.equal(stage.sideKey, schedule[index][0]);
    assert.equal(stage.turnNumber, schedule[index][1]);
  });
  assert.equal(
    stableGraphHash(progress.state),
    progress.currentStateHash,
    "Ticket 07 forward checkpoint state hash drifted",
  );
  return progress;
}

function writeForwardProgress(routeContractHash, stages, state) {
  const progress = stableGraphValue({
    schemaVersion: "ticket07_score_forward_progress_v1",
    routeContractHash,
    completedStageCount: stages.length,
    stages,
    state: stripTransientMovementPaths(state),
    currentStateHash: stableGraphHash(stripTransientMovementPaths(state)),
  });
  const temporaryPath = `${progressPath}.tmp-${process.pid}`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(progress)}\n`);
  fs.renameSync(temporaryPath, progressPath);
}

const {
  opening,
  materializationHash,
  materializationCacheHit,
} = materializeOpening();
assert.equal(opening.modelCount, 113);
assert.equal(opening.scenarioKey, "two_fronts");
assert.equal(opening.firstPlayerTaskSideKey, "challenger");
const injectedOpening = injectFrontDeployment(opening.state);
const targets = buildTargetPositions(injectedOpening.state);
if (process.argv.includes("--preflight-actions")) {
  const preflight = runMovementActionPreflight(injectedOpening.state, targets);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    materializationHash,
    materializationCacheHit,
    injectedOpeningStateHash: injectedOpening.deployment.stateHash,
    preflight,
  }, null, 2)}\n`);
  process.exit(0);
}
const schedule = [
  ["player2", 1],
  ["player1", 1],
  ["player2", 2],
  ["player1", 2],
  ["player2", 3],
];
const routeContractHash = stableGraphHash({
  schemaVersion: "ticket07_score_forward_route_contract_v2",
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  materializationHash,
  injectedOpeningStateHash: injectedOpening.deployment.stateHash,
  targets,
  schedule,
  routeId,
  subjectRosterKey,
  challengerRosterKey,
  challengerLeaderPieceKey,
  routeImplementationVersion: "ticket07_score_forward_explicit_movement_v3",
});
const resumed = loadForwardProgress(routeContractHash, schedule);
let state = resumed?.state || injectedOpening.state;
const stages = resumed?.stages || [];
if (resumed) {
  process.stderr.write(`${JSON.stringify({
    scope: "ticket07_score_forward",
    stage: "checkpoint_resumed",
    completedStageCount: stages.length,
    currentStateHash: resumed.currentStateHash,
  })}\n`);
}
for (let scheduleIndex = stages.length; scheduleIndex < schedule.length;
  scheduleIndex += 1) {
  const [sideKey, turnNumber] = schedule[scheduleIndex];
  assert.equal(state.activeSideKey, sideKey);
  assert.equal(state.turnNumber, turnNumber);
  process.stderr.write(`${JSON.stringify({
    scope: "ticket07_score_forward",
    stage: "turn_started",
    sideKey,
    turnNumber,
    score: state.scenario?.score,
  })}\n`);
  const stage = executeTurn(state, {
    routeKey: `${routeId}:${sideKey}:turn-${turnNumber}`,
    movementPlans: routeMovementPlans(state, targets, sideKey, turnNumber),
  });
  stages.push(resumableStage(stage, sideKey, turnNumber));
  state = stage.state;
  writeForwardProgress(routeContractHash, stages, state);
  process.stderr.write(`${JSON.stringify({
    scope: "ticket07_score_forward",
    stage: "turn_passed",
    sideKey,
    turnNumber,
    score: state.scenario?.score,
    scoreRowCount: scoreRows(stage).length,
    terminalEventCount: terminalEvents(stage).length,
  })}\n`);
}

assert.deepEqual(stages.slice(0, 3).map((stage) => stage.state.scenario.score), [
  { player1: 0, player2: 0 },
  { player1: 0, player2: 0 },
  { player1: 0, player2: 0 },
]);
assert.deepEqual(stages[3].state.scenario.score, { player1: 3, player2: 0 });
assert.equal(stages[4].state.scenario.score.player1, 6);
assert.equal([0, 1].includes(stages[4].state.scenario.score.player2), true);
assert.equal(stages.slice(0, 4).every((stage) =>
  terminalEvents(stage).length === 0), true);
assert.equal(terminalEvents(stages[4]).some((event) =>
  event.winnerSideKey === "player1" &&
  event.reason === "steamroller_2026_lead_three_after_scoring_on_opponent_turn"),
true);
assert.deepEqual(
  scoreRows(stages[3]).map((row) => `${row.sideKey}:${
    row.objectivePieceKey || row.elementType}`).sort(),
  [
    "player1:left-40",
    "player1:right-40",
    "player1:scenario_bonus",
  ],
);
const expectedFinalScoreRows = [
  "player1:left-40",
  "player1:right-40",
  "player1:scenario_bonus",
];
if (stages[4].state.scenario.score.player2 === 1) {
  expectedFinalScoreRows.push("player2:left-50");
}
assert.deepEqual(
  scoreRows(stages[4]).map((row) => `${row.sideKey}:${
    row.objectivePieceKey || row.elementType}`).sort(),
  expectedFinalScoreRows.sort(),
);
const receipts = stages.flatMap((stage) => stage.receipts);
const witness = certifyWarmachineExecutedTerminalRouteStrictV2(
  injectedOpening.state,
  state,
  receipts,
  {
    goalType: "scenario_score",
    winnerSideKey: "player1",
    endingSideKey: "player2",
    scoringSideKey: "player1",
  },
  {
    routeKey: `${routeId}-forward-route-v1`,
    searchMode: "long_horizon",
  },
);
assert.equal(witness.routeExecutionValidated, true, JSON.stringify(witness.issues));
assert.equal(witness.strictWitness, true, JSON.stringify(witness.proof));
assert.equal(witness.proof.absoluteTerminalTime.roundNumber, 3);
assert.equal(witness.proof.absoluteTerminalTime.endingSideKey, "player2");

const compactFixture = stableGraphValue({
  schemaVersion: "ticket07_score_forward_route_fixture_v1",
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  materializationHash,
  routeId,
  subjectRosterKey,
  challengerRosterKey,
  openingKey: opening.openingKey,
  injectedOpeningState: stripTransientMovementPaths(injectedOpening.state),
  injectedOpeningStateHash: injectedOpening.deployment.stateHash,
  targets,
  pieceKeys,
  groupKeys,
  stages: stages.map(compactStage),
  terminalPredecessorState: stripTransientMovementPaths(stages[4].preEndState),
  terminalState: stripTransientMovementPaths(state),
  terminalAction: stableGraphValue(stages[4].endTurn.receipt.persistedAction),
  terminalReceiptHash: stages[4].endTurn.receipt.receiptHash,
  routeReceiptHashes: receipts.map((receipt) => receipt.receiptHash),
  routeWitnessHash: witness.witnessHash,
  scoreTimeline: stages.map((stage, index) => ({
    endingSideKey: ["player2", "player1", "player2", "player1", "player2"][index],
    endingTurnNumber: [1, 1, 2, 2, 3][index],
    score: stage.state.scenario.score,
  })),
});
const fixture = {
  ...compactFixture,
  fixtureHash: stableGraphHash(compactFixture),
};
fs.mkdirSync(path.dirname(fixturePath), { recursive: true });
fs.writeFileSync(fixturePath, `${JSON.stringify(fixture)}\n`);

process.stdout.write(`${JSON.stringify({
  ok: true,
  schemaVersion: "verify_ticket07_score_forward_route_v1",
  routeId,
  subjectRosterKey,
  challengerRosterKey,
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  materializationHash,
  openingKey: opening.openingKey,
  modelCount: opening.modelCount,
  injectedOpeningStateHash: injectedOpening.deployment.stateHash,
  hyseneDeploymentPosition: injectedOpening.hysenePosition,
  movementActivationCount: stages.reduce((count, stage) =>
    count + stage.plannedActivations.length, 0),
  routeTransitionCount: receipts.length,
  scoreTimeline: fixture.scoreTimeline,
  scoringHistory: state.scenario.scoringHistory,
  terminalEvents: terminalEvents(stages[4]),
  routeWitnessHash: witness.witnessHash,
  fixturePath,
  fixtureHash: fixture.fixtureHash,
  claimBoundary: witness.claimBoundary,
}, null, 2)}\n`);
