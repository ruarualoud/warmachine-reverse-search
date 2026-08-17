import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import {
  buildWarmachineSteamrollerScoreTerminalAnchorProposalV1,
} from "./steamroller-score-terminal-anchor-proposals-v1.mjs";
import { materializeWarmachineSteamrollerScoreTerminalBatchV1 } from
  "./steamroller-score-terminal-materialization-batch-v1.mjs";
import { warmachineSteamrollerTerminalScenarioSubcellKeyV1 } from
  "./steamroller-terminal-scenario-corpus-v1.mjs";

export const WARMACHINE_STEAMROLLER_SCORE_TERMINAL_REPRESENTATIVE_EVIDENCE_V1_SCHEMA =
  "warmachine_steamroller_score_terminal_representative_evidence_v1";

function oppositeSide(sideKey = "") {
  return sideKey === "player1" ? "player2" : sideKey === "player2" ? "player1" : "";
}

function countBy(rows = [], keyFn = () => "") {
  const counts = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) =>
    left.localeCompare(right)));
}

function scoreTransitionByKey(corpus = {}, scenarioKey = "", transitionKey = "") {
  const scenario = (corpus.scenarios || []).find((row) => row.scenarioKey === scenarioKey);
  return (scenario?.scoreTransitionDomain?.transitions || []).find((row) =>
    row.scoreTransitionKey === transitionKey) || null;
}

function baselineCoordinatesMatch(representative = {}, anchorRoot = {}) {
  return Object.entries(anchorRoot.partitionCoordinates || {})
    .filter(([dimensionKey]) => dimensionKey !== "scoreTransition")
    .every(([dimensionKey, value]) => representative.coordinates?.[dimensionKey] === value);
}

function swapSideValue(value = "", shouldSwap = false) {
  if (!shouldSwap) return value;
  return oppositeSide(value) || value;
}

function retargetAnchorProposal({
  anchorProposal = {},
  cell = {},
  representative = {},
  transition = {},
} = {}) {
  const proposal = structuredClone(anchorProposal);
  const winnerSideKey = String(cell.winnerSideKey || "");
  const loserSideKey = String(cell.loserSideKey || oppositeSide(winnerSideKey));
  const shouldSwap = winnerSideKey === "player2";
  const state = proposal.predecessorState;
  state.stateKey = `score-terminal-representative-predecessor:${representative.subcellKey}`;
  state.activeSideKey = loserSideKey;
  state.turnNumber = Number(cell.roundClass?.representativeRoundNumber || 0);
  for (const piece of state.pieces || []) {
    piece.sideKey = swapSideValue(piece.sideKey, shouldSwap);
  }
  for (const terrain of state.terrain || []) {
    terrain.ownerSideKey = swapSideValue(terrain.ownerSideKey, shouldSwap);
    terrain.sourceSideKey = swapSideValue(terrain.sourceSideKey, shouldSwap);
  }
  for (const objective of state.scenario?.objectives || []) {
    objective.ownerSideKey = swapSideValue(objective.ownerSideKey, shouldSwap);
  }
  for (const cache of state.scenario?.caches || []) {
    cache.ownerSideKey = swapSideValue(cache.ownerSideKey, shouldSwap);
  }
  const anchorScore = state.scenario?.score || {};
  const anchorWinnerSideKey = String(anchorProposal.winnerSideKey || "player1");
  const anchorLoserSideKey = oppositeSide(anchorWinnerSideKey);
  const anchorLeadBefore = Number(anchorScore[anchorWinnerSideKey] || 0) -
    Number(anchorScore[anchorLoserSideKey] || 0);
  const leadBefore = transition.exactLeadBefore === false
    ? anchorLeadBefore
    : Number(transition.leadBefore || 0);
  state.scenario.attackerSideKey = String(cell.attackerSideKey || "");
  state.scenario.defenderSideKey = String(cell.defenderSideKey || "");
  state.scenario.scoringStartSideKey = String(cell.defenderSideKey || "");
  state.scenario.scoringStartTurnNumber = 2;
  state.scenario.score = leadBefore >= 0
    ? { [winnerSideKey]: leadBefore, [loserSideKey]: 0 }
    : { [winnerSideKey]: 0, [loserSideKey]: -leadBefore };
  proposal.proposalKey = `score-terminal-representative:${representative.subcellKey}`;
  proposal.winnerSideKey = winnerSideKey;
  proposal.partitionCoordinates = stableGraphValue(representative.coordinates || {});
  proposal.completeRosterPieceKeys = (state.pieces || []).map((piece) => piece.pieceKey);
  proposal.representativeSubcellKey = representative.subcellKey;
  proposal.representativeCellKey = representative.cellKey;
  proposal.symbolicScoreTransitionWitness = stableGraphValue({
    leadBeforeClass: String(transition.leadBeforeClass || ""),
    exactLeadBefore: transition.exactLeadBefore === true,
    representativeLeadBefore: Number(transition.leadBefore || 0),
    materializedLeadBefore: leadBefore,
    materializedInstanceWithinClass: transition.exactLeadBefore === false
      ? leadBefore >= Number(transition.leadBefore || 0)
      : leadBefore === Number(transition.leadBefore || 0),
  });
  return stableGraphValue(proposal);
}

export function buildWarmachineSteamrollerScoreTerminalRepresentativeProposalV1({
  corpus = {},
  representative = {},
  anchorRoot = {},
  anchorProposal = null,
} = {}) {
  const cell = (corpus.cells || []).find((row) => row.cellKey === representative.cellKey);
  const transition = scoreTransitionByKey(
    corpus,
    representative.scenarioKey,
    representative.coordinates?.scoreTransition,
  );
  if (!cell || !transition || !anchorRoot.scenarioKey ||
      anchorRoot.scenarioKey !== representative.scenarioKey) {
    throw new Error(`score_terminal_representative_proposal_source_missing:${
      representative.subcellKey || ""}`);
  }
  const proposal = retargetAnchorProposal({
    anchorProposal: anchorProposal ||
      buildWarmachineSteamrollerScoreTerminalAnchorProposalV1(
        representative.scenarioKey,
      ),
    cell,
    representative,
    transition,
  });
  const expectedSubcellKey = warmachineSteamrollerTerminalScenarioSubcellKeyV1(
    cell,
    proposal.partitionCoordinates,
  );
  if (expectedSubcellKey !== representative.subcellKey) {
    throw new Error(`score_terminal_representative_subcell_mismatch:${
      representative.subcellKey}`);
  }
  return proposal;
}

export function planWarmachineSteamrollerScoreTerminalRepresentativeEvidenceV1({
  corpus = {},
  representativeSelection = {},
  anchorEvidence = {},
  anchorProposals = [],
} = {}) {
  if (representativeSelection.corpusHash !== corpus.corpusHash) {
    throw new Error("score_terminal_representative_plan_corpus_mismatch");
  }
  const evidence = anchorEvidence.evidence || anchorEvidence;
  if (evidence.assessedCorpusHash && evidence.assessedCorpusHash !== corpus.corpusHash) {
    throw new Error("score_terminal_representative_plan_anchor_corpus_mismatch");
  }
  const cellsByKey = new Map((corpus.cells || []).map((cell) => [cell.cellKey, cell]));
  const anchorRootsByScenario = new Map((evidence.roots || []).map((root) => [
    root.scenarioKey,
    root,
  ]));
  const anchorProposalsByScenario = new Map((anchorProposals || []).map((proposal) => [
    proposal.hostScenarioKey,
    proposal,
  ]));
  const proposals = [];
  const unresolved = [];
  for (const representative of representativeSelection.selectedRepresentatives || []) {
    if (representative.terminalClassKey !== "lead_three_after_opponent_turn_scoring") continue;
    const cell = cellsByKey.get(representative.cellKey);
    const anchorRoot = anchorRootsByScenario.get(representative.scenarioKey);
    const transition = scoreTransitionByKey(
      corpus,
      representative.scenarioKey,
      representative.coordinates?.scoreTransition,
    );
    const anchorTransition = scoreTransitionByKey(
      corpus,
      representative.scenarioKey,
      anchorRoot?.partitionCoordinates?.scoreTransition,
    );
    let reason = "";
    if (!cell || !anchorRoot || !transition || !anchorTransition) {
      reason = "score_terminal_representative_source_identity_missing";
    } else if (cell.roundClass?.exactRoundNumber !== true) {
      reason = "score_terminal_representative_round_equivalence_unresolved";
    } else if (!baselineCoordinatesMatch(representative, anchorRoot)) {
      reason = "score_terminal_representative_nonbaseline_partition_pending";
    } else if (stableGraphHash(
      transition.scoringGainClass?.representativeWinnerCounts || {},
    ) !== stableGraphHash(
      anchorTransition.scoringGainClass?.representativeWinnerCounts || {},
    ) || stableGraphHash(
      transition.scoringGainClass?.representativeOpponentCounts || {},
    ) !== stableGraphHash(
      anchorTransition.scoringGainClass?.representativeOpponentCounts || {},
    )) {
      reason = "score_terminal_representative_scoring_geometry_pending";
    }
    if (reason) {
      unresolved.push(stableGraphValue({
        cellKey: representative.cellKey,
        subcellKey: representative.subcellKey,
        scenarioKey: representative.scenarioKey,
        reason,
      }));
      continue;
    }
    const proposal = buildWarmachineSteamrollerScoreTerminalRepresentativeProposalV1({
      corpus,
      representative,
      anchorRoot,
      anchorProposal: anchorProposalsByScenario.get(representative.scenarioKey) || null,
    });
    proposals.push(proposal);
  }
  proposals.sort((left, right) => left.representativeSubcellKey.localeCompare(
    right.representativeSubcellKey,
  ));
  unresolved.sort((left, right) => left.subcellKey.localeCompare(right.subcellKey));
  const core = {
    schemaVersion: WARMACHINE_STEAMROLLER_SCORE_TERMINAL_REPRESENTATIVE_EVIDENCE_V1_SCHEMA,
    corpusHash: corpus.corpusHash,
    selectionHash: representativeSelection.selectionHash,
    proposedCount: proposals.length,
    unresolvedCount: unresolved.length,
    unresolvedReasonCounts: countBy(unresolved, (row) => row.reason),
    proposals,
    unresolved,
    claimBoundary: "This plan retargets only score representatives whose non-score partitions and scoring geometry are already proven by a seven-scenario anchor. Other representatives remain explicit unresolved work and are not rejected or certified.",
    trainingTruth: false,
  };
  return stableGraphValue({ ...core, planHash: stableGraphHash(core) });
}

export function buildWarmachineSteamrollerScoreTerminalRepresentativeEvidenceV1(options = {}) {
  const plan = planWarmachineSteamrollerScoreTerminalRepresentativeEvidenceV1(options);
  const batch = materializeWarmachineSteamrollerScoreTerminalBatchV1({
    corpus: options.corpus,
    proposals: plan.proposals,
    maximumProposals: options.maximumProposals ?? plan.proposals.length,
  });
  const roots = batch.results.filter((row) => row.disposition === "strict_materialized")
    .map((row) => stableGraphValue({
      ...row,
      coordinates: row.partitionCoordinates,
      trainingTruth: false,
    }));
  const executionFailures = batch.results.filter((row) => ![
    "strict_materialized",
    "budget_deferred",
  ].includes(row.disposition));
  const core = {
    schemaVersion: WARMACHINE_STEAMROLLER_SCORE_TERMINAL_REPRESENTATIVE_EVIDENCE_V1_SCHEMA,
    hostReceiptHash: batch.hostReceiptHash,
    corpusHash: options.corpus?.corpusHash || "",
    selectionHash: options.representativeSelection?.selectionHash || "",
    planHash: plan.planHash,
    batchHash: batch.batchHash,
    proposedCount: plan.proposedCount,
    strictMaterializedCount: roots.length,
    strictRejectedProposalCount: batch.strictRejectedRootCount,
    proposalFilteredProposalCount: batch.proposalFilteredRootCount,
    inputInvalidProposalCount: batch.inputInvalidRootCount,
    budgetDeferredProposalCount: batch.budgetDeferredRootCount,
    unresolvedCount: plan.unresolvedCount,
    unresolvedReasonCounts: plan.unresolvedReasonCounts,
    executionFailures,
    roots,
    completeWithinPlannedBatch: roots.length === plan.proposedCount &&
      executionFailures.length === 0 && batch.budgetDeferredRootCount === 0,
    claimBoundary: "Only roots accepted by current rules-v1 strict execution and independent replay are evidence. Only Host rejections are strict_rejected; input defects and Host-legal states that miss the requested terminal or partition are reported separately. No failed proposal proves its representative subcell unreachable, and unresolved representatives remain in the ledger.",
    trainingTruth: false,
  };
  return {
    plan,
    batch,
    evidence: stableGraphValue({ ...core, evidenceHash: stableGraphHash(core) }),
  };
}
