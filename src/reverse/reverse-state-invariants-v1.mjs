import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import {
  auditRulesV1StaticPlacement,
  auditRulesV1StaticUnitFormation,
  normalizeRulesV1State,
  warmachineHost,
} from "../warmachine-host-runtime.mjs";
import { warmachinePieceInPlayV1 } from "./piece-lifecycle-v1.mjs";

export const WARMACHINE_REVERSE_STATE_BOUNDARY_AUDIT_V1_SCHEMA =
  "warmachine_reverse_state_boundary_audit_v1";

const RESOURCE_FIELDS = Object.freeze([
  "resourcePoints",
  "resource2",
  "focus",
  "fury",
  "essence",
  "essencePoints",
  "souls",
  "soulTokens",
  "corpses",
  "corpseTokens",
  "hunger",
  "hungerTokens",
]);

function finiteNumber(value) {
  return Number.isFinite(Number(value));
}

function issue(code, raw = {}) {
  return stableGraphValue({ severity: "error", code, ...raw });
}

function structuralIssues(inputState = {}, normalizedState = {}) {
  const issues = [];
  const rawPieces = Array.isArray(inputState.pieces) ? inputState.pieces : [];
  const normalizedByKey = new Map((normalizedState.pieces || []).map((piece) => [
    String(piece.pieceKey || ""),
    piece,
  ]));
  const seenPieceKeys = new Set();
  for (const [pieceIndex, rawPiece] of rawPieces.entries()) {
    const pieceKey = String(rawPiece?.pieceKey || "");
    if (!pieceKey) {
      issues.push(issue("REVERSE_STATE_MISSING_PIECE_KEY_V1", { pieceIndex }));
      continue;
    }
    if (seenPieceKeys.has(pieceKey)) {
      issues.push(issue("REVERSE_STATE_DUPLICATE_PIECE_KEY_V1", { pieceKey }));
    }
    seenPieceKeys.add(pieceKey);
    const piece = normalizedByKey.get(pieceKey) || rawPiece;
    if (warmachinePieceInPlayV1(piece)) {
      const xIn = piece.position?.xIn;
      const yIn = piece.position?.yIn;
      if (!finiteNumber(xIn) || !finiteNumber(yIn)) {
        issues.push(issue("REVERSE_STATE_NONFINITE_IN_PLAY_POSITION_V1", {
          pieceKey,
          xIn: finiteNumber(xIn) ? Number(xIn) : null,
          yIn: finiteNumber(yIn) ? Number(yIn) : null,
        }));
      }
    }
    for (const fieldKey of RESOURCE_FIELDS) {
      if (!Object.hasOwn(rawPiece || {}, fieldKey)) continue;
      if (rawPiece[fieldKey] == null || rawPiece[fieldKey] === "") continue;
      const value = Number(rawPiece[fieldKey]);
      if (!Number.isFinite(value)) {
        issues.push(issue("REVERSE_STATE_NONFINITE_RESOURCE_V1", {
          pieceKey,
          fieldKey,
        }));
      } else if (value < 0) {
        issues.push(issue("REVERSE_STATE_NEGATIVE_RESOURCE_V1", {
          pieceKey,
          fieldKey,
          value,
        }));
      }
    }
  }
  const boardWidthIn = Number(normalizedState.board?.widthIn);
  const boardHeightIn = Number(normalizedState.board?.heightIn);
  if (!Number.isFinite(boardWidthIn) || boardWidthIn <= 0 ||
      !Number.isFinite(boardHeightIn) || boardHeightIn <= 0) {
    issues.push(issue("REVERSE_STATE_INVALID_BOARD_DIMENSIONS_V1", {
      boardWidthIn: Number.isFinite(boardWidthIn) ? boardWidthIn : null,
      boardHeightIn: Number.isFinite(boardHeightIn) ? boardHeightIn : null,
    }));
  }
  for (const [sideKey, rawScore] of Object.entries(
    inputState.scenario?.score || {},
  )) {
    const value = Number(rawScore);
    if (!Number.isFinite(value) || value < 0) {
      issues.push(issue("REVERSE_STATE_INVALID_SCENARIO_SCORE_V1", {
        sideKey,
        value: Number.isFinite(value) ? value : null,
      }));
    }
  }
  const historyKeys = new Set();
  const recordedPointsBySide = new Map();
  for (const [historyIndex, row] of (inputState.scenario?.scoringHistory || [])
    .entries()) {
    const historyKey = String(row?.key || "");
    if (historyKey && historyKeys.has(historyKey)) {
      issues.push(issue("REVERSE_STATE_DUPLICATE_SCORING_HISTORY_KEY_V1", {
        historyKey,
        historyIndex,
      }));
    }
    if (historyKey) historyKeys.add(historyKey);
    const sideKey = String(row?.sideKey || "");
    const points = Number(row?.points);
    if (!sideKey || !Number.isFinite(points) || points < 0) {
      issues.push(issue("REVERSE_STATE_INVALID_SCORING_HISTORY_ROW_V1", {
        historyKey,
        historyIndex,
        sideKey,
        points: Number.isFinite(points) ? points : null,
      }));
      continue;
    }
    recordedPointsBySide.set(
      sideKey,
      Number(recordedPointsBySide.get(sideKey) || 0) + points,
    );
  }
  for (const [sideKey, recordedPoints] of recordedPointsBySide) {
    const currentScore = Number(inputState.scenario?.score?.[sideKey]);
    if (!Number.isFinite(currentScore) || recordedPoints <= currentScore) continue;
    issues.push(issue("REVERSE_STATE_SCORING_HISTORY_EXCEEDS_SCORE_V1", {
      sideKey,
      recordedPoints,
      currentScore,
    }));
  }
  return issues;
}

export function auditWarmachineReverseStateBoundaryV1(
  stateInput = {},
  rawOptions = {},
) {
  const boundaryKind = String(rawOptions.boundaryKind || "stable_action_boundary");
  const requireStaticUnitFormation =
    rawOptions.requireStaticUnitFormation === true;
  const normalizedState = normalizeRulesV1State(stateInput);
  const structure = structuralIssues(stateInput, normalizedState);
  const hostStaticPlacementAudit = auditRulesV1StaticPlacement(normalizedState);
  const hostStaticUnitFormationAudit = requireStaticUnitFormation
    ? auditRulesV1StaticUnitFormation(
        normalizedState,
        rawOptions.unitFormationOptions || {},
      )
    : stableGraphValue({
        schemaVersion: "warmachine_reverse_state_unit_formation_not_required_v1",
        ok: true,
        skipped: true,
        reason:
          "unit_formation_is_not_a_permanent_stable_state_invariant",
        issues: [],
      });
  const issues = stableGraphValue([
    ...structure,
    ...(hostStaticPlacementAudit.issues || []),
    ...(hostStaticUnitFormationAudit.issues || []),
  ]);
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_REVERSE_STATE_BOUNDARY_AUDIT_V1_SCHEMA,
    boundaryKind,
    normalizedStateHash: stableGraphHash(normalizedState),
    structureIssueCount: structure.length,
    hostStaticPlacementAudit: stableGraphValue(hostStaticPlacementAudit),
    requireStaticUnitFormation,
    hostStaticUnitFormationAudit: stableGraphValue(
      hostStaticUnitFormationAudit,
    ),
    issueCount: issues.length,
    issues,
    upstreamReceiptHash: warmachineHost.receipt.receiptHash,
    ok: issues.length === 0,
  });
  return {
    ...core,
    auditHash: stableGraphHash(core),
  };
}

export function summarizeWarmachineReverseStateBoundaryAuditV1(audit = {}) {
  return stableGraphValue({
    schemaVersion: String(audit.schemaVersion || ""),
    boundaryKind: String(audit.boundaryKind || ""),
    normalizedStateHash: String(audit.normalizedStateHash || ""),
    auditHash: String(audit.auditHash || ""),
    ok: audit.ok === true,
    issueCount: Number(audit.issueCount || 0),
    issueCodes: [...new Set((audit.issues || []).map((row) =>
      String(row.code || row.reason || "unknown_reverse_state_issue")))].sort(),
    hostStaticPlacementPassed:
      audit.hostStaticPlacementAudit?.ok === true,
    requireStaticUnitFormation:
      audit.requireStaticUnitFormation === true,
    hostStaticUnitFormationPassed: audit.requireStaticUnitFormation === true
      ? audit.hostStaticUnitFormationAudit?.ok === true
      : null,
    upstreamReceiptHash: String(audit.upstreamReceiptHash || ""),
  });
}
