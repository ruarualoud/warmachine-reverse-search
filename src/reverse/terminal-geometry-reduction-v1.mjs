import { performance } from "node:perf_hooks";

import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import {
  auditRulesV1StaticPlacement,
  auditRulesV1StaticUnitFormation,
  normalizeRulesV1State,
  warmachineHost,
} from "../warmachine-host-runtime.mjs";
import { materializeWarmachineTerminalSpatialCellsV1 } from
  "./terminal-spatial-materializer-v1.mjs";
import { WARMACHINE_TERMINAL_HYPOTHESIS_CELL_V1_SCHEMA } from
  "./terminal-hypothesis-v1.mjs";
import { warmachinePieceInPlayV1 } from "./piece-lifecycle-v1.mjs";

export const WARMACHINE_TERMINAL_GEOMETRY_REDUCTION_V1_SCHEMA =
  "warmachine_terminal_geometry_reduction_v1";

const COMPLETION_MODES = new Set(["complete_probability", "existence"]);

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function point(value = {}) {
  return {
    xIn: numeric(value.xIn ?? value.x),
    yIn: numeric(value.yIn ?? value.y),
  };
}

function exactPositions(cell = {}) {
  const exact = cell.geometryRelationCell?.exactCoordinates || {};
  const source = exact.piecePositions || exact.pieces || {};
  return Object.fromEntries(Object.entries(source).map(([pieceKey, position]) => [
    String(pieceKey),
    point(position),
  ]).sort(([left], [right]) => left.localeCompare(right)));
}

function resolvedTerminalRoute(cell = {}, rawOptions = {}) {
  const route = rawOptions.terminalRouteStepsByCellKey?.[cell.cellKey] ||
    rawOptions.terminalRouteSteps || null;
  if (Array.isArray(route) && route.length) return stableGraphValue(route);
  const action = rawOptions.terminalActionByCellKey?.[cell.cellKey] ||
    rawOptions.terminalAction || null;
  return action ? stableGraphValue([action]) : [];
}

function resolvedPriorTurnSettlementSeed(cell = {}, rawOptions = {}) {
  return stableGraphValue(
    rawOptions.priorTurnSettlementSeedByCellKey?.[cell.cellKey] ||
      rawOptions.priorTurnSettlementSeed || null,
  );
}

function unitFormationAnchorMap(cell = {}) {
  return Object.fromEntries(
    (cell.geometryRelationCell?.generationEvidence?.remainingPlacementEvidence
      ?.unitFormationAudit || []).map((audit) => [
      String(audit.unitGroupKey || ""),
      String(audit.anchorPieceKey || ""),
    ]).filter(([unitGroupKey, anchorPieceKey]) => unitGroupKey && anchorPieceKey)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function materializationCellContract(cell = {}) {
  return stableGraphValue({
    schemaVersion: cell.schemaVersion,
    goalType: cell.goalType,
    scenarioKey: cell.scenarioKey,
    scenarioPacketKey: cell.scenarioPacketKey,
    scenarioPacketYear: cell.scenarioPacketYear,
    resultKind: cell.resultKind,
    roundNumber: cell.roundNumber,
    winnerSideKey: cell.winnerSideKey,
    loserSideKey: cell.loserSideKey,
    endingSideKey: cell.endingSideKey,
    preTerminalPhaseKey: cell.preTerminalPhaseKey || "",
    actorPieceKey: cell.actorPieceKey || "",
    targetLeaderPieceKey: cell.targetLeaderPieceKey || "",
    targetBoxesBeforeFinal: cell.targetBoxesBeforeFinal ?? null,
    scoringElementKey: cell.scoringElementKey || "",
    scoreBeforeTerminalCell: cell.scoreBeforeTerminalCell || null,
    terminalScoreGainCell: cell.terminalScoreGainCell || null,
    geometryRelationCell: {
      exactCoordinatesKnown:
        cell.geometryRelationCell?.exactCoordinatesKnown === true,
      exactCoordinates: cell.geometryRelationCell?.exactCoordinates || null,
      relationChecks: cell.geometryRelationCell?.relationChecks || [],
      unitFormationAnchorMap: unitFormationAnchorMap(cell),
    },
  });
}

function materializationOptionContract(cell = {}, rawOptions = {}) {
  return stableGraphValue({
    activationEnvelopeBySide: rawOptions.activationEnvelopeBySide || {},
    preTerminalActivationEnvelopeBySide:
      rawOptions.preTerminalActivationEnvelopeBySide || {},
    maximumCurrentControlSteps: Math.max(
      1,
      Number(rawOptions.maximumCurrentControlSteps || 64),
    ),
    priorTurnSettlementSeed: resolvedPriorTurnSettlementSeed(cell, rawOptions),
    terminalRouteSteps: resolvedTerminalRoute(cell, rawOptions),
  });
}

function exclusionEntry(cell = {}, reason = "", authority = "", input = {}, detail = {}) {
  const inputProjection = stableGraphValue(input);
  const core = stableGraphValue({
    cellKey: String(cell.cellKey || ""),
    disposition: authority === "rules_v1_host" ? "strict_rejected" : "input_invalid",
    authority,
    reason,
    inputProjection,
    inputHash: stableGraphHash(inputProjection),
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    ...detail,
  });
  return stableGraphValue({ ...core, exclusionHash: stableGraphHash(core) });
}

function staticCandidateState(normalizedTemplate = {}, cell = {}) {
  const positions = exactPositions(cell);
  const state = structuredClone(normalizedTemplate);
  const knownPieceKeys = new Set((state.pieces || []).map((piece) => piece.pieceKey));
  const unknownPieceKeys = Object.keys(positions).filter((pieceKey) =>
    !knownPieceKeys.has(pieceKey));
  const missingLivePieceKeys = (state.pieces || []).filter((piece) =>
    warmachinePieceInPlayV1(piece) && !positions[piece.pieceKey]).map((piece) =>
    piece.pieceKey);
  for (const piece of state.pieces || []) {
    if (positions[piece.pieceKey]) piece.position = positions[piece.pieceKey];
  }
  return {
    positions,
    state: normalizeRulesV1State(state),
    unknownPieceKeys: unknownPieceKeys.sort(),
    missingLivePieceKeys: missingLivePieceKeys.sort(),
  };
}

export function screenWarmachineTerminalGeometryCandidatesV1(
  stateTemplateInput = {},
  terminalCellsInput = [],
) {
  const normalizedTemplate = normalizeRulesV1State(stateTemplateInput);
  const cells = (Array.isArray(terminalCellsInput)
    ? terminalCellsInput
    : [terminalCellsInput]).filter(Boolean);
  const eligible = [];
  const excluded = [];
  let staticPlacementHostCallCount = 0;
  let staticUnitFormationHostCallCount = 0;
  for (const cell of cells) {
    const baseInput = {
      schemaVersion: cell.schemaVersion || "",
      exactCoordinatesKnown:
        cell.geometryRelationCell?.exactCoordinatesKnown === true,
      exactCoordinates: cell.geometryRelationCell?.exactCoordinates || null,
    };
    if (cell.schemaVersion !== WARMACHINE_TERMINAL_HYPOTHESIS_CELL_V1_SCHEMA ||
        cell.geometryRelationCell?.exactCoordinatesKnown !== true) {
      excluded.push(exclusionEntry(
        cell,
        "terminal_geometry_exact_coordinate_cell_required",
        "input_contract",
        baseInput,
      ));
      continue;
    }
    const prepared = staticCandidateState(normalizedTemplate, cell);
    if (prepared.unknownPieceKeys.length || prepared.missingLivePieceKeys.length) {
      excluded.push(exclusionEntry(
        cell,
        "terminal_geometry_piece_coordinate_contract_failed",
        "input_contract",
        {
          ...baseInput,
          positionHash: stableGraphHash(prepared.positions),
          unknownPieceKeys: prepared.unknownPieceKeys,
          missingLivePieceKeys: prepared.missingLivePieceKeys,
        },
      ));
      continue;
    }
    staticPlacementHostCallCount += 1;
    const staticPlacementAudit = auditRulesV1StaticPlacement(prepared.state);
    staticUnitFormationHostCallCount += 1;
    const staticUnitFormationAudit = auditRulesV1StaticUnitFormation(prepared.state, {
      anchorPieceKeyByUnitGroupKey: unitFormationAnchorMap(cell),
    });
    if (!staticPlacementAudit.ok || !staticUnitFormationAudit.ok) {
      const auditInput = {
        stateHash: stableGraphHash(prepared.state),
        positionHash: stableGraphHash(prepared.positions),
        unitFormationAnchorMap: unitFormationAnchorMap(cell),
      };
      const auditEvidence = stableGraphValue({
        staticPlacementAudit,
        staticUnitFormationAudit,
      });
      excluded.push(exclusionEntry(
        cell,
        "terminal_geometry_host_static_necessary_condition_rejected",
        "rules_v1_host",
        auditInput,
        {
          auditEvidence,
          auditEvidenceHash: stableGraphHash(auditEvidence),
        },
      ));
      continue;
    }
    eligible.push({
      cell,
      staticState: prepared.state,
      staticStateHash: stableGraphHash(prepared.state),
      positions: prepared.positions,
      staticPlacementAudit,
      staticUnitFormationAudit,
    });
  }
  return {
    inputCount: cells.length,
    eligible,
    excluded: stableGraphValue(excluded),
    staticPlacementHostCallCount,
    staticUnitFormationHostCallCount,
  };
}

export function buildWarmachineTerminalGeometryRelationSignatureV1(
  stateTemplateInput = {},
  cell = {},
  rawOptions = {},
) {
  const normalizedTemplate = normalizeRulesV1State(stateTemplateInput);
  const prepared = staticCandidateState(normalizedTemplate, cell);
  const cellContract = materializationCellContract(cell);
  const optionContract = materializationOptionContract(cell, rawOptions);
  const relationProjection = stableGraphValue({
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    normalizedStateTemplateHash: stableGraphHash(normalizedTemplate),
    exactHostGeometryStateHash: stableGraphHash(prepared.state),
    boardGeometry: prepared.state.board || {},
    terrainGeometry: prepared.state.terrain || [],
    scenarioGeometry: {
      objectives: prepared.state.scenario?.objectives || [],
      caches: prepared.state.scenario?.caches || [],
      zones: prepared.state.scenario?.zones || [],
      killBoxDistanceIn: prepared.state.scenario?.killBoxDistanceIn ??
        prepared.state.scenario?.killboxDistanceIn ?? null,
    },
    piecePositions: prepared.positions,
    materializationCellContract: cellContract,
    materializationOptionContract: optionContract,
  });
  const signatureHash = stableGraphHash(relationProjection);
  return stableGraphValue({
    schemaVersion: "warmachine_terminal_geometry_relation_signature_v1",
    signatureHash,
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    proofKind: "complete_current_host_input_identity",
    engineInputSupersetComplete: true,
    sameBaseSizeAloneIsProof: false,
    circularOrReflectionSymmetryAloneIsProof: false,
    relationProjection,
  });
}

function representativeOptions(cell = {}, rawOptions = {}) {
  const route = resolvedTerminalRoute(cell, rawOptions);
  const seed = resolvedPriorTurnSettlementSeed(cell, rawOptions);
  const options = {
    ...rawOptions,
    maximumCells: 1,
  };
  delete options.terminalActionByCellKey;
  delete options.terminalRouteStepsByCellKey;
  delete options.priorTurnSettlementSeedByCellKey;
  if (route.length === 1) options.terminalAction = route[0];
  else if (route.length > 1) options.terminalRouteSteps = route;
  if (seed) options.priorTurnSettlementSeed = seed;
  return options;
}

function withoutExecutionIdentity(value) {
  if (Array.isArray(value)) return value.map(withoutExecutionIdentity);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => ![
      "stateKey",
      "receiptHash",
      "routeKey",
    ].includes(key))
    .map(([key, entry]) => [key, withoutExecutionIdentity(entry)]));
}

function materializationOutcome(result = {}) {
  const root = result.runtimeRoots?.[0] || null;
  if (root) {
    const terminalWinnerSideKey = String(
      root.terminalState?.terminal?.winnerSideKey ||
      root.terminalState?.outcome?.winnerSideKey ||
      root.strictWitness?.proof?.winnerSideKey || "",
    );
    const semanticResult = stableGraphValue({
      disposition: "strict_materialized",
      terminalState: withoutExecutionIdentity(root.terminalState),
      terminalProof: {
        strictWitness: root.strictWitness?.strictWitness === true,
        goalType: String(root.goalType || ""),
        winnerSideKey: terminalWinnerSideKey,
      },
    });
    return {
      disposition: "strict_materialized",
      reason: "",
      hostReplayAttempted: true,
      hostReplayAccepted: true,
      rulesOutcomeHash: stableGraphHash(semanticResult),
      terminalStateHash: root.terminalStateHash,
      terminalSemanticStateHash: stableGraphHash(semanticResult.terminalState),
      receiptHashes: (root.strictReceiptHashes || []).map(String),
      root,
    };
  }
  const row = result.rejected?.[0] || result.deferred?.[0] || null;
  const disposition = String(row?.disposition || "materialization_not_accounted");
  const semanticResult = stableGraphValue({
    disposition,
    reason: String(row?.reason || ""),
    strictRejection: withoutExecutionIdentity(row?.strictRejection || null),
    issues: withoutExecutionIdentity(row?.issues || []),
  });
  return {
    disposition,
    reason: semanticResult.reason,
    hostReplayAttempted: row?.hostReplayAttempted === true,
    hostReplayAccepted: row?.hostReplayAccepted === true,
    rulesOutcomeHash: stableGraphHash(semanticResult),
    terminalStateHash: "",
    terminalSemanticStateHash: "",
    receiptHashes: [],
    rejection: row,
  };
}

function groupEligibleCandidates(
  stateTemplateInput,
  eligible = [],
  rawOptions = {},
  foldEquivalentCandidates = true,
) {
  const byKey = new Map();
  for (const candidate of eligible) {
    const signature = buildWarmachineTerminalGeometryRelationSignatureV1(
      stateTemplateInput,
      candidate.cell,
      rawOptions,
    );
    const groupKey = foldEquivalentCandidates
      ? signature.signatureHash
      : `${signature.signatureHash}:${candidate.cell.cellKey}`;
    if (!byKey.has(groupKey)) {
      byKey.set(groupKey, {
        groupKey,
        signature,
        candidates: [],
      });
    }
    byKey.get(groupKey).candidates.push(candidate);
  }
  return [...byKey.values()].map((group) => ({
    ...group,
    candidates: [...group.candidates].sort((left, right) =>
      left.cell.cellKey.localeCompare(right.cell.cellKey)),
  })).sort((left, right) => left.groupKey.localeCompare(right.groupKey));
}

export function materializeWarmachineTerminalGeometryReducedV1(
  stateTemplateInput = {},
  terminalCellsInput = [],
  rawOptions = {},
) {
  const startedAt = performance.now();
  const heapBeforeBytes = process.memoryUsage().heapUsed;
  const completionMode = String(rawOptions.completionMode || "complete_probability");
  if (!COMPLETION_MODES.has(completionMode)) {
    throw new Error(`terminal_geometry_completion_mode_invalid:${completionMode}`);
  }
  const foldEquivalentCandidates = rawOptions.foldEquivalentCandidates !== false;
  const screening = screenWarmachineTerminalGeometryCandidatesV1(
    stateTemplateInput,
    terminalCellsInput,
  );
  const groups = groupEligibleCandidates(
    stateTemplateInput,
    screening.eligible,
    rawOptions,
    foldEquivalentCandidates,
  );
  const dispositionLedger = screening.excluded.map((row) => stableGraphValue({
    cellKey: row.cellKey,
    relationSignatureHash: "",
    representativeCellKey: "",
    disposition: row.disposition,
    reason: row.reason,
    authority: row.authority,
    exclusionHash: row.exclusionHash,
    enumerated: true,
    strictReplayShared: false,
    rulesOutcomeHash: stableGraphHash({ disposition: row.disposition, reason: row.reason }),
  }));
  const evaluatedGroups = [];
  const unenumerated = [];
  let witnessFound = false;
  let strictReplayHostCallCount = 0;
  for (const group of groups) {
    if (completionMode === "existence" && witnessFound) {
      for (const candidate of group.candidates) {
        const row = stableGraphValue({
          cellKey: candidate.cell.cellKey,
          relationSignatureHash: group.signature.signatureHash,
          representativeCellKey: group.candidates[0].cell.cellKey,
          disposition: "unenumerated",
          reason: "terminal_geometry_existence_witness_stop",
          authority: "completion_contract",
          enumerated: false,
          strictReplayShared: false,
          rulesOutcomeHash: "",
        });
        dispositionLedger.push(row);
        unenumerated.push(row);
      }
      continue;
    }
    const representative = group.candidates[0];
    const result = materializeWarmachineTerminalSpatialCellsV1(
      stateTemplateInput,
      representative.cell,
      representativeOptions(representative.cell, rawOptions),
    );
    const outcome = materializationOutcome(result);
    if (outcome.hostReplayAttempted) strictReplayHostCallCount += 1;
    if (outcome.disposition === "strict_materialized") witnessFound = true;
    for (const candidate of group.candidates) {
      dispositionLedger.push(stableGraphValue({
        cellKey: candidate.cell.cellKey,
        relationSignatureHash: group.signature.signatureHash,
        representativeCellKey: representative.cell.cellKey,
        disposition: outcome.disposition,
        reason: outcome.reason,
        authority: outcome.disposition === "strict_rejected"
          ? "rules_v1_host"
          : "equivalent_complete_host_input",
        enumerated: true,
        strictReplayShared: candidate.cell.cellKey !== representative.cell.cellKey,
        rulesOutcomeHash: outcome.rulesOutcomeHash,
        terminalStateHash: outcome.terminalStateHash,
        terminalSemanticStateHash: outcome.terminalSemanticStateHash,
        receiptHashes: outcome.receiptHashes,
      }));
    }
    evaluatedGroups.push({
      relationSignatureHash: group.signature.signatureHash,
      representativeCellKey: representative.cell.cellKey,
      memberCellKeys: group.candidates.map((candidate) => candidate.cell.cellKey),
      memberCount: group.candidates.length,
      signature: group.signature,
      outcome: stableGraphValue({
        disposition: outcome.disposition,
        reason: outcome.reason,
        hostReplayAttempted: outcome.hostReplayAttempted,
        hostReplayAccepted: outcome.hostReplayAccepted,
        rulesOutcomeHash: outcome.rulesOutcomeHash,
        terminalStateHash: outcome.terminalStateHash,
        terminalSemanticStateHash: outcome.terminalSemanticStateHash,
        receiptHashes: outcome.receiptHashes,
      }),
      runtimeResult: result,
    });
  }
  dispositionLedger.sort((left, right) => left.cellKey.localeCompare(right.cellKey));
  const heapAfterBytes = process.memoryUsage().heapUsed;
  const enumerationComplete = unenumerated.length === 0;
  const eligibleCandidateCount = screening.eligible.length;
  const evaluatedRepresentativeCount = evaluatedGroups.length;
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_TERMINAL_GEOMETRY_REDUCTION_V1_SCHEMA,
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    completionMode,
    foldEquivalentCandidates,
    inputCandidateCount: screening.inputCount,
    eligibleCandidateCount,
    necessaryConditionExcludedCount: screening.excluded.length,
    relationSignatureGroupCount: groups.length,
    evaluatedRepresentativeCount,
    equivalentCandidateReuseCount: Math.max(
      0,
      dispositionLedger.filter((row) => row.strictReplayShared).length,
    ),
    unenumeratedCandidateCount: unenumerated.length,
    enumerationComplete,
    strictWitnessFound: witnessFound,
    probabilityClosureEligible:
      completionMode === "complete_probability" && enumerationComplete,
    optimalityConclusionEligible: false,
    unresolvedValueInterval: enumerationComplete ? [0, 0] : [0, 1],
    hostCalls: {
      staticPlacement: screening.staticPlacementHostCallCount,
      staticUnitFormation: screening.staticUnitFormationHostCallCount,
      strictReplay: strictReplayHostCallCount,
      materialization: evaluatedRepresentativeCount,
    },
    measurements: {
      durationMs: Math.max(0, performance.now() - startedAt),
      heapBeforeBytes,
      heapAfterBytes,
      observedHeapHighWaterBytes: Math.max(heapBeforeBytes, heapAfterBytes),
      strictReplayReductionRatio: eligibleCandidateCount > 0
        ? evaluatedRepresentativeCount / eligibleCandidateCount
        : 1,
    },
    necessaryConditionExclusions: screening.excluded,
    groups: evaluatedGroups.map(({ runtimeResult: _runtimeResult, ...group }) => group),
    unenumerated: stableGraphValue(unenumerated),
    dispositionLedger: stableGraphValue(dispositionLedger),
    equivalenceContract: {
      proofKind: "complete_current_host_input_identity",
      sameBaseSizeAloneIsProof: false,
      circularOrReflectionSymmetryAloneIsProof: false,
      currentHostReceiptRequired: true,
      currentSearchSourceReceiptRequired: true,
    },
    claimBoundary: "Only candidates with identical complete current-Host input state, terminal contract and strict route share a replay. Host static placement and unit-formation failures are necessary-condition exclusions with sealed inputs. Existence mode stops after one witness but leaves every remaining candidate unenumerated with value interval [0,1]; it cannot close probability mass or support optimality claims.",
    trainingTruth: false,
  });
  return {
    ...core,
    runtimeGroups: evaluatedGroups,
    reportHash: stableGraphHash(core),
    ok: dispositionLedger.length === screening.inputCount &&
      (completionMode === "existence" ? witnessFound : enumerationComplete),
  };
}
