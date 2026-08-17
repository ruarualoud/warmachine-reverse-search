import { createHash } from "node:crypto";
import { warmachinePieceInPlayV1 } from "./piece-lifecycle-v1.mjs";

export const WARMACHINE_REVERSE_SPATIAL_QUOTIENT_SCHEMA = "warmachine_reverse_spatial_quotient_v1";

const GEOMETRY_KEYS = new Set([
  "position",
  "x",
  "y",
  "xIn",
  "yIn",
  "points",
  "vertices",
  "polygon",
]);

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, digits = 6) {
  const factor = 10 ** digits;
  return Math.round(numeric(value, 0) * factor) / factor;
}

function stableHash(value, length = 24) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, length);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function pointOf(value = {}) {
  const source = value.position && typeof value.position === "object" ? value.position : value;
  return {
    xIn: numeric(source.xIn ?? source.x, 0),
    yIn: numeric(source.yIn ?? source.y, 0),
  };
}

function baseRadiusIn(piece = {}) {
  return Math.max(0, numeric(piece.baseRadiusIn, numeric(piece.baseSizeIn ?? piece.baseDiameterIn, 0) / 2));
}

function edgeDistance(left = {}, right = {}) {
  const leftPoint = pointOf(left);
  const rightPoint = pointOf(right);
  return Math.max(0, Math.hypot(leftPoint.xIn - rightPoint.xIn, leftPoint.yIn - rightPoint.yIn) -
    baseRadiusIn(left) - baseRadiusIn(right));
}

function alive(piece = {}) {
  return warmachinePieceInPlayV1(piece);
}

function boardDimensions(state = {}) {
  return {
    widthIn: Math.max(0, numeric(state.board?.widthIn ?? state.board?.width ?? state.widthIn ?? state.width, 48)),
    heightIn: Math.max(0, numeric(state.board?.heightIn ?? state.board?.height ?? state.heightIn ?? state.height, 48)),
  };
}

function transformPoint(point = {}, transformKey = "identity", board = {}) {
  const source = pointOf(point);
  if (transformKey === "mirror_x") return { xIn: round(board.widthIn - source.xIn), yIn: round(source.yIn) };
  if (transformKey === "mirror_y") return { xIn: round(source.xIn), yIn: round(board.heightIn - source.yIn) };
  if (transformKey === "rotate_180") {
    return { xIn: round(board.widthIn - source.xIn), yIn: round(board.heightIn - source.yIn) };
  }
  return { xIn: round(source.xIn), yIn: round(source.yIn) };
}

function geometryPointToken(point = {}) {
  const source = pointOf(point);
  return `${round(source.xIn)}:${round(source.yIn)}`;
}

function stripGeometry(value) {
  if (Array.isArray(value)) return value.map(stripGeometry);
  if (!value || typeof value !== "object") return value;
  const output = {};
  for (const key of Object.keys(value).sort()) {
    if (GEOMETRY_KEYS.has(key)) continue;
    output[key] = stripGeometry(value[key]);
  }
  return output;
}

function identityReferencePaths(value, path = "", output = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => identityReferencePaths(entry, `${path}[${index}]`, output));
    return output;
  }
  if (!value || typeof value !== "object") return output;
  for (const [key, child] of Object.entries(value)) {
    if (path === "" && key === "pieceKey") continue;
    const nextPath = path ? `${path}.${key}` : key;
    if (/piecekeys?$|sourcepiece|targetpiece|controllerpiece|ownerpiece|anchorpiece/i.test(key)) output.push(nextPath);
    identityReferencePaths(child, nextPath, output);
  }
  return output;
}

function pieceBehaviorFingerprint(piece = {}) {
  const structural = stripGeometry(piece);
  delete structural.pieceKey;
  return stableHash(stableValue(structural), 32);
}

function pieceMatchToken(piece = {}, position = null) {
  return `${pieceBehaviorFingerprint(piece)}@${geometryPointToken(position || piece.position || piece)}`;
}

function featureGeometry(feature = {}, transformKey = "identity", board = {}) {
  const center = transformPoint(feature.position || feature, transformKey, board);
  const points = feature.points || feature.vertices || feature.polygon || [];
  return {
    center,
    widthIn: round(feature.widthIn ?? feature.width ?? 0),
    heightIn: round(feature.heightIn ?? feature.height ?? 0),
    radiusIn: round(feature.radiusIn ?? feature.radius ?? 0),
    points: Array.isArray(points)
      ? points.map((point) => transformPoint(point, transformKey, board)).map(geometryPointToken).sort()
      : [],
  };
}

function environmentFeatures(state = {}) {
  const scenario = state.scenario || {};
  return [
    ...(state.terrain || []).map((feature) => ({ featureKind: "terrain", feature })),
    ...(scenario.zones || []).map((feature) => ({ featureKind: "scenario_zone", feature })),
    ...(scenario.flags || []).map((feature) => ({ featureKind: "scenario_flag", feature })),
    ...(scenario.objectives || []).map((feature) => ({ featureKind: "scenario_objective", feature })),
    ...(state.deploymentZones || state.board?.deploymentZones || []).map((feature) => ({ featureKind: "deployment_zone", feature })),
  ];
}

function environmentFeatureToken(row = {}, transformKey = "identity", board = {}) {
  return JSON.stringify(stableValue({
    featureKind: row.featureKind,
    behavior: stripGeometry(row.feature),
    geometry: featureGeometry(row.feature, transformKey, board),
  }));
}

function declaredTransformKeys(state = {}, rawOptions = {}) {
  const requested = rawOptions.declaredTransforms || state.searchSpatialSymmetry?.transforms || [];
  const supported = new Set(["identity", "mirror_x", "mirror_y", "rotate_180"]);
  return ["identity", ...requested.map(String)].filter((key, index, rows) =>
    supported.has(key) && rows.indexOf(key) === index);
}

function proveTransformAutomorphism(state = {}, transformKey = "identity", fixedPieceKeys = []) {
  const board = boardDimensions(state);
  const pieces = (state.pieces || []).filter(alive);
  const fixed = new Set(fixedPieceKeys.filter(Boolean));
  const sourceEnvironment = environmentFeatures(state)
    .map((row) => environmentFeatureToken(row, "identity", board)).sort();
  const transformedEnvironment = environmentFeatures(state)
    .map((row) => environmentFeatureToken(row, transformKey, board)).sort();
  if (JSON.stringify(sourceEnvironment) !== JSON.stringify(transformedEnvironment)) {
    return { ok: false, transformKey, reason: "environment_not_invariant", pieceMapping: {} };
  }

  const unmatched = pieces.slice().sort((left, right) => String(left.pieceKey).localeCompare(String(right.pieceKey)));
  const pieceMapping = {};
  for (const piece of pieces.slice().sort((left, right) => String(left.pieceKey).localeCompare(String(right.pieceKey)))) {
    const transformedPosition = transformPoint(piece.position || piece, transformKey, board);
    const token = pieceMatchToken(piece, transformedPosition);
    const matchIndex = unmatched.findIndex((candidate) => pieceMatchToken(candidate) === token &&
      (!fixed.has(piece.pieceKey) || candidate.pieceKey === piece.pieceKey));
    if (matchIndex < 0) {
      return { ok: false, transformKey, reason: "piece_multiset_not_invariant", pieceMapping: {} };
    }
    const [match] = unmatched.splice(matchIndex, 1);
    pieceMapping[piece.pieceKey] = match.pieceKey;
  }
  if (fixedPieceKeys.some((pieceKey) => pieceKey && pieceMapping[pieceKey] !== pieceKey)) {
    return { ok: false, transformKey, reason: "fixed_piece_not_invariant", pieceMapping: {} };
  }
  return {
    ok: true,
    transformKey,
    reason: transformKey === "identity" ? "identity" : "declared_and_state_invariant",
    pieceMapping,
  };
}

export function buildWarmachineCertifiedSpatialAutomorphisms(inputState = {}, rawOptions = {}) {
  const fixedPieceKeys = Array.from(new Set(rawOptions.fixedPieceKeys || [])).filter(Boolean).sort();
  const proofs = declaredTransformKeys(inputState, rawOptions)
    .map((transformKey) => proveTransformAutomorphism(inputState, transformKey, fixedPieceKeys));
  const accepted = proofs.filter((proof) => proof.ok);
  return {
    schemaVersion: WARMACHINE_REVERSE_SPATIAL_QUOTIENT_SCHEMA,
    kind: "certified_spatial_automorphism_group",
    declaredTransformKeys: proofs.map((proof) => proof.transformKey),
    acceptedTransformKeys: accepted.map((proof) => proof.transformKey),
    rejectedTransforms: proofs.filter((proof) => !proof.ok).map((proof) => ({
      transformKey: proof.transformKey,
      reason: proof.reason,
    })),
    fixedPieceKeys,
    automorphisms: accepted,
    hardQuotientEligible: accepted.length > 1,
    proofBoundary: "Only explicitly declared board isometries that preserve the complete live piece multiset, fixed actor/terminal identities, and represented environment geometry may create a hard symmetry quotient.",
  };
}

function unitOrbitRows(state = {}, unitGroupId = "", distinguishedPieceKeys = []) {
  const distinguished = new Set(distinguishedPieceKeys.filter(Boolean));
  const members = (state.pieces || []).filter((piece) => alive(piece) && piece.unitGroupId === unitGroupId);
  const groups = new Map();
  const singletonReasons = [];
  for (const piece of members) {
    const identityRefs = identityReferencePaths(piece);
    const anonymousEligible = !distinguished.has(piece.pieceKey) && identityRefs.length === 0;
    const orbitKey = anonymousEligible
      ? `anonymous:${pieceBehaviorFingerprint(piece)}`
      : `distinguished:${piece.pieceKey}`;
    if (!groups.has(orbitKey)) groups.set(orbitKey, []);
    groups.get(orbitKey).push(piece);
    if (!anonymousEligible) {
      singletonReasons.push({
        pieceKey: piece.pieceKey,
        reason: distinguished.has(piece.pieceKey) ? "distinguished_by_search_context" : "identity_references_present",
        identityReferencePaths: identityRefs,
      });
    }
  }
  return {
    unitGroupId,
    memberCount: members.length,
    orbits: Array.from(groups.entries()).map(([orbitKey, pieces]) => ({
      orbitKey,
      anonymous: orbitKey.startsWith("anonymous:"),
      pieceKeys: pieces.map((piece) => piece.pieceKey).sort(),
      count: pieces.length,
      behaviorFingerprint: pieceBehaviorFingerprint(pieces[0]),
      occupiedPositionTokens: pieces.map((piece) => geometryPointToken(piece.position || piece)).sort(),
    })).sort((left, right) => left.orbitKey.localeCompare(right.orbitKey)),
    singletonReasons,
  };
}

export function buildWarmachineUnitPermutationQuotient(inputState = {}, unitGroupId = "", rawOptions = {}) {
  const row = unitOrbitRows(inputState, unitGroupId, rawOptions.distinguishedPieceKeys || []);
  const labelledPermutationCountUpperBound = row.orbits.reduce((product, orbit) => {
    if (!orbit.anonymous || orbit.count <= 1) return product;
    let factorial = 1;
    for (let value = 2; value <= orbit.count; value += 1) factorial *= value;
    return product * factorial;
  }, 1);
  return {
    schemaVersion: WARMACHINE_REVERSE_SPATIAL_QUOTIENT_SCHEMA,
    kind: "unit_model_permutation_quotient",
    ...row,
    labelledPermutationCountUpperBound,
    quotientRepresentativeCount: row.orbits.length,
    hardQuotientEligible: row.orbits.some((orbit) => orbit.anonymous && orbit.count > 1),
    proofBoundary: "This removes only labels of behavior-identical same-unit models with no identity-bearing rule state. It does not merge their distinct occupied positions or target positions.",
  };
}

function distanceBand(distanceIn, thresholds = []) {
  const sorted = Array.from(new Set(thresholds.map((value) => Math.max(0, numeric(value, 0))))).sort((a, b) => a - b);
  const index = sorted.findIndex((threshold) => distanceIn <= threshold + 0.001);
  return index >= 0 ? `le_${round(sorted[index], 3)}` : `gt_${round(sorted.at(-1) || 0, 3)}`;
}

function segmentRelation(point = {}, start = {}, end = {}) {
  const p = pointOf(point);
  const a = pointOf(start);
  const b = pointOf(end);
  const dx = b.xIn - a.xIn;
  const dy = b.yIn - a.yIn;
  const lengthSquared = dx * dx + dy * dy;
  const projection = lengthSquared > 0 ? ((p.xIn - a.xIn) * dx + (p.yIn - a.yIn) * dy) / lengthSquared : 0;
  const cross = dx * (p.yIn - a.yIn) - dy * (p.xIn - a.xIn);
  const side = Math.abs(cross) <= 0.001 ? "on" : cross < 0 ? "right" : "left";
  const region = projection < 0 ? "before" : projection > 1 ? "after" : "between";
  const nearest = lengthSquared > 0
    ? { xIn: a.xIn + Math.max(0, Math.min(1, projection)) * dx, yIn: a.yIn + Math.max(0, Math.min(1, projection)) * dy }
    : a;
  return {
    side,
    region,
    corridorDistanceIn: round(Math.hypot(p.xIn - nearest.xIn, p.yIn - nearest.yIn), 3),
  };
}

function corridorBlockerTokens(state = {}, start = {}, end = {}, ignoredPieceKeys = [], corridorWidthIn = 0) {
  const ignored = new Set(ignoredPieceKeys.filter(Boolean));
  return (state.pieces || []).filter((piece) => alive(piece) && !ignored.has(piece.pieceKey)).map((piece) => {
    const relation = segmentRelation(piece, start, end);
    return {
      piece,
      relation,
      intersects: relation.region === "between" && relation.corridorDistanceIn <= corridorWidthIn + baseRadiusIn(piece) + 0.001,
    };
  }).filter((row) => row.intersects).map((row) => ({
    behaviorFingerprint: pieceBehaviorFingerprint(row.piece),
    side: row.relation.side,
    region: row.relation.region,
  })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

export function buildWarmachineKillingSpreeRelationCell(inputState = {}, input = {}) {
  const actor = (inputState.pieces || []).find((piece) => piece.pieceKey === input.actorPieceKey) || null;
  const bridge = (inputState.pieces || []).find((piece) => piece.pieceKey === input.bridgeTargetPieceKey) || null;
  const terminal = (inputState.pieces || []).find((piece) => piece.pieceKey === input.terminalTargetPieceKey) || null;
  if (!actor || !bridge || !terminal) {
    return {
      schemaVersion: WARMACHINE_REVERSE_SPATIAL_QUOTIENT_SCHEMA,
      kind: "killing_spree_relation_cell",
      complete: false,
      reason: "actor_bridge_or_terminal_missing",
      relationCellKey: "",
    };
  }
  const meleeRangeIn = Math.max(0, numeric(input.meleeRangeIn, numeric(actor.meleeRangeIn, 1)));
  const maximumAdvanceIn = Math.max(0, numeric(input.maximumAdvanceIn, 1));
  const actorBridgeDistanceIn = edgeDistance(actor, bridge);
  const bridgeTerminalDistanceIn = edgeDistance(bridge, terminal);
  const actorTerminalDistanceIn = edgeDistance(actor, terminal);
  const bridgeTopology = segmentRelation(bridge, actor, terminal);
  const relation = {
    actorBridgeBand: distanceBand(actorBridgeDistanceIn, [meleeRangeIn, meleeRangeIn + maximumAdvanceIn]),
    bridgeTerminalBand: distanceBand(bridgeTerminalDistanceIn, [meleeRangeIn, meleeRangeIn + maximumAdvanceIn, meleeRangeIn * 2 + maximumAdvanceIn]),
    actorTerminalBand: distanceBand(actorTerminalDistanceIn, [meleeRangeIn, meleeRangeIn + maximumAdvanceIn]),
    bridgeSideOfActorTerminal: bridgeTopology.side,
    bridgeProjectionRegion: bridgeTopology.region,
    actorToBridgeBlockers: corridorBlockerTokens(
      inputState,
      actor,
      bridge,
      [actor.pieceKey, bridge.pieceKey, terminal.pieceKey],
      baseRadiusIn(actor),
    ),
    bridgeToTerminalBlockers: corridorBlockerTokens(
      inputState,
      bridge,
      terminal,
      [actor.pieceKey, bridge.pieceKey, terminal.pieceKey],
      baseRadiusIn(actor),
    ),
    bridgeBehaviorFingerprint: pieceBehaviorFingerprint(bridge),
  };
  return {
    schemaVersion: WARMACHINE_REVERSE_SPATIAL_QUOTIENT_SCHEMA,
    kind: "killing_spree_relation_cell",
    complete: true,
    actorPieceKey: actor.pieceKey,
    bridgeTargetPieceKey: bridge.pieceKey,
    terminalTargetPieceKey: terminal.pieceKey,
    meleeRangeIn,
    maximumAdvanceIn,
    relation,
    relationCellKey: `ks-relation-${stableHash(relation)}`,
    hardQuotientEligible: false,
    proofBoundary: "This critical-threshold and blocker-topology cell is an ordering/refinement abstraction only. It cannot hard-merge positions without a certified state automorphism or a later transition-bisimulation proof.",
  };
}

function orbitKeyForPiece(pieceKey = "", automorphisms = []) {
  const members = new Set([pieceKey]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const proof of automorphisms) {
      for (const member of Array.from(members)) {
        const mapped = proof.pieceMapping?.[member];
        if (mapped && !members.has(mapped)) {
          members.add(mapped);
          changed = true;
        }
      }
    }
  }
  return Array.from(members).sort();
}

export function quotientWarmachineReverseAlternatives(inputState = {}, alternatives = [], rawOptions = {}) {
  const automorphismReport = buildWarmachineCertifiedSpatialAutomorphisms(inputState, rawOptions);
  const classes = new Map();
  for (const alternative of alternatives) {
    const bridgeKey = String(alternative.bridgeTargetPieceKey || "");
    const orbitPieceKeys = bridgeKey
      ? orbitKeyForPiece(bridgeKey, automorphismReport.automorphisms)
      : [];
    const classIdentity = bridgeKey
      ? {
          predecessorKind: alternative.predecessorKind,
          sourceAtomKey: alternative.sourceAtomKey || "",
          actorPieceKey: alternative.actorPieceKey || "",
          terminalTargetPieceKey: alternative.terminalTargetPieceKey || "",
          bridgeOrbitPieceKeys: orbitPieceKeys,
        }
      : { alternativeKey: alternative.alternativeKey };
    const classKey = `reverse-quotient-${stableHash(classIdentity)}`;
    if (!classes.has(classKey)) classes.set(classKey, []);
    classes.get(classKey).push(alternative);
  }
  const quotientClasses = Array.from(classes.entries()).map(([classKey, members]) => ({
    classKey,
    representativeAlternativeKey: members[0].alternativeKey,
    memberAlternativeKeys: members.map((member) => member.alternativeKey).sort(),
    bridgeTargetPieceKeys: members.map((member) => member.bridgeTargetPieceKey).filter(Boolean).sort(),
    memberCount: members.length,
    hardCollapsed: members.length > 1,
  })).sort((left, right) => left.classKey.localeCompare(right.classKey));
  const representativeKeys = new Set(quotientClasses.map((row) => row.representativeAlternativeKey));
  const representatives = alternatives.filter((alternative) => representativeKeys.has(alternative.alternativeKey));
  return {
    schemaVersion: WARMACHINE_REVERSE_SPATIAL_QUOTIENT_SCHEMA,
    kind: "reverse_alternative_spatial_quotient",
    automorphismReport,
    expandedAlternativeCount: alternatives.length,
    quotientAlternativeCount: representatives.length,
    certifiedCollapsedCount: alternatives.length - representatives.length,
    quotientClasses,
    representatives,
    hardQuotientApplied: alternatives.length > representatives.length,
    proofBoundary: "Only bridge alternatives in the same certified spatial-automorphism orbit are represented once. Expanded members remain auditable and strict replay remains mandatory.",
  };
}
