#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stableGraphHash, stableGraphValue } from
  "../src/graph/typed-facts-v2.mjs";
import {
  buildWarmachineKnownRouteLocalAdversarialValueV1,
  replayWarmachineKnownRouteAdversarialCounterexampleV1,
} from "../src/search/known-route-adversarial-counterexample-v1.mjs";
import { buildWarmachineCurrentWindowAdversarialFrontierV1 } from
  "../src/search/current-window-adversarial-frontier-v1.mjs";
import { WarmachineExternalDagStore } from
  "../src/storage/external-dag-v1.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const evidenceRoot = path.resolve(process.argv.find((argument) =>
  argument.startsWith("--output-root="))?.slice("--output-root=".length) ||
  path.join(
    repositoryRoot,
    ".scratch/custom-matchup-reports/sepsira-six-swarms-vs-fane-v1",
  ));
const routeUnitPath = path.resolve(process.argv.find((argument) =>
  argument.startsWith("--route-unit="))?.slice("--route-unit=".length) ||
  path.join(evidenceRoot, "ticket09-nymara-assassination-route-unit-v1.json"));
const outputPath = path.join(
  evidenceRoot,
  "ticket21a-nymara-known-route-counterexample-v1.json",
);
const frontierOutputPath = path.join(
  evidenceRoot,
  "ticket21a-nymara-current-window-frontier-v1.json",
);

const routeUnit = JSON.parse(fs.readFileSync(routeUnitPath, "utf8"));
const startedAtMs = Date.now();
let lastReportedStep = -1;
let deviationWindowMaterial = null;
const counterexample = replayWarmachineKnownRouteAdversarialCounterexampleV1(
  routeUnit,
  {
    settlementTransitionIndex: 0,
    startStepIndex: 22,
    deviationStepIndex: 25,
    alternateSelector: {
      actionType: "pass",
      actorPieceKey: "player2_nymara_the_shadowblade_1_1",
    },
    taskContract: {
      taskKey: "ticket21a-nymara-fixed-route-counterexample-v1",
      querySideKey: "player1",
      goalKey: "two-fronts-round2-sepsira-raptor-assassination",
      goalKind: "route_terminal_goal",
      terminalFamilyKey: "assassination",
      terminalSourceKey: routeUnit.terminalSourceKey,
      horizonKind: "not_later_than_round",
      horizonRound: 2,
      informationContractKey: "host-state-before-each-decision-no-future-dice",
      futureChanceVisible: false,
    },
    onProgress(progress) {
      const stepIndex = Number(progress.stepIndex ?? -1);
      const stepComplete = progress.stage === "shared_prefix_step_complete" ||
        progress.stage === "route_branch_step_complete";
      if (stepComplete && stepIndex === lastReportedStep) return;
      lastReportedStep = stepIndex;
      process.stderr.write(`${JSON.stringify({
        elapsedSeconds: Math.round((Date.now() - startedAtMs) / 1000),
        ...progress,
      })}\n`);
    },
    onDeviationWindowMaterialized(material) {
      deviationWindowMaterial = material;
    },
  },
);
const localValue = buildWarmachineKnownRouteLocalAdversarialValueV1(
  counterexample,
);
if (!deviationWindowMaterial) {
  throw new Error("ticket21a_deviation_window_material_missing");
}
const frontierConfigHash = stableGraphHash(stableGraphValue({
  schemaVersion: "ticket21a_nymara_current_window_frontier_config_v1",
  taskContract: counterexample.taskContract,
  currentDecisionWindowDomainHash:
    counterexample.deviation.currentDecisionWindowDomainHash,
  startIndex: 0,
  limit: 256,
}));
const frontierStoreRoot = path.join(
  evidenceRoot,
  `ticket21a-frontier-store-${counterexample.counterexampleReceiptHash.slice(0, 16)}`,
);
const frontierStore = new WarmachineExternalDagStore(frontierStoreRoot, {
  hostReceiptHash: counterexample.currentHostReceiptHash,
  sourceHash: counterexample.counterexampleReceiptHash,
  configHash: frontierConfigHash,
});
const adversarialFrontier =
  buildWarmachineCurrentWindowAdversarialFrontierV1(
    deviationWindowMaterial.inputState,
    deviationWindowMaterial.enumeration,
    {
      taskKey: counterexample.taskContract.taskKey,
      querySideKey: counterexample.taskContract.querySideKey,
      startIndex: 0,
      limit: 256,
      successorEnumerationScopeKind: "selected_actor_and_actorless",
      enumeratedInputStateReference: deviationWindowMaterial.inputState,
      persistState(state) {
        return frontierStore.putState(state);
      },
      onProgress(progress) {
        process.stderr.write(`${JSON.stringify({
          elapsedSeconds: Math.round((Date.now() - startedAtMs) / 1000),
          ...progress,
        })}\n`);
      },
    },
  );
const frontierCore = stableGraphValue({
  schemaVersion: "warmachine_ticket21a_current_window_frontier_evidence_v1",
  counterexampleReceiptHash: counterexample.counterexampleReceiptHash,
  localValueReceiptHash: localValue.localValueReceiptHash,
  frontierConfigHash,
  frontierStorePath: path.relative(repositoryRoot, frontierStoreRoot),
  adversarialFrontier,
  claimBoundary:
    "This artifact expands one scoped current-Host decision window by one ply. Persisted successor states support later continuation, but deeper turns, Chance and any Host rows outside the applied enumeration scope remain unresolved.",
});
const frontierReport = {
  ...frontierCore,
  reportHash: stableGraphHash(frontierCore),
};
const core = stableGraphValue({
  schemaVersion: "warmachine_ticket21a_known_route_counterexample_evidence_v1",
  routeUnitPath: path.relative(repositoryRoot, routeUnitPath),
  routeUnitFixtureHash: routeUnit.fixtureHash,
  counterexample,
  localValue,
  adversarialFrontierEvidence: {
    outputPath: path.relative(repositoryRoot, frontierOutputPath),
    reportHash: frontierReport.reportHash,
    adversarialFrontierReceiptHash:
      adversarialFrontier.adversarialFrontierReceiptHash,
    onePlyFrontierReady: adversarialFrontier.onePlyFrontierReady,
    hostAcceptedActionCount: adversarialFrontier.hostAcceptedActionCount,
    edgeCount: adversarialFrontier.edges.length,
    fullOpponentTurnComplete:
      adversarialFrontier.fullOpponentTurnComplete,
  },
  elapsedMs: Date.now() - startedAtMs,
  claimBoundary:
    "This artifact proves at most one current-Host cooperative script and one strict opponent deviation. It keeps the whole-game interval open and is not a natural win-rate, adaptive-policy or global-optimality claim.",
});
const report = { ...core, reportHash: stableGraphHash(core) };
fs.mkdirSync(evidenceRoot, { recursive: true });
const temporaryFrontierPath = `${frontierOutputPath}.tmp-${process.pid}`;
fs.writeFileSync(
  temporaryFrontierPath,
  `${JSON.stringify(frontierReport)}\n`,
);
fs.renameSync(temporaryFrontierPath, frontierOutputPath);
const temporaryPath = `${outputPath}.tmp-${process.pid}`;
fs.writeFileSync(temporaryPath, `${JSON.stringify(report)}\n`);
fs.renameSync(temporaryPath, outputPath);
process.stdout.write(`${JSON.stringify({
  ok: counterexample.ok && localValue.ok,
  outputPath,
  reportHash: report.reportHash,
  counterexampleReceiptHash: counterexample.counterexampleReceiptHash,
  localValueReceiptHash: localValue.localValueReceiptHash,
  currentHostCooperativeRouteExists:
    counterexample.currentHostCooperativeRouteExists,
  currentHostConditionalCooperativeSuffixExists:
    counterexample.currentHostConditionalCooperativeSuffixExists,
  counterBlocksFixedRoute: counterexample.counterBlocksFixedRoute,
  knownCounterexampleStrict: counterexample.knownCounterexampleStrict,
  fixedRouteBefore:
    localValue.fixedRouteScriptValueBeforeKnownCounterresponse,
  fixedRouteAfter:
    localValue.fixedRouteScriptValueAfterKnownCounterresponse,
  wholeGameAfter: localValue.wholeGameValueAfterKnownCounterresponse,
  adversarialFrontier: {
    outputPath: frontierOutputPath,
    reportHash: frontierReport.reportHash,
    receiptHash: adversarialFrontier.adversarialFrontierReceiptHash,
    onePlyFrontierReady: adversarialFrontier.onePlyFrontierReady,
    edgeCount: adversarialFrontier.edges.length,
    successorStatesPersisted: adversarialFrontier.successorStatesPersisted,
    unresolvedReasons: adversarialFrontier.unresolvedReasons,
  },
  elapsedMs: core.elapsedMs,
}, null, 2)}\n`);
