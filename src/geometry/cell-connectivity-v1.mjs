import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { WARMACHINE_GEOMETRY_CELL_PARTITION_V1_SCHEMA } from
  "./cell-partition-v1.mjs";
import { WARMACHINE_GEOMETRY_PREDICATE_PLAN_V1_SCHEMA } from
  "./predicate-plan-v1.mjs";
import { WARMACHINE_GEOMETRY_STRICT_REPRESENTATIVE_V1_SCHEMA } from
  "./strict-representative-v1.mjs";

export const WARMACHINE_ENDPOINT_CELL_CONNECTIVITY_V1_SCHEMA =
  "warmachine_endpoint_cell_connectivity_v1";

const CONVEX_REGION_PRIMITIVE_KINDS = new Set([
  "axis_aligned_rectangle_inclusion",
  "axis_aligned_rectangle_exclusion",
  "circle_inclusion",
  "circle_exclusion",
  "rounded_rotated_rectangle_exclusion",
]);
const CLEARANCE_EPSILON_IN = 1e-6;

function number(value) {
  return Number(value || 0);
}

function distance(left = {}, right = {}) {
  return Math.hypot(number(left.xIn) - number(right.xIn),
    number(left.yIn) - number(right.yIn));
}

function shapeEnvelope(primitive = {}) {
  const kind = String(primitive.primitiveKind || "");
  if (kind.startsWith("axis_aligned_rectangle_")) {
    const bounds = primitive.bounds || {};
    const center = {
      xIn: (number(bounds.left) + number(bounds.right)) / 2,
      yIn: (number(bounds.top) + number(bounds.bottom)) / 2,
    };
    const halfWidth = Math.max(0, (number(bounds.right) - number(bounds.left)) / 2);
    const halfHeight = Math.max(0, (number(bounds.bottom) - number(bounds.top)) / 2);
    return {
      kind,
      center,
      outerRadiusIn: Math.hypot(halfWidth, halfHeight),
      bounds: {
        left: number(bounds.left),
        right: number(bounds.right),
        top: number(bounds.top),
        bottom: number(bounds.bottom),
      },
    };
  }
  if (kind.startsWith("circle_")) {
    const center = {
      xIn: number(primitive.center?.xIn),
      yIn: number(primitive.center?.yIn),
    };
    const radiusIn = Math.max(0, number(primitive.radiusIn));
    return {
      kind,
      center,
      outerRadiusIn: radiusIn,
      bounds: {
        left: center.xIn - radiusIn,
        right: center.xIn + radiusIn,
        top: center.yIn - radiusIn,
        bottom: center.yIn + radiusIn,
      },
    };
  }
  if (kind === "rounded_rotated_rectangle_exclusion") {
    const center = {
      xIn: number(primitive.center?.xIn),
      yIn: number(primitive.center?.yIn),
    };
    const halfWidth = Math.max(0, number(primitive.widthIn) / 2);
    const halfHeight = Math.max(0, number(primitive.heightIn) / 2);
    const inflation = Math.max(0, number(primitive.inflationRadiusIn));
    const radians = number(primitive.rotationDegrees) * Math.PI / 180;
    const extentX = Math.abs(Math.cos(radians)) * halfWidth +
      Math.abs(Math.sin(radians)) * halfHeight + inflation;
    const extentY = Math.abs(Math.sin(radians)) * halfWidth +
      Math.abs(Math.cos(radians)) * halfHeight + inflation;
    return {
      kind,
      center,
      outerRadiusIn: Math.hypot(halfWidth, halfHeight) + inflation,
      bounds: {
        left: center.xIn - extentX,
        right: center.xIn + extentX,
        top: center.yIn - extentY,
        bottom: center.yIn + extentY,
      },
    };
  }
  return null;
}

function strictInteriorEvidence(inner = {}, outer = {}) {
  const innerEnvelope = shapeEnvelope(inner);
  const outerKind = String(outer.primitiveKind || "");
  if (!innerEnvelope) return { proven: false, reason: "inner_shape_envelope_unsupported" };
  if (outerKind.startsWith("axis_aligned_rectangle_")) {
    const bounds = outer.bounds || {};
    const margins = {
      left: innerEnvelope.bounds.left - number(bounds.left),
      right: number(bounds.right) - innerEnvelope.bounds.right,
      top: innerEnvelope.bounds.top - number(bounds.top),
      bottom: number(bounds.bottom) - innerEnvelope.bounds.bottom,
    };
    const minimumClearanceIn = Math.min(...Object.values(margins));
    return {
      proven: minimumClearanceIn > CLEARANCE_EPSILON_IN,
      proofKind: "conservative_shape_bounds_strictly_inside_rectangle",
      minimumClearanceIn,
      margins,
    };
  }
  if (outerKind.startsWith("circle_")) {
    const centerDistanceIn = distance(innerEnvelope.center, outer.center || {});
    const minimumClearanceIn = number(outer.radiusIn) -
      centerDistanceIn - innerEnvelope.outerRadiusIn;
    return {
      proven: minimumClearanceIn > CLEARANCE_EPSILON_IN,
      proofKind: "conservative_outer_circle_strictly_inside_circle",
      minimumClearanceIn,
      centerDistanceIn,
      innerOuterRadiusIn: innerEnvelope.outerRadiusIn,
    };
  }
  return { proven: false, reason: "outer_inclusion_shape_unsupported" };
}

function strictSeparationEvidence(left = {}, right = {}) {
  const leftEnvelope = shapeEnvelope(left);
  const rightEnvelope = shapeEnvelope(right);
  if (!leftEnvelope || !rightEnvelope) {
    return { proven: false, reason: "shape_envelope_unsupported" };
  }
  const centerDistanceIn = distance(leftEnvelope.center, rightEnvelope.center);
  const minimumClearanceIn = centerDistanceIn - leftEnvelope.outerRadiusIn -
    rightEnvelope.outerRadiusIn;
  return {
    proven: minimumClearanceIn > CLEARANCE_EPSILON_IN,
    proofKind: "conservative_disjoint_outer_circles",
    minimumClearanceIn,
    centerDistanceIn,
    leftOuterRadiusIn: leftEnvelope.outerRadiusIn,
    rightOuterRadiusIn: rightEnvelope.outerRadiusIn,
  };
}

function strictOverlapEvidence(left = {}, right = {}) {
  const leftKind = String(left.primitiveKind || "");
  const rightKind = String(right.primitiveKind || "");
  const leftRectangle = leftKind.startsWith("axis_aligned_rectangle_");
  const rightRectangle = rightKind.startsWith("axis_aligned_rectangle_");
  const leftCircle = leftKind.startsWith("circle_");
  const rightCircle = rightKind.startsWith("circle_");
  if (leftRectangle && rightRectangle) {
    const overlapXIn = Math.min(number(left.bounds?.right), number(right.bounds?.right)) -
      Math.max(number(left.bounds?.left), number(right.bounds?.left));
    const overlapYIn = Math.min(number(left.bounds?.bottom), number(right.bounds?.bottom)) -
      Math.max(number(left.bounds?.top), number(right.bounds?.top));
    const minimumOverlapIn = Math.min(overlapXIn, overlapYIn);
    return {
      proven: minimumOverlapIn > CLEARANCE_EPSILON_IN,
      proofKind: "axis_aligned_rectangles_have_strict_area_overlap",
      minimumOverlapIn,
      overlapXIn,
      overlapYIn,
    };
  }
  if (leftCircle && rightCircle) {
    const centerDistanceIn = distance(left.center || {}, right.center || {});
    const minimumOverlapIn = number(left.radiusIn) + number(right.radiusIn) -
      centerDistanceIn;
    return {
      proven: minimumOverlapIn > CLEARANCE_EPSILON_IN,
      proofKind: "circles_have_strict_lens_overlap",
      minimumOverlapIn,
      centerDistanceIn,
    };
  }
  const circle = leftCircle ? left : rightCircle ? right : null;
  const rectangle = leftRectangle ? left : rightRectangle ? right : null;
  if (circle && rectangle) {
    const centerX = number(circle.center?.xIn);
    const centerY = number(circle.center?.yIn);
    const nearestX = Math.max(
      number(rectangle.bounds?.left),
      Math.min(centerX, number(rectangle.bounds?.right)),
    );
    const nearestY = Math.max(
      number(rectangle.bounds?.top),
      Math.min(centerY, number(rectangle.bounds?.bottom)),
    );
    const centerToRectangleIn = Math.hypot(centerX - nearestX, centerY - nearestY);
    const minimumOverlapIn = number(circle.radiusIn) - centerToRectangleIn;
    return {
      proven: minimumOverlapIn > CLEARANCE_EPSILON_IN,
      proofKind: "circle_has_strict_overlap_with_axis_aligned_rectangle",
      minimumOverlapIn,
      centerToRectangleIn,
    };
  }
  return { proven: false, reason: "strict_overlap_shape_pair_unsupported" };
}

function primitiveCenter(primitive = {}) {
  const kind = String(primitive.primitiveKind || "");
  if (kind.startsWith("axis_aligned_rectangle_")) {
    return {
      xIn: (number(primitive.bounds?.left) + number(primitive.bounds?.right)) / 2,
      yIn: (number(primitive.bounds?.top) + number(primitive.bounds?.bottom)) / 2,
    };
  }
  if (kind.startsWith("circle_")) {
    return {
      xIn: number(primitive.center?.xIn),
      yIn: number(primitive.center?.yIn),
    };
  }
  return null;
}

function strictInsideMarginIn(point = {}, primitive = {}) {
  const kind = String(primitive.primitiveKind || "");
  if (kind.startsWith("axis_aligned_rectangle_")) {
    return Math.min(
      number(point.xIn) - number(primitive.bounds?.left),
      number(primitive.bounds?.right) - number(point.xIn),
      number(point.yIn) - number(primitive.bounds?.top),
      number(primitive.bounds?.bottom) - number(point.yIn),
    );
  }
  if (kind.startsWith("circle_")) {
    return number(primitive.radiusIn) - distance(point, primitive.center || {});
  }
  return -Infinity;
}

function strictCommonIntersectionWitnessEvidence(primitives = []) {
  const centers = primitives.map(primitiveCenter).filter(Boolean);
  if (centers.length !== primitives.length || centers.length === 0) {
    return { proven: false, reason: "common_intersection_witness_shape_unsupported" };
  }
  const candidates = [
    ...centers,
    {
      xIn: centers.reduce((sum, center) => sum + center.xIn, 0) / centers.length,
      yIn: centers.reduce((sum, center) => sum + center.yIn, 0) / centers.length,
    },
  ];
  for (let left = 0; left < centers.length; left += 1) {
    for (let right = left + 1; right < centers.length; right += 1) {
      candidates.push({
        xIn: (centers[left].xIn + centers[right].xIn) / 2,
        yIn: (centers[left].yIn + centers[right].yIn) / 2,
      });
    }
  }
  const evaluated = candidates.map((candidate) => ({
    candidate,
    minimumInteriorMarginIn: Math.min(...primitives.map((primitive) =>
      strictInsideMarginIn(candidate, primitive))),
  })).sort((left, right) =>
    right.minimumInteriorMarginIn - left.minimumInteriorMarginIn ||
    left.candidate.xIn - right.candidate.xIn ||
    left.candidate.yIn - right.candidate.yIn);
  const best = evaluated[0];
  return {
    proven: best.minimumInteriorMarginIn > CLEARANCE_EPSILON_IN,
    proofKind: "explicit_point_strictly_inside_every_convex_set",
    witnessPoint: best.candidate,
    minimumInteriorMarginIn: best.minimumInteriorMarginIn,
    candidateCount: candidates.length,
  };
}

function circleBoundaryIntersectionPoints(left = {}, right = {}) {
  const leftCenter = left.center || {};
  const rightCenter = right.center || {};
  const leftRadius = Math.max(0, number(left.radiusIn));
  const rightRadius = Math.max(0, number(right.radiusIn));
  const centerDistance = distance(leftCenter, rightCenter);
  if (centerDistance <= CLEARANCE_EPSILON_IN ||
      centerDistance > leftRadius + rightRadius + CLEARANCE_EPSILON_IN ||
      centerDistance < Math.abs(leftRadius - rightRadius) - CLEARANCE_EPSILON_IN) {
    return [];
  }
  const along = (leftRadius ** 2 - rightRadius ** 2 + centerDistance ** 2) /
    (2 * centerDistance);
  const heightSquared = Math.max(0, leftRadius ** 2 - along ** 2);
  const height = Math.sqrt(heightSquared);
  const unitX = (number(rightCenter.xIn) - number(leftCenter.xIn)) / centerDistance;
  const unitY = (number(rightCenter.yIn) - number(leftCenter.yIn)) / centerDistance;
  const base = {
    xIn: number(leftCenter.xIn) + along * unitX,
    yIn: number(leftCenter.yIn) + along * unitY,
  };
  const perpendicular = { xIn: -unitY * height, yIn: unitX * height };
  const points = [{
    xIn: base.xIn + perpendicular.xIn,
    yIn: base.yIn + perpendicular.yIn,
  }];
  if (height > CLEARANCE_EPSILON_IN) {
    points.push({
      xIn: base.xIn - perpendicular.xIn,
      yIn: base.yIn - perpendicular.yIn,
    });
  }
  return points;
}

function circleTripleIntersectionEvidence(primitives = []) {
  if (primitives.length !== 3 || primitives.some((primitive) =>
    !String(primitive.primitiveKind || "").startsWith("circle_"))) {
    return {
      classified: false,
      simplexPresentProven: false,
      simplexAbsentProven: false,
      reason: "exact_triple_intersection_classifier_unsupported",
    };
  }
  const candidates = [
    ...primitives.map((primitive) => ({
      xIn: number(primitive.center?.xIn),
      yIn: number(primitive.center?.yIn),
    })),
  ];
  for (let left = 0; left < primitives.length; left += 1) {
    for (let right = left + 1; right < primitives.length; right += 1) {
      candidates.push(...circleBoundaryIntersectionPoints(
        primitives[left],
        primitives[right],
      ));
    }
  }
  const witness = candidates.find((candidate) => primitives.every((primitive) =>
    strictInsideMarginIn(candidate, primitive) >= -CLEARANCE_EPSILON_IN));
  return {
    classified: true,
    simplexPresentProven: Boolean(witness),
    simplexAbsentProven: !witness,
    proofKind: witness
      ? "three_disk_intersection_contains_center_or_pair_boundary_intersection"
      : "three_disk_intersection_has_no_center_or_pair_boundary_intersection",
    witnessPoint: witness || null,
    candidateCount: candidates.length,
  };
}

function tripleIntersectionEvidence(primitives = []) {
  const strictWitness = strictCommonIntersectionWitnessEvidence(primitives);
  if (strictWitness.proven) {
    return {
      ...strictWitness,
      classified: true,
      simplexPresentProven: true,
      simplexAbsentProven: false,
    };
  }
  const circleEvidence = circleTripleIntersectionEvidence(primitives);
  return circleEvidence.classified
    ? { ...strictWitness, ...circleEvidence }
    : {
      ...strictWitness,
      classified: false,
      simplexPresentProven: false,
      simplexAbsentProven: false,
    };
}

function binaryBoundaryRank(edgeCount = 0, triangleEdgeIndexes = []) {
  const basisByPivot = new Map();
  for (const edgeIndexes of triangleEdgeIndexes) {
    let vector = edgeIndexes.reduce((mask, edgeIndex) =>
      mask | (1n << BigInt(edgeIndex)), 0n);
    while (vector !== 0n) {
      let pivot = edgeCount - 1;
      while (pivot >= 0 && (vector & (1n << BigInt(pivot))) === 0n) {
        pivot -= 1;
      }
      if (pivot < 0) break;
      const basis = basisByPivot.get(pivot);
      if (basis == null) {
        basisByPivot.set(pivot, vector);
        break;
      }
      vector ^= basis;
    }
  }
  return basisByPivot.size;
}

function signedTriangleAreaTwice(left = {}, middle = {}, right = {}) {
  return (number(middle.xIn) - number(left.xIn)) *
    (number(right.yIn) - number(left.yIn)) -
    (number(middle.yIn) - number(left.yIn)) *
    (number(right.xIn) - number(left.xIn));
}

function pointStrictlyInsideTriangle(point = {}, vertices = []) {
  if (vertices.length !== 3) return false;
  const signs = [
    signedTriangleAreaTwice(vertices[0], vertices[1], point),
    signedTriangleAreaTwice(vertices[1], vertices[2], point),
    signedTriangleAreaTwice(vertices[2], vertices[0], point),
  ];
  return signs.every((value) => value > CLEARANCE_EPSILON_IN) ||
    signs.every((value) => value < -CLEARANCE_EPSILON_IN);
}

function pointStrictlySatisfiesEndpointFormula(point = {}, inclusions = [], exclusions = []) {
  return inclusions.every((row) =>
    strictInsideMarginIn(point, row.primitive) > CLEARANCE_EPSILON_IN) &&
    exclusions.every((row) =>
      strictInsideMarginIn(point, row.primitive) < -CLEARANCE_EPSILON_IN);
}

function threeCircleRingComponentMaterializationEvidence(
  topology = {},
  exclusions = [],
  inclusions = [],
  strictWitness = null,
) {
  if (topology.clusters?.length !== 1) {
    return { proven: false, reason: "three_circle_ring_requires_one_cluster" };
  }
  const cluster = topology.clusters[0];
  if (cluster.memberCount !== 3 || cluster.strictOverlapEdgeCount !== 3 ||
      cluster.firstHomologyExact !== true || cluster.firstBettiNumber !== 1) {
    return { proven: false, reason: "three_circle_ring_nerve_signature_mismatch" };
  }
  const exclusionByKey = new Map(exclusions.map((row) =>
    [String(row.constraintKey || ""), row]));
  const members = cluster.memberConstraintKeys.map((key) =>
    exclusionByKey.get(String(key || ""))).filter(Boolean);
  if (members.length !== 3 || members.some((row) =>
    !String(row.primitive?.primitiveKind || "").startsWith("circle_"))) {
    return { proven: false, reason: "three_circle_ring_requires_circle_primitives" };
  }
  const triple = cluster.tripleIntersectionEvidence?.[0] || {};
  if (triple.simplexAbsentProven !== true) {
    return { proven: false, reason: "three_circle_ring_empty_triple_not_proven" };
  }
  const centers = members.map((row) => primitiveCenter(row.primitive));
  const centroid = {
    xIn: centers.reduce((sum, center) => sum + center.xIn, 0) / 3,
    yIn: centers.reduce((sum, center) => sum + center.yIn, 0) / 3,
  };
  const cycleVertices = [...centers].sort((left, right) =>
    Math.atan2(left.yIn - centroid.yIn, left.xIn - centroid.xIn) -
    Math.atan2(right.yIn - centroid.yIn, right.xIn - centroid.xIn));
  const cycleAreaTwice = Math.abs(signedTriangleAreaTwice(
    cycleVertices[0],
    cycleVertices[1],
    cycleVertices[2],
  ));
  const outerWitnessPoint = strictWitness?.candidate?.point || null;
  const holeWitnessValid = cycleAreaTwice > CLEARANCE_EPSILON_IN &&
    pointStrictlyInsideTriangle(centroid, cycleVertices) &&
    pointStrictlySatisfiesEndpointFormula(centroid, inclusions, exclusions);
  const outerWitnessValid = Boolean(outerWitnessPoint) &&
    pointStrictlySatisfiesEndpointFormula(
      outerWitnessPoint,
      inclusions,
      exclusions,
    ) && !pointStrictlyInsideTriangle(outerWitnessPoint, cycleVertices);
  if (!holeWitnessValid || !outerWitnessValid) {
    return {
      proven: false,
      reason: holeWitnessValid
        ? "three_circle_ring_outer_strict_witness_not_separated"
        : "three_circle_ring_hole_witness_not_strict",
      centroid,
      cycleVertices,
      cycleAreaTwice,
    };
  }
  const componentCore = stableGraphValue({
    theoremKey: "strictly_overlapping_three_disk_ring_jordan_component_partition_v1",
    cycleVertices,
    cycleAreaTwice,
    cycleContainedInForbiddenUnionProof:
      "each_center_segment_is_covered_by_its_strictly_overlapping_disk_pair",
    tripleIntersectionEmptyProof: triple,
    totalComponentCount: 2,
    components: [{
      componentKey: "outer_source_component",
      representativePoint: outerWitnessPoint,
      strictWitnessHash: String(strictWitness?.strictWitnessHash || ""),
      sourceReachabilityDisposition: "strict_path_witness_accepted",
    }, {
      componentKey: "bounded_ring_hole_component",
      representativePoint: centroid,
      strictWitnessHash: "",
      sourceReachabilityDisposition:
        "proven_unreachable_from_outer_source_without_crossing_forbidden_cycle",
    }],
    proofScope: "endpoint_constraint_components_and_topological_source_separation",
  });
  return {
    proven: true,
    ...componentCore,
    componentMaterializationHash: stableGraphHash(componentCore),
  };
}

function exclusionNerveEvidence(exclusions = []) {
  const pairRelations = [];
  const overlapAdjacency = new Map(exclusions.map((_, index) => [index, new Set()]));
  const unknownPairs = [];
  for (let leftIndex = 0; leftIndex < exclusions.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < exclusions.length; rightIndex += 1) {
      const left = exclusions[leftIndex];
      const right = exclusions[rightIndex];
      const separation = strictSeparationEvidence(left.primitive, right.primitive);
      const overlap = separation.proven
        ? { proven: false, reason: "strict_separation_already_proven" }
        : strictOverlapEvidence(left.primitive, right.primitive);
      const relation = separation.proven
        ? "strictly_separated"
        : overlap.proven
          ? "strictly_overlapping"
          : "unresolved_touch_or_shape_relation";
      pairRelations.push(stableGraphValue({
        leftConstraintKey: left.constraintKey,
        rightConstraintKey: right.constraintKey,
        relation,
        separation,
        overlap,
      }));
      if (overlap.proven) {
        overlapAdjacency.get(leftIndex).add(rightIndex);
        overlapAdjacency.get(rightIndex).add(leftIndex);
      }
      if (!separation.proven && !overlap.proven) {
        unknownPairs.push(`${left.constraintKey}:${right.constraintKey}`);
      }
    }
  }
  const visited = new Set();
  const clusters = [];
  for (let startIndex = 0; startIndex < exclusions.length; startIndex += 1) {
    if (visited.has(startIndex)) continue;
    const stack = [startIndex];
    const memberIndexes = [];
    visited.add(startIndex);
    while (stack.length) {
      const current = stack.pop();
      memberIndexes.push(current);
      for (const neighbor of overlapAdjacency.get(current) || []) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        stack.push(neighbor);
      }
    }
    memberIndexes.sort((left, right) => left - right);
    const memberSet = new Set(memberIndexes);
    const edgeCount = memberIndexes.reduce((sum, index) =>
      sum + [...(overlapAdjacency.get(index) || [])]
        .filter((neighbor) => memberSet.has(neighbor) && neighbor > index).length, 0);
    const treeProven = edgeCount === Math.max(0, memberIndexes.length - 1);
    const edgeIndexesByPair = new Map();
    const clusterEdges = [];
    for (let leftOffset = 0; leftOffset < memberIndexes.length; leftOffset += 1) {
      for (let rightOffset = leftOffset + 1;
        rightOffset < memberIndexes.length;
        rightOffset += 1) {
        const leftIndex = memberIndexes[leftOffset];
        const rightIndex = memberIndexes[rightOffset];
        if (!overlapAdjacency.get(leftIndex)?.has(rightIndex)) continue;
        const edgeIndex = clusterEdges.length;
        edgeIndexesByPair.set(`${leftIndex}:${rightIndex}`, edgeIndex);
        clusterEdges.push([leftIndex, rightIndex]);
      }
    }
    const tripleEvidenceRows = [];
    const provenTriangleEdgeIndexes = [];
    for (let firstOffset = 0; firstOffset < memberIndexes.length; firstOffset += 1) {
      for (let secondOffset = firstOffset + 1;
        secondOffset < memberIndexes.length;
        secondOffset += 1) {
        for (let thirdOffset = secondOffset + 1;
          thirdOffset < memberIndexes.length;
          thirdOffset += 1) {
          const first = memberIndexes[firstOffset];
          const second = memberIndexes[secondOffset];
          const third = memberIndexes[thirdOffset];
          const edgeIndexes = [
            edgeIndexesByPair.get(`${Math.min(first, second)}:${Math.max(first, second)}`),
            edgeIndexesByPair.get(`${Math.min(first, third)}:${Math.max(first, third)}`),
            edgeIndexesByPair.get(`${Math.min(second, third)}:${Math.max(second, third)}`),
          ];
          if (edgeIndexes.some((edgeIndex) => edgeIndex == null)) continue;
          const evidence = tripleIntersectionEvidence([
            exclusions[first].primitive,
            exclusions[second].primitive,
            exclusions[third].primitive,
          ]);
          tripleEvidenceRows.push(stableGraphValue({
            memberConstraintKeys: [first, second, third].map((index) =>
              exclusions[index].constraintKey).sort(),
            ...evidence,
          }));
          if (evidence.simplexPresentProven) {
            provenTriangleEdgeIndexes.push(edgeIndexes);
          }
        }
      }
    }
    const graphCycleRank = edgeCount - memberIndexes.length + 1;
    const provenTriangleBoundaryRank = binaryBoundaryRank(
      edgeCount,
      provenTriangleEdgeIndexes,
    );
    const firstBettiNumberUpperBound = Math.max(
      0,
      graphCycleRank - provenTriangleBoundaryRank,
    );
    const unresolvedTriangleCount = tripleEvidenceRows.filter((evidence) =>
      evidence.classified !== true).length;
    const firstHomologyExact = unresolvedTriangleCount === 0;
    const firstBettiNumber = firstHomologyExact
      ? firstBettiNumberUpperBound
      : null;
    const firstHomologyZeroProven = firstBettiNumber === 0;
    clusters.push(stableGraphValue({
      clusterIndex: clusters.length,
      memberConstraintKeys: memberIndexes.map((index) =>
        exclusions[index].constraintKey).sort(),
      memberCount: memberIndexes.length,
      strictOverlapEdgeCount: edgeCount,
      treeProven,
      contractibleUnionProven: treeProven,
      graphCycleRank,
      tripleIntersectionEvidence: tripleEvidenceRows,
      provenTriangleCount: provenTriangleEdgeIndexes.length,
      provenTriangleBoundaryRank,
      unresolvedTriangleCount,
      firstHomologyExact,
      firstBettiNumber,
      firstBettiNumberUpperBound,
      firstHomologyZeroProven,
      planarHoleFreeUnionProven: firstHomologyZeroProven,
    }));
  }
  return stableGraphValue({
    pairRelations,
    unknownPairs: unknownPairs.sort(),
    clusters,
    everyPairClassified: unknownPairs.length === 0,
    everyOverlapClusterTree: clusters.every((cluster) => cluster.treeProven),
    everyOverlapClusterFirstHomologyZero:
      clusters.every((cluster) => cluster.firstHomologyZeroProven),
    everyOverlapClusterFirstHomologyExact:
      clusters.every((cluster) => cluster.firstHomologyExact),
    contractibleSeparatedClusterFamilyProven:
      unknownPairs.length === 0 && clusters.every((cluster) => cluster.treeProven),
    holeFreeSeparatedClusterFamilyProven:
      unknownPairs.length === 0 &&
      clusters.every((cluster) => cluster.firstHomologyZeroProven),
  });
}

function receiptValid(value = {}, hashKey = "") {
  const hash = String(value[hashKey] || "");
  if (!hash) return false;
  const core = { ...value };
  delete core[hashKey];
  return stableGraphHash(core) === hash;
}

function validateInputs(predicatePlan = {}, cellPage = {}, representatives = {}) {
  const issues = [];
  if (predicatePlan.schemaVersion !== WARMACHINE_GEOMETRY_PREDICATE_PLAN_V1_SCHEMA ||
      !receiptValid(predicatePlan, "predicatePlanReceiptHash")) {
    issues.push("endpoint_connectivity_predicate_plan_invalid");
  }
  if (cellPage.schemaVersion !== WARMACHINE_GEOMETRY_CELL_PARTITION_V1_SCHEMA ||
      !receiptValid(cellPage, "cellPartitionPageHash")) {
    issues.push("endpoint_connectivity_cell_page_invalid");
  }
  if (representatives.schemaVersion !==
      WARMACHINE_GEOMETRY_STRICT_REPRESENTATIVE_V1_SCHEMA ||
      !receiptValid(representatives, "strictRepresentativeReceiptHash")) {
    issues.push("endpoint_connectivity_representatives_invalid");
  }
  if (cellPage.predicatePlanReceiptHash !== predicatePlan.predicatePlanReceiptHash ||
      representatives.predicatePlanReceiptHash !== predicatePlan.predicatePlanReceiptHash ||
      representatives.cellPartitionPageHash !== cellPage.cellPartitionPageHash) {
    issues.push("endpoint_connectivity_receipt_binding_mismatch");
  }
  if (predicatePlan.continuousChoiceKind !== "player_choice_not_chance" ||
      cellPage.continuousChoiceKind !== "player_choice_not_chance" ||
      representatives.continuousChoiceKind !== "player_choice_not_chance" ||
      predicatePlan.chanceMassAssigned !== false ||
      cellPage.chanceMassAssigned !== false ||
      representatives.chanceMassAssigned !== false) {
    issues.push("endpoint_connectivity_chance_contract_invalid");
  }
  return [...new Set(issues)].sort();
}

function constraintRows(predicatePlan = {}, cell = {}) {
  const predicateByKey = new Map((predicatePlan.predicates || []).map((row) =>
    [String(row.predicateKey || ""), row]));
  const eventByKey = new Map((predicatePlan.eventRegions || []).map((row) =>
    [String(row.eventRegionKey || ""), row]));
  const rows = [];
  const issues = [];
  for (const assignment of cell.requiredPredicateAssignment || []) {
    const predicate = predicateByKey.get(String(assignment.predicateKey || ""));
    if (!predicate) {
      issues.push(`endpoint_connectivity_predicate_missing:${assignment.predicateKey || ""}`);
      continue;
    }
    const relationKind = String(predicate.relationKind || "");
    rows.push(stableGraphValue({
      constraintKey: String(assignment.predicateKey || ""),
      constraintSource: "required_endpoint_predicate",
      expectedInside: assignment.expected === true,
      relationKind,
      constraintRole: assignment.expected === true &&
        relationKind === "inside_closed_region" ? "inclusion" :
        assignment.expected === true && relationKind === "outside_open_region"
          ? "exclusion"
          : "unsupported",
      primitive: predicate.primitive || {},
      sourceRuleKeys: predicate.sourceRuleKeys || [],
    }));
  }
  for (const assignment of cell.eventRegionAssignment || []) {
    const event = eventByKey.get(String(assignment.eventRegionKey || ""));
    if (!event) {
      issues.push(`endpoint_connectivity_event_region_missing:${assignment.eventRegionKey || ""}`);
      continue;
    }
    const expectedInside = assignment.expectedInside === true;
    rows.push(stableGraphValue({
      constraintKey: String(assignment.eventRegionKey || ""),
      constraintSource: "endpoint_event_region",
      expectedInside,
      relationKind: "inside_closed_region",
      constraintRole: expectedInside ? "inclusion" : "exclusion",
      primitive: event.primitive || {},
      sourceRuleKeys: event.sourceRuleKeys || [],
    }));
  }
  return { rows, issues };
}

function certifyCell(predicatePlan = {}, cell = {}, representativeCell = {}) {
  const constraints = constraintRows(predicatePlan, cell);
  const unsupportedReasons = [...constraints.issues];
  const inclusions = constraints.rows.filter((row) => row.constraintRole === "inclusion");
  const exclusions = constraints.rows.filter((row) => row.constraintRole === "exclusion");
  if (inclusions.length === 0) {
    unsupportedReasons.push("convex_inclusion_domain_missing");
  }
  for (const constraint of constraints.rows) {
    if (constraint.constraintRole === "unsupported") {
      unsupportedReasons.push(`constraint_relation_unsupported:${constraint.constraintKey}`);
    }
    if (!CONVEX_REGION_PRIMITIVE_KINDS.has(constraint.primitive?.primitiveKind)) {
      unsupportedReasons.push(
        `constraint_primitive_not_supported_convex_inclusion:${constraint.constraintKey}`,
      );
    }
  }
  const activePrimitiveHashes = new Set(constraints.rows.map((row) =>
    stableGraphHash(row.primitive || {})));
  for (const obstacle of predicatePlan.configurationObstacles || []) {
    if (!activePrimitiveHashes.has(stableGraphHash(obstacle.primitive || {}))) {
      unsupportedReasons.push(
        `configuration_obstacle_not_bound_to_active_constraint:${obstacle.obstacleKey || ""}`,
      );
    }
  }
  const interiorEvidence = [];
  let exclusionTopologyEvidence = stableGraphValue({
    pairRelations: [],
    unknownPairs: [],
    clusters: [],
    everyPairClassified: true,
    everyOverlapClusterTree: true,
    everyOverlapClusterFirstHomologyZero: true,
    everyOverlapClusterFirstHomologyExact: true,
    contractibleSeparatedClusterFamilyProven: true,
    holeFreeSeparatedClusterFamilyProven: true,
  });
  if (exclusions.length) {
    for (const exclusion of exclusions) {
      for (const inclusion of inclusions) {
        const evidence = strictInteriorEvidence(exclusion.primitive, inclusion.primitive);
        interiorEvidence.push(stableGraphValue({
          exclusionConstraintKey: exclusion.constraintKey,
          inclusionConstraintKey: inclusion.constraintKey,
          ...evidence,
        }));
        if (!evidence.proven) {
          unsupportedReasons.push(
            `exclusion_not_proven_strictly_interior:${exclusion.constraintKey}:${inclusion.constraintKey}`,
          );
        }
      }
    }
    exclusionTopologyEvidence = exclusionNerveEvidence(exclusions);
    for (const pairKey of exclusionTopologyEvidence.unknownPairs) {
      unsupportedReasons.push(`exclusion_pair_relation_unresolved:${pairKey}`);
    }
    for (const cluster of exclusionTopologyEvidence.clusters) {
      if (!cluster.firstHomologyExact) {
        unsupportedReasons.push(
          `exclusion_overlap_cluster_first_homology_unresolved:${cluster.memberConstraintKeys.join(":")}`,
        );
      }
    }
  }
  const strictWitness = representativeCell?.strictWitness || null;
  if (!strictWitness || strictWitness.strictTransitionAccepted !== true) {
    unsupportedReasons.push("strict_nonempty_witness_missing");
  }
  const uniqueReasons = [...new Set(unsupportedReasons)].sort();
  const componentCount = uniqueReasons.length === 0
    ? 1 + exclusionTopologyEvidence.clusters.reduce((sum, cluster) =>
      sum + number(cluster.firstBettiNumber), 0)
    : null;
  const componentCountCertified = componentCount != null;
  const connected = componentCount === 1;
  const componentMaterialization = componentCount === 1
    ? stableGraphValue({
      proven: true,
      theoremKey: "single_certified_component_uses_strict_witness_v1",
      totalComponentCount: 1,
      components: [{
        componentKey: "single_endpoint_constraint_component",
        representativePoint: strictWitness?.candidate?.point || null,
        strictWitnessHash: String(strictWitness?.strictWitnessHash || ""),
        sourceReachabilityDisposition: "strict_path_witness_accepted",
      }],
    })
    : componentCount === 2
      ? threeCircleRingComponentMaterializationEvidence(
        exclusionTopologyEvidence,
        exclusions,
        inclusions,
        strictWitness,
      )
      : { proven: false, reason: "multi_component_materializer_unsupported" };
  const componentMaterializationComplete =
    componentMaterialization?.proven === true &&
    number(componentMaterialization.totalComponentCount) === componentCount;
  const proofCore = componentCountCertified ? stableGraphValue({
    theoremKey: exclusions.length
      ? connected
        ? "convex_domain_minus_strictly_interior_convex_union_with_zero_first_nerve_homology_is_path_connected_v1"
        : "alexander_duality_exact_component_count_from_convex_union_nerve_first_homology_v1"
      : "nonempty_finite_intersection_of_convex_sets_is_connected_v1",
    constraintIdentityHashes: constraints.rows.map((row) => stableGraphHash(row)).sort(),
    nonemptyStrictWitnessHash: String(strictWitness.strictWitnessHash || ""),
    endpointSignatureHash: String(strictWitness.endpointSignatureHash || ""),
    componentCount,
    inclusionConstraintKeys: inclusions.map((row) => row.constraintKey).sort(),
    exclusionConstraintKeys: exclusions.map((row) => row.constraintKey).sort(),
    strictInteriorEvidence: interiorEvidence,
    exclusionTopologyEvidence,
    proofIngredients: exclusions.length ? [
      "finite_convex_sets_form_a_good_cover",
      "the_complete_nerve_two_skeleton_determines_first_homology",
      "alexander_duality_maps_first_cohomology_rank_to_planar_complement_component_count_minus_one",
      "strict_interior_containment_keeps_the_complement_components_inside_the_convex_working_domain",
    ] : [
      "finite_intersections_of_convex_sets_are_convex",
    ],
    proofScope: "endpoint_constraint_formula_only",
  }) : null;
  return stableGraphValue({
    cellKey: String(cell.cellKey || ""),
    constraintCount: constraints.rows.length,
    constraints: constraints.rows,
    disposition: componentCountCertified
      ? connected
        ? "certified_single_connected_endpoint_constraint_component"
        : "certified_multiple_endpoint_constraint_components"
      : "unresolved_general_endpoint_connectivity",
    endpointConstraintNonemptyProven:
      strictWitness?.strictTransitionAccepted === true,
    endpointConstraintComponentCountCertified: componentCountCertified,
    endpointConstraintConnectivityCertified: connected,
    endpointConstraintComponentCount: componentCount,
    endpointConstraintComponentMaterializationComplete:
      componentMaterializationComplete,
    endpointConstraintComponents: componentMaterializationComplete
      ? componentMaterialization.components
      : [],
    componentMaterialization,
    connectivityProof: proofCore,
    connectivityProofHash: proofCore ? stableGraphHash(proofCore) : "",
    strictInteriorEvidence: interiorEvidence,
    exclusionTopologyEvidence,
    unsupportedReasons: uniqueReasons,
    legalReachableEndpointSetConnectivityCertified: false,
    pathClassConnectivityCertified: false,
    chanceMass: null,
  });
}

export function certifyWarmachineEndpointCellConnectivityV1(
  predicatePlan = {},
  cellPage = {},
  representatives = {},
) {
  const validationIssues = validateInputs(predicatePlan, cellPage, representatives);
  const representativeByCellKey = new Map((representatives.cells || []).map((row) =>
    [String(row.cellKey || ""), row]));
  const cells = (cellPage.cells || []).map((cell) => certifyCell(
    predicatePlan,
    cell,
    representativeByCellKey.get(String(cell.cellKey || "")) || {},
  ));
  const certifiedCellCount = cells.filter((cell) =>
    cell.endpointConstraintComponentCountCertified).length;
  const connectedCellCount = cells.filter((cell) =>
    cell.endpointConstraintConnectivityCertified).length;
  const componentMaterializedCellCount = cells.filter((cell) =>
    cell.endpointConstraintComponentMaterializationComplete).length;
  const unresolvedCellCount = cells.length - certifiedCellCount;
  const pageComponentCountComplete = validationIssues.length === 0 &&
    cells.length > 0 && unresolvedCellCount === 0;
  const pageConnectivityComplete = pageComponentCountComplete &&
    connectedCellCount === cells.length;
  const fullSignatureDenominatorPresent = String(cellPage.cursor || "0") === "0" &&
    cellPage.nextCursor === null &&
    cellPage.predicateSignaturePartitionComplete === true;
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_ENDPOINT_CELL_CONNECTIVITY_V1_SCHEMA,
    ok: validationIssues.length === 0,
    predicatePlanReceiptHash: String(predicatePlan.predicatePlanReceiptHash || ""),
    cellPartitionPageHash: String(cellPage.cellPartitionPageHash || ""),
    strictRepresentativeReceiptHash:
      String(representatives.strictRepresentativeReceiptHash || ""),
    pageCellCount: cells.length,
    certifiedCellCount,
    connectedCellCount,
    componentMaterializedCellCount,
    unresolvedCellCount,
    cells,
    validationIssues,
    endpointConstraintConnectivityPageComplete: pageConnectivityComplete,
    endpointConstraintConnectivityComplete:
      pageConnectivityComplete && fullSignatureDenominatorPresent,
    endpointConstraintComponentCountPageComplete: pageComponentCountComplete,
    endpointConstraintComponentCountComplete:
      pageComponentCountComplete && fullSignatureDenominatorPresent,
    endpointConstraintConnectedComponentPartitionPageComplete:
      pageComponentCountComplete && componentMaterializedCellCount === cells.length,
    endpointConstraintConnectedComponentPartitionComplete:
      pageComponentCountComplete && componentMaterializedCellCount === cells.length &&
      fullSignatureDenominatorPresent,
    connectedComponentPartitionComplete: false,
    legalReachableEndpointSetConnectivityComplete: false,
    pathClassPartitionComplete: false,
    transitionStable: false,
    continuousChoiceKind: "player_choice_not_chance",
    chanceMassAssigned: false,
    completionDebts: uniqueSorted([
      ...validationIssues,
      ...(unresolvedCellCount ? ["general_endpoint_connectivity_unresolved"] : []),
      ...(componentMaterializedCellCount === cells.length
        ? []
        : ["endpoint_constraint_components_not_materialized"]),
      ...(fullSignatureDenominatorPresent
        ? []
        : ["endpoint_constraint_connectivity_denominator_not_exhausted"]),
      "strict_reachable_endpoint_connectivity_not_proven",
      "path_class_connectivity_not_proven",
      "transition_stability_not_proven",
    ]),
    claimBoundary:
      "A certificate proves only the connected-component count of one nonempty endpoint constraint formula that is either a finite intersection of supported convex inclusions or a convex domain minus finitely many strictly interior exclusion clusters. Every exclusion pair and every nerve triangle needed for exact first homology must be classified. Alexander duality converts the exact first Betti number into complement component count. Touching, unclassified triple intersections, unsupported shapes and boundary-spanning exclusions stay unresolved. Multi-component formulas are counted but not yet materialized into executable component cells. This does not prove strict path reachability, path classes or transition stability; whole-denominator completion additionally requires one page from cursor zero exhausting every declared signature.",
  });
  return {
    ...core,
    endpointConnectivityReceiptHash: stableGraphHash(core),
  };
}

function uniqueSorted(values = []) {
  return [...new Set(values.map(String).filter(Boolean))].sort();
}
