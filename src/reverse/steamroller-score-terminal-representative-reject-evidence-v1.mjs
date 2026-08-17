import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { warmachineHost } from "../warmachine-host-runtime.mjs";
import { materializeWarmachineSteamrollerScoreTerminalBatchV1 } from
  "./steamroller-score-terminal-materialization-batch-v1.mjs";
import { buildWarmachineSteamrollerScoreTerminalAnchorProposalV1 } from
  "./steamroller-score-terminal-anchor-proposals-v1.mjs";
import { buildWarmachineSteamrollerScoreTerminalRepresentativeProposalV1 } from
  "./steamroller-score-terminal-representative-evidence-v1.mjs";

export const
WARMACHINE_STEAMROLLER_SCORE_TERMINAL_REPRESENTATIVE_REJECT_EVIDENCE_V1_SCHEMA =
  "warmachine_steamroller_score_terminal_representative_reject_evidence_v1";

const INVALID_BASE_TOPOLOGIES = new Set([
  "illegal_overlap_expected_reject",
  "outside_table_expected_reject",
]);
const ANCHOR_PRESERVED_PARTITIONS = new Set([
  "damage",
  "highStakesBlastClosure",
  "highStakesCountdownState",
  "highStakesFuseResolution",
  "leaderControl",
  "lifecycle",
  "madeToHaulDecision",
  "payloadLifecycle",
  "payloadMoveDecision",
  "scenarioControl",
  "scenarioTerrainSetup",
  "trenchCacheLifecycle",
  "wolvesObjectiveMove",
  "wolvesProgressState",
  "wolvesTokenDecision",
]);

function countBy(rows = [], keyFn = () => "") {
  const counts = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) =>
    left.localeCompare(right)));
}

function setResourceEnvelope(state = {}, resourceClass = "") {
  if (resourceClass !== "zero_available") {
    return { ok: false, reason: "score_terminal_reject_resource_variant_unsupported" };
  }
  for (const piece of state.pieces || []) {
    piece.resourcePoints = 0;
    if ("resource2" in piece) piece.resource2 = 0;
    if ("focusPoints" in piece) piece.focusPoints = 0;
    if ("furyPoints" in piece) piece.furyPoints = 0;
    if ("focus" in piece) piece.focus = 0;
    if ("fury" in piece) piece.fury = 0;
  }
  return { ok: true };
}

function loserLeader(state = {}, loserSideKey = "") {
  return (state.pieces || []).find((piece) => piece.sideKey === loserSideKey &&
    (piece.isWarcaster || piece.isWarlock || piece.isLeader ||
      /warcaster|warlock|leader/i.test(`${piece.modelRole || ""} ${piece.modelType || ""}`))) ||
    null;
}

function applyInvalidBaseTopology(proposal = {}, representative = {}) {
  const state = proposal.predecessorState;
  const value = representative.coordinates?.baseTopology;
  const affected = loserLeader(state, String(
    proposal.loserSideKey || state.activeSideKey || "",
  ));
  if (!affected?.position || !INVALID_BASE_TOPOLOGIES.has(value)) {
    return { ok: false, reason: "score_terminal_reject_base_variant_unsupported" };
  }
  if (value === "outside_table_expected_reject") {
    affected.position = { xIn: -2, yIn: Number(affected.position.yIn || 24) };
    return {
      ok: true,
      mutationKind: "loser_leader_outside_table",
      affectedPieceKey: affected.pieceKey,
    };
  }
  const blockerKey = `representative-overlap-blocker:${representative.subcellKey}`;
  state.terrain = [...(state.terrain || []), {
    terrainKey: blockerKey,
    type: "obstruction",
    isObstruction: true,
    blocksMovement: true,
    blocksLineOfSight: true,
    xIn: Number(affected.position.xIn),
    yIn: Number(affected.position.yIn),
    widthIn: 2,
    heightIn: 2,
    geometryExactWithinScope: true,
    exactWithinScope: true,
  }];
  return {
    ok: true,
    mutationKind: "loser_leader_overlaps_blocking_terrain",
    affectedPieceKey: affected.pieceKey,
    blockerKey,
  };
}

function supportAudit(representative = {}, anchorRoot = {}) {
  const issues = [];
  for (const [partitionKey, value] of Object.entries(representative.coordinates || {})) {
    if (["baseTopology", "resource", "scoreTransition"].includes(partitionKey)) continue;
    if (!ANCHOR_PRESERVED_PARTITIONS.has(partitionKey) ||
        anchorRoot.partitionCoordinates?.[partitionKey] !== value) {
      issues.push({
        reason: "score_terminal_reject_partition_variant_unsupported",
        partitionKey,
        requestedValue: value,
        anchorValue: anchorRoot.partitionCoordinates?.[partitionKey] ?? null,
      });
    }
  }
  if (!INVALID_BASE_TOPOLOGIES.has(representative.coordinates?.baseTopology)) {
    issues.push({
      reason: "score_terminal_reject_base_variant_unsupported",
      requestedValue: representative.coordinates?.baseTopology || "",
    });
  }
  if (representative.coordinates?.resource !== "zero_available") {
    issues.push({
      reason: "score_terminal_reject_resource_variant_unsupported",
      requestedValue: representative.coordinates?.resource || "",
    });
  }
  return { ok: issues.length === 0, issues };
}

export function planWarmachineSteamrollerScoreTerminalRepresentativeRejectEvidenceV1({
  corpus = {},
  representativeSelection = {},
  anchorEvidence = {},
  anchorProposals = [],
} = {}) {
  if (representativeSelection.corpusHash !== corpus.corpusHash) {
    throw new Error("score_terminal_reject_plan_corpus_mismatch");
  }
  const evidence = anchorEvidence.evidence || anchorEvidence;
  const anchorsByScenario = new Map((evidence.roots || []).map((root) => [
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
    if (representative.terminalClassKey !== "lead_three_after_opponent_turn_scoring" ||
        representative.expectedNextDisposition !== "expected_strict_reject" ||
        !INVALID_BASE_TOPOLOGIES.has(representative.coordinates?.baseTopology)) continue;
    const anchorRoot = anchorsByScenario.get(representative.scenarioKey);
    const support = supportAudit(representative, anchorRoot || {});
    if (!anchorRoot || !support.ok) {
      unresolved.push(stableGraphValue({
        cellKey: representative.cellKey,
        subcellKey: representative.subcellKey,
        scenarioKey: representative.scenarioKey,
        reason: !anchorRoot
          ? "score_terminal_reject_anchor_missing"
          : "score_terminal_reject_variant_unsupported",
        issues: support.issues,
      }));
      continue;
    }
    if (!anchorProposalsByScenario.has(representative.scenarioKey)) {
      anchorProposalsByScenario.set(
        representative.scenarioKey,
        buildWarmachineSteamrollerScoreTerminalAnchorProposalV1(
          representative.scenarioKey,
        ),
      );
    }
    const proposal = structuredClone(
      buildWarmachineSteamrollerScoreTerminalRepresentativeProposalV1({
        corpus,
        representative,
        anchorRoot,
        anchorProposal: anchorProposalsByScenario.get(representative.scenarioKey),
      }),
    );
    const resource = setResourceEnvelope(
      proposal.predecessorState,
      representative.coordinates.resource,
    );
    const topology = applyInvalidBaseTopology(proposal, representative);
    if (!resource.ok || !topology.ok) {
      unresolved.push(stableGraphValue({
        cellKey: representative.cellKey,
        subcellKey: representative.subcellKey,
        scenarioKey: representative.scenarioKey,
        reason: resource.reason || topology.reason,
      }));
      continue;
    }
    proposal.predecessorHistoryRequired = false;
    proposal.predecessorHistoryEvidence = {};
    proposal.predecessorState.stateKey =
      `score-terminal-reject-predecessor:${representative.subcellKey}`;
    proposal.proposalKey = `score-terminal-reject:${representative.subcellKey}`;
    proposal.stateVariantEvidence = stableGraphValue({
      sourceAnchorSubcellKey: anchorRoot.subcellKey,
      exactRepresentativeSubcellKey: representative.subcellKey,
      resourceMutation: "all_models_zero_available",
      topology,
      historicalReachabilityProven: false,
      searchSideRuleConclusion: false,
    });
    proposals.push(stableGraphValue(proposal));
  }
  proposals.sort((left, right) => left.representativeSubcellKey.localeCompare(
    right.representativeSubcellKey,
  ));
  unresolved.sort((left, right) => left.subcellKey.localeCompare(right.subcellKey));
  const core = {
    schemaVersion:
      WARMACHINE_STEAMROLLER_SCORE_TERMINAL_REPRESENTATIVE_REJECT_EVIDENCE_V1_SCHEMA,
    corpusHash: corpus.corpusHash,
    selectionHash: representativeSelection.selectionHash,
    proposedCount: proposals.length,
    unresolvedCount: unresolved.length,
    unresolvedReasonCounts: countBy(unresolved, (row) => row.reason),
    proposals,
    unresolved,
    claimBoundary: "These proposals instantiate only selected score representatives whose sole expected invalid geometry is a model base outside the table or overlapping exact blocking terrain. The complete state still goes to the rules-v1 Host; the planner makes no rules conclusion and historical reachability is not claimed.",
    trainingTruth: false,
  };
  return stableGraphValue({ ...core, planHash: stableGraphHash(core) });
}

export function buildWarmachineSteamrollerScoreTerminalRepresentativeRejectEvidenceV1(
  options = {},
) {
  const plan = planWarmachineSteamrollerScoreTerminalRepresentativeRejectEvidenceV1(options);
  const batch = materializeWarmachineSteamrollerScoreTerminalBatchV1({
    corpus: options.corpus,
    proposals: plan.proposals,
    maximumProposals: options.maximumProposals ?? plan.proposals.length,
  });
  const proposalsBySubcellKey = new Map(plan.proposals.map((proposal) => [
    proposal.representativeSubcellKey,
    proposal,
  ]));
  const roots = batch.results.filter((row) => row.disposition === "strict_rejected")
    .map((row) => {
      const proposal = proposalsBySubcellKey.get(row.subcellKey) || {};
      return stableGraphValue({
        ...row,
        coordinates: proposal.partitionCoordinates || {},
        stateVariantEvidence: proposal.stateVariantEvidence || {},
        strictReplayCertified: false,
        trainingTruth: false,
      });
    });
  const nonHostOutcomes = batch.results.filter((row) => ![
    "strict_rejected",
    "budget_deferred",
  ].includes(row.disposition));
  const core = {
    schemaVersion:
      WARMACHINE_STEAMROLLER_SCORE_TERMINAL_REPRESENTATIVE_REJECT_EVIDENCE_V1_SCHEMA,
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    corpusHash: options.corpus?.corpusHash || "",
    selectionHash: options.representativeSelection?.selectionHash || "",
    planHash: plan.planHash,
    batchHash: batch.batchHash,
    proposedCount: plan.proposedCount,
    strictRejectedCount: roots.length,
    proposalFilteredCount: batch.proposalFilteredRootCount,
    inputInvalidCount: batch.inputInvalidRootCount,
    budgetDeferredCount: batch.budgetDeferredRootCount,
    unresolvedCount: plan.unresolvedCount,
    roots,
    nonHostOutcomes,
    completeWithinPlannedBatch: roots.length === plan.proposedCount &&
      nonHostOutcomes.length === 0 && batch.budgetDeferredRootCount === 0,
    claimBoundary: "Every root is one current-Host static-placement rejection for an exact selected representative identity. It proves that concrete invalid state is rejected, not that every state in the coarse partition is unreachable. No root has reverse-history or training authority.",
    trainingTruth: false,
  };
  return {
    plan,
    batch,
    evidence: stableGraphValue({ ...core, evidenceHash: stableGraphHash(core) }),
  };
}
