#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

import { stableGraphHash, stableGraphValue } from
  "../src/graph/typed-facts-v2.mjs";
import { auditWarmachineLegalDeploymentReachabilityV1 } from
  "../src/reverse/deployment-reachability-v1.mjs";
import {
  reissueWarmachineTerminalReverseRouteV1,
  replayWarmachineTerminalReverseRouteV1,
} from "../src/reverse/replay-terminal-reverse-route-v1.mjs";
import { certifyWarmachineStrictSettlementHistoryBindingV1 } from
  "../src/reverse/steamroller-history-bound-terminal-hypothesis-v1.mjs";
import { warmachineReverseStateSemanticHashV1 } from
  "../src/reverse/terminal-event-predecessor-v1.mjs";
import { normalizeRulesV1State, warmachineHost } from
  "../src/warmachine-host-runtime.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const evidenceRoot = path.resolve(argumentValue("output") || path.join(
  repositoryRoot,
  ".scratch/custom-matchup-reports/sepsira-six-swarms-vs-fane-v1",
));
const routeId = argumentValue("route-id");
assert.ok(routeId, "--route-id is required");

const sourcePaths = {
  fixture: path.join(evidenceRoot,
    `${routeId}-forward-route-fixture-v1.json`),
  opening: path.join(evidenceRoot,
    `${routeId}-strict-route-opening-v1.json`),
  reverseReport: path.join(evidenceRoot,
    `${routeId}-root-to-opening-v1.json`),
  routeUnit: path.join(evidenceRoot, `${routeId}-route-unit-v1.json`),
  checkpoint: path.join(evidenceRoot,
    `${routeId}-historical-resume-checkpoint-v1.json.gz`),
};
const reissueReportPath = path.join(evidenceRoot,
  `${routeId}-current-host-score-route-reissue-v1.json`);
const progressPath = path.join(evidenceRoot,
  `${routeId}-current-host-score-route-reissue-progress-v1.json`);

function argumentValue(name, fallback = "") {
  const prefix = `--${name}=`;
  const argument = process.argv.find((value) => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : fallback;
}

function readJson(filePath) {
  assert.equal(fs.existsSync(filePath), true, `Missing evidence ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readGzipJson(filePath) {
  assert.equal(fs.existsSync(filePath), true, `Missing evidence ${filePath}`);
  return JSON.parse(zlib.gunzipSync(fs.readFileSync(filePath)));
}

function assertStoredHash(record, hashKey, label) {
  const expectedHash = String(record?.[hashKey] || "");
  assert.ok(expectedHash, `${label}: missing ${hashKey}`);
  const core = { ...record };
  delete core[hashKey];
  assert.equal(
    stableGraphHash(stableGraphValue(core)),
    expectedHash,
    `${label}: ${hashKey} mismatch`,
  );
  return expectedHash;
}

function writeJsonAtomic(filePath, value) {
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value)}\n`);
  fs.renameSync(temporaryPath, filePath);
}

function deploymentRectangles(state) {
  return Object.fromEntries((state.deploymentZones || []).map((zone) => {
    const zoneKey = String(zone.zoneKey || zone.deploymentZoneKey || zone.id);
    return [zoneKey, {
      id: zoneKey,
      x: Number(zone.xIn ?? zone.x),
      y: Number(zone.yIn ?? zone.y),
      width: Number(zone.widthIn ?? zone.width),
      height: Number(zone.heightIn ?? zone.height),
    }];
  }));
}

function settlementTransition(stage = {}, index = 0) {
  assert.ok(stage.preEndState, `stage ${index}: preEndState required`);
  assert.ok(stage.state, `stage ${index}: successor state required`);
  return {
    windowKey: `${routeId}:stage-${index + 1}:round-${
      stage.preEndState.turnNumber}:${stage.preEndState.activeSideKey}`,
    round: stage.preEndState.turnNumber,
    endingSideKey: stage.preEndState.activeSideKey,
    predecessorState: stage.preEndState,
    successorState: stage.state,
    actionPatch: {},
  };
}

function terminalEventFromFixture(fixture) {
  return (fixture.stages || []).flatMap((stage) =>
    stage.terminalEvents || []).find((event) =>
    event.eventType === "terminal") || null;
}

function challengerLeaderName(state = {}) {
  const leader = (state.pieces || []).find((piece) =>
    piece.sideKey === "player2" &&
    (piece.isWarcaster === true || piece.isWarlock === true));
  assert.ok(leader, "Score route challenger leader missing");
  return String(
    leader.cardSnapshot?.name || leader.cardName || leader.label || "",
  );
}

function compactReissue(result = {}) {
  const {
    reissuedRoute: _reissuedRoute,
    finalState: _finalState,
    ...report
  } = result;
  return report;
}

function compactReplay(result = {}) {
  const {
    finalState: _finalState,
    runtimeTrainingStateEntries: _runtimeTrainingStateEntries,
    ...report
  } = result;
  return report;
}

const fixture = readJson(sourcePaths.fixture);
const openingArtifact = readJson(sourcePaths.opening);
const sourceReverseReport = readJson(sourcePaths.reverseReport);
const sourceRouteUnit = readJson(sourcePaths.routeUnit);
const checkpointFile = readGzipJson(sourcePaths.checkpoint);
const routeUnitArtifactHash = assertStoredHash(
  sourceRouteUnit,
  "fixtureHash",
  "route unit",
);
const sourceHashes = {
  fixtureHash: assertStoredHash(fixture, "fixtureHash", "forward fixture"),
  openingEvidenceHash: assertStoredHash(
    openingArtifact,
    "openingEvidenceHash",
    "strict opening",
  ),
  reverseReportHash: assertStoredHash(
    sourceReverseReport,
    "reportHash",
    "reverse report",
  ),
  routeUnitFixtureHash:
    sourceRouteUnit.sourceEvidence?.routeUnitFixtureHash ||
    routeUnitArtifactHash,
  checkpointHash: assertStoredHash(
    checkpointFile.checkpoint,
    "checkpointHash",
    "historical checkpoint",
  ),
};
assert.equal(checkpointFile.fixtureHash, fixture.fixtureHash);
assert.equal(sourceReverseReport.fixtureHash, fixture.fixtureHash);
assert.equal(openingArtifact.subjectRosterKey, fixture.subjectRosterKey);
assert.equal(openingArtifact.challengerRosterKey, fixture.challengerRosterKey);
assert.equal(sourceRouteUnit.subjectRosterKey, fixture.subjectRosterKey);
assert.equal(sourceRouteUnit.challengerRosterKey, fixture.challengerRosterKey);

const openingState = normalizeRulesV1State(openingArtifact.openingState);
const openingStateHash = warmachineReverseStateSemanticHashV1(openingState);
assert.equal(openingStateHash, openingArtifact.strictOpeningStateHash);
const matchingFrontiers = (checkpointFile.checkpoint.frontiers || []).filter(
  (frontier) =>
    String(frontier.stateHash || "") === openingStateHash &&
    warmachineReverseStateSemanticHashV1(frontier.state) === openingStateHash &&
    Array.isArray(frontier.reverseEdges) && frontier.reverseEdges.length > 0,
);
assert.equal(matchingFrontiers.length, 1,
  "Expected exactly one archived frontier matching the selected opening");
const sourceFrontier = matchingFrontiers[0];
assert.equal(
  sourceFrontier.reverseEdges.length,
  sourceReverseReport.reverseEdgeCounts[0],
);

const deploymentAudit = auditWarmachineLegalDeploymentReachabilityV1(
  openingState,
  {
    firstPlayerSideKey: openingArtifact.openingAddress.firstPlayerSideKey,
    deployments: deploymentRectangles(openingState),
  },
);
assert.equal(deploymentAudit.ok, true,
  JSON.stringify(deploymentAudit.failedChecks, null, 2));
assert.equal(deploymentAudit.stateHash, openingStateHash);
const strictOpeningEvidenceCore = stableGraphValue({
  schemaVersion: "warmachine_current_host_reissued_opening_evidence_v1",
  routeId,
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  stateHash: openingStateHash,
  deploymentAuditHash: deploymentAudit.reportHash,
  sourceOpeningEvidenceHash: openingArtifact.openingEvidenceHash,
  sourceHostReceiptHash: openingArtifact.hostReceiptHash,
});
const strictOpeningEvidenceHash = stableGraphHash(strictOpeningEvidenceCore);

const sourceRoute = {
  candidateKey: String(
    sourceReverseReport.routeCandidateKeys?.[0] || sourceFrontier.labelKey,
  ),
  predecessorState: openingState,
  predecessorStateHash: openingStateHash,
  reverseEdges: sourceFrontier.reverseEdges,
  reversedPriorTurnCount: sourceFrontier.reversedPriorTurnCount,
};
let lastProgressCount = -1;
const reissue = reissueWarmachineTerminalReverseRouteV1(
  sourceRoute,
  fixture.terminalState,
  {
    routeKey: `${routeId}:current-host-reissue`,
    repairBlockedMovementPathWitness: true,
    repairBlockedUnitMovementAnchorWitness: true,
    requireSourceSuccessorStateHash: true,
    onProgress(progress) {
      const count = Number(progress.replayedEdgeCount || 0);
      if (count !== sourceRoute.reverseEdges.length && count % 5 !== 0) return;
      if (count === lastProgressCount) return;
      lastProgressCount = count;
      const progressCore = stableGraphValue({
        schemaVersion: "warmachine_ticket09_score_route_reissue_progress_v1",
        routeId,
        hostReceiptHash: warmachineHost.receipt.receiptHash,
        sourceCheckpointHash: sourceHashes.checkpointHash,
        sourceReverseEdgeCount: sourceRoute.reverseEdges.length,
        ...progress,
      });
      writeJsonAtomic(progressPath, {
        ...progressCore,
        progressHash: stableGraphHash(progressCore),
      });
      process.stdout.write(`${JSON.stringify({
        routeId,
        stage: progress.stage,
        replayedEdgeCount: count,
        reverseEdgeCount: sourceRoute.reverseEdges.length,
        transitionAccepted: progress.transitionAccepted,
      })}\n`);
    },
  },
);

let independentReplay = null;
let historyBinding = null;
if (reissue.ok) {
  independentReplay = replayWarmachineTerminalReverseRouteV1(
    reissue.reissuedRoute,
    fixture.terminalState,
    {
      routeKey: `${routeId}:current-host-independent-replay`,
      captureTrainingTrace: false,
    },
  );
  const settlementTransitions = fixture.stages.map(settlementTransition);
  historyBinding = certifyWarmachineStrictSettlementHistoryBindingV1({
    terminalHypothesis: {
      terminalHypothesisKey: `${routeId}-history-current-host`,
      terminalClassKey: "lead_three_after_opponent_turn_scoring",
      scenarioKey: "two_fronts",
      mapKey: openingArtifact.openingAddress.mapKey,
      terminalRound: 3,
      endingSideKey: "player2",
      winnerSideKey: "player1",
      loserSideKey: "player2",
    },
    settlementTransitions,
  });
}

const currentCertified = reissue.ok === true &&
  independentReplay?.fullRouteStrictReplayCertified === true &&
  historyBinding?.strictCertified === true;
const reportCore = stableGraphValue({
  schemaVersion: "warmachine_ticket09_score_route_current_host_reissue_v1",
  routeId,
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  sourceHostReceiptHash: fixture.hostReceiptHash,
  sourceHashes,
  sourceFrontier: {
    labelKey: sourceFrontier.labelKey,
    stateHash: sourceFrontier.stateHash,
    reverseEdgeCount: sourceFrontier.reverseEdges.length,
    reversedPriorTurnCount: sourceFrontier.reversedPriorTurnCount,
  },
  strictOpeningEvidence: {
    stateHash: openingStateHash,
    evidenceHash: strictOpeningEvidenceHash,
    deploymentAuditHash: deploymentAudit.reportHash,
  },
  reissue: compactReissue(reissue),
  independentReplay: independentReplay
    ? compactReplay(independentReplay)
    : null,
  historyBinding: historyBinding
    ? {
      bindingHash: historyBinding.bindingHash,
      strictCertified: historyBinding.strictCertified,
      finalScore: historyBinding.preset?.finalScore || null,
      failureCount: historyBinding.failures?.length || 0,
      failures: historyBinding.failures || [],
    }
    : null,
  currentCertified,
  priorReceiptHashesConsultedForExecution: false,
  claimBoundary: "Archived actions and explicit paths are proposal witnesses only. Every edge is freshly enumerated and executed under the current Host, then the complete route and score history are independently certified before a current route unit is published.",
});
const reissueReport = {
  ...reportCore,
  reportHash: stableGraphHash(reportCore),
};
writeJsonAtomic(reissueReportPath, reissueReport);

if (!currentCertified) {
  process.stderr.write(`${JSON.stringify({
    ok: false,
    routeId,
    reportHash: reissueReport.reportHash,
    reissueFailure: reissue.failures?.[0] || null,
    replayFailure: independentReplay?.failures?.[0] || null,
    historyFailures: historyBinding?.failures || [],
    outputPath: reissueReportPath,
  }, null, 2)}\n`);
  process.exitCode = 1;
} else {
  const terminalEvent = terminalEventFromFixture(fixture);
  assert.equal(terminalEvent?.winnerSideKey, "player1");
  assert.deepEqual(
    historyBinding.preset.finalScore,
    fixture.scoreTimeline.at(-1).score,
  );
  assert.equal(openingArtifact.rosterPointLedger.sides.player1.rosterPoints, 100);
  assert.equal(openingArtifact.rosterPointLedger.sides.player2.rosterPoints, 100);
  const unitCore = stableGraphValue({
    schemaVersion: "warmachine_ticket09_strict_route_unit_v1",
    routeId,
    routeKey: reissue.reissuedRoute.candidateKey,
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    terminalFamilyKey: "score",
    terminalSourceKey: "two_fronts_round3_lead_three_score_v1",
    leaderName: challengerLeaderName(fixture.injectedOpeningState),
    challengerSideKey: "player2",
    winnerSideKey: terminalEvent.winnerSideKey,
    subjectRosterKey: fixture.subjectRosterKey,
    challengerRosterKey: fixture.challengerRosterKey,
    rosterPointLedger: openingArtifact.rosterPointLedger,
    physicalModelCount: openingArtifact.physicalModelCount,
    openingKey: strictOpeningEvidenceHash,
    strictOpeningStateHash: openingStateHash,
    strictOpeningEvidenceHash,
    openingAddress: openingArtifact.openingAddress,
    strictRoute: {
      strictOpeningComplete: true,
      strictReplayComplete: true,
      assumptionClosureComplete: true,
      transitionCount: reissue.freshStrictTransitionCount,
      reverseEdgeCount: reissue.reverseEdgeCount,
      routeReceiptHashes: reissue.freshReceiptHashes,
      routeWitnessHash: reissue.reissueHash,
      fullRouteReplayHash: independentReplay.replayHash,
      semanticOutcomeHash: stableGraphHash({
        openingStateHash,
        terminalStateHash: reissue.expectedTerminalStateHash,
      }),
      historyBindingHash: historyBinding.bindingHash,
      unresolvedBranchCount: sourceReverseReport.unresolvedCount,
      rejectedBranchCount: sourceReverseReport.rejectedBranchCount,
      candidateSetComplete: false,
      opponentResponseSetComplete: false,
      chanceMassComplete: false,
      sourceSearchLedger: {
        hostReceiptHash: sourceReverseReport.hostReceiptHash,
        unresolvedBranchCount: sourceReverseReport.unresolvedCount,
        rejectedBranchCount: sourceReverseReport.rejectedBranchCount,
        currentCandidateCompletenessClaimed: false,
      },
    },
    observed: {
      scoreTimeline: fixture.scoreTimeline,
      terminalEvent,
    },
    replayMaterial: {
      openingState,
      terminalState: normalizeRulesV1State(fixture.terminalState),
      settlementTransitions: fixture.stages.map(settlementTransition),
    },
    evidenceFiles: {
      sourceForwardFixture: path.basename(sourcePaths.fixture),
      sourceStrictRouteOpening: path.basename(sourcePaths.opening),
      sourceReverseReport: path.basename(sourcePaths.reverseReport),
      currentHostReissueReport: path.basename(reissueReportPath),
    },
    sourceEvidence: {
      fixtureHash: fixture.fixtureHash,
      openingEvidenceHash: openingArtifact.openingEvidenceHash,
      reverseReportHash: sourceReverseReport.reportHash,
      routeUnitFixtureHash: sourceRouteUnit.fixtureHash,
      checkpointHash: checkpointFile.checkpoint.checkpointHash,
      sourceHostReceiptHash: fixture.hostReceiptHash,
    },
    claimBoundary: "This unit proves one current-Host score route from one exact legal deployment by fresh full-route reissue, independent replay and score-history certification. It does not prove adversarial defense, Chance closure, candidate completeness, strategy value or natural win rate.",
  });
  const unit = { ...unitCore, fixtureHash: stableGraphHash(unitCore) };
  writeJsonAtomic(sourcePaths.routeUnit, unit);
  writeJsonAtomic(progressPath, {
    schemaVersion: "warmachine_ticket09_score_route_reissue_progress_v1",
    routeId,
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    stage: "complete",
    replayedEdgeCount: reissue.replayedEdgeCount,
    reverseEdgeCount: reissue.reverseEdgeCount,
    currentCertified: true,
    routeUnitFixtureHash: unit.fixtureHash,
    reportHash: reissueReport.reportHash,
  });
  process.stdout.write(`${JSON.stringify({
    ok: true,
    routeId,
    routeKey: unit.routeKey,
    hostReceiptHash: unit.hostReceiptHash,
    reverseEdgeCount: unit.strictRoute.reverseEdgeCount,
    transitionCount: unit.strictRoute.transitionCount,
    reissueHash: unit.strictRoute.routeWitnessHash,
    replayHash: unit.strictRoute.fullRouteReplayHash,
    historyBindingHash: unit.strictRoute.historyBindingHash,
    reportHash: reissueReport.reportHash,
    fixtureHash: unit.fixtureHash,
    outputPath: sourcePaths.routeUnit,
  }, null, 2)}\n`);
}
