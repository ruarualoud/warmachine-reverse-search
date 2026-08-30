#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadWarmachineMatchupTemplateRoomV1 } from
  "./load-matchup-template-room-v1.mjs";
import { materializeWarmachineRepresentativeOpeningsV1 } from
  "../src/matchup/representative-opening-materializer-v1.mjs";
import { buildWarmachineSteamrollerFallbackOpeningBindersV1 } from
  "../src/matchup/steamroller-opening-binders-v1.mjs";
import { buildWarmachineSteamrollerOpeningMapTemplateV1 } from
  "../src/matchup/steamroller-opening-map-template-v1.mjs";
import { stableGraphHash, stableGraphValue } from
  "../src/graph/typed-facts-v2.mjs";
import {
  bindWarmachineBenchmarkExplicitMovementPathV2,
  buildWarmachineBenchmarkMaximumStrictRollOutcomeV2,
  executeWarmachineBenchmarkActivationV2,
  executeWarmachineBenchmarkControlPhaseV2,
  executeWarmachineBenchmarkTurnV2,
} from "../src/benchmark/fixed-steamroller-benchmark-v2.mjs";
import {
  auditRulesV1StaticPlacement,
  auditRulesV1StaticUnitFormation,
  buildRulesV1MovementPathProposalPlan,
  normalizeRulesV1State,
  warmachineHost,
} from "../src/warmachine-host-runtime.mjs";
import { auditWarmachineLegalDeploymentReachabilityV1 } from
  "../src/reverse/deployment-reachability-v1.mjs";
import { searchWarmachineMaterializedTerminalRootToDeploymentV1 } from
  "../src/reverse/materialized-terminal-root-to-deployment-v1.mjs";
import { reverseWarmachineActivationSequenceV2 } from
  "../src/reverse/activation-sequence-predecessor-v2.mjs";
import { generateWarmachineControlPhasePredecessorsV1 } from
  "../src/reverse/control-phase-predecessor-v1.mjs";
import { generateWarmachineMovementActivationPredecessorsV1 } from
  "../src/reverse/movement-activation-predecessor-v1.mjs";
import { generateWarmachinePreviousTurnEndPredecessorsV1 } from
  "../src/reverse/previous-turn-end-predecessor-v1.mjs";
import { buildWarmachineActivationSequenceOptionsV1 } from
  "../src/reverse/terminal-rooted-to-deployment-v1.mjs";
import { warmachineReverseStateSemanticHashV1 } from
  "../src/reverse/terminal-event-predecessor-v1.mjs";
import { buildWarmachineTerminalHypothesisDomainV1 } from
  "../src/reverse/terminal-hypothesis-v1.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceRoot = path.join(
  repositoryRoot,
  ".scratch/custom-matchup-reports/sepsira-six-swarms-vs-fane-v1",
);
const productionPlanHash =
  "764d6d6439e3933da3284b93316f729c85b951ef0637b42763399a3434e98b87";
const preflightFixturePath = path.join(
  evidenceRoot,
  "ticket06-short-route-preflight-fixture-v1.json",
);
const compactRouteEvidencePath = path.join(
  repositoryRoot,
  "scripts/fixtures/ticket06-short-route-evidence-v1.json",
);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function fileHash(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function semanticDifferenceRows(left, right, pathKey = "", rows = [], limit = 24) {
  if (rows.length >= limit || Object.is(left, right)) return rows;
  if (typeof left !== typeof right || left === null || right === null ||
      typeof left !== "object") {
    rows.push({ pathKey, candidate: left, expected: right });
    return rows;
  }
  for (const key of [...new Set([
    ...Object.keys(left),
    ...Object.keys(right),
  ])].filter((entry) => entry !== "stateKey").sort()) {
    semanticDifferenceRows(
      left[key],
      right[key],
      pathKey ? `${pathKey}.${key}` : key,
      rows,
      limit,
    );
    if (rows.length >= limit) break;
  }
  return rows;
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

function compactTicket06Witness(witness) {
  const compactStage = (stage) => {
    const preEndState = stage.preEndState || stage.turn.preEndState;
    return {
      control: { state: stripTransientMovementPaths(stage.control.state) },
      plannedActivations: stage.plannedActivations.map((activation) => ({
        activationGroupKey: activation.activationGroupKey,
        state: stripTransientMovementPaths(activation.state),
      })),
      turn: {
        activatedGroupKeys: stage.turn.activatedGroupKeys,
        state: stripTransientMovementPaths(stage.turn.state),
      },
      preEndState: stripTransientMovementPaths(preEndState),
      state: stripTransientMovementPaths(stage.state),
    };
  };
  return {
    state: stripTransientMovementPaths(witness.state),
    preTerminalState: stripTransientMovementPaths(witness.preTerminalState),
    attack: {
      receipts: witness.attack.receipts,
      selectionAudit: witness.attack.selectionAudit,
    },
    stages: {
      p2TurnOne: compactStage(witness.stages.p2TurnOne),
      p1TurnOne: compactStage(witness.stages.p1TurnOne),
      p2Control: { state: stripTransientMovementPaths(witness.stages.p2Control.state) },
    },
    pieceKeys: witness.pieceKeys,
  };
}

function loadOrBuildTicket06PreflightWitness({
  injectedOpening,
  materializationHash,
}) {
  const expectedContract = {
    schemaVersion: "ticket06_short_route_preflight_fixture_v1",
    historyBindingProjection: "pre_end_state_v2",
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    materializationHash,
    injectedOpeningStateHash: injectedOpening.deployment.stateHash,
    injectedOpeningSemanticStateHash:
      warmachineReverseStateSemanticHashV1(injectedOpening.state),
  };
  if (fs.existsSync(preflightFixturePath)) {
    const fixture = readJson(preflightFixturePath);
    const witnessHash = stableGraphHash(fixture.witness);
    if (Object.entries(expectedContract).every(([key, value]) => fixture[key] === value) &&
        fixture.witnessHash === witnessHash) {
      return {
        witness: compactTicket06Witness(fixture.witness),
        source: "receipt_bound_fixture",
      };
    }
  }
  const witness = compactTicket06Witness(executeForwardWitness(injectedOpening.state, {
    laneX: injectedOpening.laneX,
    sepsiraMovementDestination: injectedOpening.sepsiraMovementDestination,
    vordakPieceKey: injectedOpening.vordakPieceKey,
  }));
  const fixture = {
    ...expectedContract,
    witness,
    witnessHash: stableGraphHash(witness),
  };
  fs.mkdirSync(path.dirname(preflightFixturePath), { recursive: true });
  fs.writeFileSync(preflightFixturePath, `${JSON.stringify(fixture)}\n`);
  return { witness, source: "fresh_strict_forward_witness" };
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
  const productionRuntime = readJson(path.join(
    evidenceRoot,
    "terminal-root-batch-v1/plans",
    productionPlanHash,
    "opening-batch-runtime.json",
  ));
  const sourceOpening = productionRuntime.openings.find((opening) =>
    opening.scenarioKey === "two_fronts" && opening.modelCount === 78 &&
    opening.firstPlayerTaskSideKey === "challenger");
  assert.ok(sourceOpening, "Ticket 06 source roster opening is missing");

  const { loadedRoomStore, templateRoom } =
    loadWarmachineMatchupTemplateRoomV1();
  const templateHash = createHash("sha256").update(JSON.stringify({
    roomStoreContentHash: loadedRoomStore.contentHash,
    roomId: templateRoom.id,
    shapes: templateRoom.shapes,
    deployments: templateRoom.deployments,
  })).digest("hex");
  const openingTask = {
    subjectRosterKey: sourceOpening.subjectRosterKey,
    challengerRosterKey: sourceOpening.challengerRosterKey,
    pairReason: "ticket06_short_strict_existence_witness",
    scenarioKey: "two_fronts",
    mapKey: "mixed_table",
    firstPlayerTaskSideKey: "challenger",
    deploymentSeedKey: "balanced",
    scenarioTerrainSetupClassKey: sourceOpening.scenarioTerrainSetupClassKey,
  };
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
    openingTasks: [openingTask],
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
  return { opening: result.openings[0], materializationHash: result.materializationHash };
}

function relevantPieces(state = {}) {
  const leaders = (state.pieces || []).filter((piece) =>
    piece.isWarcaster === true || piece.isWarlock === true);
  const anchors = new Set(leaders.map((piece) => piece.pieceKey));
  for (const piece of state.pieces || []) {
    if (piece.sideKey === "player2" && /vordak/i.test(String(piece.cardName || piece.label))) {
      anchors.add(piece.pieceKey);
    }
  }
  const anchorPieces = (state.pieces || []).filter((piece) => anchors.has(piece.pieceKey));
  return (state.pieces || []).filter((piece) => anchorPieces.some((anchor) =>
    piece.sideKey === anchor.sideKey && Math.hypot(
      Number(piece.position?.xIn) - Number(anchor.position?.xIn),
      Number(piece.position?.yIn) - Number(anchor.position?.yIn),
    ) <= 14)).map((piece) => ({
    pieceKey: piece.pieceKey,
    sideKey: piece.sideKey,
    unitGroupId: String(piece.unitGroupId || ""),
    label: String(piece.cardName || piece.label || piece.pieceKey),
    position: piece.position,
    baseSizeIn: Number(piece.baseSizeIn || 0),
    speedIn: Number(piece.speedIn || 0),
    isLeader: piece.isWarcaster === true || piece.isWarlock === true,
  })).sort((left, right) => left.sideKey.localeCompare(right.sideKey) ||
    left.position.yIn - right.position.yIn ||
    left.position.xIn - right.position.xIn ||
    left.pieceKey.localeCompare(right.pieceKey));
}

function piece(state, pieceKey) {
  const result = (state.pieces || []).find((candidate) =>
    candidate.pieceKey === pieceKey);
  assert.ok(result, `Missing piece ${pieceKey}`);
  return result;
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

function relocateSoloToLegalFrontSlot(
  stateInput,
  pieceKey,
  yIn,
  { actionType = "run", movementDestinations = [], preferredX = 20 } = {},
) {
  const xCandidates = Array.from({ length: 47 }, (_, index) => index + 1)
    .sort((left, right) => Math.abs(left - preferredX) -
      Math.abs(right - preferredX) ||
      left - right);
  for (const xIn of xCandidates) {
    const state = structuredClone(stateInput);
    piece(state, pieceKey).position = { xIn, yIn };
    const normalized = normalizeRulesV1State(state);
    if (!auditRulesV1StaticPlacement(normalized).ok) continue;
    if (!movementDestinations.length) {
      return { state: normalized, position: { xIn, yIn } };
    }
    for (const destination of movementDestinations) {
      const plan = buildRulesV1MovementPathProposalPlan(normalized, {
        actorPieceKey: pieceKey,
        actionType,
        destination,
        ignoredPieceKeys: [pieceKey],
        keyBase: `ticket06-deployment-lane-${pieceKey}`,
      });
      if (plan.proposals.some((proposal) => proposal.precheckPassed === true)) {
        return {
          state: normalized,
          position: { xIn, yIn },
          movementDestination: destination,
        };
      }
    }
  }
  assert.fail(`No strict front deployment slot for ${pieceKey}`);
}

function buildStrictInjectedOpening(openingState) {
  const ashmaelPieceKey = "player2_ashmael_keeper_of_whispers_1_1";
  const sepsiraPieceKey = "player1_master_necrosurgeon_sepsira_1_1";
  const vordakPieceKey = openingState.pieces.filter((candidate) =>
    candidate.sideKey === "player2" &&
    /vordak/i.test(String(candidate.cardName || candidate.label || "")))
    .sort((left, right) => Math.abs(Number(left.position?.xIn) - 20) -
      Math.abs(Number(right.position?.xIn) - 20) ||
      left.pieceKey.localeCompare(right.pieceKey))[0]?.pieceKey;
  assert.ok(vordakPieceKey, "Ticket 06 opening has no Vordak");
  const vordak = relocateSoloToLegalFrontSlot(
    openingState,
    vordakPieceKey,
    5,
    { preferredX: 20 },
  );
  const laneX = vordak.position.xIn;
  const ashmael = relocateSoloToLegalFrontSlot(
    vordak.state,
    ashmaelPieceKey,
    5,
    { preferredX: laneX - 2 },
  );
  const sepsira = relocateSoloToLegalFrontSlot(
    ashmael.state,
    sepsiraPieceKey,
    37.8,
    {
      preferredX: laneX,
      movementDestinations: [0, -0.5, 0.5].map((offset) => ({
        xIn: laneX + offset,
        yIn: 26.8,
      })),
    },
  );
  sepsira.state.stateKey =
    `${sepsira.state.stateKey}:ticket06-strict-user-seed-v1`;
  const normalized = normalizeRulesV1State(sepsira.state);
  const placement = auditRulesV1StaticPlacement(normalized);
  const formation = auditRulesV1StaticUnitFormation(normalized);
  const deployment = auditWarmachineLegalDeploymentReachabilityV1(normalized, {
    firstPlayerSideKey: "player2",
    deployments: deploymentRectangles(normalized),
  });
  assert.equal(placement.ok, true, JSON.stringify(placement, null, 2));
  assert.equal(formation.ok, true, JSON.stringify(formation, null, 2));
  assert.equal(deployment.ok, true, JSON.stringify(deployment, null, 2));
  return {
    state: normalized,
    placement,
    formation,
    deployment,
    injectedPositions: {
      [vordakPieceKey]: vordak.position,
      [ashmaelPieceKey]: ashmael.position,
      [sepsiraPieceKey]: sepsira.position,
    },
    vordakPieceKey,
    laneX,
    sepsiraMovementDestination: sepsira.movementDestination,
  };
}

function prepareMovement(state, {
  actorPieceKey,
  actionType,
  destination,
  pathKey,
}) {
  const plan = buildRulesV1MovementPathProposalPlan(state, {
    actorPieceKey,
    actionType,
    destination,
    ignoredPieceKeys: [actorPieceKey],
    keyBase: pathKey,
  });
  const proposal = plan.proposals.find((candidate) =>
    candidate.proposalKind === "host_auto_routed" &&
    candidate.precheckPassed === true) ||
    plan.proposals.find((candidate) => candidate.precheckPassed === true);
  assert.ok(proposal, JSON.stringify({ actorPieceKey, actionType, destination, plan }, null, 2));
  return {
    pathKey,
    waypoints: proposal.waypoints,
    state: bindWarmachineBenchmarkExplicitMovementPathV2(state, {
      actorPieceKey,
      actionType,
      pathKey,
      waypoints: proposal.waypoints,
      proposalSource: "ticket06_short_strict_witness_v1",
    }),
  };
}

function movementIntent(actorPieceKey, actionType, pathKey) {
  const actionKey = `${actorPieceKey}:${actionType}-path:${pathKey}:v1`;
  return {
    preferMovement: true,
    repeatIntent: false,
    maxSteps: 8,
    enumerationScopeForStep: ({ stepIndex }) => stepIndex === 0
      ? {
        actionFamilyKeys: ["movement", "timing"],
        movementPathKindKeys: ["explicit_path"],
      }
      : {},
    selectAction: ({ scoped, stepIndex }) => stepIndex === 0
      ? scoped.enumeration.actions.find((action) => action.actionKey === actionKey) || null
      : null,
  };
}

function executePreparedTurn(state, {
  routeKey,
  movementPlans,
  shedThenMovementPlans = [],
}) {
  const control = executeWarmachineBenchmarkControlPhaseV2(state, {
    routeKey: `${routeKey}:control`,
  });
  assert.equal(control.ok, true, JSON.stringify(control.failures, null, 2));
  let prepared = control.state;
  const plannedActivations = [];
  for (const plan of movementPlans) {
    const path = prepareMovement(prepared, plan);
    const activation = executeWarmachineBenchmarkActivationV2(
      path.state,
      plan.actorPieceKey,
      {
        routeKey: `${routeKey}:${plan.actorPieceKey}`,
        ...movementIntent(plan.actorPieceKey, plan.actionType, plan.pathKey),
      },
    );
    assert.equal(activation.ok, true, JSON.stringify({
      reason: activation.reason,
      audit: activation.selectionAudit,
    }, null, 2));
    const cleanedActivation = {
      ...activation,
      state: stripTransientMovementPaths(activation.state),
    };
    prepared = cleanedActivation.state;
    plannedActivations.push(cleanedActivation);
  }
  for (const plan of shedThenMovementPlans) {
    const path = prepareMovement(prepared, plan);
    const actorPieceKey = plan.actorPieceKey;
    const movementActionKey =
      `${actorPieceKey}:${plan.actionType}-path:${plan.pathKey}:v1`;
    const activation = executeWarmachineBenchmarkActivationV2(
      path.state,
      actorPieceKey,
      {
        routeKey: `${routeKey}:${actorPieceKey}:shed-then-move`,
        enumerationScopeForStep: ({ stepIndex }) => stepIndex === 0
          ? { actionFamilyKeys: ["resource", "timing"] }
          : stepIndex === 1
            ? {
              actionFamilyKeys: ["movement", "timing"],
              movementPathKindKeys: ["explicit_path"],
            }
            : {},
        selectAction: ({ scoped, stepIndex }) => {
          if (stepIndex === 0) {
            return scoped.enumeration.actions.find((action) =>
            action.actionType === "shed_fury" &&
            Number(action.metadata?.furyRemoved || 0) === 1) || null;
          }
          if (stepIndex === 1) {
            return scoped.enumeration.actions.find((action) =>
              action.actionKey === movementActionKey) || null;
          }
          return scoped.enumeration.actions.find((action) =>
            /end_|pass|activation_complete/.test(
              String(action.actionType || "").toLowerCase(),
            )) || null;
        },
      },
    );
    assert.equal(activation.ok, true, JSON.stringify({
      actorPieceKey,
      reason: activation.reason,
      audit: activation.selectionAudit,
    }, null, 2));
    const cleanedActivation = {
      ...activation,
      state: stripTransientMovementPaths(activation.state),
    };
    prepared = cleanedActivation.state;
    plannedActivations.push(cleanedActivation);
  }
  const turn = executeWarmachineBenchmarkTurnV2(prepared, {
    routeKey,
    maximumActivations: 96,
    intentForActivationGroup: () => ({ completionOnly: true, avoidFeat: true }),
  });
  assert.equal(turn.ok, true, JSON.stringify(turn.failures, null, 2));
  return {
    control,
    plannedActivations,
    preEndState: turn.preEndState,
    turn,
    state: turn.state,
  };
}

function executeForwardWitness(openingState, {
  laneX,
  sepsiraMovementDestination,
  vordakPieceKey,
} = {}) {
  const ashmaelPieceKey = "player2_ashmael_keeper_of_whispers_1_1";
  const sepsiraPieceKey = "player1_master_necrosurgeon_sepsira_1_1";
  let state = openingState;
  const p2TurnOne = executePreparedTurn(state, {
    routeKey: "ticket06-short:p2-turn1",
    movementPlans: [
      {
        actorPieceKey: vordakPieceKey,
        actionType: "run",
        destination: { xIn: laneX, yIn: 17 },
        pathKey: "ticket06-vordak-turn1-run",
      },
    ],
    shedThenMovementPlans: [{
      actorPieceKey: ashmaelPieceKey,
      actionType: "run",
      destination: { xIn: laneX, yIn: 12 },
      pathKey: "ticket06-ashmael-turn1-shed-run",
    }],
  });
  state = p2TurnOne.state;
  const p1TurnOne = executePreparedTurn(state, {
    routeKey: "ticket06-short:p1-turn1",
    movementPlans: [{
      actorPieceKey: sepsiraPieceKey,
      actionType: "run",
      destination: sepsiraMovementDestination,
      pathKey: "ticket06-sepsira-turn1-run",
    }],
  });
  state = p1TurnOne.state;
  const p2Control = executeWarmachineBenchmarkControlPhaseV2(state, {
    routeKey: "ticket06-short:p2-turn2:control",
  });
  assert.equal(p2Control.ok, true, JSON.stringify({
    failures: p2Control.failures,
    selectionAudit: p2Control.selectionAudit,
    ashmael: piece(p2Control.state, ashmaelPieceKey),
    vordak: piece(p2Control.state, vordakPieceKey),
  }, null, 2));
  state = p2Control.state;
  const preTerminalState = state;
  const attack = executeWarmachineBenchmarkActivationV2(state, vordakPieceKey, {
    routeKey: "ticket06-short:p2-turn2:vordak",
    repeatIntent: true,
    maxSteps: 12,
    rejectedAuditLimit: 200,
    enumerationScopeForStep: () => ({
      actionFamilyKeys: ["movement", "attack_or_effect", "resource", "timing"],
      targetPieceKeys: [sepsiraPieceKey],
      includeUntargetedActions: true,
    }),
    selectAction: ({ scoped, stepIndex }) => {
      const attacks = scoped.enumeration.actions.filter((action) =>
        action.targetPieceKey === sepsiraPieceKey &&
        /attack/.test(String(action.actionType || "")));
      const selected = attacks.slice().sort((left, right) =>
        Number(/advance.*melee|melee.*advance/.test(
          String(right.actionType || ""))) -
          Number(/advance.*melee|melee.*advance/.test(
            String(left.actionType || ""))) ||
        Number(/melee/.test(String(right.actionType || ""))) -
          Number(/melee/.test(String(left.actionType || ""))) ||
        Number(right.expectedDamage || 0) - Number(left.expectedDamage || 0) ||
        left.actionKey.localeCompare(right.actionKey))[0];
      if (selected) {
        return {
          actionKey: selected.actionKey,
          actionPatch: {
            strictRollOutcome:
              buildWarmachineBenchmarkMaximumStrictRollOutcomeV2(selected),
          },
        };
      }
      return scoped.enumeration.actions.find((action) =>
        /decline|pass|end_|activation_complete/.test(
          String(action.actionType || "").toLowerCase(),
        )) || null;
    },
  });
  assert.equal(attack.ok, true, JSON.stringify({
    reason: attack.reason,
    audit: attack.selectionAudit,
  }, null, 2));
  return {
    state: attack.state,
    preTerminalState,
    attack,
    stages: { p2TurnOne, p1TurnOne, p2Control },
    pieceKeys: { vordakPieceKey, ashmaelPieceKey, sepsiraPieceKey },
  };
}

function forwardActivationOrder(stage = {}) {
  return [
    ...(stage.plannedActivations || []).map((activation) =>
      activation.activationGroupKey),
    ...(stage.turn?.activatedGroupKeys || []),
  ];
}

function materializedRoot(witness, materializationHash) {
  const { vordakPieceKey, ashmaelPieceKey, sepsiraPieceKey } = witness.pieceKeys;
  const actionSequence = witness.attack.selectionAudit.map((row) =>
    stableGraphValue(row.selectedAction));
  return {
    taskKey: "ticket06-short-strict-assassination-v1",
    planHash: stableGraphHash({ materializationHash, actionSequence }),
    report: {
      disposition: "strict_materialized",
      root: {
        taskKey: "ticket06-short-strict-assassination-v1",
        scenarioKey: "two_fronts",
        roundNumber: 2,
        winnerSideKey: "player2",
        loserSideKey: "player1",
        endingSideKey: "player2",
        actorPieceKey: vordakPieceKey,
        controllerPieceKey: ashmaelPieceKey,
        targetPieceKey: sepsiraPieceKey,
        actionSequence,
      },
    },
    runtime: {
      predecessorState: witness.preTerminalState,
      terminalState: witness.state,
    },
  };
}

function terminalCell(materialized) {
  const root = materialized.report.root;
  const piecePositions = Object.fromEntries(materialized.runtime.terminalState.pieces
    .map((entry) => [entry.pieceKey, entry.position]));
  return buildWarmachineTerminalHypothesisDomainV1({
    scenarioKey: root.scenarioKey,
    scenarioPacketKey: "steamroller-2026",
    scenarioPacketYear: "2026",
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    rosterReceiptHash: materialized.planHash,
    specs: [{
      goalType: "assassination",
      roundNumbers: [root.roundNumber],
      winnerSideKeys: [root.winnerSideKey],
      loserSideKeys: [root.loserSideKey],
      endingSideKeys: [root.endingSideKey],
      causalActionFamilies: ["strict_melee_chain"],
      actorPieceKeys: [root.actorPieceKey],
      targetLeaderPieceKeys: [root.targetPieceKey],
      targetBoxesBeforeFinal: [1],
      resourceEnvelopeKeys: ["strict_observed"],
      geometryRelationCells: [{
        relationKind: "materialized_terminal_activation_reachable",
        actorToTargetRangeBand: "rule_legal_range",
        lineOfSightRelation: "strict_los_required",
        pathRelation: "strict_host_generated_path",
        baseRelation: "legal_nonoverlap",
        exactCoordinatesKnown: true,
        exactCoordinates: { piecePositions },
        relationChecks: [],
      }],
      assumptionSources: {
        goalType: "user_constrained",
        roundNumber: "user_constrained",
        winnerSideKey: "rule_derived",
        loserSideKey: "rule_derived",
        endingSideKey: "rule_derived",
        causalActionFamily: "rule_derived",
        actorPieceKey: "rule_derived",
        targetLeaderPieceKey: "rule_derived",
        targetBoxesBeforeFinal: "optimistic_proposal",
        resourceEnvelopeKey: "rule_derived",
        geometryRelationCell: "rule_derived",
      },
    }],
  }).cells[0];
}

function ticket06ReverseOptions({ injectedOpening, witness }) {
  const p2ForwardOrder = forwardActivationOrder(witness.stages.p2TurnOne);
  const p1ForwardOrder = forwardActivationOrder(witness.stages.p1TurnOne);
  return {
    deployments: deploymentRectangles(injectedOpening.state),
    firstPlayerSideKey: "player2",
    maximumReverseTurns: 2,
    maximumRouteLabels: 8,
    maximumUniqueStates: 8,
    maximumCompletedRoutes: 1,
    stopAfterCompletedRouteCount: 1,
    frontierOrder: "best_first_to_deployment",
    includePass: true,
    includeMovement: true,
    movementActionTypes: ["advance", "run"],
    includeChargeCombat: true,
    chargeCombatActorPieceKeys: [witness.pieceKeys.vordakPieceKey],
    chargeTargetPieceKeys: injectedOpening.state.pieces
      .filter((piece) => piece.destroyed !== true &&
        piece.removedFromPlay !== true)
      .map((piece) => piece.pieceKey)
      .sort(),
    maximumChargeProposals: 16,
    maximumChargeCombatCandidates: 4,
    maximumActivationDepth: 64,
    maximumActivationLabels: 96,
    maximumActivationUniqueStates: 96,
    activationFrontierOrder: "best_first_to_deployment",
    stopAfterActivationBoundaryRouteCount: 1,
    maximumActivationGroupsPerExpansion: 1,
    maximumActivationCandidatesPerExpansion: 1,
    maximumActivationCandidatesPerGroupKey: {
      [witness.pieceKeys.vordakPieceKey]: 24,
      [witness.pieceKeys.ashmaelPieceKey]: 1,
    },
    maximumActivationPassActorsPerExpansion: 1,
    maximumMovementStrictCandidatesPerExpansion: 1,
    maximumMovementStrictCandidatesByGroupKey: {
      [witness.pieceKeys.vordakPieceKey]: 24,
      [witness.pieceKeys.ashmaelPieceKey]: 8,
    },
    maximumMovementStrictCandidateAttempts: 72,
    dedupeEquivalentPathWitnessesForReachabilityBudget: true,
    maximumUnitMovementAnchorsPerGroup: 1,
    maximumDeploymentSlotOrigins: 12,
    maximumDeploymentSlotRings: 2,
    includeDeploymentSlotAlternatives: true,
    requireTurnOneSideDeploymentBoundary: true,
    includeResourceSpendPrefixes: true,
    resourceSpendPrefixActorPieceKeys: [witness.pieceKeys.ashmaelPieceKey],
    requireResourceSpendPrefixActorPieceKeys: [
      witness.pieceKeys.ashmaelPieceKey,
    ],
    includePostMovementResourceSpendSuffixes: true,
    resourcePrefixTargetPieceKeys: [
      witness.pieceKeys.vordakPieceKey,
      witness.pieceKeys.ashmaelPieceKey,
    ],
    maximumResourcePrefixTargets: 2,
    maximumResourcePrefixDepth: 3,
    maximumResourcePrefixLabels: 12,
    maximumResourcePrefixRoutes: 1,
    maximumResourceSuffixTargets: 2,
    maximumResourceSuffixDepth: 3,
    maximumResourceSuffixLabels: 12,
    maximumResourceSuffixRoutes: 1,
    maximumResourceSuffixMovementProposals: 1,
    resourceEnvelopeModesByTurnAndSide: {
      "1:player1": ["reverse_focus_allocation_baseline"],
      "1:player2": ["unchanged"],
      "2:player2": ["reverse_single_fury_leech_baseline"],
    },
    prioritizeControlResourceDependencies: false,
    activationGroupOrderKeysByTurnAndSide: {
      "1:player2": p2ForwardOrder.slice().reverse(),
      "1:player1": p1ForwardOrder.slice().reverse(),
    },
    movementActivationGroupKeysByTurnAndSide: {
      "1:player2": [
        witness.pieceKeys.vordakPieceKey,
        witness.pieceKeys.ashmaelPieceKey,
      ],
      "1:player1": [witness.pieceKeys.sepsiraPieceKey],
    },
    nextSideActivationRestoreModes: ["all_alive_activated"],
    nextSideActivationRestoreModesByTurnAndSide: {
      "1:player1": ["preserve_reset_state"],
      "2:player2": ["all_alive_activated"],
    },
    currentTurnIncludeMovement: false,
    currentTurnMaximumActivationDepth: 8,
    currentTurnMaximumActivationLabels: 8,
    currentTurnMaximumActivationUniqueStates: 8,
    certifyFullRouteStrictReplay: true,
    progressEveryLabels: 1,
    progressDeploymentFailureLimit: 1,
    includeRuntimeDiagnostics: true,
  };
}

function nextSideActivationRestoreModesForState(state, options) {
  const sideKey = String(state?.activeSideKey || "");
  const turnSideKey = `${Number(state?.turnNumber || 0)}:${sideKey}`;
  return options.nextSideActivationRestoreModesByTurnAndSide?.[turnSideKey] ||
    options.nextSideActivationRestoreModesBySide?.[sideKey] ||
    options.nextSideActivationRestoreModes;
}

function assertKnownPredecessor(result, expectedState, label) {
  const expectedStateHash = warmachineReverseStateSemanticHashV1(expectedState);
  const candidate = (result.candidates || result.runtimeBoundaries || []).find((row) =>
    String(row.predecessorStateHash || row.stateHash || "") === expectedStateHash);
  assert.ok(candidate, JSON.stringify({
    label,
    expectedStateHash,
    candidateStateHashes: (result.candidates || result.runtimeBoundaries || []).map((row) =>
      String(row.predecessorStateHash || row.stateHash || "")),
    candidateOrigins: (result.candidates || []).map((row) => ({
      actorPieceKey: row.actorPieceKey,
      origin: row.movementProposal?.origin,
      relationKind: row.movementProposal?.relationKind,
      preActivationResourcePoints: row.preActivationResourcePoints,
      actionTypes: row.strictReplaySteps?.map((step) => step.actionType),
      semanticDifferences: row.predecessorState
        ? semanticDifferenceRows(row.predecessorState, expectedState)
        : [],
    })),
    rejected: result.rejected,
    unresolved: result.unresolved,
  }, null, 2));
  return candidate;
}

function runTicket06CompositionPreflight({ injectedOpening, witness }) {
  const jointOnly = process.argv.includes("--preflight-joint");
  const options = ticket06ReverseOptions({ injectedOpening, witness });
  const deployments = options.deployments;
  const { vordakPieceKey, ashmaelPieceKey, sepsiraPieceKey } = witness.pieceKeys;
  const p2Stage = witness.stages.p2TurnOne;
  const p1Stage = witness.stages.p1TurnOne;
  const movementRuntimeByLabel = new Map();
  const p2ForwardOrder = forwardActivationOrder(p2Stage);
  const p1ForwardOrder = forwardActivationOrder(p1Stage);
  assert.deepEqual(
    options.activationGroupOrderKeysByTurnAndSide["1:player2"],
    p2ForwardOrder.slice().reverse(),
  );
  assert.deepEqual(
    options.activationGroupOrderKeysByTurnAndSide["1:player1"],
    p1ForwardOrder.slice().reverse(),
  );
  assert.equal(new Set(p2ForwardOrder).size, p2ForwardOrder.length);
  assert.equal(new Set(p1ForwardOrder).size, p1ForwardOrder.length);
  const movementCases = [
    {
      label: "player2_turn1_vordak_run",
      actorPieceKey: vordakPieceKey,
      successor: p2Stage.plannedActivations[0].state,
      predecessor: p2Stage.control.state,
      resourcePrefixRequired: false,
    },
    {
      label: "player2_turn1_ashmael_shed_fury_then_run",
      actorPieceKey: ashmaelPieceKey,
      successor: p2Stage.plannedActivations[1].state,
      predecessor: p2Stage.plannedActivations[0].state,
      resourcePrefixRequired: true,
      exactPredecessorRequired: false,
    },
    {
      label: "player1_turn1_sepsira_run",
      actorPieceKey: sepsiraPieceKey,
      successor: p1Stage.plannedActivations[0].state,
      predecessor: p1Stage.control.state,
      resourcePrefixRequired: false,
    },
  ].filter((testCase) => !jointOnly || [
    vordakPieceKey,
    ashmaelPieceKey,
  ].includes(testCase.actorPieceKey));
  const movementEvidence = movementCases.map((testCase) => {
    const productionMaximumStrictCandidates = Number(
      options.maximumMovementStrictCandidatesByGroupKey[testCase.actorPieceKey] ??
      options.maximumMovementStrictCandidatesPerExpansion,
    );
    const maximumStrictCandidates = testCase.exactPredecessorRequired === false ? 4 : 1;
    const maximumStrictCandidateAttempts = testCase.exactPredecessorRequired === false
      ? 12
      : 4;
    assert.equal(productionMaximumStrictCandidates >= maximumStrictCandidates, true,
      `${testCase.label} production candidate budget is below its preflight witness budget`);
    assert.equal(options.maximumMovementStrictCandidateAttempts >=
      maximumStrictCandidateAttempts, true,
    `${testCase.label} production attempt budget is below its preflight witness budget`);
    process.stderr.write(`${JSON.stringify({
      scope: "ticket06_short_preflight",
      stage: "movement_case_started",
      label: testCase.label,
    })}\n`);
    const result = generateWarmachineMovementActivationPredecessorsV1(
      testCase.successor,
      {
        sideKey: piece(testCase.successor, testCase.actorPieceKey).sideKey,
        actorPieceKeys: [testCase.actorPieceKey],
        actionTypes: options.movementActionTypes,
        deployments,
        includeDeploymentSlotAlternatives: options.includeDeploymentSlotAlternatives,
        maximumDeploymentSlotOrigins: options.maximumDeploymentSlotOrigins,
        maximumDeploymentSlotRings: options.maximumDeploymentSlotRings,
        reservedDeploymentPieceKeys: testCase.actorPieceKey === ashmaelPieceKey
          ? [vordakPieceKey]
          : [],
        maximumStrictCandidates,
        maximumStrictCandidateAttempts,
        includeResourceSpendPrefixes: testCase.resourcePrefixRequired,
        resourceSpendPrefixActorPieceKeys: testCase.resourcePrefixRequired
          ? [testCase.actorPieceKey]
          : [],
        requireResourceSpendPrefixActorPieceKeys: testCase.resourcePrefixRequired
          ? [testCase.actorPieceKey]
          : [],
        resourcePrefixTargetPieceKeys: options.resourcePrefixTargetPieceKeys,
        maximumResourcePrefixTargets: options.maximumResourcePrefixTargets,
        maximumResourcePrefixDepth: options.maximumResourcePrefixDepth,
        maximumResourcePrefixLabels: options.maximumResourcePrefixLabels,
        maximumResourcePrefixRoutes: options.maximumResourcePrefixRoutes,
      },
    );
    movementRuntimeByLabel.set(testCase.label, result);
    const candidate = testCase.exactPredecessorRequired === false
      ? result.candidates.find((row) =>
        row.strictReplaySteps.some((step) => step.actionType === "shed_fury") &&
        row.strictReplaySteps.some((step) => step.actionType === "run"))
      : assertKnownPredecessor(result, testCase.predecessor, testCase.label);
    assert.ok(candidate, JSON.stringify({
      label: testCase.label,
      candidates: result.publicCandidates,
      rejected: result.rejected,
      unresolved: result.unresolved,
    }, null, 2));
    if (testCase.exactPredecessorRequired === false) {
      assert.equal(new Set(result.candidates.map((row) =>
        JSON.stringify(row.movementProposal.origin))).size > 1, true,
      JSON.stringify({
        label: testCase.label,
        candidateOrigins: result.candidates.map((row) => row.movementProposal.origin),
      }, null, 2));
    }
    process.stderr.write(`${JSON.stringify({
      scope: "ticket06_short_preflight",
      stage: "movement_case_passed",
      label: testCase.label,
      strictCandidateCount: result.strictCandidateCount,
    })}\n`);
    return {
      label: testCase.label,
      candidateKey: candidate.candidateKey,
      predecessorStateHash: candidate.predecessorStateHash,
      origin: candidate.movementProposal.origin,
      actionTypes: candidate.strictReplaySteps.map((step) => step.actionType),
    };
  });

  const controlCases = [
    {
      label: "player2_turn1_control",
      successor: p2Stage.control.state,
      predecessor: injectedOpening.state,
      modes: options.resourceEnvelopeModesByTurnAndSide["1:player2"],
    },
    {
      label: "player1_turn1_control",
      successor: p1Stage.control.state,
      predecessor: p2Stage.state,
      modes: options.resourceEnvelopeModesByTurnAndSide["1:player1"],
    },
    {
      label: "player2_turn2_control",
      successor: witness.stages.p2Control.state,
      predecessor: p1Stage.state,
      modes: options.resourceEnvelopeModesByTurnAndSide["2:player2"],
    },
  ].filter(() => !jointOnly);
  const controlRuntimeByLabel = new Map();
  const controlEvidence = controlCases.map((testCase) => {
    process.stderr.write(`${JSON.stringify({
      scope: "ticket06_short_preflight",
      stage: "control_case_started",
      label: testCase.label,
    })}\n`);
    const result = generateWarmachineControlPhasePredecessorsV1(testCase.successor, {
      resourceEnvelopeModes: testCase.modes,
      controlResidueModes: ["absent"],
      includeRuntimeDiagnostics: true,
    });
    controlRuntimeByLabel.set(testCase.label, result);
    const candidate = result.candidates.find((row) =>
      testCase.modes.includes(row.resourceEnvelopeMode));
    assert.ok(candidate, JSON.stringify({
      label: testCase.label,
      expectedResourceEnvelopeModes: testCase.modes,
      candidates: result.publicCandidates,
      rejected: result.rejected,
      unresolved: result.unresolved,
    }, null, 2));
    if (testCase.label === "player2_turn2_control") {
      assert.equal(candidate.strictReplaySteps.some((step) =>
        step.actionType === "leech_fury"), true,
      JSON.stringify(candidate.strictReplaySteps, null, 2));
    }
    process.stderr.write(`${JSON.stringify({
      scope: "ticket06_short_preflight",
      stage: "control_case_passed",
      label: testCase.label,
    })}\n`);
    return {
      label: testCase.label,
      candidateKey: candidate.candidateKey,
      predecessorStateHash: candidate.predecessorStateHash,
      resourceEnvelopeMode: candidate.resourceEnvelopeMode,
    };
  });
  const turnBoundaryEvidence = [];
  const turnBoundaryRuntimeByLabel = new Map();
  if (!jointOnly) {
    for (const controlLabel of ["player1_turn1_control", "player2_turn2_control"]) {
      process.stderr.write(`${JSON.stringify({
        scope: "ticket06_short_preflight",
        stage: "turn_boundary_case_started",
        label: controlLabel,
      })}\n`);
      const controlCandidate = controlRuntimeByLabel.get(controlLabel).candidates[0];
      const previousTurn = generateWarmachinePreviousTurnEndPredecessorsV1(
        controlCandidate.predecessorState,
        {
          nextSideActivationRestoreModes:
            nextSideActivationRestoreModesForState(
              controlCandidate.predecessorState,
              options,
            ),
          maintenanceResourcePreimageModes: ["preserve_cleanup_result"],
          includeRuntimeDiagnostics: true,
        },
      );
      const candidate = previousTurn.candidates[0];
      assert.ok(candidate, JSON.stringify({
        label: controlLabel,
        rejected: previousTurn.rejected,
        unresolved: previousTurn.unresolved,
      }, null, 2));
      const expectedActivationRestoreMode = controlLabel ===
        "player1_turn1_control"
        ? "preserve_reset_state"
        : "all_alive_activated";
      assert.equal(
        candidate.mutation.activationRestoreMode,
        expectedActivationRestoreMode,
      );
      const restoredCurrentSidePieces = candidate.predecessorState.pieces.filter((entry) =>
        entry.sideKey === candidate.mutation.currentSideKey &&
        entry.destroyed !== true && entry.removed !== true);
      assert.equal(restoredCurrentSidePieces.length > 0, true);
      assert.equal(
        restoredCurrentSidePieces.every((entry) =>
          entry.activated === (expectedActivationRestoreMode ===
            "all_alive_activated")),
        true,
        JSON.stringify({
          label: controlLabel,
          expectedActivationRestoreMode,
          activatedPieceKeys: restoredCurrentSidePieces.filter((entry) =>
            entry.activated === true).map((entry) => entry.pieceKey),
        }, null, 2),
      );
      turnBoundaryRuntimeByLabel.set(controlLabel, candidate);
      turnBoundaryEvidence.push({
        label: controlLabel,
        candidateKey: candidate.candidateKey,
        endingSideKey: candidate.endingSideKey,
        endingTurnNumber: candidate.endingTurnNumber,
        activationRestoreMode: candidate.mutation.activationRestoreMode,
        currentSideActivatedPieceCount: restoredCurrentSidePieces.filter((entry) =>
          entry.activated === true).length,
        actionTypes: candidate.strictReplaySteps.map((step) => step.actionType),
      });
      process.stderr.write(`${JSON.stringify({
        scope: "ticket06_short_preflight",
        stage: "turn_boundary_case_passed",
        label: controlLabel,
      })}\n`);
    }
  }

  process.stderr.write(`${JSON.stringify({
    scope: "ticket06_short_preflight",
    stage: "joint_activation_composition_started",
  })}\n`);
  const vordakOrigin = movementRuntimeByLabel.get("player2_turn1_vordak_run")
    .candidates[0].movementProposal.origin;
  const ashmaelResult = movementRuntimeByLabel.get(
    "player2_turn1_ashmael_shed_fury_then_run",
  );
  const vordakRadius = Number(piece(p2Stage.control.state, vordakPieceKey).baseSizeIn) / 2;
  const ashmaelRadius = Number(piece(p2Stage.control.state, ashmaelPieceKey).baseSizeIn) / 2;
  const compatibleAshmaelCandidates = ashmaelResult.candidates.filter((candidate) =>
    Math.hypot(
      candidate.movementProposal.origin.xIn - vordakOrigin.xIn,
      candidate.movementProposal.origin.yIn - vordakOrigin.yIn,
    ) + 0.001 >= vordakRadius + ashmaelRadius);
  assert.equal(compatibleAshmaelCandidates.length > 0, true, JSON.stringify({
    label: "player2_turn1_joint_activation_static_geometry",
    vordakOrigin,
    ashmaelOrigins: ashmaelResult.candidates.map((candidate) =>
      candidate.movementProposal.origin),
    minimumSeparationIn: vordakRadius + ashmaelRadius,
  }, null, 2));
  let jointDeployment = null;
  const jointAttempts = [];
  for (const ashmaelCandidate of compatibleAshmaelCandidates) {
    const vordakResult = generateWarmachineMovementActivationPredecessorsV1(
      ashmaelCandidate.predecessorState,
      {
        sideKey: "player2",
        actorPieceKeys: [vordakPieceKey],
        actionTypes: options.movementActionTypes,
        deployments,
        includeDeploymentSlotAlternatives: true,
        maximumDeploymentSlotOrigins: options.maximumDeploymentSlotOrigins,
        maximumDeploymentSlotRings: options.maximumDeploymentSlotRings,
        maximumStrictCandidates: 1,
        maximumStrictCandidateAttempts: 4,
      },
    );
    for (const vordakCandidate of vordakResult.candidates) {
      const deployment = auditWarmachineLegalDeploymentReachabilityV1(
        vordakCandidate.predecessorState,
        { firstPlayerSideKey: "player2", deployments },
      );
      jointAttempts.push({
        ashmaelOrigin: ashmaelCandidate.movementProposal.origin,
        vordakOrigin: vordakCandidate.movementProposal.origin,
        failedChecks: deployment.failedChecks,
        deploymentAudit: deployment.deploymentAudit,
      });
      if (deployment.strictDeploymentLegal === true &&
          deployment.failedChecks.every((check) => check === "controlPhaseStart")) {
        jointDeployment = { ashmaelCandidate, vordakCandidate, deployment };
        break;
      }
    }
    if (jointDeployment) break;
  }
  assert.ok(jointDeployment, JSON.stringify({
    label: "player2_turn1_joint_activation_composition",
    jointAttempts,
  }, null, 2));
  const p2Boundary = {
    state: jointDeployment.vordakCandidate.predecessorState,
    stateHash: jointDeployment.vordakCandidate.predecessorStateHash,
  };
  const deployment = jointDeployment.deployment;
  process.stderr.write(`${JSON.stringify({
    scope: "ticket06_short_preflight",
    stage: "joint_activation_composition_passed",
    ashmaelOrigin: jointDeployment.ashmaelCandidate.movementProposal.origin,
    vordakOrigin: jointDeployment.vordakCandidate.movementProposal.origin,
  })}\n`);
  const p2BoundaryControl = generateWarmachineControlPhasePredecessorsV1(
    p2Boundary.state,
    {
      resourceEnvelopeModes: options.resourceEnvelopeModesByTurnAndSide["1:player2"],
      controlResidueModes: ["absent"],
    },
  );
  const legalControlPredecessor = p2BoundaryControl.candidates.find((candidate) =>
    auditWarmachineLegalDeploymentReachabilityV1(candidate.predecessorState, {
      firstPlayerSideKey: "player2",
      deployments,
    }).ok);
  assert.ok(legalControlPredecessor, JSON.stringify({
    label: "player2_turn1_joint_control_to_deployment_composition",
    candidates: p2BoundaryControl.publicCandidates,
    rejected: p2BoundaryControl.rejected,
    unresolved: p2BoundaryControl.unresolved,
  }, null, 2));
  let wholeTurnCompositionEvidence = null;
  if (!jointOnly) {
    process.stderr.write(`${JSON.stringify({
      scope: "ticket06_short_preflight",
      stage: "player2_whole_turn_composition_started",
    })}\n`);
    const player2ActivationEnd = turnBoundaryRuntimeByLabel.get(
      "player1_turn1_control",
    ).predecessorState;
    const player1ActivatedAtPlayer2TurnEnd = player2ActivationEnd.pieces
      .filter((entry) => entry.sideKey === "player1" && entry.activated === true)
      .map((entry) => entry.pieceKey);
    assert.deepEqual(player1ActivatedAtPlayer2TurnEnd, [], JSON.stringify({
      label: "player2_whole_turn_next_side_activation_contract",
      player1ActivatedAtPlayer2TurnEnd,
    }, null, 2));
    const activationOptions = buildWarmachineActivationSequenceOptionsV1(
      player2ActivationEnd,
      "player2",
      "ticket06_short_preflight_player2_turn1",
      options,
    );
    assert.equal(activationOptions.includeChargeCombat, true,
      "Ticket 06 charge-combat inverse option was dropped by the activation bridge");
    assert.deepEqual(
      activationOptions.chargeTargetPieceKeys,
      options.chargeTargetPieceKeys,
      "Ticket 06 charge targets were dropped by the activation bridge",
    );
    assert.deepEqual(
      activationOptions.chargeCombatActorPieceKeys,
      [vordakPieceKey],
      "Ticket 06 charge actor scope was dropped by the activation bridge",
    );
    assert.equal(
      activationOptions.dedupeEquivalentPathWitnessesForReachabilityBudget,
      true,
      "Ticket 06 reachability path-witness policy was dropped by the activation bridge",
    );
    const player2Activation = reverseWarmachineActivationSequenceV2(
      player2ActivationEnd,
      {
        ...activationOptions,
        onProgress: (event) => {
          if (!["activation_boundary_reached", "activation_expansion_ready"]
            .includes(event.stage)) return;
          process.stderr.write(`${JSON.stringify({
            scope: "ticket06_short_preflight",
            stage: `player2_whole_turn_${event.stage}`,
            depth: event.depth,
            boundaryRouteCount: event.boundaryRouteCount,
            selectedCandidates: event.selectedCandidates,
          })}\n`);
        },
      },
    );
    assert.equal(player2Activation.runtimeBoundaries.length > 0, true,
      JSON.stringify({
        label: "player2_whole_turn_activation_composition",
        unresolved: player2Activation.unresolved.slice(0, 20),
        rejected: player2Activation.rejected.slice(0, 20),
      }, null, 2));
    let wholeTurnLegalOpening = null;
    const wholeTurnAttempts = [];
    for (const boundary of player2Activation.runtimeBoundaries) {
      const control = generateWarmachineControlPhasePredecessorsV1(boundary.state, {
        resourceEnvelopeModes:
          options.resourceEnvelopeModesByTurnAndSide["1:player2"],
        controlResidueModes: ["absent"],
        includeRuntimeDiagnostics: true,
      });
      for (const candidate of control.candidates) {
        const deploymentAudit = auditWarmachineLegalDeploymentReachabilityV1(
          candidate.predecessorState,
          { firstPlayerSideKey: "player2", deployments },
        );
        wholeTurnAttempts.push({
          boundaryStateHash: boundary.stateHash,
          candidateKey: candidate.candidateKey,
          failedChecks: deploymentAudit.failedChecks,
        });
        if (deploymentAudit.ok) {
          wholeTurnLegalOpening = { boundary, candidate, deploymentAudit };
          break;
        }
      }
      if (wholeTurnLegalOpening) break;
    }
    assert.ok(wholeTurnLegalOpening, JSON.stringify({
      label: "player2_whole_turn_control_to_deployment_composition",
      wholeTurnAttempts,
    }, null, 2));
    wholeTurnCompositionEvidence = {
      activationBoundaryDepth: wholeTurnLegalOpening.boundary.depth,
      activationBoundaryStateHash: wholeTurnLegalOpening.boundary.stateHash,
      activationReverseEdgeCount:
        wholeTurnLegalOpening.boundary.reverseEdges.length,
      controlPredecessorStateHash:
        wholeTurnLegalOpening.candidate.predecessorStateHash,
      strictDeploymentLegal:
        wholeTurnLegalOpening.deploymentAudit.strictDeploymentLegal,
    };
    process.stderr.write(`${JSON.stringify({
      scope: "ticket06_short_preflight",
      stage: "player2_whole_turn_composition_passed",
      ...wholeTurnCompositionEvidence,
    })}\n`);
  }
  return {
    schemaVersion: "ticket06_short_route_composition_preflight_v1",
    movementEvidence,
    controlEvidence,
    turnBoundaryEvidence,
    activationOrderEvidence: {
      player2TurnOneGroupCount: p2ForwardOrder.length,
      player1TurnOneGroupCount: p1ForwardOrder.length,
    },
    jointActivationBoundaryStateHash: p2Boundary.stateHash,
    jointActivationDeploymentLegal: deployment.strictDeploymentLegal,
    jointControlPredecessorStateHash:
      legalControlPredecessor.predecessorStateHash,
    wholeTurnCompositionEvidence,
  };
}

function reverseToOpening({
  injectedOpening,
  materializationHash,
  witness,
}) {
  const materialized = materializedRoot(witness, materializationHash);
  const cell = terminalCell(materialized);
  const p2ForwardOrder = forwardActivationOrder(witness.stages.p2TurnOne);
  const p1ForwardOrder = forwardActivationOrder(witness.stages.p1TurnOne);
  const sharedOptions = ticket06ReverseOptions({ injectedOpening, witness });
  const result = searchWarmachineMaterializedTerminalRootToDeploymentV1({
    materialized,
    terminalCell: cell,
    rawOptions: {
      ...sharedOptions,
      onActivationProgress: (event) => {
        if (event.stage !== "activation_expansion_ready" ||
            !(event.selectedCandidates || []).some((candidate) =>
              candidate.movementOrigin ||
              candidate.operatorKey !== "pass_activation_inverse_v1")) return;
        process.stderr.write(`${JSON.stringify({
          scope: "ticket06_short_activation",
          sideKey: event.sideKey,
          depth: event.depth,
          selectedCandidates: event.selectedCandidates,
        })}\n`);
      },
      onProgress: (event) => {
        if (!["processing_label", "search_complete"].includes(event.stage)) return;
        process.stderr.write(`${JSON.stringify({
          scope: "ticket06_short_reverse",
          stage: event.stage,
          processedLabelCount: event.processedLabelCount,
          completedRouteCount: event.completedRouteCount,
          current: event.current,
        })}\n`);
      },
    },
  });
  assert.equal(result.terminalReplay?.strictReplayCertified, true,
    JSON.stringify(result.terminalReplay?.failures || result, null, 2));
  assert.equal(result.terminalReplay.priorReceiptHashesConsultedForExecution, false);
  assert.equal(result.legalDeploymentRouteCount > 0, true,
    JSON.stringify({
      stage: result.stage,
      unresolvedReasonCounts: Object.fromEntries(Object.entries(
        (result.search?.unresolved || []).reduce((counts, row) => {
          const key = `${row.stageKey || "unknown"}:${row.reason || "unknown"}`;
          counts[key] = Number(counts[key] || 0) + 1;
          return counts;
        }, {}),
      ).sort(([left], [right]) => left.localeCompare(right))),
      controlDiagnostics: (result.search?.runtimeDiagnostics || [])
        .filter((row) => String(row.stageKey || "").endsWith("_control"))
        .slice(0, 4).map((row) => ({
          stageKey: row.stageKey,
          controlResidueMode: row.controlResidueMode,
          resourceEnvelopeMode: row.resourceEnvelopeMode,
          semanticDifferences: row.executedSuccessorState && row.expectedSuccessorState
            ? (() => {
              const differences = [];
              const visit = (left, right, pathKey = "") => {
                if (differences.length >= 16 || Object.is(left, right)) return;
                if (typeof left !== typeof right || left === null || right === null ||
                    typeof left !== "object") {
                  differences.push({ pathKey, executed: left, expected: right });
                  return;
                }
                for (const key of [...new Set([
                  ...Object.keys(left),
                  ...Object.keys(right),
                ])].filter((key) => key !== "stateKey").sort()) {
                  visit(left[key], right[key], pathKey ? `${pathKey}.${key}` : key);
                }
              };
              visit(row.executedSuccessorState, row.expectedSuccessorState);
              return differences;
            })()
            : [],
        })),
      unresolved: result.search?.unresolved?.slice(0, 12),
      rejected: result.search?.rejected?.slice(0, 12),
    }, null, 2));
  assert.equal(result.fullRouteStrictReplayCertifiedCount > 0, true);
  assert.equal(result.oracleIsolationPassed, true);
  return { materialized, cell, result, p1ForwardOrder, p2ForwardOrder };
}

const { opening, materializationHash } = materializeOpening();
const state = opening.state;
assert.equal(state.scenario?.scenarioKey, "two_fronts");
assert.deepEqual(state.scenario?.score, { player1: 0, player2: 0 });
assert.equal(state.turnNumber, 1);
assert.equal(state.activeSideKey, "player2");
assert.equal(state.phaseKey, "control");
assert.equal(opening.modelCount, 78);
const injectedOpening = buildStrictInjectedOpening(state);
const refreshWitnessOnly = process.argv.includes("--refresh-witness-only");
const preflightOnly = process.argv.includes("--preflight") ||
  process.argv.includes("--preflight-joint") || refreshWitnessOnly;
const skipCompositionPreflight = process.argv.includes(
  "--skip-composition-preflight",
);
const loadedWitness = preflightOnly
  ? loadOrBuildTicket06PreflightWitness({ injectedOpening, materializationHash })
  : {
    witness: executeForwardWitness(injectedOpening.state, {
      laneX: injectedOpening.laneX,
      sepsiraMovementDestination: injectedOpening.sepsiraMovementDestination,
      vordakPieceKey: injectedOpening.vordakPieceKey,
    }),
    source: "fresh_strict_forward_witness",
  };
const witness = loadedWitness.witness;
const terminalEvents = witness.attack.receipts.flatMap((receipt) =>
  receipt.events || []).filter((event) => event.eventType === "terminal");
assert.equal(terminalEvents.length > 0, true, JSON.stringify({
  actions: witness.attack.selectionAudit.map((row) => ({
    stepIndex: row.stepIndex,
    actionKey: row.selectedAction.actionKey,
    actionType: row.selectedAction.actionType,
    attackProfileKey: row.selectedAction.attackProfileKey,
    expectedDamage: row.selectedAction.expectedDamage,
    rejectedCharges: (row.rejectedActions || []).filter((action) =>
      /charge/.test(String(action.actionType || ""))).map((action) => ({
      actionKey: action.actionKey,
      reason: action.reason,
      reasons: action.reasons,
      blockerKind: action.blockerKind,
      blockerKeys: action.blockerKeys,
      movementCostIn: action.movementCostIn,
      movementAllowanceIn: action.movementAllowanceIn,
    })),
  })),
  sepsira: {
    position: piece(witness.state, witness.pieceKeys.sepsiraPieceKey).position,
    boxesRemaining: piece(
      witness.state,
      witness.pieceKeys.sepsiraPieceKey,
    ).damage?.boxesRemaining,
    destroyed: piece(witness.state, witness.pieceKeys.sepsiraPieceKey).destroyed,
  },
  vordak: {
    position: piece(witness.state, witness.pieceKeys.vordakPieceKey).position,
    fury: piece(witness.state, witness.pieceKeys.vordakPieceKey).resourcePoints,
  },
}, null, 2));
if (refreshWitnessOnly) {
  process.stdout.write(`${JSON.stringify({
    ok: true,
    mode: "refresh_receipt_bound_forward_witness_only",
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    materializationHash,
    injectedOpeningStateHash: injectedOpening.deployment.stateHash,
    injectedOpeningSemanticStateHash:
      warmachineReverseStateSemanticHashV1(injectedOpening.state),
    witnessSource: loadedWitness.source,
    witnessHash: stableGraphHash(compactTicket06Witness(witness)),
  }, null, 2)}\n`);
  process.exit(0);
}
const preflight = skipCompositionPreflight
  ? {
    schemaVersion: "ticket06_short_route_composition_preflight_v1",
    disposition: "separate_receipt_bound_preflight_required",
    witnessHash: stableGraphHash(compactTicket06Witness(witness)),
  }
  : runTicket06CompositionPreflight({ injectedOpening, witness });
if (preflightOnly) {
  process.stdout.write(`${JSON.stringify({
    ok: true,
    mode: process.argv.includes("--preflight-joint")
      ? "strict_joint_activation_preflight"
      : "strict_route_composition_preflight",
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    materializationHash,
    injectedOpeningStateHash: injectedOpening.deployment.stateHash,
    injectedOpeningSemanticStateHash:
      warmachineReverseStateSemanticHashV1(injectedOpening.state),
    witnessSource: loadedWitness.source,
    witnessHash: stableGraphHash(compactTicket06Witness(witness)),
    preflight,
  }, null, 2)}\n`);
} else {
  const reverse = reverseToOpening({
    injectedOpening,
    materializationHash,
    witness,
  });
  const certifiedRoute = reverse.result.search.routes.find((route) =>
    route.fullRouteStrictReplayCertified === true);
  assert.ok(certifiedRoute, "Ticket 06 compact strict route receipt is missing");
  const compactEvidenceCore = stableGraphValue({
    schemaVersion: "warmachine_ticket06_short_route_evidence_v1",
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    materializationHash,
    sourceWitnessHash: stableGraphHash(compactTicket06Witness(witness)),
    openingKey: opening.openingKey,
    representativeOpeningStateHash: opening.strictOpeningStateHash,
    injectedOpeningStateHash: injectedOpening.deployment.stateHash,
    injectedOpeningSemanticStateHash:
      warmachineReverseStateSemanticHashV1(injectedOpening.state),
    strictOpeningStateHash: certifiedRoute.predecessorStateHash,
    strictDeploymentEvidenceHash: stableGraphHash(
      certifiedRoute.deploymentEndpointEvidence,
    ),
    deploymentSeedKey: opening.deploymentSeedKey,
    scenarioKey: state.scenario.scenarioKey,
    firstPlayerSideKey: state.firstPlayerSideKey,
    physicalModelCount: state.pieces.length,
    routeKey: certifiedRoute.candidateKey,
    terminalFamilyKey: "assassination",
    terminalSourceKey: "vordak-strict-leader-removal",
    terminalWinnerSideKey: terminalEvents[0].winnerSideKey,
    terminalReason: terminalEvents[0].reason,
    reverseEdgeCount: certifiedRoute.reverseEdges.length,
    strictReceiptCount: certifiedRoute.strictReceiptHashes.length,
    fullRouteStrictReplayCertified: true,
    fullRouteReplayHash: certifiedRoute.fullRouteStrictReplay?.replayHash || "",
    fullRouteReplayedEdgeCount: Number(
      certifiedRoute.fullRouteStrictReplay?.replayedEdgeCount || 0,
    ),
    legalDeploymentRouteCount: reverse.result.legalDeploymentRouteCount,
    fullRouteStrictReplayCertifiedCount:
      reverse.result.fullRouteStrictReplayCertifiedCount,
    oracleIsolationPassed: reverse.result.oracleIsolationPassed,
    unresolvedCount: reverse.result.unresolvedCount,
    rejectedBranchCount: reverse.result.rejectedBranchCount,
    reverseSearchReportHash: reverse.result.reportHash,
    claimBoundary: "This compact receipt binds one Ticket 06 strict opening-to-assassination route and independent current-Host full-route replay. It does not close omitted candidates, opponent responses, Chance mass, natural probability or optimality.",
  });
  const compactEvidence = {
    ...compactEvidenceCore,
    evidenceHash: stableGraphHash(compactEvidenceCore),
  };
  fs.mkdirSync(path.dirname(compactRouteEvidencePath), { recursive: true });
  fs.writeFileSync(compactRouteEvidencePath,
    `${JSON.stringify(compactEvidence, null, 2)}\n`, "utf8");
  const output = {
    ok: true,
    schemaVersion: "verify_ticket06_short_assassination_root_to_opening_v1",
    mode: "strict_reverse_to_opening",
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    materializationHash,
    openingKey: opening.openingKey,
    strictOpeningStateHash: opening.strictOpeningStateHash,
    injectedOpeningStateHash: injectedOpening.deployment.stateHash,
    injectedOpeningSemanticStateHash:
      warmachineReverseStateSemanticHashV1(injectedOpening.state),
    injectedOpeningStrictDeploymentLegal: injectedOpening.deployment.ok,
    injectedPositions: injectedOpening.injectedPositions,
    sepsiraMovementDestination: injectedOpening.sepsiraMovementDestination,
    deploymentSeedKey: opening.deploymentSeedKey,
    formationArchetypes: opening.formationArchetypes,
    scenarioKey: state.scenario.scenarioKey,
    score: state.scenario.score,
    modelCount: state.pieces.length,
    deploymentZones: state.deploymentZones,
    routePositions: {
      opening: Object.fromEntries(Object.keys(injectedOpening.injectedPositions)
        .map((pieceKey) => [pieceKey, piece(injectedOpening.state, pieceKey).position])),
      terminal: Object.fromEntries(Object.keys(injectedOpening.injectedPositions)
        .map((pieceKey) => [pieceKey, piece(witness.state, pieceKey).position])),
    },
    terminalEvents,
    terminalActionTypes: witness.attack.selectionAudit.map((row) =>
      row.selectedAction.actionType),
    terminalActionKeys: witness.attack.selectionAudit.map((row) =>
      row.selectedAction.actionKey),
    preflight,
    reverseSearch: {
      terminalReplayStrict: reverse.result.terminalReplay.strictReplayCertified,
      legalDeploymentRouteCount: reverse.result.legalDeploymentRouteCount,
      fullRouteStrictReplayCertifiedCount:
        reverse.result.fullRouteStrictReplayCertifiedCount,
      oracleIsolationPassed: reverse.result.oracleIsolationPassed,
      unresolvedCount: reverse.result.unresolvedCount,
      rejectedBranchCount: reverse.result.rejectedBranchCount,
      reportHash: reverse.result.reportHash,
    },
    compactRouteEvidence: {
      path: path.relative(repositoryRoot, compactRouteEvidencePath),
      evidenceHash: compactEvidence.evidenceHash,
      fullRouteReplayHash: compactEvidence.fullRouteReplayHash,
      reverseEdgeCount: compactEvidence.reverseEdgeCount,
    },
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}
