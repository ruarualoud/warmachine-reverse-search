import assert from "node:assert/strict";

import { publishWarmachineReverseReachabilityV1 } from
  "../src/report/reachability-publication-v1.mjs";
import {
  assassinationDeploymentSearch,
  assassinationTerminalDomain,
  assassinationTerminalState,
} from "./verify-terminal-event-predecessor-v1.mjs";

const terminalCell = assassinationTerminalDomain.cells[0];
const route = assassinationDeploymentSearch.routes[0];
assert.ok(route);
assert.equal(route.fullRouteStrictReplayCertified, true);
const evidenceHash = route.strictReceiptHashes[0] || route.candidateKey;
const assumptionEvidenceByKey = Object.fromEntries(
  Object.keys(terminalCell.assumptionSources || {}).map((assumptionKey) => [
    assumptionKey,
    {
      status: "strict-certified",
      evidenceKind: "independent_rules_v1_replay",
      evidenceHashes: [evidenceHash],
      requiredForTraining: true,
    },
  ]),
);
const publication = publishWarmachineReverseReachabilityV1({
  terminalCell,
  terminalState: assassinationTerminalState,
  searchReport: assassinationDeploymentSearch,
  routeCandidateKey: route.candidateKey,
  assumptionEvidenceByKey,
  probabilityClosure: {
    complete: true,
    massConserved: true,
    closureKind: "micro_terminal_strict_existence_partition",
  },
  opponentResponseClosure: {
    complete: true,
    closureKind: "micro_full_turn_response_recovered",
  },
  maximumControlSteps: 64,
});

assert.equal(publication.ok, true);
assert.equal(publication.trainingGate.eligible, true,
  JSON.stringify(publication.trainingGate.failedChecks));
assert.equal(publication.humanReport.trainingGate.eligible, true);
assert.ok(publication.humanReport.markdown.includes("反推层"));
assert.ok(publication.humanReport.routeLayers.length > 0);
assert.ok(publication.humanReport.roster.length >= 3);
assert.equal(publication.trainingTrajectory.candidateCount, 1);
assert.equal(publication.trainingTrajectory.trainingTruth, true);
assert.ok(publication.trainingTrajectory.candidates[0].decisions.length > 0);
assert.ok(Object.keys(publication.trainingTrajectory.candidates[0].states).length > 0);
assert.equal(publication.trainingTrajectory.negativeExamples.length, 0);
assert.equal(publication.trainingTrajectory.strategyPolicyTargetsPresent, false);
assert.equal(publication.trainingTrajectory.strategyValueTargetsPresent, false);
assert.equal(publication.trainingTrajectory.naturalWinRateClaimPresent, false);
assert.equal(publication.trainingTrajectory.globalOptimalityClaimPresent, false);

const denied = publishWarmachineReverseReachabilityV1({
  terminalCell,
  terminalState: assassinationTerminalState,
  searchReport: assassinationDeploymentSearch,
  routeCandidateKey: route.candidateKey,
  assumptionEvidenceByKey: {},
  probabilityClosure: { complete: false, massConserved: false },
  opponentResponseClosure: { complete: false },
  maximumControlSteps: 64,
});
assert.equal(denied.trainingGate.eligible, false);
assert.equal(denied.trainingTrajectory.candidateCount, 0);
assert.equal(denied.trainingTrajectory.trainingTruth, false);
assert.equal(denied.trainingTrajectory.negativeExamples.length, 0);
assert.ok(denied.trainingTrajectory.deniedReasons.includes("probabilityClosure"));
assert.ok(denied.trainingTrajectory.deniedReasons.includes("opponentResponseClosure"));
assert.ok(denied.trainingTrajectory.deniedReasons.includes(
  "requiredAssumptionsStrictCertified",
));

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_reachability_publication_v1",
  publicationHash: publication.publicationHash,
  humanReportHash: publication.humanReportHash,
  trajectoryDecisionCount:
    publication.trainingTrajectory.candidates[0].decisions.length,
  trajectoryStateCount:
    Object.keys(publication.trainingTrajectory.candidates[0].states).length,
  deniedReasons: denied.trainingTrajectory.deniedReasons,
}, null, 2));
