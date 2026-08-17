import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { warmachineReverseDispositionProtocolV1 } from
  "./reverse-disposition-v1.mjs";

export const WARMACHINE_SEARCH_CONSOLE_PRESENTATION_EVIDENCE_V1_SCHEMA =
  "warmachine_search_console_presentation_evidence_v1";

function bindCurrentHostReceipt(snapshot = {}, currentHostReceiptHash = "") {
  const sourceHostReceiptHash = String(snapshot.hostReceiptHash || "");
  const currentReceiptHash = String(currentHostReceiptHash || "");
  const comparable = Boolean(sourceHostReceiptHash && currentReceiptHash);
  const compatible = !comparable || sourceHostReceiptHash === currentReceiptHash;
  const hostCompatibility = stableGraphValue({
    checked: comparable,
    compatible,
    sourceHostReceiptHash,
    currentHostReceiptHash: currentReceiptHash,
    invalidationReason: compatible ? "" : "host_receipt_mismatch",
  });
  if (compatible) return { snapshot, hostCompatibility };

  const invalidatedBranches = (snapshot.graph?.branches || []).map((branch) =>
    stableGraphValue({
      ...branch,
      historicalDisposition: String(branch.disposition || ""),
      disposition: "rules_drift",
      strictReplay: {
        ...(branch.strictReplay || {}),
        historicalCertified: branch.strictReplay?.certified === true,
        certified: false,
        invalidatedByHostReceiptMismatch: true,
      },
    }));
  const driftRows = invalidatedBranches.map((branch) => stableGraphValue({
    disposition: "rules_drift",
    dispositionId: `rules-drift-${stableGraphHash({
      branchKey: branch.branchKey,
      sourceHostReceiptHash,
      currentReceiptHash,
    }, 24)}`,
    reason: "host_receipt_mismatch",
    stageKey: "presentation_publication",
    branchKey: branch.branchKey,
    sourceHostReceiptHash,
    currentHostReceiptHash: currentReceiptHash,
    recoveryProtocol: warmachineReverseDispositionProtocolV1("rules_drift"),
  }));
  return {
    hostCompatibility,
    snapshot: stableGraphValue({
      ...snapshot,
      ok: false,
      graph: {
        ...(snapshot.graph || {}),
        branches: invalidatedBranches,
      },
      dispositions: [...(snapshot.dispositions || []), ...driftRows],
      dispositionCounts: {
        ...(snapshot.dispositionCounts || {}),
        rules_drift: Number(snapshot.dispositionCounts?.rules_drift || 0) +
          driftRows.length,
      },
      searchCoverage: {
        ...(snapshot.searchCoverage || {}),
        strictCertifiedBranchCount: 0,
      },
      trainingTruth: false,
    }),
  };
}

function identityFromPiece(piece = {}) {
  const card = piece.cardSnapshot || piece.card || {};
  return stableGraphValue({
    pieceKey: String(piece.pieceKey || ""),
    cardId: String(piece.cardId || card.id || card.cardId || ""),
    cardName: String(piece.cardName || card.name || ""),
    modelId: String(piece.modelId || ""),
    modelName: String(piece.modelName || piece.label || piece.name || ""),
    portraitPath: String(piece.portraitPath || card.portraitPath || ""),
  });
}

export function collectWarmachineReplayPieceIdentitiesV1(source = {}) {
  const identities = new Map();
  const conflictKeys = new Set();
  const pending = [source];
  const visited = new Set();
  while (pending.length) {
    const value = pending.pop();
    if (!value || typeof value !== "object" || visited.has(value)) continue;
    visited.add(value);
    if (Array.isArray(value)) {
      pending.push(...value);
      continue;
    }
    if (value.pieceKey && (value.cardSnapshot || value.cardId || value.cardName)) {
      const identity = identityFromPiece(value);
      const prior = identities.get(identity.pieceKey);
      if (!prior) identities.set(identity.pieceKey, identity);
      else if (stableGraphHash(prior) !== stableGraphHash(identity)) {
        conflictKeys.add(identity.pieceKey);
      }
    }
    pending.push(...Object.values(value));
  }
  for (const key of conflictKeys) identities.delete(key);
  return {
    identities,
    conflictPieceKeys: [...conflictKeys].sort(),
  };
}

function uniqueProjectedPieces(snapshot = {}) {
  const pieces = new Map();
  for (const node of snapshot.graph?.nodes || []) {
    for (const piece of node.pieces || []) {
      if (piece.pieceKey && !pieces.has(piece.pieceKey)) pieces.set(piece.pieceKey, piece);
    }
  }
  return pieces;
}

function normalizedScenarioKey(value = "") {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function summarizeBoardEvidence(snapshot = {}, scenarioAssetByScenarioKey = {}) {
  const nodes = snapshot.graph?.nodes || [];
  const terrain = nodes.flatMap((node) => node.terrain || []);
  const objectives = nodes.flatMap((node) => node.objectives || []);
  const caches = nodes.flatMap((node) => node.caches || []);
  const geometryRows = [...terrain, ...objectives, ...caches];
  const scenarioKey = normalizedScenarioKey(snapshot.terminal?.scenarioKey || "");
  const scenarioAsset = scenarioAssetByScenarioKey[scenarioKey] || null;
  return stableGraphValue({
    renderMode: scenarioAsset
      ? "official_scenario_diagram_plus_rules_state_geometry"
      : "rules_state_geometry",
    scenarioKey,
    backgroundAssetBound: Boolean(scenarioAsset),
    backgroundImageUrl: String(scenarioAsset?.assetUrl || ""),
    backgroundImageSha256: String(scenarioAsset?.sha256 || ""),
    backgroundImageSourceKind: String(scenarioAsset?.sourceKind || ""),
    backgroundImageSourceMemberPath: String(scenarioAsset?.sourceMemberPath || ""),
    backgroundImageSourceArchiveSha256: String(scenarioAsset?.sourceArchiveSha256 || ""),
    backgroundImageSourceRectPx: scenarioAsset?.battlefieldSourceRectPx || null,
    coordinateConvention: String(scenarioAsset?.coordinateConvention ||
      "x_west_to_east_y_south_to_north"),
    canvasYAxisInvertedFromRulesCoordinates: true,
    backgroundBindingReason: scenarioAsset
      ? "official_scenario_diagram_bound_by_exact_scenario_key"
      : "search_state_has_no_evidence_bound_map_asset",
    sourceNodeCount: nodes.length,
    distinctBoardCount: new Set(nodes.map((node) => stableGraphHash(node.board || {}))).size,
    distinctTerrainLayoutCount: new Set(nodes.map((node) => stableGraphHash(node.terrain || []))).size,
    distinctObjectiveLayoutCount: new Set(nodes.map((node) => stableGraphHash({
      objectives: node.objectives || [],
      caches: node.caches || [],
    }))).size,
    terrainElementCount: nodes[0]?.terrain?.length || 0,
    objectiveElementCount: nodes[0]?.objectives?.length || 0,
    cacheElementCount: nodes[0]?.caches?.length || 0,
    geometryExactWithinDeclaredScope: geometryRows.length > 0 && geometryRows.every((row) =>
      row.geometryExactWithinScope === true && !(row.geometryIssues || []).length),
  });
}

export function enrichWarmachineSearchConsolePresentationV1(rawInput = {}) {
  const hostBinding = bindCurrentHostReceipt(
    rawInput.snapshot || {},
    rawInput.currentHostReceiptHash || "",
  );
  const snapshot = hostBinding.snapshot;
  const checkpointProvided = Boolean(rawInput.checkpoint);
  const checkpointEvidence = collectWarmachineReplayPieceIdentitiesV1(
    rawInput.checkpoint || {},
  );
  const projectedPieces = uniqueProjectedPieces(snapshot);
  const exactIdentities = new Map(checkpointEvidence.identities);
  for (const [pieceKey, piece] of projectedPieces) {
    if (!exactIdentities.has(pieceKey) && piece.cardId && piece.cardName) {
      exactIdentities.set(pieceKey, identityFromPiece(piece));
    }
  }
  const exactAssetByCardId = rawInput.exactAssetByCardId || {};
  const exactMediaAssetByPortraitPath = rawInput.exactMediaAssetByPortraitPath || {};
  const matchedKeys = new Set();
  const portraitKeys = new Set();
  const exactCardOverrideKeys = new Set();
  const exactMediaLibraryKeys = new Set();
  const exactCardIds = new Set();
  const enrichedNodes = (snapshot.graph?.nodes || []).map((node) => ({
    ...node,
    pieces: (node.pieces || []).map((piece) => {
      const identity = exactIdentities.get(piece.pieceKey);
      if (!identity) return { ...piece, portraitPath: "", presentationIdentityExact: false };
      matchedKeys.add(piece.pieceKey);
      if (identity.cardId) exactCardIds.add(identity.cardId);
      const asset = exactAssetByCardId[identity.cardId] || null;
      const portraitPath = String(identity.portraitPath || "");
      const mediaAsset = exactMediaAssetByPortraitPath[portraitPath] || null;
      const portraitUrl = String(asset?.assetUrl || mediaAsset?.assetUrl || "");
      if (asset) exactCardOverrideKeys.add(piece.pieceKey);
      if (!asset && mediaAsset) exactMediaLibraryKeys.add(piece.pieceKey);
      if (portraitUrl) portraitKeys.add(piece.pieceKey);
      const portraitEvidenceAsset = asset || mediaAsset;
      return stableGraphValue({
        ...piece,
        cardId: identity.cardId,
        cardName: identity.cardName,
        modelId: identity.modelId,
        modelName: identity.modelName,
        portraitPath,
        portraitUrl,
        portraitEvidenceKind: asset
          ? "exact_card_asset_override"
          : mediaAsset ? "exact_media_library_path" : "missing_exact_card_asset",
        portraitEvidenceSourceKind: String(portraitEvidenceAsset?.sourceKind || ""),
        portraitEvidenceSource: String(portraitEvidenceAsset?.sourceMemberPath || ""),
        portraitEvidenceArchive: String(portraitEvidenceAsset?.sourceArchiveName || ""),
        portraitEvidenceArchiveHash: String(
          portraitEvidenceAsset?.sourceArchiveSha256 || "",
        ),
        portraitEvidenceHash: String(portraitEvidenceAsset?.sha256 || ""),
        presentationIdentityExact: true,
      });
    }),
  }));
  const projectedKeys = [...projectedPieces.keys()].sort();
  const unmatchedPieceKeys = projectedKeys.filter((key) => !matchedKeys.has(key));
  const missingPortraitPieceKeys = projectedKeys.filter((key) =>
    matchedKeys.has(key) && !portraitKeys.has(key));
  const pieceIdentity = stableGraphValue({
    sourceKind: checkpointProvided
      ? "checkpoint_card_snapshot_by_piece_key"
      : "projected_card_identity_by_piece_key",
    sourceFileName: String(rawInput.checkpointFileName || ""),
    sourceCheckpointHash: String(rawInput.checkpointHash || ""),
    projectedPieceCount: projectedKeys.length,
    exactIdentityMatchedPieceCount: matchedKeys.size,
    exactIdentityUnmatchedPieceCount: unmatchedPieceKeys.length,
    exactPortraitPieceCount: portraitKeys.size,
    exactCardOverridePieceCount: exactCardOverrideKeys.size,
    exactMediaLibraryPieceCount: exactMediaLibraryKeys.size,
    missingExactPortraitPieceCount: missingPortraitPieceKeys.length,
    exactCardCount: exactCardIds.size,
    conflictPieceCount: checkpointEvidence.conflictPieceKeys.length,
    unmatchedPieceKeys,
    missingPortraitPieceKeys,
    conflictPieceKeys: checkpointEvidence.conflictPieceKeys,
  });
  const evidence = stableGraphValue({
    schemaVersion: WARMACHINE_SEARCH_CONSOLE_PRESENTATION_EVIDENCE_V1_SCHEMA,
    pieceIdentity,
    board: summarizeBoardEvidence(snapshot, rawInput.scenarioAssetByScenarioKey || {}),
    hostCompatibility: hostBinding.hostCompatibility,
    fuzzyIdentityMatchingUsed: false,
    trainingTruth: false,
  });
  return stableGraphValue({
    ...snapshot,
    graph: {
      ...(snapshot.graph || {}),
      nodes: enrichedNodes,
    },
    replayPresentationEvidence: {
      ...evidence,
      evidenceHash: stableGraphHash(evidence),
    },
  });
}
