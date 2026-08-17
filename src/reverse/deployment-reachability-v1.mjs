import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { normalizeRulesV1State } from "../warmachine-host-runtime.mjs";
import {
  auditDeploymentTokens,
  warmachineConstructionHost,
} from "../warmachine-construction-host-runtime.mjs";
import { warmachineReverseStateSemanticHashV1 } from
  "./terminal-event-predecessor-v1.mjs";

export const WARMACHINE_DEPLOYMENT_REACHABILITY_V1_SCHEMA =
  "warmachine_deployment_reachability_v1";

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
