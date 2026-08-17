import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import {
  buildWarmachineSteamrollerScoreTerminalAnchorProposalsV1,
  WARMACHINE_STEAMROLLER_SCORE_TERMINAL_ANCHOR_ROSTER_RECEIPT_V1,
} from
  "./steamroller-score-terminal-anchor-proposals-v1.mjs";
import { materializeWarmachineSteamrollerScoreTerminalBatchV1 } from
  "./steamroller-score-terminal-materialization-batch-v1.mjs";
import { buildWarmachineSteamrollerTerminalScenarioCorpusV1 } from
  "./steamroller-terminal-scenario-corpus-v1.mjs";

export const WARMACHINE_STEAMROLLER_SCORE_TERMINAL_ANCHOR_EVIDENCE_V1_SCHEMA =
  "warmachine_steamroller_score_terminal_anchor_evidence_v1";

export function buildWarmachineSteamrollerScoreTerminalAnchorEvidenceV1({
  corpusOptions = {},
} = {}) {
  const boundCorpusOptions = {
    ...corpusOptions,
    rosterReceiptHash: corpusOptions.rosterReceiptHash ||
      WARMACHINE_STEAMROLLER_SCORE_TERMINAL_ANCHOR_ROSTER_RECEIPT_V1,
  };
  const baselineCorpus = buildWarmachineSteamrollerTerminalScenarioCorpusV1(boundCorpusOptions);
  const proposals = buildWarmachineSteamrollerScoreTerminalAnchorProposalsV1();
  const batch = materializeWarmachineSteamrollerScoreTerminalBatchV1({
    corpus: baselineCorpus,
    proposals,
  });
  const corpus = buildWarmachineSteamrollerTerminalScenarioCorpusV1({
    ...boundCorpusOptions,
    dispositionsByCellKey: batch.dispositionsByCellKey,
  });
  const core = {
    schemaVersion: WARMACHINE_STEAMROLLER_SCORE_TERMINAL_ANCHOR_EVIDENCE_V1_SCHEMA,
    hostReceiptHash: batch.hostReceiptHash,
    sourceCorpusHash: baselineCorpus.corpusHash,
    assessedCorpusHash: corpus.corpusHash,
    batchHash: batch.batchHash,
    proposedRootCount: batch.proposedRootCount,
    strictMaterializedRootCount: batch.strictMaterializedRootCount,
    strictRejectedRootCount: batch.strictRejectedRootCount,
    uniqueStrictMaterializedSubcellCount: batch.uniqueStrictMaterializedSubcellCount,
    complete: batch.proposedRootCount > 0 &&
      batch.strictMaterializedRootCount === batch.proposedRootCount &&
      batch.strictRejectedRootCount === 0,
    roots: batch.results.map((row) => stableGraphValue({
      disposition: row.disposition,
      reason: row.reason || "",
      proposalKey: row.proposalKey || "",
      scenarioKey: row.scenarioKey || "",
      cellKey: row.cellKey || "",
      subcellKey: row.subcellKey || "",
      terminalClassKey: row.terminalClassKey || "",
      actionKey: row.actionKey || "",
      receiptHash: row.receiptHash || "",
      replayReceiptHash: row.replayReceiptHash || "",
      scoreBefore: row.scoreBefore || {},
      scoreAfter: row.scoreAfter || {},
      primarySourceFamilyKey: row.primarySourceFamilyKey || "",
      pieceIdentitySource: row.pieceIdentitySource || {},
      partitionCoordinates: row.partitionCoordinates || {},
      predecessorHistoryEvidence: row.predecessorHistoryEvidence || {},
      strictReplayCertified: row.strictReplayCertified === true,
      reachabilityProven: row.reachabilityProven === true,
      trainingTruth: row.trainingTruth === true,
    })),
    claimBoundary: "These counts are rebuilt from a strict two-window scoring history, live strict terminal end-turn execution and independent terminal replay at console startup. The two Leaders retain exact card/model identity, stats, health and native resource from the cited legal 100-point source rosters, but this turn-end-only execution projection omits attack, feat, spell and special-action families. It proves only the seven exact two-Leader score-terminal anchor subcells, not a legal micro roster, a full-card tactical root, deployment reachability, the remaining corpus, strategy value or win rate.",
  };
  return {
    corpus,
    proposals,
    evidence: stableGraphValue({ ...core, evidenceHash: stableGraphHash(core) }),
  };
}
