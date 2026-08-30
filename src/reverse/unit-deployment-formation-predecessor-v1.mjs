import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import {
  buildUnitRingSlotsV1,
  rankUnitRingTrajectoryAssignmentsV1,
} from "../matchup/unit-ring-trajectory-v1.mjs";

export const WARMACHINE_UNIT_DEPLOYMENT_FORMATION_PREDECESSOR_V1_SCHEMA =
  "warmachine_unit_deployment_formation_predecessor_v1";

function numeric(value, fallback = 0) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function point(value = {}) {
  const source = value.position || value;
  return {
    xIn: numeric(source.xIn ?? source.x),
    yIn: numeric(source.yIn ?? source.y),
  };
}

function baseRadiusIn(piece = {}) {
  return Math.max(0.01, numeric(
    piece.baseRadiusIn,
    numeric(piece.baseSizeIn ?? piece.baseDiameterIn, 1.18) / 2,
  ));
}

function inPlay(piece = {}) {
  return piece.destroyed !== true && piece.removedFromPlay !== true &&
    piece.offTable !== true && piece.notDeployed !== true;
}

function movementAllowanceIn(piece = {}, actionType = "advance") {
  const speedIn = Math.max(0, numeric(piece.speedIn));
  return actionType === "run" ? speedIn + 5 : speedIn;
}

function zoneRectangle(zone = {}) {
  return {
    x: numeric(zone.xIn ?? zone.x),
    y: numeric(zone.yIn ?? zone.y),
    width: Math.max(0, numeric(zone.widthIn ?? zone.width)),
    height: Math.max(0, numeric(zone.heightIn ?? zone.height)),
  };
}

function staticPlacementIssues(
  members,
  originsByPieceKey,
  obstacles,
  epsilonIn,
) {
  const issues = [];
  for (const member of members) {
    const origin = originsByPieceKey[member.pieceKey];
    for (const obstacle of obstacles) {
      const observedSeparationIn = Math.hypot(
        origin.xIn - point(obstacle).xIn,
        origin.yIn - point(obstacle).yIn,
      );
      const requiredSeparationIn = baseRadiusIn(member) +
        baseRadiusIn(obstacle);
      if (observedSeparationIn + epsilonIn >= requiredSeparationIn) continue;
      issues.push({
        reason: "unit_deployment_formation_static_base_overlap",
        actorPieceKey: member.pieceKey,
        blockerPieceKey: obstacle.pieceKey,
        observedSeparationIn,
        requiredSeparationIn,
      });
    }
  }
  return issues;
}

function axisValues(minimum, maximum, step) {
  if (maximum < minimum) return [];
  const values = [];
  for (let value = minimum; value <= maximum + 1e-9; value += step) {
    values.push(Math.min(value, maximum));
  }
  if (!values.length || Math.abs(values.at(-1) - maximum) > 1e-6) {
    values.push(maximum);
  }
  return [...new Set(values.map((value) => value.toFixed(6)))].map(Number);
}

function centroid(rows = []) {
  if (!rows.length) return { xIn: 0, yIn: 0 };
  return rows.reduce((sum, row) => ({
    xIn: sum.xIn + point(row).xIn / rows.length,
    yIn: sum.yIn + point(row).yIn / rows.length,
  }), { xIn: 0, yIn: 0 });
}

function centeredOffsets(points = []) {
  const center = centroid(points);
  return points.map((entry) => ({
    xIn: point(entry).xIn - center.xIn,
    yIn: point(entry).yIn - center.yIn,
  }));
}

function rotateOffsets(offsets = [], angleRadians = 0) {
  const cosine = Math.cos(angleRadians);
  const sine = Math.sin(angleRadians);
  return offsets.map((entry) => ({
    xIn: entry.xIn * cosine - entry.yIn * sine,
    yIn: entry.xIn * sine + entry.yIn * cosine,
  }));
}

function slotOffsetTemplates(modelCount, separationIn, rotationCount) {
  const rows = [];
  const columns = Math.max(1, Math.ceil(Math.sqrt(modelCount)));
  for (const extraGapIn of [0, 0.1, 0.25]) {
    const spacingIn = separationIn + extraGapIn;
    const grid = centeredOffsets(Array.from({ length: modelCount }, (_, index) => ({
      xIn: (index % columns) * spacingIn,
      yIn: Math.floor(index / columns) * spacingIn,
    })));
    for (let rotation = 0; rotation < rotationCount; rotation += 1) {
      rows.push({
        shapeKey: `compact-grid:gap-${extraGapIn.toFixed(2)}:rotation-${rotation}`,
        offsets: rotateOffsets(grid, rotation * Math.PI * 2 / rotationCount),
      });
    }
  }
  const ringRadiusIn = separationIn /
    (2 * Math.sin(Math.PI / modelCount));
  for (let rotation = 0; rotation < rotationCount; rotation += 1) {
    rows.push({
      shapeKey: `compact-ring:rotation-${rotation}`,
      offsets: buildUnitRingSlotsV1({
        center: { xIn: 0, yIn: 0 },
        radiusIn: ringRadiusIn,
        modelCount,
        offsetRadians: rotation * Math.PI * 2 / rotationCount,
      }),
    });
  }
  return rows;
}

export function generateWarmachineUnitDeploymentFormationPredecessorsV1({
  members = [],
  otherPieces = [],
  deploymentZone = {},
  actionType = "run",
  gapIn = 0.05,
  gridStepIn = 0.25,
  rotationCount = 12,
  maximumCandidates = 16,
  epsilonIn = 0.001,
  validateCandidate = null,
} = {}) {
  const ordered = members.filter(inPlay).slice().sort((left, right) =>
    String(left.pieceKey || "").localeCompare(String(right.pieceKey || "")));
  if (ordered.length < 2) {
    return {
      schemaVersion:
        WARMACHINE_UNIT_DEPLOYMENT_FORMATION_PREDECESSOR_V1_SCHEMA,
      candidates: [],
      candidateCount: 0,
      reason: "unit_deployment_formation_requires_multiple_models",
    };
  }
  const zone = zoneRectangle(deploymentZone);
  const maximumRadiusIn = Math.max(...ordered.map(baseRadiusIn));
  const maximumPairSeparationIn = Math.max(...ordered.flatMap((left, index) =>
    ordered.slice(index + 1).map((right) =>
      baseRadiusIn(left) + baseRadiusIn(right) + Math.max(0, numeric(gapIn)))));
  const stepIn = Math.max(0.05, numeric(gridStepIn, 0.25));
  const destinationCenter = centroid(ordered);
  const movementAllowanceByPieceKey = Object.fromEntries(ordered.map((piece) => [
    piece.pieceKey,
    movementAllowanceIn(piece, actionType),
  ]));
  const groupKeys = new Set(ordered.map((piece) => piece.pieceKey));
  const obstacles = otherPieces.filter((piece) =>
    inPlay(piece) && !groupKeys.has(piece.pieceKey));
  const candidates = [];
  const seen = new Set();
  let testedAssignmentCount = 0;
  let trajectoryRejectedCount = 0;
  let placementRejectedCount = 0;
  let candidateValidationRejectedCount = 0;
  const candidateValidationRejectedIssueCodes = new Set();
  const candidateValidationRejectedSamples = [];
  const rotations = Math.max(1, Math.floor(numeric(rotationCount, 12)));
  const limit = Math.max(1, Math.floor(numeric(maximumCandidates, 16)));
  const templates = slotOffsetTemplates(
    ordered.length,
    maximumPairSeparationIn,
    rotations,
  );
  let centerCount = 0;
  templateLoop:
  for (const template of templates) {
    const offsetX = template.offsets.map((entry) => entry.xIn);
    const offsetY = template.offsets.map((entry) => entry.yIn);
    const centerBounds = {
      xMin: zone.x - zone.width / 2 + maximumRadiusIn - Math.min(...offsetX),
      xMax: zone.x + zone.width / 2 - maximumRadiusIn - Math.max(...offsetX),
      yMin: zone.y - zone.height / 2 + maximumRadiusIn - Math.min(...offsetY),
      yMax: zone.y + zone.height / 2 - maximumRadiusIn - Math.max(...offsetY),
    };
    const centers = axisValues(centerBounds.xMin, centerBounds.xMax, stepIn)
      .flatMap((xIn) => axisValues(centerBounds.yMin, centerBounds.yMax, stepIn)
        .map((yIn) => ({ xIn, yIn })))
      .sort((left, right) =>
        Math.hypot(left.xIn - destinationCenter.xIn,
          left.yIn - destinationCenter.yIn) -
          Math.hypot(right.xIn - destinationCenter.xIn,
            right.yIn - destinationCenter.yIn) ||
        left.yIn - right.yIn || left.xIn - right.xIn);
    centerCount += centers.length;
    for (const center of centers) {
      const slots = template.offsets.map((entry) => ({
        xIn: center.xIn + entry.xIn,
        yIn: center.yIn + entry.yIn,
      }));
      for (const assignment of rankUnitRingTrajectoryAssignmentsV1({
        members: ordered,
        slots,
        movementAllowanceByPieceKey,
      })) {
        testedAssignmentCount += 1;
        if (!assignment.trajectoryAudit.ok) {
          trajectoryRejectedCount += 1;
          continue;
        }
        const placementIssues = staticPlacementIssues(
          ordered,
          assignment.destinationsByPieceKey,
          obstacles,
          epsilonIn,
        );
        if (placementIssues.length) {
          placementRejectedCount += 1;
          continue;
        }
        const signature = stableGraphHash(
          assignment.destinationsByPieceKey,
          24,
        );
        if (seen.has(signature)) continue;
        seen.add(signature);
        const proposedCore = stableGraphValue({
          candidateKind: "unit_deployment_formation_predecessor",
          actionType,
          center,
          formationShapeKey: template.shapeKey,
          assignmentKey: assignment.assignmentKey,
          originsByPieceKey: assignment.destinationsByPieceKey,
          maximumMovementDistanceIn: assignment.maximumMovementDistanceIn,
          totalMovementDistanceIn: assignment.totalMovementDistanceIn,
          trajectoryAudit: assignment.trajectoryAudit,
          placementIssues,
        });
        const candidateValidation = typeof validateCandidate === "function"
          ? validateCandidate(proposedCore)
          : { ok: true };
        if (candidateValidation?.ok !== true) {
          candidateValidationRejectedCount += 1;
          for (const issueCode of candidateValidation?.issueCodes || []) {
            candidateValidationRejectedIssueCodes.add(String(issueCode));
          }
          if (candidateValidationRejectedSamples.length < 16) {
            candidateValidationRejectedSamples.push(stableGraphValue({
              formationShapeKey: template.shapeKey,
              assignmentKey: assignment.assignmentKey,
              center,
              auditHash: String(candidateValidation?.auditHash || ""),
              issueCodes: candidateValidation?.issueCodes || [],
            }));
          }
          continue;
        }
        const core = stableGraphValue({
          ...proposedCore,
          candidateValidationEvidence: stableGraphValue(candidateValidation),
        });
        candidates.push({
          ...core,
          candidateKey: `unit-deployment-formation-${stableGraphHash(core, 32)}`,
        });
        if (candidates.length >= limit) break templateLoop;
      }
    }
  }
  const core = stableGraphValue({
    schemaVersion:
      WARMACHINE_UNIT_DEPLOYMENT_FORMATION_PREDECESSOR_V1_SCHEMA,
    actionType,
    modelCount: ordered.length,
    obstacleCount: obstacles.length,
    formationTemplateCount: templates.length,
    centerCount,
    gridStepIn: stepIn,
    rotationCount: rotations,
    maximumCandidates: limit,
    testedAssignmentCount,
    trajectoryRejectedCount,
    placementRejectedCount,
    candidateValidationRejectedCount,
    candidateValidationRejectedIssueCodes:
      [...candidateValidationRejectedIssueCodes].sort(),
    candidateValidationRejectedSamples,
    candidateCount: candidates.length,
  });
  return {
    ...core,
    candidates,
    reportHash: stableGraphHash(core),
    ok: candidates.length > 0,
  };
}
