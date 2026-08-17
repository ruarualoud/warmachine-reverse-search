import { createHash } from "node:crypto";

import {
  auditDeploymentTokens,
  buildHeuristicDeploymentPlan,
  buildRosterTokens,
} from "../warmachine-construction-host-runtime.mjs";
import { WARMACHINE_RULES_V1_RUNTIME_WINDOW_FIELDS } from "../warmachine-construction-host-runtime.mjs";
import { buildWarmachineFormationRuleInteractionProfile } from "../warmachine-construction-host-runtime.mjs";

export const WARMACHINE_FORMATION_CANDIDATE_GENERATOR_SCHEMA = "warmachine_formation_candidate_generator_v1";

const ARCHETYPES = [
  {
    key: "balanced_layered",
    label: "Balanced layered",
    basePriority: 0.7,
    channels: {},
    laneSequences: {
      leader: ["center"], unit: ["north", "center", "south"], battlegroup: ["center", "north", "south"], support: ["center", "north", "south"], other: ["north", "center", "south"],
    },
    depthSequences: { leader: ["rear"], unit: ["front"], battlegroup: ["mid"], support: ["back", "mid"], other: ["mid"] },
    formationOrientation: "wide",
    formationEdgeGapIn: 0.18,
  },
  {
    key: "wide_screen",
    label: "Wide screening line",
    basePriority: 0.58,
    channels: { ownScenario: 0.35, enemyPositionControl: 0.2 },
    laneSequences: {
      leader: ["center"], unit: ["north", "south", "north", "south", "center"], battlegroup: ["north", "south", "center"], support: ["center", "north", "south"], other: ["north", "south", "center"],
    },
    depthSequences: { leader: ["rear"], unit: ["front"], battlegroup: ["mid"], support: ["back"], other: ["mid"] },
    formationOrientation: "wide",
    formationEdgeGapIn: 0.75,
  },
  {
    key: "anti_aoe_dispersion",
    label: "AOE dispersion",
    basePriority: 0.42,
    channels: { enemyAreaDamage: 1.4, enemyChainKill: 0.35 },
    laneSequences: {
      leader: ["center"], unit: ["north", "south", "center"], battlegroup: ["south", "north", "center"], support: ["north", "south", "center"], other: ["south", "north", "center"],
    },
    depthSequences: { leader: ["rear"], unit: ["front", "mid", "front"], battlegroup: ["mid", "back"], support: ["back", "rear"], other: ["mid", "back"] },
    formationOrientation: "wide",
    formationEdgeGapIn: 1.8,
  },
  {
    key: "anti_line_stagger",
    label: "Staggered anti-line",
    basePriority: 0.4,
    channels: { enemyLineAttack: 1.5, enemyChainKill: 0.2 },
    laneSequences: {
      leader: ["center"], unit: ["north", "center", "south"], battlegroup: ["south", "center", "north"], support: ["north", "south", "center"], other: ["center", "north", "south"],
    },
    depthSequences: { leader: ["rear"], unit: ["front", "mid", "front", "back"], battlegroup: ["mid", "back"], support: ["rear", "back"], other: ["mid", "back"] },
    formationOrientation: "tall",
    formationEdgeGapIn: 1.25,
  },
  {
    key: "chain_kill_islands",
    label: "Chain-kill islands",
    basePriority: 0.4,
    channels: { enemyChainKill: 1.6, enemyAreaDamage: 0.25 },
    laneSequences: {
      leader: ["center"], unit: ["north", "south", "center", "north", "south"], battlegroup: ["center", "north", "south"], support: ["north", "south", "center"], other: ["south", "north", "center"],
    },
    depthSequences: { leader: ["rear"], unit: ["front", "mid"], battlegroup: ["mid", "back"], support: ["rear"], other: ["back", "mid"] },
    formationOrientation: "wide",
    formationEdgeGapIn: 1.95,
  },
  {
    key: "support_bubbles",
    label: "Support-linked bubbles",
    basePriority: 0.45,
    channels: { ownSupport: 1.5, ownRetaliation: 0.35 },
    laneSequences: {
      leader: ["center"], unit: ["center", "north", "south"], battlegroup: ["center", "north", "south"], support: ["center", "north", "south"], other: ["center", "north", "south"],
    },
    depthSequences: { leader: ["rear"], unit: ["front", "mid"], battlegroup: ["mid"], support: ["mid", "back"], other: ["mid"] },
    formationOrientation: "wide",
    formationEdgeGapIn: 0.35,
  },
  {
    key: "counterpunch_shell",
    label: "Screen and counterpunch shell",
    basePriority: 0.5,
    channels: { ownRetaliation: 1.1, enemyPositionControl: 0.35 },
    laneSequences: {
      leader: ["center"], unit: ["north", "south", "center"], battlegroup: ["center", "north", "south"], support: ["center", "north", "south"], other: ["north", "south", "center"],
    },
    depthSequences: { leader: ["rear"], unit: ["front"], battlegroup: ["back", "mid"], support: ["back", "rear"], other: ["mid"] },
    formationOrientation: "wide",
    formationEdgeGapIn: 0.75,
  },
  {
    key: "scenario_fan",
    label: "Scenario fan",
    basePriority: 0.48,
    channels: { ownScenario: 1.5, ownPositionControl: 0.45 },
    laneSequences: {
      leader: ["center"], unit: ["north", "center", "south"], battlegroup: ["north", "south", "center"], support: ["center", "north", "south"], other: ["north", "center", "south"],
    },
    depthSequences: { leader: ["rear"], unit: ["front"], battlegroup: ["mid", "front"], support: ["mid", "back"], other: ["mid"] },
    formationOrientation: "wide",
    formationEdgeGapIn: 1.25,
  },
  {
    key: "center_break",
    label: "Central breakthrough",
    basePriority: 0.38,
    channels: { ownChainKill: 0.8, ownPositionControl: 0.8, ownScreeningBypass: 0.6 },
    laneSequences: {
      leader: ["center"], unit: ["center", "center", "north", "south"], battlegroup: ["center", "center", "north", "south"], support: ["center"], other: ["center", "north", "south"],
    },
    depthSequences: { leader: ["rear"], unit: ["front", "mid"], battlegroup: ["front", "mid"], support: ["mid", "back"], other: ["mid"] },
    formationOrientation: "tall",
    formationEdgeGapIn: 0.35,
  },
  {
    key: "refused_north",
    label: "Refused north flank",
    basePriority: 0.32,
    channels: { ownPositionControl: 0.5 },
    laneSequences: {
      leader: ["north"], unit: ["north", "north", "center", "north", "south"], battlegroup: ["north", "center"], support: ["north", "center"], other: ["north", "center", "south"],
    },
    depthSequences: { leader: ["rear"], unit: ["front", "mid"], battlegroup: ["mid"], support: ["back"], other: ["mid"] },
    formationOrientation: "wide",
    formationEdgeGapIn: 0.75,
  },
  {
    key: "refused_south",
    label: "Refused south flank",
    basePriority: 0.32,
    channels: { ownPositionControl: 0.5 },
    laneSequences: {
      leader: ["south"], unit: ["south", "south", "center", "south", "north"], battlegroup: ["south", "center"], support: ["south", "center"], other: ["south", "center", "north"],
    },
    depthSequences: { leader: ["rear"], unit: ["front", "mid"], battlegroup: ["mid"], support: ["back"], other: ["mid"] },
    formationOrientation: "wide",
    formationEdgeGapIn: 0.75,
  },
];

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function round(value, digits = 6) {
  const scale = 10 ** digits;
  return Math.round((numeric(value, 0) + Number.EPSILON) * scale) / scale;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function stableHash(value, length = 24) {
  return createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex").slice(0, length);
}

function entryRole(entry = {}) {
  const type = String(entry.cardTypeName || entry.cardType || "").toLowerCase();
  if (/warcaster|warlock/.test(type)) return "leader";
  if (/warjack|warbeast|monstrosity|colossal|gargantuan/.test(type)) return "battlegroup";
  if (/unit/.test(type) && !/attachment/.test(type)) return "unit";
  if (/attachment/.test(type)) return "attachment";
  if (/solo|support|structure|battle engine/.test(type)) return "support";
  return "other";
}

function channelStrength(profile = {}, key = "") {
  return numeric(profile.channels?.[key]?.strength, 0);
}

function archetypePriority(archetype, ownProfile, enemyProfile) {
  const weights = archetype.channels || {};
  return round(
    numeric(archetype.basePriority, 0) +
    numeric(weights.enemyAreaDamage, 0) * channelStrength(enemyProfile, "area_damage") +
    numeric(weights.enemyLineAttack, 0) * channelStrength(enemyProfile, "line_attack") +
    numeric(weights.enemyChainKill, 0) * channelStrength(enemyProfile, "chain_kill") +
    numeric(weights.enemyPositionControl, 0) * channelStrength(enemyProfile, "position_control") +
    numeric(weights.ownSupport, 0) * channelStrength(ownProfile, "support_radius") +
    numeric(weights.ownRetaliation, 0) * channelStrength(ownProfile, "retaliation") +
    numeric(weights.ownScenario, 0) * channelStrength(ownProfile, "scenario_control") +
    numeric(weights.ownPositionControl, 0) * channelStrength(ownProfile, "position_control") +
    numeric(weights.ownChainKill, 0) * channelStrength(ownProfile, "chain_kill") +
    numeric(weights.ownScreeningBypass, 0) * channelStrength(ownProfile, "screening_bypass"),
  );
}

export function rankWarmachineFormationArchetypes(referenceState = {}, sideKey = "player1") {
  const enemySideKey = sideKey === "player2" ? "player1" : "player2";
  const ownProfile = buildWarmachineFormationRuleInteractionProfile(referenceState, sideKey);
  const enemyProfile = buildWarmachineFormationRuleInteractionProfile(referenceState, enemySideKey);
  return ARCHETYPES.map((archetype) => ({
    ...archetype,
    priority: archetypePriority(archetype, ownProfile, enemyProfile),
    ruleConditioning: {
      ownProfileKey: ownProfile.profileKey,
      enemyProfileKey: enemyProfile.profileKey,
      ownUncertaintyWeight: ownProfile.uncertaintyWeight,
      enemyUncertaintyWeight: enemyProfile.uncertaintyWeight,
    },
  })).sort((left, right) => right.priority - left.priority || left.key.localeCompare(right.key));
}

function cycleValue(values = [], index = 0, fallback = "center") {
  return values.length ? values[index % values.length] : fallback;
}

export function buildWarmachineFormationAssignmentOverrides(rosterEntries = [], archetype = {}, sideKey = "player1") {
  const cursors = { leader: 0, unit: 0, battlegroup: 0, support: 0, other: 0 };
  const overrides = {};
  for (const [index, entry] of rosterEntries.entries()) {
    const role = entryRole(entry);
    if (role === "attachment") continue;
    const cursor = cursors[role] || 0;
    cursors[role] = cursor + 1;
    const lane = cycleValue(archetype.laneSequences?.[role], cursor, "center");
    const depth = cycleValue(archetype.depthSequences?.[role], cursor, role === "leader" ? "rear" : "mid");
    overrides[String(index + 1)] = {
      lane,
      depth,
      role: `formation_${archetype.key}_${role}`,
      formationOrientation: archetype.formationOrientation || "auto",
      formationEdgeGapIn: numeric(archetype.formationEdgeGapIn, 0.18),
      reason: `${archetype.key} assigns ${entry.name || `roster ${index + 1}`} to ${lane}/${depth} with ${archetype.formationOrientation || "auto"} formation.`,
      turnOneIntent: sideKey === "player2"
        ? `Preserve the ${archetype.key} geometry while advancing west toward its assigned terminal-goal lane.`
        : `Preserve the ${archetype.key} geometry while advancing east toward its assigned terminal-goal lane.`,
    };
  }
  return overrides;
}

function materializeSide({ templateRoom, sideKey, list, archetype, firstPlayerSideKey }) {
  const deploymentZone = sideKey === "player2" ? templateRoom.deployments?.p2_deploy : templateRoom.deployments?.p1_deploy;
  if (!deploymentZone) throw new Error(`${sideKey} deployment zone missing`);
  const plan = buildHeuristicDeploymentPlan({
    sideKey,
    armyName: list.armyName || list.army || list.key || sideKey,
    rosterEntries: list.entries || [],
    deploymentZone,
    firstPlayer: firstPlayerSideKey,
    assignmentOverridesByRosterIndex: buildWarmachineFormationAssignmentOverrides(list.entries || [], archetype, sideKey),
    mode: `reverse_formation_${archetype.key}_v1`,
    source: "warmachine_formation_candidate_generator_v1",
    plannerMeta: {
      archetypeKey: archetype.key,
      archetypePriority: archetype.priority,
      ruleConditioning: archetype.ruleConditioning,
    },
  });
  const materialized = buildRosterTokens({
    sideKey,
    color: sideKey === "player2" ? "blue" : "red",
    armyName: list.armyName || list.army || list.key || sideKey,
    rosterEntries: list.entries || [],
    totalPoints: list.totalPoints ?? null,
    startX: sideKey === "player2" ? 42.5 : 5.5,
    columnStep: sideKey === "player2" ? -3.2 : 3.2,
    deploymentPlan: plan,
  });
  return { plan, materialized };
}

function pairOrder(leftRows = [], rightRows = []) {
  const rows = [];
  for (const [leftIndex, left] of leftRows.entries()) for (const [rightIndex, right] of rightRows.entries()) {
    rows.push({
      left,
      right,
      leftIndex,
      rightIndex,
      diversityLayer: Math.max(leftIndex, rightIndex),
      rankSum: leftIndex + rightIndex,
      priority: round(left.priority + right.priority),
    });
  }
  return rows.sort((a, b) =>
    a.diversityLayer - b.diversityLayer ||
    a.rankSum - b.rankSum ||
    b.priority - a.priority ||
    a.left.key.localeCompare(b.left.key) ||
    a.right.key.localeCompare(b.right.key));
}

function cleanTurnOneRuntime(game = {}) {
  const cleaned = {
    ...game,
    rulesV1RuntimeState: null,
    rulesV1RuntimeStateUpdatedAt: "",
    controlPhaseProgressed: false,
    controlPhaseEndAmbushWindow: false,
    controlledBoxedLifecycleContinuationStack: [],
    lifecycleGeneratedAttackContinuationStack: [],
    ruleAtomSelections: [],
    pendingRuleChoiceWindows: [],
    controlPhaseStepKey: "",
    activationPreludeActorPieceKey: "",
    activationPreludeKind: "",
    soulTakerActivationPreludeActorPieceKey: "",
    preGameRuleChoicesComplete: false,
    explicitMovementPaths: [],
    scenarioScoringHistory: [],
    lastScenarioScoring: null,
    lastScenarioEndTurnSettlement: null,
  };
  for (const field of WARMACHINE_RULES_V1_RUNTIME_WINDOW_FIELDS) cleaned[field] = null;
  return cleaned;
}

export function generateWarmachineFormationCandidates({
  templateRoom,
  player1List,
  player2List,
  referenceState = {},
  firstPlayerSideKey = "player1",
  maximumArchetypesPerSide = ARCHETYPES.length,
  maximumPairs = 64,
  includeRooms = true,
  archetypeKeysBySide = {},
} = {}) {
  if (!templateRoom || !player1List || !player2List) throw new Error("templateRoom and both lists are required");
  const perSideLimit = Math.max(1, Math.min(ARCHETYPES.length, Math.floor(numeric(maximumArchetypesPerSide, ARCHETYPES.length))));
  const selectArchetypes = (sideKey) => {
    const ranked = rankWarmachineFormationArchetypes(referenceState, sideKey);
    const requestedKeys = Array.isArray(archetypeKeysBySide?.[sideKey])
      ? [...new Set(archetypeKeysBySide[sideKey].map(String).filter(Boolean))]
      : [];
    if (!requestedKeys.length) return ranked.slice(0, perSideLimit);
    const byKey = new Map(ranked.map((archetype) => [archetype.key, archetype]));
    const unknownKeys = requestedKeys.filter((key) => !byKey.has(key));
    if (unknownKeys.length) throw new Error(`unknown ${sideKey} formation archetype keys: ${unknownKeys.join(",")}`);
    return requestedKeys.map((key) => byKey.get(key));
  };
  const p1Archetypes = selectArchetypes("player1");
  const p2Archetypes = selectArchetypes("player2");
  const allPairs = pairOrder(p1Archetypes, p2Archetypes);
  const pairLimit = Math.max(1, Math.min(allPairs.length, Math.floor(numeric(maximumPairs, 64))));
  const selectedPairs = allPairs.slice(0, pairLimit);
  const proposalMass = 1 / Math.max(1, allPairs.length);
  const candidates = [];
  const rejected = [];
  for (const pair of selectedPairs) {
    const formationKey = `formation-${stableHash({
      firstPlayerSideKey,
      player1ListKey: player1List.key || "player1",
      player2ListKey: player2List.key || "player2",
      player1Archetype: pair.left.key,
      player2Archetype: pair.right.key,
    })}`;
    try {
      const player1 = materializeSide({ templateRoom, sideKey: "player1", list: player1List, archetype: pair.left, firstPlayerSideKey });
      const player2 = materializeSide({ templateRoom, sideKey: "player2", list: player2List, archetype: pair.right, firstPlayerSideKey });
      const tokens = { ...player1.materialized.tokens, ...player2.materialized.tokens };
      const deploymentAudit = auditDeploymentTokens({ tokens, deployments: templateRoom.deployments || {} });
      if (!deploymentAudit.ok) {
        rejected.push({ formationKey, candidateMass: round(proposalMass), reason: "strict_deployment_geometry_rejected", deploymentAudit });
        continue;
      }
      const room = structuredClone(templateRoom);
      room.id = `reverse-${formationKey}`;
      room.tokens = tokens;
      room.logs = [];
      room.pings = [];
      room.game = {
        ...cleanTurnOneRuntime(room.game),
        phase: "activation",
        round: 1,
        turnNumber: 1,
        clockActivePlayer: firstPlayerSideKey === "player2" ? 2 : 1,
        firstPlayerSideKey,
        attackerSideKey: firstPlayerSideKey,
        defenderSideKey: firstPlayerSideKey === "player2" ? "player1" : "player2",
        player1Score: 0,
        player2Score: 0,
        deploymentPlanMode: "reverse_formation_candidate_generator_v1",
        deploymentPlanSummary: {
          player1Archetype: pair.left.key,
          player2Archetype: pair.right.key,
          sidePlans: { player1: player1.plan, player2: player2.plan },
        },
      };
      candidates.push({
        formationKey,
        candidateMass: round(proposalMass),
        proposalMass: round(proposalMass),
        pairPriority: pair.priority,
        diversityLayer: pair.diversityLayer,
        archetypes: {
          player1: { key: pair.left.key, label: pair.left.label, priority: pair.left.priority, ruleConditioning: pair.left.ruleConditioning },
          player2: { key: pair.right.key, label: pair.right.label, priority: pair.right.priority, ruleConditioning: pair.right.ruleConditioning },
        },
        deploymentAudit,
        deploymentCertificates: {
          player1: player1.plan.precisionDeploymentBridge,
          player2: player2.plan.precisionDeploymentBridge,
        },
        room: includeRooms ? room : undefined,
      });
    } catch (error) {
      rejected.push({
        formationKey,
        candidateMass: round(proposalMass),
        reason: "formation_materialization_failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const selectedMass = round(selectedPairs.length * proposalMass);
  const legalMass = round(candidates.length * proposalMass);
  const rejectedMass = round(rejected.length * proposalMass);
  const unresolvedBudgetMass = round(Math.max(0, 1 - selectedMass));
  const proposalMassLedger = {
    totalFiniteProposalMass: 1,
    attemptedProposalMass: selectedMass,
    strictLegalProposalMass: legalMass,
    strictRejectedProposalMass: rejectedMass,
    budgetUnresolvedProposalMass: unresolvedBudgetMass,
    representedAttemptedMassConserved: round(legalMass + rejectedMass) === selectedMass,
    semantics: "Uniform mass over this finite declared archetype-pair generator, not a measure over every legal exact deployment.",
  };
  const explicitArchetypeSelection = Array.isArray(archetypeKeysBySide?.player1) ||
    Array.isArray(archetypeKeysBySide?.player2);
  const finiteContract = {
    archetypeCountPerSide: explicitArchetypeSelection
      ? Math.max(p1Archetypes.length, p2Archetypes.length)
      : perSideLimit,
    ...(explicitArchetypeSelection ? {
      requestedArchetypeKeysBySide: {
        player1: p1Archetypes.map((archetype) => archetype.key),
        player2: p2Archetypes.map((archetype) => archetype.key),
      },
    } : {}),
    pairUpperBound: allPairs.length,
    materializationAttemptUpperBound: selectedPairs.length,
    exactCoordinateOwner: "local_deployment_geometry_packer",
    legalityAudit: "full_base_inside_zone_no_overlap_unit_coherency_attachment_proximity",
    exhaustiveOverAllLegalDeployments: false,
    budgetExhaustionMeaning: "unresolved_generator_proposal_mass",
  };
  const claimBoundary = "Generated candidates are exact legal deployment proposals inside a finite declared archetype library. They do not exhaust the continuous legal deployment space and cannot prove matchup optimality without strict forward witnesses and adversarial coverage.";
  for (const candidate of candidates) {
    if (!candidate.room) continue;
    candidate.room.game.reverseFormationCandidateEvidence = {
      schemaVersion: "warmachine_reverse_formation_candidate_evidence_v1",
      formationKey: candidate.formationKey,
      candidateMass: candidate.candidateMass,
      pairPriority: candidate.pairPriority,
      diversityLayer: candidate.diversityLayer,
      archetypes: candidate.archetypes,
      deploymentAudit: candidate.deploymentAudit,
      deploymentCertificates: candidate.deploymentCertificates,
      proposalMassLedger,
      finiteContract,
      runtimeReset: {
        cleanTurnOneRuntime: true,
        inheritedRulesV1RuntimeState: false,
        preGameRuleChoicesComplete: false,
      },
      claimBoundary,
    };
  }
  return {
    schemaVersion: WARMACHINE_FORMATION_CANDIDATE_GENERATOR_SCHEMA,
    firstPlayerSideKey,
    archetypes: { player1: p1Archetypes, player2: p2Archetypes },
    counts: {
      archetypesPerSide: perSideLimit,
      fullPairCount: allPairs.length,
      attemptedPairCount: selectedPairs.length,
      strictLegalCandidateCount: candidates.length,
      strictRejectedCandidateCount: rejected.length,
      budgetUnresolvedPairCount: allPairs.length - selectedPairs.length,
    },
    candidates,
    rejected,
    proposalMassLedger,
    finiteContract,
    claimBoundary,
  };
}
