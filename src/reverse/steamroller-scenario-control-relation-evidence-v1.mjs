import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { warmachineHost } from "../warmachine-host-runtime.mjs";
import {
  buildWarmachineSteamrollerScoreTerminalAnchorProposalV1,
  WARMACHINE_STEAMROLLER_SCORE_TERMINAL_ANCHOR_ROSTER_RECEIPT_V1,
} from "./steamroller-score-terminal-anchor-proposals-v1.mjs";
import { materializeWarmachineSteamrollerScoreTerminalBatchV1 } from
  "./steamroller-score-terminal-materialization-batch-v1.mjs";
import { buildWarmachineSteamrollerTerminalScenarioCorpusV1 } from
  "./steamroller-terminal-scenario-corpus-v1.mjs";

export const WARMACHINE_STEAMROLLER_SCENARIO_CONTROL_RELATION_EVIDENCE_V1_SCHEMA =
  "warmachine_steamroller_scenario_control_relation_evidence_v1";

const MODES = Object.freeze(["contested", "controller_ineligible"]);

function controlPartitionEvidence(root = {}) {
  return (root.partitionAudit?.evidence || []).find((row) =>
    row.partitionKey === "scenarioControl") || null;
}

export function buildWarmachineSteamrollerScenarioControlRelationEvidenceV1({
  corpus = null,
} = {}) {
  const baselineCorpus = corpus || buildWarmachineSteamrollerTerminalScenarioCorpusV1({
    rosterReceiptHash: WARMACHINE_STEAMROLLER_SCORE_TERMINAL_ANCHOR_ROSTER_RECEIPT_V1,
  });
  const proposals = MODES.map((mode) =>
    buildWarmachineSteamrollerScoreTerminalAnchorProposalV1(
      "pressure_point",
      {
        proposalKey: `pressure-point-scenario-control-${mode}-v1`,
        scenarioControlMode: mode,
      },
    ));
  const batch = materializeWarmachineSteamrollerScoreTerminalBatchV1({
    corpus: baselineCorpus,
    proposals,
  });
  if (batch.strictMaterializedRootCount !== MODES.length ||
      batch.runtimeRoots.length !== MODES.length) {
    throw new Error(`scenario_control_relation_materialization_failed:${batch.batchHash}`);
  }
  const roots = batch.results.map((root) => {
    const controlEvidence = controlPartitionEvidence(root);
    if (!controlEvidence?.passed) {
      throw new Error(`scenario_control_relation_partition_failed:${root.subcellKey}`);
    }
    return stableGraphValue({
      ...root,
      scenarioControlEvidenceHash: stableGraphHash(controlEvidence),
      scenarioControlWitness: controlEvidence.observed?.witness || null,
      scenarioControlWitnessRow: controlEvidence.observed?.witnessRow || null,
    });
  });
  const core = {
    schemaVersion: WARMACHINE_STEAMROLLER_SCENARIO_CONTROL_RELATION_EVIDENCE_V1_SCHEMA,
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    strictMaterializedRootCount: roots.length,
    strictRejectedRootCount: 0,
    roots,
    claimBoundary: "This evidence proves two exact Pressure Point score-terminal subcells. In one, eligible models from both sides contest the center 50 mm objective and neither secures it. In the other, a real Fane solo is within range of that objective but is excluded from control and contest while occupying an exactly mapped standard building. Both roots score a separate Scenario Terrain element, execute the full strict historical scoring prefix plus terminal settlement, and independently replay. They do not prove deployment reachability, arbitrary control combinations, strategy value or training truth.",
    trainingTruth: false,
  };
  return {
    evidence: stableGraphValue({ ...core, evidenceHash: stableGraphHash(core) }),
    runtimeRoots: batch.runtimeRoots,
  };
}
