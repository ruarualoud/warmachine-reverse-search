function numeric(value, fallback = 0) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function point(value = {}) {
  return {
    xIn: numeric(value.xIn ?? value.x),
    yIn: numeric(value.yIn ?? value.y),
  };
}

function baseRadiusIn(model = {}) {
  return Math.max(0, numeric(
    model.baseRadiusIn,
    numeric(model.baseDiameterIn ?? model.baseSizeIn, 1.2) / 2,
  ));
}

function distance(left = {}, right = {}) {
  const leftPoint = point(left);
  const rightPoint = point(right);
  return Math.hypot(
    leftPoint.xIn - rightPoint.xIn,
    leftPoint.yIn - rightPoint.yIn,
  );
}

function minimumLinearSeparation(left, right, leftEnd, rightEnd) {
  const leftStart = point(left.position);
  const rightStart = point(right.position);
  const leftDestination = point(leftEnd);
  const rightDestination = point(rightEnd);
  const relativeStart = {
    xIn: leftStart.xIn - rightStart.xIn,
    yIn: leftStart.yIn - rightStart.yIn,
  };
  const relativeDelta = {
    xIn: leftDestination.xIn - rightDestination.xIn - relativeStart.xIn,
    yIn: leftDestination.yIn - rightDestination.yIn - relativeStart.yIn,
  };
  const denominator = relativeDelta.xIn ** 2 + relativeDelta.yIn ** 2;
  const closestFraction = denominator <= 1e-12
    ? 0
    : Math.max(0, Math.min(1, -(
      relativeStart.xIn * relativeDelta.xIn +
      relativeStart.yIn * relativeDelta.yIn
    ) / denominator));
  const separation = Math.hypot(
    relativeStart.xIn + relativeDelta.xIn * closestFraction,
    relativeStart.yIn + relativeDelta.yIn * closestFraction,
  );
  return { closestFraction, separation };
}

export function auditLinearUnitFormationTrajectoryV1({
  members = [],
  destinationsByPieceKey = {},
  movementAllowanceByPieceKey = {},
  epsilonIn = 0.001,
} = {}) {
  const ordered = [...members].sort((left, right) =>
    String(left.pieceKey || "").localeCompare(String(right.pieceKey || "")));
  const issues = [];
  const movement = [];
  for (const model of ordered) {
    const destination = destinationsByPieceKey[model.pieceKey];
    if (!destination) {
      issues.push({
        reason: "unit_trajectory_destination_missing",
        pieceKey: model.pieceKey,
      });
      continue;
    }
    const movementDistanceIn = distance(model.position, destination);
    const allowance = numeric(
      movementAllowanceByPieceKey[model.pieceKey],
      Number.POSITIVE_INFINITY,
    );
    movement.push({
      pieceKey: model.pieceKey,
      movementDistanceIn,
      movementAllowanceIn: allowance,
    });
    if (movementDistanceIn > allowance + epsilonIn) {
      issues.push({
        reason: "unit_trajectory_movement_allowance_exceeded",
        pieceKey: model.pieceKey,
        movementDistanceIn,
        movementAllowanceIn: allowance,
      });
    }
  }
  for (let leftIndex = 0; leftIndex < ordered.length; leftIndex += 1) {
    const left = ordered[leftIndex];
    const leftEnd = destinationsByPieceKey[left.pieceKey];
    if (!leftEnd) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < ordered.length; rightIndex += 1) {
      const right = ordered[rightIndex];
      const rightEnd = destinationsByPieceKey[right.pieceKey];
      if (!rightEnd) continue;
      const minimum = minimumLinearSeparation(left, right, leftEnd, rightEnd);
      const requiredSeparationIn = baseRadiusIn(left) + baseRadiusIn(right);
      if (minimum.separation + epsilonIn >= requiredSeparationIn) continue;
      issues.push({
        reason: "unit_trajectory_internal_base_overlap",
        leftPieceKey: left.pieceKey,
        rightPieceKey: right.pieceKey,
        closestFraction: minimum.closestFraction,
        minimumSeparationIn: minimum.separation,
        requiredSeparationIn,
      });
    }
  }
  return {
    schemaVersion: "warmachine_linear_unit_formation_trajectory_audit_v1",
    ok: issues.length === 0,
    modelCount: ordered.length,
    movement,
    issues,
  };
}

export function buildUnitRingSlotsV1({
  center = {},
  radiusIn = 0,
  modelCount = 0,
  offsetRadians = 0,
} = {}) {
  const origin = point(center);
  return Array.from({ length: modelCount }, (_, index) => {
    const angle = numeric(offsetRadians) + index * Math.PI * 2 / modelCount;
    return {
      xIn: origin.xIn + Math.cos(angle) * numeric(radiusIn),
      yIn: origin.yIn + Math.sin(angle) * numeric(radiusIn),
    };
  });
}

export function rankUnitRingTrajectoryAssignmentsV1({
  members = [],
  slots = [],
  movementAllowanceByPieceKey = {},
} = {}) {
  const ordered = [...members].sort((left, right) =>
    String(left.pieceKey || "").localeCompare(String(right.pieceKey || "")));
  if (ordered.length === 0 || ordered.length !== slots.length) return [];
  const candidates = [];
  const seen = new Set();
  for (const direction of [1, -1]) {
    for (let shift = 0; shift < slots.length; shift += 1) {
      const destinationsByPieceKey = Object.fromEntries(ordered.map((model, index) => [
        model.pieceKey,
        point(slots[(shift + direction * index + slots.length * 2) % slots.length]),
      ]));
      const signature = ordered.map((model) => {
        const destination = destinationsByPieceKey[model.pieceKey];
        return `${model.pieceKey}:${destination.xIn.toFixed(6)}:${destination.yIn.toFixed(6)}`;
      }).join("|");
      if (seen.has(signature)) continue;
      seen.add(signature);
      const trajectoryAudit = auditLinearUnitFormationTrajectoryV1({
        members: ordered,
        destinationsByPieceKey,
        movementAllowanceByPieceKey,
      });
      const distances = trajectoryAudit.movement.map((row) => row.movementDistanceIn);
      candidates.push({
        assignmentKey: `ring:${direction === 1 ? "clockwise" : "counterclockwise"}:shift-${shift}`,
        destinationsByPieceKey,
        trajectoryAudit,
        maximumMovementDistanceIn: Math.max(...distances, 0),
        totalMovementDistanceIn: distances.reduce((sum, value) => sum + value, 0),
      });
    }
  }
  return candidates.sort((left, right) =>
    Number(right.trajectoryAudit.ok) - Number(left.trajectoryAudit.ok) ||
    left.trajectoryAudit.issues.length - right.trajectoryAudit.issues.length ||
    left.maximumMovementDistanceIn - right.maximumMovementDistanceIn ||
    left.totalMovementDistanceIn - right.totalMovementDistanceIn ||
    left.assignmentKey.localeCompare(right.assignmentKey));
}
