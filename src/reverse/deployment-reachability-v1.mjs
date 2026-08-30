import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { normalizeRulesV1State } from "../warmachine-host-runtime.mjs";
import {
  auditDeploymentTokens,
  warmachineConstructionHost,
} from "../warmachine-construction-host-runtime.mjs";
import { warmachinePieceInPlayV1 } from "./piece-lifecycle-v1.mjs";
import { warmachineReverseStateSemanticHashV1 } from
  "./terminal-event-predecessor-v1.mjs";

export const WARMACHINE_DEPLOYMENT_REACHABILITY_V1_SCHEMA =
  "warmachine_deployment_reachability_v1";
export const WARMACHINE_DECLARED_MOVEMENT_DEPLOYMENT_LOWER_BOUND_V1_SCHEMA =
  "warmachine_declared_movement_deployment_reachability_lower_bound_v1";

function numeric(value, fallback = 0) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function baseLabel(piece = {}) {
  const millimeters = Math.round(Math.max(0.1,
    numeric(piece.baseSizeIn ?? piece.baseDiameterIn, 1.18)) * 25.4);
  const standard = [30, 40, 50, 80, 100, 120].sort((left, right) =>
    Math.abs(left - millimeters) - Math.abs(right - millimeters))[0];
  return `${standard}mm`;
}

function lifecycleIssues(piece = {}) {
  const issues = [];
  if (piece.destroyed === true) issues.push("destroyed");
  if (piece.removedFromPlay === true) issues.push("removed_from_play");
  if (piece.offTable === true) issues.push("off_table");
  if (piece.notDeployed === true) issues.push("not_deployed");
  if (piece.dormantReplacement === true || piece.replacementStartsDormant === true) {
    issues.push("dormant_replacement");
  }
  const boxes = numeric(piece.damage?.boxesRemaining ?? piece.boxesRemaining, 1);
  const maximum = numeric(piece.damage?.maxBoxes ?? piece.maxBoxes, boxes);
  if (boxes <= 0) issues.push("zero_boxes");
  if (boxes < maximum) issues.push("preexisting_damage");
  return issues;
}

function tokenForPiece(piece = {}) {
  return {
    id: piece.pieceKey,
    pieceKey: piece.pieceKey,
    label: piece.label || piece.pieceKey,
    sideKey: piece.sideKey,
    x: numeric(piece.position?.xIn),
    y: numeric(piece.position?.yIn),
    base: baseLabel(piece),
    unitGroupId: piece.unitGroupId || "",
    rosterEntryId: piece.rosterEntryId || "",
    attachedToPieceKey: piece.attachedToPieceKey || "",
    attachmentHostPieceKey: piece.attachmentHostPieceKey || "",
    scenario: false,
    offTable: false,
    notDeployed: false,
    dormantReplacement: false,
  };
}

function activationGroupKey(piece = {}) {
  return String(
    piece.unitGroupId || piece.unitId || piece.metadata?.unitGroupId ||
    piece.metadata?.unitId || piece.pieceKey || "",
  );
}

function deploymentZoneForSide(deployments = {}, sideKey = "") {
  const source = sideKey === "player1"
    ? deployments.p1_deploy || deployments.player1
    : deployments.p2_deploy || deployments.player2;
  if (!source) return null;
  return {
    x: numeric(source.xIn ?? source.x),
    y: numeric(source.yIn ?? source.y),
    width: Math.max(0, numeric(source.widthIn ?? source.width)),
    height: Math.max(0, numeric(source.heightIn ?? source.height)),
  };
}

function declaredMovementAllowanceIn(piece = {}, movementGroup = {}) {
  const explicitByPiece = movementGroup.maximumMovementInByPieceKey?.[
    piece.pieceKey
  ];
  const explicit = Number.isFinite(Number(explicitByPiece))
    ? Number(explicitByPiece)
    : Number.isFinite(Number(movementGroup.maximumMovementIn))
      ? Number(movementGroup.maximumMovementIn)
      : null;
  const additional = Math.max(0, numeric(
    movementGroup.additionalMovementAllowanceInByPieceKey?.[piece.pieceKey] ??
      movementGroup.additionalMovementAllowanceIn,
    0,
  ));
  if (explicit !== null) {
    return {
      allowanceIn: Math.max(0, explicit),
      allowanceSource: "explicit_declared_upper_bound",
    };
  }
  const actionType = String(movementGroup.actionType || "").toLowerCase();
  const speedIn = Math.max(0, numeric(piece.speedIn));
  if (actionType === "run") {
    return {
      allowanceIn: speedIn + 5 + additional,
      allowanceSource: additional > 0
        ? "current_speed_plus_run_constant_plus_declared_additional"
        : "current_speed_plus_run_constant",
    };
  }
  if (["advance", "normal_movement"].includes(actionType)) {
    return {
      allowanceIn: speedIn + additional,
      allowanceSource: additional > 0
        ? "current_speed_plus_declared_additional"
        : "current_speed",
    };
  }
  return {
    allowanceIn: null,
    allowanceSource: "unsupported_declared_movement_action_type",
  };
}

function distanceToLegalDeploymentCenterRectangle(piece = {}, zone = {}) {
  const radiusIn = Math.max(0, numeric(
    piece.baseRadiusIn,
    numeric(piece.baseSizeIn ?? piece.baseDiameterIn, 1.18) / 2,
  ));
  const bounds = {
    xMin: zone.x - zone.width / 2 + radiusIn,
    xMax: zone.x + zone.width / 2 - radiusIn,
    yMin: zone.y - zone.height / 2 + radiusIn,
    yMax: zone.y + zone.height / 2 - radiusIn,
  };
  if (bounds.xMin > bounds.xMax || bounds.yMin > bounds.yMax) {
    return {
      bounds,
      nearestLegalDeploymentCenter: null,
      minimumDistanceIn: null,
      legalCenterRectangleExists: false,
    };
  }
  const xIn = numeric(piece.position?.xIn);
  const yIn = numeric(piece.position?.yIn);
  const nearestLegalDeploymentCenter = {
    xIn: Math.max(bounds.xMin, Math.min(bounds.xMax, xIn)),
    yIn: Math.max(bounds.yMin, Math.min(bounds.yMax, yIn)),
  };
  return {
    bounds,
    nearestLegalDeploymentCenter,
    minimumDistanceIn: Math.hypot(
      xIn - nearestLegalDeploymentCenter.xIn,
      yIn - nearestLegalDeploymentCenter.yIn,
    ),
    legalCenterRectangleExists: true,
  };
}

function crossSideOverlapPairs(state = {}, sideKey = "") {
  const ownPieces = (state.pieces || []).filter((piece) =>
    piece.sideKey === sideKey && warmachinePieceInPlayV1(piece));
  const opposingPieces = (state.pieces || []).filter((piece) =>
    piece.sideKey !== sideKey && warmachinePieceInPlayV1(piece));
  const overlaps = [];
  for (const own of ownPieces) {
    for (const opposing of opposingPieces) {
      const centerDistanceIn = Math.hypot(
        numeric(own.position?.xIn) - numeric(opposing.position?.xIn),
        numeric(own.position?.yIn) - numeric(opposing.position?.yIn),
      );
      const requiredMinimumCenterDistanceIn =
        numeric(own.baseSizeIn ?? own.baseDiameterIn, 1.18) / 2 +
        numeric(opposing.baseSizeIn ?? opposing.baseDiameterIn, 1.18) / 2;
      if (centerDistanceIn + 0.001 >= requiredMinimumCenterDistanceIn) continue;
      overlaps.push({
        ownPieceKey: own.pieceKey,
        opposingPieceKey: opposing.pieceKey,
        centerDistanceIn,
        requiredMinimumCenterDistanceIn,
      });
    }
  }
  return overlaps;
}

export function auditWarmachineSideDeploymentGeometryV1(
  stateInput = {},
  rawOptions = {},
) {
  const state = normalizeRulesV1State(stateInput);
  const sideKey = String(rawOptions.sideKey || "");
  const deployments = rawOptions.deployments || {};
  if (!["player1", "player2"].includes(sideKey)) {
    throw new Error("side_deployment_geometry_requires_player_side");
  }
  if (!deployments.p1_deploy || !deployments.p2_deploy) {
    throw new Error("side_deployment_geometry_requires_both_deployment_zones");
  }
  const aliveSidePieces = (state.pieces || []).filter((piece) =>
    piece.sideKey === sideKey && warmachinePieceInPlayV1(piece));
  const tokens = Object.fromEntries(aliveSidePieces.map((piece) => [
    piece.pieceKey,
    tokenForPiece(piece),
  ]));
  const deploymentAudit = auditDeploymentTokens({ tokens, deployments });
  const crossSideOverlaps = crossSideOverlapPairs(state, sideKey);
  const checks = {
    sideHasInPlayModels: aliveSidePieces.length > 0,
    strictSideDeploymentGeometry: deploymentAudit.ok === true,
    noCrossSideBaseOverlap: crossSideOverlaps.length === 0,
  };
  const failedChecks = Object.entries(checks).filter(([, passed]) => !passed)
    .map(([key]) => key);
  const core = {
    schemaVersion: "warmachine_side_deployment_geometry_v1",
    stateHash: warmachineReverseStateSemanticHashV1(state),
    sideKey,
    inPlayModelCount: aliveSidePieces.length,
    checks,
    failedChecks,
    deploymentAudit: stableGraphValue(deploymentAudit),
    crossSideOverlapPairs: stableGraphValue(crossSideOverlaps),
    claimBoundary: "This checks one side's surviving models at a declared first-activation boundary. It proves deployment-zone, internal overlap, unit-coherency, attachment-distance, and cross-side overlap geometry only; it does not assert that opponent effects could not previously move or remove models.",
  };
  return {
    ...core,
    auditHash: stableGraphHash(stableGraphValue(core)),
    ok: failedChecks.length === 0,
  };
}

export function
auditWarmachineDeclaredMovementDeploymentReachabilityLowerBoundV1(
  stateInput = {},
  rawOptions = {},
) {
  const state = normalizeRulesV1State(stateInput);
  const sideKey = String(rawOptions.sideKey || "");
  const deployments = rawOptions.deployments || {};
  const movementGroups = Array.isArray(rawOptions.movementGroups)
    ? rawOptions.movementGroups
    : [];
  if (!["player1", "player2"].includes(sideKey)) {
    throw new Error("declared_movement_deployment_lower_bound_requires_player_side");
  }
  const zone = deploymentZoneForSide(deployments, sideKey);
  if (!zone) {
    throw new Error("declared_movement_deployment_lower_bound_requires_side_zone");
  }
  const inPlaySidePieces = (state.pieces || []).filter((piece) =>
    piece.sideKey === sideKey && warmachinePieceInPlayV1(piece));
  const pieceAudits = [];
  const violations = [];
  for (const movementGroup of movementGroups.slice().sort((left, right) =>
    String(left.groupKey || "").localeCompare(String(right.groupKey || "")))) {
    const groupKey = String(movementGroup.groupKey || "");
    const members = inPlaySidePieces.filter((piece) =>
      activationGroupKey(piece) === groupKey);
    if (!groupKey || !members.length) {
      violations.push({
        groupKey,
        reason: groupKey
          ? "declared_movement_group_has_no_in_play_models"
          : "declared_movement_group_key_missing",
      });
      continue;
    }
    for (const piece of members) {
      const allowance = declaredMovementAllowanceIn(piece, movementGroup);
      const geometry = distanceToLegalDeploymentCenterRectangle(piece, zone);
      const withinLowerBound = geometry.legalCenterRectangleExists === true &&
        allowance.allowanceIn !== null &&
        geometry.minimumDistanceIn <= allowance.allowanceIn + 0.001;
      const row = stableGraphValue({
        groupKey,
        pieceKey: piece.pieceKey,
        actionType: String(movementGroup.actionType || ""),
        position: piece.position,
        speedIn: numeric(piece.speedIn),
        movementAllowanceIn: allowance.allowanceIn,
        allowanceSource: allowance.allowanceSource,
        minimumDistanceToLegalDeploymentCenterIn:
          geometry.minimumDistanceIn,
        nearestLegalDeploymentCenter:
          geometry.nearestLegalDeploymentCenter,
        legalDeploymentCenterBounds: geometry.bounds,
        withinLowerBound,
      });
      pieceAudits.push(row);
      if (withinLowerBound) continue;
      violations.push(stableGraphValue({
        ...row,
        reason: !geometry.legalCenterRectangleExists
          ? "deployment_zone_has_no_legal_center_for_base"
          : allowance.allowanceIn === null
            ? "declared_movement_action_type_unsupported"
            : "deployment_distance_exceeds_declared_movement_allowance",
      }));
    }
  }
  const checks = {
    movementGroupsDeclared: movementGroups.length > 0,
    everyDeclaredGroupResolved: !violations.some((row) => [
      "declared_movement_group_has_no_in_play_models",
      "declared_movement_group_key_missing",
    ].includes(row.reason)),
    everyDeclaredModelWithinOptimisticMovementLowerBound:
      violations.length === 0,
  };
  const failedChecks = Object.entries(checks).filter(([, passed]) => !passed)
    .map(([key]) => key);
  const core = stableGraphValue({
    schemaVersion:
      WARMACHINE_DECLARED_MOVEMENT_DEPLOYMENT_LOWER_BOUND_V1_SCHEMA,
    stateHash: warmachineReverseStateSemanticHashV1(state),
    sideKey,
    deploymentZone: zone,
    movementGroups,
    checks,
    failedChecks,
    pieceAudits,
    violations,
    claimBoundary: "This is an optimistic necessary condition for one declared movement activation between a legal deployment center and the observed model center. It ignores terrain, bases, path length beyond straight-line distance, formation, timing, effects, and activation order. Passing does not prove reachability; failing proves the declared movement envelope cannot reach deployment unless the caller omitted a valid movement modifier or displacement effect.",
  });
  return {
    ...core,
    auditHash: stableGraphHash(core),
    ok: failedChecks.length === 0,
  };
}

export function auditWarmachineLegalDeploymentReachabilityV1(
  stateInput = {},
  rawOptions = {},
) {
  const state = normalizeRulesV1State(stateInput);
  const firstPlayerSideKey = String(rawOptions.firstPlayerSideKey || "player1");
  const deployments = rawOptions.deployments || {};
  if (!deployments.p1_deploy || !deployments.p2_deploy) {
    throw new Error("deployment_reachability_requires_both_deployment_zones");
  }
  const lifecycle = (state.pieces || []).map((piece) => ({
    pieceKey: piece.pieceKey,
    issues: lifecycleIssues(piece),
  })).filter((row) => row.issues.length > 0);
  const activatedPieceKeys = (state.pieces || []).filter((piece) =>
    piece.activated === true).map((piece) => piece.pieceKey).sort();
  const tokens = Object.fromEntries((state.pieces || []).map((piece) => [
    piece.pieceKey,
    tokenForPiece(piece),
  ]));
  const deploymentAudit = auditDeploymentTokens({ tokens, deployments });
  const score = state.scenario?.score || {};
  const scoringHistory = state.scenario?.scoringHistory || [];
  const timingChecks = {
    turnNumberOne: Number(state.turnNumber) === 1,
    firstPlayerActive: state.activeSideKey === firstPlayerSideKey,
    controlPhaseStart: state.phaseKey === "control" &&
      ["", "maintenance"].includes(String(state.controlPhaseStepKey || "")),
    noActivatedModels: activatedPieceKeys.length === 0,
    zeroScenarioScore: Number(score.player1 || 0) === 0 && Number(score.player2 || 0) === 0,
    emptyScoringHistory: scoringHistory.length === 0,
  };
  const checks = {
    completeOpeningLifecycle: lifecycle.length === 0,
    strictDeploymentGeometry: deploymentAudit.ok === true,
    ...timingChecks,
  };
  const failedChecks = Object.entries(checks).filter(([, passed]) => !passed)
    .map(([key]) => key);
  const core = {
    schemaVersion: WARMACHINE_DEPLOYMENT_REACHABILITY_V1_SCHEMA,
    stateKey: String(state.stateKey || ""),
    stateHash: warmachineReverseStateSemanticHashV1(state),
    firstPlayerSideKey,
    modelCount: state.pieces.length,
    checks,
    failedChecks,
    lifecycleIssues: stableGraphValue(lifecycle),
    activatedPieceKeys,
    deploymentAudit: stableGraphValue(deploymentAudit),
    upstreamConstructionReceiptHash: warmachineConstructionHost.receipt.receiptHash,
    strictDeploymentLegal: deploymentAudit.ok === true,
    legalDeploymentReached: failedChecks.length === 0,
    trainingTruth: false,
    claimBoundary: "This certifies that one concrete complete-roster rules state is a legal turn-one deployment boundary under the Construction Host and opening lifecycle/timing checks. It does not prove the finite formation library or continuous deployment space is exhausted, nor that any route to this state is strategically optimal.",
  };
  return {
    ...core,
    reportHash: stableGraphHash(stableGraphValue(core)),
    ok: core.legalDeploymentReached,
  };
}
