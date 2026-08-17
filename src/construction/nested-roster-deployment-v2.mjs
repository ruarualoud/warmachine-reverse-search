import {
  buildWarmachineRulesV1StateFromLayer3Room,
  warmachineConstructionHost,
} from "../warmachine-construction-host-runtime.mjs";
import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { buildWarmachineRosterProvenanceV2 } from "../reverse/terminal-proof-v2.mjs";
import { normalizeRulesV1State } from "../warmachine-host-runtime.mjs";
import { generateWarmachineFormationCandidates } from "./formation-candidates-v1.mjs";
import { buildWarmachineRosterPointLedger } from "./roster-investment-v1.mjs";

export const WARMACHINE_FINITE_ROSTER_PROPOSAL_LEDGER_V2_SCHEMA =
  "warmachine_finite_roster_proposal_ledger_v2";
export const WARMACHINE_MODEL_HISTORY_COVERAGE_V2_SCHEMA =
  "warmachine_model_history_coverage_v2";
export const WARMACHINE_NESTED_ROSTER_DEPLOYMENT_SEARCH_V2_SCHEMA =
  "warmachine_nested_roster_deployment_search_v2";

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, digits = 9) {
  const scale = 10 ** digits;
  return Math.round((numeric(value, 0) + Number.EPSILON) * scale) / scale;
}

function sortedUnique(values = []) {
  return [...new Set(values.map(String).filter(Boolean))].sort();
}

function canonicalRosterEntry(entry = {}) {
  return {
    name: String(entry.name || entry.cardName || ""),
    cardId: String(entry.cardId || entry.id || ""),
    cardTypeName: String(entry.cardTypeName || entry.cardType || ""),
    linePoints: Number.isFinite(Number(entry.linePoints)) ? numeric(entry.linePoints) : null,
    physicalModels: Math.max(0, Math.floor(numeric(entry.physicalModels ?? entry.modelCount, 0))),
    options: String(entry.options || ""),
    attachedTo: String(entry.attachedTo || ""),
    battlegroupController: String(entry.battlegroupController || ""),
  };
}

function canonicalRosterIdentity(list = {}, sideKey = "") {
  const entries = (list.entries || []).map(canonicalRosterEntry)
    .sort((left, right) => stableGraphHash(left).localeCompare(stableGraphHash(right)));
  return {
    faction: String(list.side || ""),
    army: String(list.army || list.armyName || ""),
    leader: String(list.leader || ""),
    totalPoints: Number.isFinite(Number(list.totalPoints)) ? numeric(list.totalPoints) : null,
    entries,
  };
}

export function buildWarmachineRosterPoolSourceEvidenceV2(lists = [], rawMetadata = {}) {
  const sourceRosterIdentityHashes = sortedUnique(lists.map((list) =>
    stableGraphHash(canonicalRosterIdentity(list))));
  const core = {
    schemaVersion: "warmachine_roster_pool_source_evidence_v2",
    sourceContentHash: String(rawMetadata.sourceContentHash || ""),
    sourceSchemaVersion: String(rawMetadata.sourceSchemaVersion || ""),
    exactListLegality: rawMetadata.exactListLegality === true,
    forceBuilderContract: String(rawMetadata.forceBuilderContract || ""),
    remoteVersion: String(rawMetadata.remoteVersion || ""),
    sourceRosterIdentityHashes,
    sourceRosterIdentityCount: sourceRosterIdentityHashes.length,
    exhaustiveAllFactionRosters: rawMetadata.exhaustiveAllFactionRosters === true,
  };
  return { ...core, sourceEvidenceHash: stableGraphHash(core) };
}

function validateRosterProposal(
  list = {},
  sideKey = "",
  sourceEvidence = {},
  options = {},
  canonicalRosterIdentityHash = "",
) {
  const expectedPoints = numeric(options.expectedPoints, 100);
  const entries = (list.entries || []).map(canonicalRosterEntry);
  const summedPoints = round(entries.reduce((sum, entry) => sum + numeric(entry.linePoints, 0), 0));
  const totalPoints = Number.isFinite(Number(list.totalPoints)) ? numeric(list.totalPoints) : null;
  const reasons = [];
  if (!sourceEvidence.sourceContentHash) reasons.push("source_content_hash_missing");
  if (!sourceEvidence.sourceEvidenceHash ||
    sourceEvidence.sourceEvidenceHash !== stableGraphHash({
      schemaVersion: sourceEvidence.schemaVersion,
      sourceContentHash: sourceEvidence.sourceContentHash,
      sourceSchemaVersion: sourceEvidence.sourceSchemaVersion,
      exactListLegality: sourceEvidence.exactListLegality,
      forceBuilderContract: sourceEvidence.forceBuilderContract,
      remoteVersion: sourceEvidence.remoteVersion,
      sourceRosterIdentityHashes: sourceEvidence.sourceRosterIdentityHashes,
      sourceRosterIdentityCount: sourceEvidence.sourceRosterIdentityCount,
      exhaustiveAllFactionRosters: sourceEvidence.exhaustiveAllFactionRosters,
    })) reasons.push("source_evidence_digest_invalid");
  if (!(sourceEvidence.sourceRosterIdentityHashes || []).includes(canonicalRosterIdentityHash)) {
    reasons.push("roster_identity_not_present_in_bound_source_pool");
  }
  if (sourceEvidence.exactListLegality !== true) {
    reasons.push("upstream_exact_force_builder_legality_not_certified");
  }
  if (!entries.length) reasons.push("empty_roster");
  if (entries.some((entry) => !entry.cardId)) reasons.push("card_source_id_missing");
  if (entries.some((entry) => entry.linePoints == null)) reasons.push("entry_point_value_missing");
  if (totalPoints == null) reasons.push("declared_total_points_missing");
  if (totalPoints != null && Math.abs(totalPoints - expectedPoints) > 1e-9) {
    reasons.push("declared_total_points_mismatch");
  }
  if (totalPoints != null && Math.abs(totalPoints - summedPoints) > 1e-9) {
    reasons.push("entry_point_sum_mismatch");
  }
  if ((list.warnings || []).length) reasons.push("upstream_force_builder_warnings_present");
  return {
    exactLegalInSourcePool: reasons.length === 0,
    reasons,
    totalPoints,
    summedPoints,
    entryCount: entries.length,
    physicalModelCount: Math.max(0, Math.floor(numeric(list.physicalModels, 0))),
  };
}

function capabilityAssessment(list = {}, bottlenecks = []) {
  const cardIds = new Set((list.entries || []).map((entry) => String(entry.cardId || "")).filter(Boolean));
  const rows = bottlenecks.map((bottleneck, index) => {
    const requiredAnyCardIds = sortedUnique(
      bottleneck.requiredAnyCardIds || bottleneck.requiredCardIds || [],
    );
    const matchedCardIds = requiredAnyCardIds.filter((cardId) => cardIds.has(cardId));
    const requirementMatched = requiredAnyCardIds.length === 0 || matchedCardIds.length > 0;
    const exactHardProof = Boolean(
      bottleneck.hardBranchLockEligible === true &&
      bottleneck.sourceClassificationClosed === true &&
      bottleneck.alternativeProviderSetExhausted === true &&
      bottleneck.optimisticCapabilityBoundExact === true &&
      bottleneck.strictTracePreservationProven === true &&
      !(bottleneck.wildcardSourceIds || []).length,
    );
    return {
      bottleneckKey: String(bottleneck.bottleneckKey || `bottleneck-${index}`),
      requiredAnyCardIds,
      matchedCardIds,
      requirementMatched,
      orderingLockEligible: bottleneck.orderingLockEligible === true,
      exactHardProof,
      terminalProposalRefuted: exactHardProof && !requirementMatched,
    };
  });
  return {
    rows,
    matchedRequirementCount: rows.filter((row) => row.requirementMatched).length,
    orderingMatchCount: rows.filter((row) =>
      row.orderingLockEligible && row.requirementMatched).length,
    terminalProposalRefuted: rows.some((row) => row.terminalProposalRefuted),
  };
}

function sampleRank(seed, canonicalRosterKey) {
  return stableGraphHash({ seed: String(seed || "warmachine-roster-v2"), canonicalRosterKey });
}

function featureCoverage(rows = []) {
  const leaders = sortedUnique(rows.map((row) => row.list.leader));
  const featureBuckets = sortedUnique(rows.map((row) => row.list.featureBucket));
  const cardIds = sortedUnique(rows.flatMap((row) =>
    (row.list.entries || []).map((entry) => entry.cardId)));
  const armies = sortedUnique(rows.map((row) => row.list.army || row.list.armyName));
  return {
    uniqueLeaderCount: leaders.length,
    uniqueFeatureBucketCount: featureBuckets.length,
    uniqueCardSourceCount: cardIds.length,
    uniqueArmyCount: armies.length,
    leaders,
    featureBuckets,
    cardIds,
    armies,
  };
}

export function buildWarmachineFiniteRosterProposalLedgerV2(
  lists = [],
  sideKey = "player1",
  rawOptions = {},
) {
  const options = {
    expectedPoints: numeric(rawOptions.expectedPoints, 100),
    maximumSelectedUniqueRosters: Math.max(1, Math.floor(numeric(
      rawOptions.maximumSelectedUniqueRosters,
      lists.length || 1,
    ))),
    seed: String(rawOptions.seed || "warmachine-roster-v2"),
    sourceEvidence: stableGraphValue(rawOptions.sourceEvidence || {}),
    capabilityBottlenecks: stableGraphValue(rawOptions.capabilityBottlenecks || []),
  };
  const sourceProposalCount = lists.length;
  const sourceMassPerProposal = sourceProposalCount ? 1 / sourceProposalCount : 0;
  const groups = new Map();
  const invalid = [];
  for (const [sourceIndex, list] of lists.entries()) {
    const canonicalIdentity = canonicalRosterIdentity(list, sideKey);
    const canonicalRosterKey = `roster-${stableGraphHash(canonicalIdentity)}`;
    const validation = validateRosterProposal(
      list,
      sideKey,
      options.sourceEvidence,
      options,
      stableGraphHash(canonicalIdentity),
    );
    if (!validation.exactLegalInSourcePool) {
      invalid.push({
        sourceIndex,
        sourceListKey: String(list.key || `source-${sourceIndex}`),
        canonicalRosterKey,
        validation,
        sourceProposalMass: round(sourceMassPerProposal),
      });
      continue;
    }
    if (!groups.has(canonicalRosterKey)) {
      groups.set(canonicalRosterKey, {
        canonicalRosterKey,
        canonicalIdentity,
        list,
        sourceAliases: [],
        validation,
      });
    }
    groups.get(canonicalRosterKey).sourceAliases.push({
      sourceIndex,
      sourceListKey: String(list.key || `source-${sourceIndex}`),
    });
  }
  const legalRows = [...groups.values()].map((row) => {
    const capability = capabilityAssessment(row.list, options.capabilityBottlenecks);
    return {
      ...row,
      sourceAliasCount: row.sourceAliases.length,
      sourceProposalMass: round(row.sourceAliases.length * sourceMassPerProposal),
      capability,
      sampleRank: sampleRank(options.seed, row.canonicalRosterKey),
      strategyPrior: {
        screeningScore: numeric(row.list.screeningScore, 0),
        featureBucket: String(row.list.featureBucket || ""),
      },
    };
  });
  legalRows.sort((left, right) =>
    Number(left.capability.terminalProposalRefuted) -
      Number(right.capability.terminalProposalRefuted) ||
    right.capability.orderingMatchCount - left.capability.orderingMatchCount ||
    left.sampleRank.localeCompare(right.sampleRank) ||
    left.canonicalRosterKey.localeCompare(right.canonicalRosterKey));
  const terminalEligible = legalRows.filter((row) => !row.capability.terminalProposalRefuted);
  const terminalProposalExcluded = legalRows.filter((row) => row.capability.terminalProposalRefuted);
  const selected = terminalEligible.slice(0, options.maximumSelectedUniqueRosters);
  const budgetUnresolved = terminalEligible.slice(options.maximumSelectedUniqueRosters);
  const sourceInvalidMass = round(invalid.length * sourceMassPerProposal);
  const terminalProposalExcludedMass = round(terminalProposalExcluded.reduce(
    (sum, row) => sum + row.sourceProposalMass,
    0,
  ));
  const selectedMass = round(selected.reduce((sum, row) => sum + row.sourceProposalMass, 0));
  const budgetUnresolvedMass = round(budgetUnresolved.reduce(
    (sum, row) => sum + row.sourceProposalMass,
    0,
  ));
  const representedMass = round(
    sourceInvalidMass + terminalProposalExcludedMass + selectedMass + budgetUnresolvedMass,
  );
  const core = {
    schemaVersion: WARMACHINE_FINITE_ROSTER_PROPOSAL_LEDGER_V2_SCHEMA,
    sideKey,
    upstreamConstructionReceiptHash: warmachineConstructionHost.receipt.receiptHash,
    sourceEvidence: options.sourceEvidence,
    samplingContract: {
      seed: options.seed,
      method: "stable_hash_order_with_capability_ordering_prefix",
      finiteSourcePoolOnly: true,
      exhaustiveOverAllFactionRosters: false,
      maximumSelectedUniqueRosters: options.maximumSelectedUniqueRosters,
    },
    counts: {
      sourceProposalCount,
      sourceExactLegalProposalCount: sourceProposalCount - invalid.length,
      sourceInvalidProposalCount: invalid.length,
      uniqueExactLegalRosterCount: legalRows.length,
      duplicateLegalAliasCount: Math.max(0, sourceProposalCount - invalid.length - legalRows.length),
      terminalProposalExcludedUniqueCount: terminalProposalExcluded.length,
      selectedUniqueRosterCount: selected.length,
      budgetUnresolvedUniqueRosterCount: budgetUnresolved.length,
    },
    massLedger: {
      sourceProposalMass: sourceProposalCount ? 1 : 0,
      sourceInvalidMass,
      terminalProposalExcludedMass,
      selectedMass,
      budgetUnresolvedMass,
      representedMass,
      massConserved: sourceProposalCount === 0 || Math.abs(representedMass - 1) <= 1e-8,
      semantics: "Uniform source-proposal mass inside the bound finite construction pool. Duplicate canonical rosters merge identities and accumulate alias mass.",
    },
    sourceCoverage: featureCoverage(legalRows),
    selectedCoverage: featureCoverage(selected),
    selected,
    budgetUnresolved,
    terminalProposalExcluded,
    invalid,
    hardPruningEnabled: terminalProposalExcluded.length > 0,
    globalOptimalityProven: false,
    trainingTruth: false,
    claimBoundary: "Exact legality is inherited only from the content-bound upstream Force Builder pool and rechecked for points, warnings and source identity. Sampling covers a finite proposal pool, not every legal faction roster; ordering bottlenecks do not remove rosters without a closed exact hard proof.",
  };
  return { ...core, ledgerHash: stableGraphHash(core) };
}

function pieceLifecycleStage(piece = {}) {
  if (piece.removedFromPlay) return "removed_from_play";
  if (piece.destroyed) return "destroyed";
  if (piece.damageLifecycleStage) return String(piece.damageLifecycleStage);
  if (piece.notDeployed || piece.offTable) return "off_table_or_not_deployed";
  if (piece.replacementStartsDormant) return "dormant_replacement";
  return "in_play";
}

function pieceSnapshot(piece = {}, checkpointIndex = 0, checkpointKey = "") {
  return {
    checkpointIndex,
    checkpointKey,
    pieceKey: String(piece.pieceKey || ""),
    sideKey: String(piece.sideKey || ""),
    position: piece.position ? {
      xIn: numeric(piece.position.xIn ?? piece.position.x, 0),
      yIn: numeric(piece.position.yIn ?? piece.position.y, 0),
    } : null,
    lifecycleStage: pieceLifecycleStage(piece),
    boxesRemaining: Number.isFinite(Number(piece.damage?.boxesRemaining))
      ? numeric(piece.damage.boxesRemaining)
      : null,
    resourcePoints: Number.isFinite(Number(piece.resourcePoints))
      ? numeric(piece.resourcePoints)
      : null,
    soulTokens: Number.isFinite(Number(piece.soulTokens)) ? numeric(piece.soulTokens) : null,
    corpseTokens: Number.isFinite(Number(piece.corpseTokens)) ? numeric(piece.corpseTokens) : null,
    statusTags: sortedUnique(piece.statusTags || []),
    activated: piece.activated === true,
  };
}

export function buildWarmachineStrictHistorySegmentReceiptV2(
  beforeStateInput = {},
  action = {},
  transition = {},
) {
  const beforeState = normalizeRulesV1State(beforeStateInput);
  const afterState = normalizeRulesV1State(transition.nextState || {});
  const authorityReceiptHash = warmachineConstructionHost.core.receipt.receiptHash;
  const receiptCore = {
    authorityReceiptHash,
    actionKey: String(action.actionKey || ""),
    beforeStateHash: stableGraphHash(beforeState),
    afterStateHash: stableGraphHash(afterState),
    events: stableGraphValue(transition.events || []),
  };
  const strictCertified = transition.ok === true && Boolean(receiptCore.actionKey) &&
    Boolean(transition.nextState);
  return {
    schemaVersion: "warmachine_strict_history_segment_receipt_v2",
    receiptKey: `history-segment-${stableGraphHash(receiptCore)}`,
    ...receiptCore,
    transitionOk: transition.ok === true,
    strictCertified,
    strictReceiptHash: stableGraphHash(receiptCore),
    rejection: strictCertified ? null : stableGraphValue(transition.rejection || transition.error || null),
  };
}

function positionDistance(left, right) {
  if (!left || !right) return null;
  return round(Math.hypot(
    numeric(left.xIn ?? left.x, 0) - numeric(right.xIn ?? right.x, 0),
    numeric(left.yIn ?? left.y, 0) - numeric(right.yIn ?? right.y, 0),
  ));
}

function segmentCoverage(states, receipts = []) {
  const rows = [];
  for (let index = 0; index < Math.max(0, states.length - 1); index += 1) {
    const beforeStateHash = stableGraphHash(states[index]);
    const afterStateHash = stableGraphHash(states[index + 1]);
    const receipt = receipts[index] || {};
    const stateHashesMatch = receipt.beforeStateHash === beforeStateHash &&
      receipt.afterStateHash === afterStateHash;
    const authorityReceiptHash = warmachineConstructionHost.core.receipt.receiptHash;
    const receiptCore = {
      authorityReceiptHash: String(receipt.authorityReceiptHash || ""),
      actionKey: String(receipt.actionKey || ""),
      beforeStateHash: String(receipt.beforeStateHash || ""),
      afterStateHash: String(receipt.afterStateHash || ""),
      events: stableGraphValue(receipt.events || []),
    };
    const receiptHashMatches = receipt.strictReceiptHash === stableGraphHash(receiptCore);
    const authorityMatches = receiptCore.authorityReceiptHash === authorityReceiptHash;
    const strictCertified = receipt.strictCertified === true &&
      receipt.transitionOk === true && Boolean(receiptCore.actionKey) &&
      stateHashesMatch && receiptHashMatches && authorityMatches;
    rows.push({
      segmentIndex: index,
      beforeStateHash,
      afterStateHash,
      receiptKey: String(receipt.receiptKey || ""),
      actionKey: receiptCore.actionKey,
      authorityReceiptHash: receiptCore.authorityReceiptHash,
      strictReceiptHash: String(receipt.strictReceiptHash || ""),
      strictCertified,
      stateHashesMatch,
      receiptHashMatches,
      authorityMatches,
      unresolvedReason: strictCertified
        ? ""
        : !receipt.strictCertified || receipt.transitionOk !== true
          ? "strict_transition_receipt_missing"
          : !stateHashesMatch
            ? "strict_receipt_state_hash_mismatch"
            : !authorityMatches
              ? "strict_receipt_authority_mismatch"
              : !receiptHashMatches
                ? "strict_receipt_digest_mismatch"
                : "strict_receipt_action_identity_missing",
    });
  }
  return rows;
}

function deploymentSource(piece = {}) {
  return {
    pieceKey: String(piece.pieceKey || ""),
    cardId: String(piece.cardSnapshot?.id || piece.cardId || ""),
    modelId: String(piece.modelId || piece.unitModelId || ""),
    rosterEntryId: String(piece.entryId || piece.metadata?.entryId || ""),
    unitGroupId: String(piece.unitGroupId || ""),
    controllerPieceKey: String(piece.controllerPieceKey || ""),
    battlegroupId: String(piece.battlegroupId || piece.startingBattlegroupId || ""),
    replacementGroupKey: String(piece.replacementGroupKey || ""),
    replacesPieceKey: String(piece.replacesPieceKey || ""),
    startingPosition: piece.position ? stableGraphValue(piece.position) : null,
    startsOffTable: Boolean(piece.notDeployed || piece.offTable || piece.replacementStartsDormant),
  };
}

function deferredReachabilityEnvelope(piece, snapshots, rawOptions = {}) {
  const first = snapshots[0] || null;
  const last = snapshots.at(-1) || null;
  const sideKey = String(piece.sideKey || "");
  const activationUpperBound = Math.max(0, Math.floor(numeric(
    rawOptions.activationUpperBoundBySide?.[sideKey] ?? rawOptions.activationUpperBound,
    0,
  )));
  const declaredExtraMovementUpperBoundIn = Math.max(0, numeric(
    rawOptions.declaredExtraMovementUpperBoundInByPieceKey?.[piece.pieceKey],
    0,
  ));
  const movementClosureComplete =
    rawOptions.movementClosureCompleteByPieceKey?.[piece.pieceKey] === true;
  const coreRunUpperBoundIn = round(Math.max(0, numeric(piece.speedIn, 0)) * 2 * activationUpperBound);
  const totalUpperBoundIn = movementClosureComplete
    ? round(coreRunUpperBoundIn + declaredExtraMovementUpperBoundIn)
    : null;
  const requiredEndpointDisplacementIn = positionDistance(first?.position, last?.position);
  return {
    activationUpperBound,
    coreRunUpperBoundIn,
    declaredExtraMovementUpperBoundIn,
    movementClosureComplete,
    totalMovementUpperBoundIn: totalUpperBoundIn,
    requiredEndpointDisplacementIn,
    reachableUnderDeclaredCompleteBound: totalUpperBoundIn == null ||
      requiredEndpointDisplacementIn == null
      ? null
      : requiredEndpointDisplacementIn <= totalUpperBoundIn + 1e-9,
    hardReachabilityRefuted: totalUpperBoundIn != null &&
      requiredEndpointDisplacementIn != null &&
      requiredEndpointDisplacementIn > totalUpperBoundIn + 1e-9,
    orderingOnly: !movementClosureComplete,
    unresolvedReasons: movementClosureComplete
      ? []
      : ["special_movement_reactions_and_rule_sources_not_closed"],
  };
}

function deferredEquivalenceGroups(rows = []) {
  const groups = new Map();
  for (const row of rows) {
    if (row.historyMode !== "deferred_reachable_envelope") continue;
    const groupIdentity = {
      sideKey: row.sideKey,
      unitGroupId: row.deploymentSource.unitGroupId,
      cardId: row.deploymentSource.cardId,
      modelRole: row.modelRole,
      modelType: row.modelType,
      envelope: row.reachableEnvelope,
      lifecycleStage: row.finalLifecycleStage,
    };
    const groupKey = `deferred-${stableGraphHash(groupIdentity)}`;
    if (!groups.has(groupKey)) groups.set(groupKey, { groupKey, groupIdentity, pieceKeys: [] });
    groups.get(groupKey).pieceKeys.push(row.pieceKey);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    pieceKeys: group.pieceKeys.sort(),
    multiplicity: group.pieceKeys.length,
    quotientPolicy: "share_deferred_envelope_computation_only_preserve_each_model_identity",
  })).sort((left, right) => left.groupKey.localeCompare(right.groupKey));
}

export function buildWarmachineModelHistoryCoverageV2(
  stateSequenceInput = [],
  rawOptions = {},
) {
  const states = stateSequenceInput.map((entry) => normalizeRulesV1State(entry.state || entry));
  if (!states.length) throw new Error("at least one complete rules state is required");
  const checkpointKeys = stateSequenceInput.map((entry, index) =>
    String(entry.checkpointKey || entry.state?.stateKey || entry.stateKey || `checkpoint-${index}`));
  const relevantPieceKeys = new Set(sortedUnique(rawOptions.directlyRelevantPieceKeys || []));
  const historyScopeComplete = rawOptions.historyScopeComplete === true && states.length > 1;
  const allPieceKeys = sortedUnique(states.flatMap((state) =>
    (state.pieces || []).map((piece) => piece.pieceKey)));
  const pieceMaps = states.map((state) => new Map((state.pieces || []).map((piece) =>
    [String(piece.pieceKey || ""), piece])));
  const segmentRows = segmentCoverage(states, rawOptions.strictSegmentReceipts || []);
  const allSegmentsStrict = segmentRows.every((row) => row.strictCertified);
  const rows = allPieceKeys.map((pieceKey) => {
    const pieces = pieceMaps.map((map) => map.get(pieceKey) || null);
    const firstKnownPiece = pieces.find(Boolean) || {};
    const snapshots = pieces.map((piece, index) => piece
      ? pieceSnapshot(piece, index, checkpointKeys[index])
      : {
        checkpointIndex: index,
        checkpointKey: checkpointKeys[index],
        pieceKey,
        missingFromCompleteState: true,
      });
    const presentAtEveryCheckpoint = pieces.every(Boolean);
    const directlyRelevant = relevantPieceKeys.has(pieceKey);
    const reachableEnvelope = directlyRelevant
      ? null
      : deferredReachabilityEnvelope(firstKnownPiece, snapshots, rawOptions);
    const exactHistoryComplete = directlyRelevant && presentAtEveryCheckpoint &&
      allSegmentsStrict && historyScopeComplete;
    return {
      pieceKey,
      sideKey: String(firstKnownPiece.sideKey || ""),
      modelRole: String(firstKnownPiece.modelRole || ""),
      modelType: String(firstKnownPiece.modelType || ""),
      directlyRelevant,
      historyMode: directlyRelevant
        ? exactHistoryComplete
          ? "strict_complete_state_sequence"
          : "expanded_checkpoints_with_unresolved_segments"
        : "deferred_reachable_envelope",
      deploymentSource: deploymentSource(pieces[0] || firstKnownPiece),
      presentAtEveryCheckpoint,
      exactHistoryComplete,
      finalLifecycleStage: pieceLifecycleStage(pieces.at(-1) || firstKnownPiece),
      snapshots: directlyRelevant ? snapshots : [snapshots[0], snapshots.at(-1)],
      reachableEnvelope,
      unresolvedReasons: sortedUnique([
        ...(!presentAtEveryCheckpoint ? ["model_missing_from_complete_checkpoint_state"] : []),
        ...(directlyRelevant && !historyScopeComplete
          ? ["declared_history_scope_incomplete"]
          : []),
        ...(directlyRelevant && !allSegmentsStrict ? ["strict_transition_segment_coverage_incomplete"] : []),
        ...(reachableEnvelope?.unresolvedReasons || []),
      ]),
    };
  });
  const openingProvenance = buildWarmachineRosterProvenanceV2(states[0]);
  const finalProvenance = buildWarmachineRosterProvenanceV2(states.at(-1));
  const missingFromOpening = rows.filter((row) => !pieceMaps[0].has(row.pieceKey))
    .map((row) => row.pieceKey);
  const missingFromFinal = rows.filter((row) => !pieceMaps.at(-1).has(row.pieceKey))
    .map((row) => row.pieceKey);
  const core = {
    schemaVersion: WARMACHINE_MODEL_HISTORY_COVERAGE_V2_SCHEMA,
    upstreamReceiptHash: warmachineConstructionHost.core.receipt.receiptHash,
    checkpointCount: states.length,
    checkpointKeys,
    checkpointStateHashes: states.map((state) => stableGraphHash(state)),
    historyScope: {
      startKind: String(rawOptions.scopeStartKind || "unspecified"),
      endKind: String(rawOptions.scopeEndKind || "unspecified"),
      complete: historyScopeComplete,
    },
    segmentRows,
    counts: {
      modelCount: rows.length,
      directlyRelevantModelCount: rows.filter((row) => row.directlyRelevant).length,
      strictCompleteHistoryModelCount: rows.filter((row) => row.exactHistoryComplete).length,
      expandedUnresolvedHistoryModelCount: rows.filter((row) =>
        row.historyMode === "expanded_checkpoints_with_unresolved_segments").length,
      deferredEnvelopeModelCount: rows.filter((row) =>
        row.historyMode === "deferred_reachable_envelope").length,
      hardReachabilityRefutedModelCount: rows.filter((row) =>
        row.reachableEnvelope?.hardReachabilityRefuted).length,
      modelMissingFromOpeningCount: missingFromOpening.length,
      modelMissingFromFinalCount: missingFromFinal.length,
    },
    openingProvenance,
    finalProvenance,
    rows,
    deferredEquivalenceGroups: deferredEquivalenceGroups(rows),
    rosterIdentityPreserved: missingFromOpening.length === 0 && missingFromFinal.length === 0,
    requiredHistoryCoverageComplete: rows.every((row) =>
      row.directlyRelevant ? row.exactHistoryComplete : row.presentAtEveryCheckpoint),
    allModelHistoriesStrictComplete: rows.every((row) => row.exactHistoryComplete),
    deferredMovementClosureComplete: rows.filter((row) => !row.directlyRelevant)
      .every((row) => row.reachableEnvelope?.movementClosureComplete === true),
    hardPruningEnabled: false,
    claimBoundary: "Directly relevant models retain every supplied complete-state checkpoint and require a state-bound strict receipt for each segment. Deferred models keep individual identities and conservative reachability envelopes; an incomplete movement closure may order expansion but cannot refute reachability.",
  };
  return { ...core, historyCoverageHash: stableGraphHash(core) };
}

function orderedRosterPairs(player1Rows = [], player2Rows = [], seed = "") {
  const pairs = [];
  for (const player1 of player1Rows) for (const player2 of player2Rows) {
    const rosterPairKey = `roster-pair-${stableGraphHash({
      player1: player1.canonicalRosterKey,
      player2: player2.canonicalRosterKey,
    })}`;
    pairs.push({
      rosterPairKey,
      player1,
      player2,
      sourceProposalMass: round(player1.sourceProposalMass * player2.sourceProposalMass),
      capabilityOrderingMatchCount: player1.capability.orderingMatchCount +
        player2.capability.orderingMatchCount,
      sampleRank: stableGraphHash({ seed, rosterPairKey }),
    });
  }
  return pairs.sort((left, right) =>
    right.capabilityOrderingMatchCount - left.capabilityOrderingMatchCount ||
    left.sampleRank.localeCompare(right.sampleRank) ||
    left.rosterPairKey.localeCompare(right.rosterPairKey));
}

function openingCandidateRecord(pair, firstPlayerSideKey, formation, options) {
  const firstPlayerMass = 1 / options.firstPlayerSideKeys.length;
  const openingProposalMass = round(
    pair.sourceProposalMass * firstPlayerMass * numeric(formation.proposalMass, 0),
  );
  let state = null;
  let rosterProvenance = null;
  let rosterPointLedger = null;
  if (formation.room && options.includeStates) {
    state = buildWarmachineRulesV1StateFromLayer3Room(formation.room, {
      strictMode: true,
      enforceStrictExecutor: true,
    });
    rosterProvenance = buildWarmachineRosterProvenanceV2(state);
    rosterPointLedger = buildWarmachineRosterPointLedger(state, {
      completeArmyPointsBySide: {
        player1: pair.player1.list.totalPoints,
        player2: pair.player2.list.totalPoints,
      },
    });
  }
  return {
    openingKey: `opening-${stableGraphHash({
      rosterPairKey: pair.rosterPairKey,
      firstPlayerSideKey,
      formationKey: formation.formationKey,
    })}`,
    rosterPairKey: pair.rosterPairKey,
    rosterKeys: {
      player1: pair.player1.canonicalRosterKey,
      player2: pair.player2.canonicalRosterKey,
    },
    sourceListKeys: {
      player1: pair.player1.sourceAliases.map((row) => row.sourceListKey),
      player2: pair.player2.sourceAliases.map((row) => row.sourceListKey),
    },
    firstPlayerSideKey,
    formationKey: formation.formationKey,
    archetypes: formation.archetypes,
    openingProposalMass,
    deploymentAudit: formation.deploymentAudit,
    deploymentCertificates: formation.deploymentCertificates,
    strictDeploymentLegal: formation.deploymentAudit?.ok === true,
    stateKey: String(state?.stateKey || ""),
    stateHash: state ? stableGraphHash(state) : "",
    modelCount: state?.pieces?.length ??
      numeric(pair.player1.list.physicalModels) + numeric(pair.player2.list.physicalModels),
    rosterProvenance,
    rosterPointLedger,
    state: options.includeStates ? state : undefined,
    room: options.includeRooms ? formation.room : undefined,
  };
}

function sideLegalMass(ledger) {
  return round(1 - numeric(ledger.massLedger.sourceInvalidMass, 0));
}

function sideTerminalEligibleMass(ledger) {
  return round(
    numeric(ledger.massLedger.selectedMass, 0) +
    numeric(ledger.massLedger.budgetUnresolvedMass, 0),
  );
}

export function runWarmachineNestedRosterDeploymentSearchV2(rawInput = {}) {
  const rosterPoolsBySide = rawInput.rosterPoolsBySide || {};
  const sourceEvidenceBySide = rawInput.sourceEvidenceBySide || {};
  const maximumSelectedRostersBySide = rawInput.maximumSelectedRostersBySide || {};
  const capabilityBottlenecksBySide = rawInput.capabilityBottlenecksBySide || {};
  const firstPlayerSideKeys = sortedUnique(rawInput.firstPlayerSideKeys || ["player1"])
    .filter((sideKey) => ["player1", "player2"].includes(sideKey));
  if (!rawInput.templateRoom) throw new Error("templateRoom is required");
  if (!firstPlayerSideKeys.length) throw new Error("at least one first-player side is required");
  const options = {
    seed: String(rawInput.seed || "warmachine-nested-opening-v2"),
    maximumRosterPairs: Math.max(1, Math.floor(numeric(rawInput.maximumRosterPairs, 16))),
    maximumArchetypesPerSide: Math.max(1, Math.floor(numeric(
      rawInput.maximumArchetypesPerSide,
      3,
    ))),
    maximumFormationPairsPerRosterPair: Math.max(1, Math.floor(numeric(
      rawInput.maximumFormationPairsPerRosterPair,
      9,
    ))),
    firstPlayerSideKeys,
    includeRooms: rawInput.includeRooms === true,
    includeStates: rawInput.includeStates === true,
  };
  if (options.includeStates) options.includeRooms = true;
  const rosterLedgers = {
    player1: buildWarmachineFiniteRosterProposalLedgerV2(
      rosterPoolsBySide.player1 || [],
      "player1",
      {
        expectedPoints: rawInput.expectedPointsBySide?.player1 ?? 100,
        maximumSelectedUniqueRosters: maximumSelectedRostersBySide.player1 ?? 4,
        seed: `${options.seed}:player1`,
        sourceEvidence: sourceEvidenceBySide.player1 || {},
        capabilityBottlenecks: capabilityBottlenecksBySide.player1 || [],
      },
    ),
    player2: buildWarmachineFiniteRosterProposalLedgerV2(
      rosterPoolsBySide.player2 || [],
      "player2",
      {
        expectedPoints: rawInput.expectedPointsBySide?.player2 ?? 100,
        maximumSelectedUniqueRosters: maximumSelectedRostersBySide.player2 ?? 4,
        seed: `${options.seed}:player2`,
        sourceEvidence: sourceEvidenceBySide.player2 || {},
        capabilityBottlenecks: capabilityBottlenecksBySide.player2 || [],
      },
    ),
  };
  const allSelectedRosterPairs = orderedRosterPairs(
    rosterLedgers.player1.selected,
    rosterLedgers.player2.selected,
    options.seed,
  );
  const attemptedRosterPairs = allSelectedRosterPairs.slice(0, options.maximumRosterPairs);
  const deferredSelectedRosterPairs = allSelectedRosterPairs.slice(options.maximumRosterPairs);
  const openings = [];
  const rejectedDeployments = [];
  const pairRows = [];
  let strictLegalOpeningMass = 0;
  let strictRejectedOpeningMass = 0;
  let formationBudgetUnresolvedMass = 0;
  for (const pair of attemptedRosterPairs) {
    for (const firstPlayerSideKey of firstPlayerSideKeys) {
      const formationResult = generateWarmachineFormationCandidates({
        templateRoom: rawInput.templateRoom,
        player1List: pair.player1.list,
        player2List: pair.player2.list,
        referenceState: rawInput.referenceState || {},
        firstPlayerSideKey,
        maximumArchetypesPerSide: options.maximumArchetypesPerSide,
        maximumPairs: options.maximumFormationPairsPerRosterPair,
        includeRooms: options.includeRooms,
        archetypeKeysBySide: rawInput.formationArchetypeKeysBySide || {},
      });
      const firstPlayerMass = 1 / firstPlayerSideKeys.length;
      strictLegalOpeningMass += pair.sourceProposalMass * firstPlayerMass *
        numeric(formationResult.proposalMassLedger.strictLegalProposalMass, 0);
      strictRejectedOpeningMass += pair.sourceProposalMass * firstPlayerMass *
        numeric(formationResult.proposalMassLedger.strictRejectedProposalMass, 0);
      formationBudgetUnresolvedMass += pair.sourceProposalMass * firstPlayerMass *
        numeric(formationResult.proposalMassLedger.budgetUnresolvedProposalMass, 0);
      for (const formation of formationResult.candidates) {
        openings.push(openingCandidateRecord(pair, firstPlayerSideKey, formation, options));
      }
      for (const rejection of formationResult.rejected) {
        rejectedDeployments.push({
          rosterPairKey: pair.rosterPairKey,
          firstPlayerSideKey,
          ...stableGraphValue(rejection),
          openingProposalMass: round(
            pair.sourceProposalMass * firstPlayerMass *
              numeric(rejection.proposalMass ?? rejection.candidateMass, 0),
          ),
        });
      }
      pairRows.push({
        rosterPairKey: pair.rosterPairKey,
        firstPlayerSideKey,
        sourceProposalMass: pair.sourceProposalMass,
        rosterKeys: {
          player1: pair.player1.canonicalRosterKey,
          player2: pair.player2.canonicalRosterKey,
        },
        formationCounts: formationResult.counts,
        formationMassLedger: formationResult.proposalMassLedger,
      });
    }
  }
  strictLegalOpeningMass = round(strictLegalOpeningMass);
  strictRejectedOpeningMass = round(strictRejectedOpeningMass);
  formationBudgetUnresolvedMass = round(formationBudgetUnresolvedMass);
  const sideExactLegalMasses = {
    player1: sideLegalMass(rosterLedgers.player1),
    player2: sideLegalMass(rosterLedgers.player2),
  };
  const sideTerminalEligibleMasses = {
    player1: sideTerminalEligibleMass(rosterLedgers.player1),
    player2: sideTerminalEligibleMass(rosterLedgers.player2),
  };
  const exactLegalRosterPairMass = round(
    sideExactLegalMasses.player1 * sideExactLegalMasses.player2,
  );
  const terminalEligibleRosterPairMass = round(
    sideTerminalEligibleMasses.player1 * sideTerminalEligibleMasses.player2,
  );
  const sourceInvalidRosterPairMass = round(Math.max(0, 1 - exactLegalRosterPairMass));
  const terminalProposalExcludedRosterPairMass = round(Math.max(
    0,
    exactLegalRosterPairMass - terminalEligibleRosterPairMass,
  ));
  const attemptedRosterPairMass = round(attemptedRosterPairs.reduce(
    (sum, pair) => sum + pair.sourceProposalMass,
    0,
  ));
  const rosterBudgetUnresolvedMass = round(Math.max(
    0,
    terminalEligibleRosterPairMass - attemptedRosterPairMass,
  ));
  const representedMass = round(
    sourceInvalidRosterPairMass + terminalProposalExcludedRosterPairMass +
    rosterBudgetUnresolvedMass + strictLegalOpeningMass +
    strictRejectedOpeningMass + formationBudgetUnresolvedMass,
  );
  const core = {
    schemaVersion: WARMACHINE_NESTED_ROSTER_DEPLOYMENT_SEARCH_V2_SCHEMA,
    upstreamConstructionReceiptHash: warmachineConstructionHost.receipt.receiptHash,
    searchMode: String(rawInput.searchMode || "fixed_faction_finite_roster_pool"),
    finiteContract: {
      rosterSourcePoolBound: true,
      exactForceBuilderLegalityInheritedFromContentBoundSource: true,
      deploymentCoordinatesOwnedByConstructionHostPacker: true,
      deploymentAudit: "full_base_inside_zone_no_overlap_unit_coherency_attachment_proximity",
      exhaustiveOverAllFactionRosters: false,
      exhaustiveOverAllContinuousDeployments: false,
      firstPlayerSideKeys,
      maximumRosterPairs: options.maximumRosterPairs,
      maximumArchetypesPerSide: options.maximumArchetypesPerSide,
      maximumFormationPairsPerRosterPair: options.maximumFormationPairsPerRosterPair,
    },
    rosterLedgers,
    counts: {
      selectedRosterPairCount: allSelectedRosterPairs.length,
      attemptedRosterPairCount: attemptedRosterPairs.length,
      deferredSelectedRosterPairCount: deferredSelectedRosterPairs.length,
      attemptedRosterPairFirstPlayerCount: pairRows.length,
      strictLegalOpeningCount: openings.length,
      strictRejectedOpeningCount: rejectedDeployments.length,
      formationBudgetUnresolvedCount: pairRows.reduce((sum, row) =>
        sum + numeric(row.formationCounts.budgetUnresolvedPairCount, 0), 0),
    },
    massLedger: {
      totalSourceRosterPairMass: 1,
      sourceInvalidRosterPairMass,
      terminalProposalExcludedRosterPairMass,
      rosterBudgetUnresolvedMass,
      strictLegalOpeningMass,
      strictRejectedOpeningMass,
      formationBudgetUnresolvedMass,
      representedMass,
      massConserved: Math.abs(representedMass - 1) <= 1e-7,
      semantics: "Independent uniform source-list proposal mass by side, followed by uniform declared first-player alternatives and finite formation-archetype pairs. Canonical duplicate lists accumulate alias mass before nesting.",
    },
    pairRows,
    openings,
    rejectedDeployments,
    deferredSelectedRosterPairs: deferredSelectedRosterPairs.map((pair) => ({
      rosterPairKey: pair.rosterPairKey,
      sourceProposalMass: pair.sourceProposalMass,
    })),
    globalOptimalityProven: false,
    trainingTruth: false,
    claimBoundary: "Every returned opening has exact source-pool roster evidence and a strict deployment geometry audit. Unselected roster proposals, roster pairs, first-player alternatives and formation pairs remain explicit unresolved mass; the finite pool and archetype library do not exhaust faction construction or continuous deployment.",
  };
  return { ...core, searchHash: stableGraphHash(core) };
}
