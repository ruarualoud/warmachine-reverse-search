import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { warmachinePieceInPlayV1 } from "../reverse/piece-lifecycle-v1.mjs";
import {
  warmachineSteamrollerTerminalScenarioSubcellKeyV1,
} from "../reverse/steamroller-terminal-scenario-corpus-v1.mjs";
import {
  WARMACHINE_RULES_V1_RUNTIME_WINDOW_FIELDS,
  warmachineConstructionHost,
} from "../warmachine-construction-host-runtime.mjs";
import {
  auditRulesV1StaticPlacement,
  auditRulesV1StaticUnitFormation,
  scoreScenarioElements,
  warmachineHost,
} from "../warmachine-host-runtime.mjs";
import {
  materializeWarmachineMatchupScoreTerminalRootV1,
} from "./matchup-terminal-root-materializer-v1.mjs";
import {
  prepareWarmachineScoreTerminalSeedStateV1,
} from "./two-fronts-score-terminal-seed-v1.mjs";

export const WARMACHINE_MATCHUP_SCORE_TERMINAL_TASK_MATERIALIZER_V1_SCHEMA =
  "warmachine_matchup_score_terminal_task_materializer_v1";

const GOAL_FAMILY = "scenario_score_threshold";
const TERMINAL_CLASS = "lead_three_after_opponent_turn_scoring";
const ACTION_CATEGORY = "steamroller_turn_end_settlement";
const SUPPORTED_SCENARIO = "wolves_at_our_heels";
const SUPPORTED_SCORE_TRANSITION =
  "score-transition-87d5b7b6ca0bb8072508ee57";
const MULTI_SOURCE_SCORE_TRANSITION =
  "score-transition-0054dada47e0734346ef9dfd";
const SATURATED_CONTEST_TRANSITIONS = new Set([
  "score-transition-0016a1f0609f49ed6c01f60c",
  "score-transition-02525c5dcb6441533205a4db",
]);
const SIDE_KEY_BY_TASK_SIDE = Object.freeze({
  subject: "player1",
  challenger: "player2",
});

function taskSideForCanonicalSide(sideKey = "", permutationKey = "identity") {
  const base = sideKey === "player1" ? "subject" :
    sideKey === "player2" ? "challenger" : "";
  if (!base || permutationKey === "identity") return base;
  return base === "subject" ? "challenger" : "subject";
}

function taskTerminal(task = {}) {
  const canonical = task.representative?.canonicalTerminal || {};
  const sideBinding = task.executionEnvelope?.sideBinding || {};
  const terminal = {
    causalActionFamily: String(canonical.causalActionFamily || ""),
    resultKind: String(canonical.resultKind || ""),
  };
  for (const role of ["attacker", "defender", "ending", "winner", "loser"]) {
    const canonicalSideKey = String(canonical[`${role}SideKey`] || "");
    const taskSideKey = String(sideBinding[`${role}TaskSideKey`] || "");
    const expectedTaskSideKey = taskSideForCanonicalSide(
      canonicalSideKey,
      task.sidePermutationKey,
    );
    if (!expectedTaskSideKey || taskSideKey !== expectedTaskSideKey ||
        !SIDE_KEY_BY_TASK_SIDE[taskSideKey]) {
      throw new Error(`score_terminal_task_${role}_side_binding_mismatch`);
    }
    terminal[`${role}SideKey`] = SIDE_KEY_BY_TASK_SIDE[taskSideKey];
    terminal[`${role}TaskSideKey`] = taskSideKey;
  }
  return stableGraphValue(terminal);
}

function taskIdentity(task = {}) {
  return stableGraphValue({
    groupKey: task.groupKey,
    groupPlanHash: task.groupPlanHash,
    variantIndex: String(task.variantIndex || ""),
    representative: task.representative,
    subjectRosterKey: task.subjectRosterKey,
    challengerRosterKey: task.challengerRosterKey,
    mapKey: task.mapKey,
    deploymentSeedKey: task.deploymentSeedKey,
    firstPlayerTaskSideKey: task.firstPlayerTaskSideKey,
    sidePermutationKey: task.sidePermutationKey,
  });
}

function validateTaskReceipts(task = {}) {
  const envelope = task.executionEnvelope || {};
  const envelopeCore = { ...envelope };
  const envelopeHash = String(envelopeCore.executionEnvelopeHash || "");
  delete envelopeCore.executionEnvelopeHash;
  if (!envelopeHash || stableGraphHash(envelopeCore) !== envelopeHash) {
    throw new Error("score_terminal_task_execution_envelope_hash_invalid");
  }
  const identity = taskIdentity(task);
  if (task.taskKey !==
      `matchup-terminal-task-${stableGraphHash(identity).slice(0, 32)}`) {
    throw new Error("score_terminal_task_identity_hash_invalid");
  }
  const behaviorSignature = stableGraphValue({
    ...identity,
    exactRepresentativeCoordinates: task.representative?.coordinates,
    executionEnvelopeHash: envelopeHash,
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    constructionHostReceiptHash:
      warmachineConstructionHost.receipt.receiptHash,
  });
  if (stableGraphHash(behaviorSignature) !== task.behaviorSignatureHash) {
    throw new Error("score_terminal_task_host_or_construction_receipt_drift");
  }
  return taskTerminal(task);
}

function validateEvidenceCorpus(evidenceCorpus = {}, representative = {}) {
  const cacheCore = { ...evidenceCorpus };
  const cacheHash = String(cacheCore.cacheHash || "");
  delete cacheCore.cacheHash;
  if (!cacheHash || stableGraphHash(cacheCore) !== cacheHash) {
    throw new Error("score_terminal_task_evidence_cache_hash_invalid");
  }
  if (evidenceCorpus.hostReceiptHash !== warmachineHost.receipt.receiptHash ||
      evidenceCorpus.corpus?.hostReceiptHash !==
        warmachineHost.receipt.receiptHash) {
    throw new Error("score_terminal_task_evidence_host_receipt_drift");
  }
  if (evidenceCorpus.evidenceCorpus?.corpusHash !==
      evidenceCorpus.corpus?.corpusHash ||
      evidenceCorpus.evidenceCorpus?.representativeSelectionHash !==
        evidenceCorpus.representativeSelection?.selectionHash) {
    throw new Error("score_terminal_task_evidence_internal_binding_mismatch");
  }
  const selected = (evidenceCorpus.representativeSelection
    ?.selectedRepresentatives || []).find((row) =>
    row.subcellKey === representative.subcellKey);
  if (!selected || selected.cellKey !== representative.cellKey ||
      selected.terminalClassKey !== representative.terminalClassKey ||
      selected.scenarioKey !== representative.scenarioKey ||
      Number(selected.representativeRoundNumber) !==
        Number(representative.roundNumber) ||
      stableGraphHash(selected.coordinates || {}) !==
        stableGraphHash(representative.coordinates || {}) ||
      stableGraphHash(selected.skeletonObligations || []) !==
        stableGraphHash(representative.skeletonObligations || [])) {
    throw new Error("score_terminal_task_representative_selection_mismatch");
  }
  const cell = (evidenceCorpus.corpus?.cells || []).find((row) =>
    row.cellKey === representative.cellKey);
  const canonical = representative.canonicalTerminal || {};
  if (!cell || cell.dependencyReceipt?.hostReceiptHash !==
      warmachineHost.receipt.receiptHash ||
      cell.terminalClassKey !== TERMINAL_CLASS ||
      cell.scenarioKey !== representative.scenarioKey ||
      cell.causalActionFamily !== ACTION_CATEGORY ||
      Number(cell.roundClass?.representativeRoundNumber) !==
        Number(representative.roundNumber) ||
      cell.sourceResolutionStatus !== representative.sourceResolutionStatus ||
      cell.resultKind !== canonical.resultKind ||
      cell.attackerSideKey !== canonical.attackerSideKey ||
      cell.defenderSideKey !== canonical.defenderSideKey ||
      cell.endingSideKey !== canonical.endingSideKey ||
      cell.winnerSideKey !== canonical.winnerSideKey ||
      cell.loserSideKey !== canonical.loserSideKey) {
    throw new Error("score_terminal_task_corpus_cell_mismatch");
  }
  for (const [partitionKey, value] of Object.entries(
    representative.coordinates || {},
  )) {
    if (!cell.partitions?.[partitionKey]?.includes(value)) {
      throw new Error(
        `score_terminal_task_partition_outside_cell:${partitionKey}:${value}`,
      );
    }
  }
  return { cell, selected };
}

function validateOpening(task = {}, opening = {}, terminal = {}) {
  const representative = task.representative || {};
  const envelope = task.executionEnvelope || {};
  const expectedFirstSideKey = SIDE_KEY_BY_TASK_SIDE[
    task.firstPlayerTaskSideKey
  ];
  if (opening.disposition !== "strict_opening_materialized" ||
      !opening.state || !Array.isArray(opening.state.pieces) ||
      !opening.strictDeploymentReceiptHash || !opening.scenarioBindingHash ||
      !opening.exactMapTemplateHash ||
      opening.subjectRosterKey !== envelope.sourceRosterKeys?.subject ||
      opening.challengerRosterKey !== envelope.sourceRosterKeys?.challenger ||
      opening.scenarioKey !== representative.scenarioKey ||
      opening.mapKey !== task.mapKey ||
      opening.deploymentSeedKey !== task.deploymentSeedKey ||
      opening.firstPlayerTaskSideKey !== task.firstPlayerTaskSideKey ||
      opening.scenarioTerrainSetupClassKey !==
        representative.coordinates?.scenarioTerrainSetup ||
      opening.state.scenario?.scenarioKey !== representative.scenarioKey ||
      opening.state.firstPlayerSideKey !== expectedFirstSideKey ||
      opening.state.firstPlayerSideKey !== terminal.attackerSideKey ||
      opening.state.scenario?.attackerSideKey !== terminal.attackerSideKey ||
      opening.state.scenario?.defenderSideKey !== terminal.defenderSideKey ||
      opening.state.deploymentComplete !== true ||
      opening.state.strictMode !== true ||
      Number(opening.modelCount) !== opening.state.pieces.length ||
      stableGraphHash(opening.state) !== opening.strictOpeningStateHash) {
    throw new Error("score_terminal_task_opening_binding_mismatch");
  }
  if (!(opening.state.pieces || []).some((piece) => piece.sideKey === "player1") ||
      !(opening.state.pieces || []).some((piece) => piece.sideKey === "player2")) {
    throw new Error("score_terminal_task_opening_two_rosters_required");
  }
}

function validatePlanAndGroup(task = {}, groupPlan = {}, plan = {}) {
  const planned = (plan.selectedTasks || []).find((row) =>
    row.taskKey === task.taskKey);
  if (!planned || stableGraphHash(planned) !== stableGraphHash(task) ||
      groupPlan.groupKey !== task.groupKey ||
      groupPlan.groupPlanHash !== task.groupPlanHash ||
      groupPlan.goalFamily !== GOAL_FAMILY ||
      !groupPlan.representativeKeys?.includes(task.representative?.subcellKey) ||
      !groupPlan.axes?.subjectRosterKeys?.includes(task.subjectRosterKey) ||
      !groupPlan.axes?.challengerRosterKeys?.includes(task.challengerRosterKey)) {
    throw new Error("score_terminal_task_plan_or_routing_binding_mismatch");
  }
}

function exactSupportedCoordinates(representative = {}) {
  const coordinates = representative.coordinates || {};
  return representative.terminalClassKey === TERMINAL_CLASS &&
    representative.scenarioKey === SUPPORTED_SCENARIO &&
    Number(representative.roundNumber) === 3 &&
    representative.sourceResolutionStatus === "officially_confirmed" &&
    coordinates.baseTopology === "legal_separated" &&
    coordinates.damage === "critical_models_undamaged" &&
    coordinates.leaderControl === "outside_or_not_required" &&
    coordinates.lifecycle === "both_rosters_complete" &&
    coordinates.resource === "maximum_native_resource" &&
    coordinates.scenarioControl === "winner_secures_uncontested" &&
    coordinates.scenarioTerrainSetup ===
      "all_flags_fallback_no_valid_terrain" &&
    coordinates.scoreTransition === SUPPORTED_SCORE_TRANSITION &&
    coordinates.wolvesProgressState === "at_least_one_objective_at_two" &&
    coordinates.wolvesTokenDecision === "eligible_add_token_declined" &&
    coordinates.wolvesObjectiveMove === "move_not_triggered";
}

function exactTerminalPaymentIncompatible(representative = {}) {
  return representative.terminalClassKey === TERMINAL_CLASS &&
    representative.sourceResolutionStatus === "officially_confirmed" &&
    representative.canonicalTerminal?.causalActionFamily === ACTION_CATEGORY &&
    representative.coordinates?.resource === "exact_terminal_payment";
}

function saturatedContestCandidate(representative = {}) {
  return representative.terminalClassKey === TERMINAL_CLASS &&
    representative.sourceResolutionStatus === "officially_confirmed" &&
    representative.canonicalTerminal?.causalActionFamily === ACTION_CATEGORY &&
    representative.coordinates?.scenarioControl === "contested" &&
    SATURATED_CONTEST_TRANSITIONS.has(
      representative.coordinates?.scoreTransition,
    );
}

function highStakesZeroCountdownConflictCandidate(representative = {}) {
  return representative.terminalClassKey === TERMINAL_CLASS &&
    representative.scenarioKey === "high_stakes" &&
    representative.sourceResolutionStatus === "officially_confirmed" &&
    representative.canonicalTerminal?.causalActionFamily === ACTION_CATEGORY &&
    representative.coordinates?.highStakesCountdownState ===
      "one_nonzero_element_reduced" &&
    representative.coordinates?.scoreTransition ===
      "score-transition-009603a9589e2967efa82418";
}

function wolvesDeclinedThirdGoalConflictCandidate(representative = {}) {
  return representative.terminalClassKey === TERMINAL_CLASS &&
    representative.scenarioKey === "wolves_at_our_heels" &&
    representative.sourceResolutionStatus === "officially_confirmed" &&
    representative.canonicalTerminal?.causalActionFamily === ACTION_CATEGORY &&
    representative.coordinates?.wolvesTokenDecision ===
      "eligible_add_token_declined" &&
    representative.coordinates?.scoreTransition ===
      "score-transition-30987a13ea0f6d43d1ccd27a";
}

function exactMultiSourceCoordinates(representative = {}) {
  if (representative.terminalClassKey !== TERMINAL_CLASS ||
      representative.sourceResolutionStatus !== "officially_confirmed" ||
      representative.canonicalTerminal?.causalActionFamily !== ACTION_CATEGORY ||
      representative.coordinates?.scoreTransition !==
        MULTI_SOURCE_SCORE_TRANSITION) return false;
  const common = {
    baseTopology: "legal_separated",
    damage: "critical_models_undamaged",
    leaderControl: "outside_or_not_required",
    scenarioControl: "winner_secures_uncontested",
    scenarioTerrainSetup: "all_flags_fallback_no_valid_terrain",
    scoreTransition: MULTI_SOURCE_SCORE_TRANSITION,
  };
  const expected = representative.scenarioKey === "payload" &&
      Number(representative.roundNumber) === 7
    ? {
      ...common,
      lifecycle: "both_rosters_complete",
      madeToHaulDecision: "not_triggered",
      payloadLifecycle: "both_payloads_active",
      payloadMoveDecision: "eligible_move_declined",
      resource: "one_additional_purchase_available",
    }
    : representative.scenarioKey === "trench_warfare" &&
        Number(representative.roundNumber) === 2
      ? {
        ...common,
        lifecycle: "reserve_replacement_or_dormant_history",
        resource: "zero_available",
        trenchCacheLifecycle: "both_caches_active",
      }
      : null;
  return Boolean(expected) && stableGraphHash(representative.coordinates || {}) ===
    stableGraphHash(expected);
}

function saturatedContestEvidence(opening = {}, transition = {}) {
  const winnerCounts = transition.scoringGainClass
    ?.representativeWinnerCounts || {};
  const opponentCounts = transition.scoringGainClass
    ?.representativeOpponentCounts || {};
  const scoredElementFamilies = [
    "objective_40",
    "objective_50",
    "scenario_terrain_own",
    "scenario_terrain_opponent",
  ];
  const requestedScoringElementCount = scoredElementFamilies.reduce(
    (sum, key) => sum + Number(winnerCounts[key] || 0) +
      Number(opponentCounts[key] || 0),
    0,
  );
  const objectiveCount = (opening.state?.scenario?.objectives || []).filter(
    (row) => row.active !== false,
  ).length;
  const scenarioTerrainCount = (opening.state?.terrain || []).filter((row) =>
    row.active !== false && (row.isScenarioTerrain || row.scenarioTerrain ||
      row.scenarioElement),
  ).length;
  const availableScoringElementCount = objectiveCount + scenarioTerrainCount;
  return stableGraphValue({
    requestedScenarioControl: "contested",
    scoreTransitionKey: String(transition.scoreTransitionKey || ""),
    winnerCounts,
    opponentCounts,
    scoredElementFamilies,
    requestedScoringElementCount,
    objectiveCount,
    scenarioTerrainCount,
    availableScoringElementCount,
    everyScoringElementAllocated:
      requestedScoringElementCount === availableScoringElementCount,
    contestedElementCanAlsoScoreForEitherSide: false,
    relationAuthority: "terminal_candidate_contract",
    hostRulesConclusion: false,
  });
}

function sealedReport(task = {}, opening = {}, disposition = {}, detail = {}) {
  const core = stableGraphValue({
    schemaVersion:
      WARMACHINE_MATCHUP_SCORE_TERMINAL_TASK_MATERIALIZER_V1_SCHEMA,
    terminalRootKind: "scenario_score_threshold",
    terminalTaskKey: String(task.taskKey || ""),
    taskKey: String(task.taskKey || ""),
    groupKey: String(task.groupKey || ""),
    cellKey: String(task.representative?.cellKey || ""),
    representativeSubcellKey: String(task.representative?.subcellKey || ""),
    openingKey: String(opening.openingKey || ""),
    constructionOpeningKey: String(opening.constructionOpeningKey || ""),
    strictOpeningStateHash: String(opening.strictOpeningStateHash || ""),
    strictDeploymentReceiptHash: String(
      opening.strictDeploymentReceiptHash || "",
    ),
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    constructionHostReceiptHash:
      warmachineConstructionHost.receipt.receiptHash,
    disposition: disposition.disposition,
    authority: disposition.authority,
    reason: disposition.reason,
    strictRulesConclusion: disposition.strictRulesConclusion === true,
    strictReplayCertified: detail.root?.strictReplayCertified === true,
    matchupTerminalRootProven:
      disposition.disposition === "strict_materialized" &&
      detail.root?.strictReplayCertified === true,
    genericCapabilityPinsCountAsTaskRoute: false,
    historicalReachabilityProven: false,
    deploymentToTerminalReachabilityProven: false,
    trainingTruth: false,
    ...detail,
    claimBoundary: disposition.claimBoundary ||
      "This task-specific artifact proves only one authored later-round score settlement for the complete task-bound rosters under the current Host, exact representative partitions and independent replay. It does not prove a route from deployment, strategy value, win rate, exhaustive coverage or training truth.",
  });
  return stableGraphValue({ ...core, reportHash: stableGraphHash(core) });
}

function inputInvalid(task, opening, reason, evidence = {}) {
  return {
    report: sealedReport(task, opening, {
      disposition: "input_invalid",
      authority: "input_contract",
      reason,
    }, { inputValidationEvidence: stableGraphValue(evidence) }),
    runtime: null,
  };
}

function proposalFiltered(task, opening, reason, evidence = {}) {
  return {
    report: sealedReport(task, opening, {
      disposition: "proposal_filtered",
      authority: "search_relation",
      reason,
      claimBoundary: "The exact complete task roster or authored geometry did not carry this representative relation. This filters only this task candidate and is not a Host rejection or a family-level unreachability claim.",
    }, { candidateFilterEvidence: stableGraphValue(evidence) }),
    runtime: null,
  };
}

function pieceRadiusIn(piece = {}) {
  return Number(piece.baseDiameterIn || piece.baseSizeIn || 1.2) / 2;
}

function leaderLike(piece = {}) {
  return piece.isWarcaster === true || piece.isWarlock === true ||
    piece.isLeader === true || /warcaster|warlock|leader/i.test(
      `${piece.modelRole || ""} ${piece.modelType || ""}`,
    );
}

function placeEndingLeaderInKillBox(state = {}, sideKey = "") {
  const leader = (state.pieces || []).find((piece) =>
    piece.sideKey === sideKey && warmachinePieceInPlayV1(piece) &&
    leaderLike(piece));
  if (!leader) return null;
  const center = state.scenario?.killBoxCenter || {
    xIn: Number(state.board?.widthIn || 48) / 2,
    yIn: Number(state.board?.heightIn || 48) / 2,
  };
  const original = structuredClone(leader.position);
  for (const [xOffset, yOffset] of [
    [0, 6], [0, -6], [4, 4], [-4, 4], [4, -4], [-4, -4], [0, 0],
  ]) {
    leader.position = {
      xIn: Number(center.xIn) + xOffset,
      yIn: Number(center.yIn) + yOffset,
    };
    if (auditRulesV1StaticPlacement(state).ok) {
      return stableGraphValue({
        pieceKey: leader.pieceKey,
        sideKey,
        position: structuredClone(leader.position),
      });
    }
  }
  leader.position = original;
  return null;
}

function placeWinnerUnitOnObjective(state = {}, sideKey = "", objective = {}) {
  const groups = new Map();
  for (const piece of state.pieces || []) {
    if (piece.sideKey !== sideKey || !piece.unitGroupId ||
        !warmachinePieceInPlayV1(piece)) continue;
    const members = groups.get(piece.unitGroupId) || [];
    members.push(piece);
    groups.set(piece.unitGroupId, members);
  }
  for (const [unitGroupId, members] of [...groups.entries()].sort(([left], [right]) =>
    left.localeCompare(right))) {
    members.sort((left, right) => left.pieceKey.localeCompare(right.pieceKey));
    const originals = members.map((piece) => structuredClone(piece.position));
    const ringRadius = Number(objective.baseRadiusIn ||
      Number(objective.baseSizeMm || 40) / 50.8) +
      Math.max(...members.map(pieceRadiusIn)) + 0.15;
    for (let rotation = 0; rotation < 48; rotation += 1) {
      const offset = rotation * Math.PI / 24;
      members.forEach((piece, index) => {
        const angle = offset + index * Math.PI * 2 / members.length;
        piece.position = {
          xIn: Number(objective.xIn) + Math.cos(angle) * ringRadius,
          yIn: Number(objective.yIn) + Math.sin(angle) * ringRadius,
        };
      });
      if (auditRulesV1StaticPlacement(state).ok &&
          auditRulesV1StaticUnitFormation(state).ok) {
        return stableGraphValue({
          unitGroupId,
          sideKey,
          objectiveKey: objective.objectiveKey,
          pieceKeys: members.map((piece) => piece.pieceKey),
          positions: members.map((piece) => structuredClone(piece.position)),
        });
      }
    }
    members.forEach((piece, index) => {
      piece.position = originals[index];
    });
  }
  return null;
}

function setPieceNativeResource(piece = {}, amount = 0) {
  const value = Number(amount || 0);
  if ("resourcePoints" in piece) piece.resourcePoints = value;
  if ("focusPoints" in piece) piece.focusPoints = value;
  if ("furyPoints" in piece) piece.furyPoints = value;
  if ("focus" in piece) piece.focus = value;
  if ("fury" in piece) piece.fury = value;
  if ("resource2" in piece) piece.resource2 = value;
}

function authorOneAdditionalPurchaseResource(state = {}) {
  const warjack = (state.pieces || []).find((piece) =>
    piece.isWarjack === true && warmachinePieceInPlayV1(piece) &&
    Number(piece.resourceMax ?? piece.focusMax ?? 0) >= 1);
  if (!warjack) return "";
  setPieceNativeResource(warjack, 1);
  return warjack.pieceKey;
}

function authorAmbushReserveHistory(state = {}) {
  const groupKeys = [...new Set((state.pieces || []).filter((piece) =>
    piece.canAmbush === true && piece.canDeployFromReserve === true &&
    warmachinePieceInPlayV1(piece) && Boolean(piece.unitGroupId)).map((piece) =>
    String(piece.unitGroupId)))].sort();
  for (const unitGroupId of groupKeys) {
    const group = (state.pieces || []).filter((piece) =>
      String(piece.unitGroupId || "") === unitGroupId);
    const eligible = group.filter((piece) =>
      piece.canAmbush === true && piece.canDeployFromReserve === true &&
      warmachinePieceInPlayV1(piece));
    if (!eligible.length) continue;
    for (const piece of eligible) {
      piece.offTable = true;
      piece.notDeployed = true;
      piece.activated = false;
      piece.activationKey = "";
      piece.statusTags = [...new Set([
        ...(piece.statusTags || []),
        "off_table",
        "not_deployed",
      ])].sort();
    }
    return stableGraphValue({
      unitGroupId,
      reservePieceKeys: eligible.map((piece) => piece.pieceKey).sort(),
      inPlayNonAmbushPieceKeys: group.filter((piece) =>
        piece.canAmbush !== true && warmachinePieceInPlayV1(piece)).map(
        (piece) => piece.pieceKey).sort(),
    });
  }
  return null;
}

function directObjectiveCandidates(state = {}, sideKey = "") {
  return (state.pieces || []).filter((piece) => {
    const text = `${piece.modelRole || ""} ${piece.modelType || ""} ${
      piece.cardType || ""}`;
    return piece.sideKey === sideKey && warmachinePieceInPlayV1(piece) &&
      !piece.unitGroupId && !piece.unitId && (
        leaderLike(piece) ||
        piece.isWarbeast === true || piece.isWarjack === true ||
        piece.isBattleEngine === true ||
        /warbeast|warjack|battle[\s_-]*engine|cohort/i.test(text)
      );
  }).sort((left, right) =>
    Number(leaderLike(left)) - Number(leaderLike(right)) ||
    left.pieceKey.localeCompare(right.pieceKey));
}

function soloCandidates(state = {}, sideKey = "", excluded = new Set()) {
  return (state.pieces || []).filter((piece) => {
    const text = `${piece.modelRole || ""} ${piece.modelType || ""} ${
      piece.cardType || ""}`;
    return piece.sideKey === sideKey && warmachinePieceInPlayV1(piece) &&
      !piece.unitGroupId && !piece.unitId && !leaderLike(piece) &&
      !excluded.has(piece.pieceKey) && (piece.isSolo === true ||
        /\bsolo\b/i.test(text));
  }).sort((left, right) => left.pieceKey.localeCompare(right.pieceKey));
}

function elementRadiusIn(element = {}) {
  return Number(element.baseRadiusIn || element.radiusIn ||
    Number(element.baseSizeMm || 0) / 50.8 ||
    Number(element.widthIn || 0) / 2 || 0.6);
}

function placePieceNearElement(state = {}, piece = {}, element = {}, seed = 0) {
  const original = structuredClone(piece.position);
  const centerDistance = elementRadiusIn(element) + pieceRadiusIn(piece) + 0.15;
  for (let index = 0; index < 48; index += 1) {
    const angle = (seed + index) * Math.PI / 24;
    piece.position = {
      xIn: Number(element.xIn) + Math.cos(angle) * centerDistance,
      yIn: Number(element.yIn) + Math.sin(angle) * centerDistance,
    };
    if (auditRulesV1StaticPlacement(state).ok) return true;
  }
  piece.position = original;
  return false;
}

function placeUnitGroupNearElement(state = {}, group = {}, element = {}, seed = 0) {
  const members = group.members || [];
  if (!members.length) return false;
  const originals = members.map((piece) => structuredClone(piece.position));
  const ringRadius = elementRadiusIn(element) +
    Math.max(...members.map(pieceRadiusIn)) + 0.15;
  for (let rotation = 0; rotation < 48; rotation += 1) {
    const offset = (seed + rotation) * Math.PI / 24;
    members.forEach((piece, index) => {
      const angle = offset + index * Math.PI * 2 / members.length;
      piece.position = {
        xIn: Number(element.xIn) + Math.cos(angle) * ringRadius,
        yIn: Number(element.yIn) + Math.sin(angle) * ringRadius,
      };
    });
    if (auditRulesV1StaticPlacement(state).ok &&
        auditRulesV1StaticUnitFormation(state).ok) return true;
  }
  members.forEach((piece, index) => {
    piece.position = originals[index];
  });
  return false;
}

function unitGroupCandidates(state = {}, sideKey = "") {
  const groups = new Map();
  for (const piece of state.pieces || []) {
    if (piece.sideKey !== sideKey || !piece.unitGroupId ||
        !warmachinePieceInPlayV1(piece)) continue;
    const members = groups.get(piece.unitGroupId) || [];
    members.push(piece);
    groups.set(piece.unitGroupId, members);
  }
  return [...groups.entries()].map(([unitGroupId, members]) => ({
    unitGroupId,
    members: members.sort((left, right) =>
      left.pieceKey.localeCompare(right.pieceKey)),
  })).sort((left, right) => left.unitGroupId.localeCompare(right.unitGroupId));
}

function pieceWithinElementControlRange(piece = {}, element = {}) {
  const dx = Number(piece.position?.xIn || 0) - Number(element.xIn || 0);
  const dy = Number(piece.position?.yIn || 0) - Number(element.yIn || 0);
  const edgeDistance = Math.max(0, Math.hypot(dx, dy) -
    pieceRadiusIn(piece) - elementRadiusIn(element));
  return edgeDistance <= Number(element.contestingRangeIn ||
    element.scenarioTerrainControlRangeIn || 3) + 0.001;
}

function moveDirectPieceAwayFromElements(state = {}, piece = {},
  assignments = [], seed = 0) {
  const original = structuredClone(piece.position);
  for (let index = 0; index < 144; index += 1) {
    const column = (seed + index) % 12;
    const row = Math.floor((seed + index) / 12) % 12;
    piece.position = { xIn: 2 + column * 4, yIn: 2 + row * 4 };
    if (assignments.some(({ sideKey, element }) =>
      sideKey !== piece.sideKey && pieceWithinElementControlRange(
        piece,
        element,
      ))) continue;
    if (auditRulesV1StaticPlacement(state).ok) return true;
  }
  piece.position = original;
  return false;
}

function moveUnitGroupAwayFromElements(state = {}, members = [],
  assignments = [], seed = 0) {
  if (!members.length) return false;
  const originals = members.map((piece) => structuredClone(piece.position));
  const center = originals.reduce((sum, position) => ({
    xIn: sum.xIn + Number(position.xIn || 0) / originals.length,
    yIn: sum.yIn + Number(position.yIn || 0) / originals.length,
  }), { xIn: 0, yIn: 0 });
  for (let index = 0; index < 144; index += 1) {
    const column = (seed + index) % 12;
    const row = Math.floor((seed + index) / 12) % 12;
    const target = { xIn: 2 + column * 4, yIn: 2 + row * 4 };
    members.forEach((piece, memberIndex) => {
      piece.position = {
        xIn: Number(originals[memberIndex].xIn) + target.xIn - center.xIn,
        yIn: Number(originals[memberIndex].yIn) + target.yIn - center.yIn,
      };
    });
    if (members.some((piece) => assignments.some(({ sideKey, element }) =>
      sideKey !== piece.sideKey && pieceWithinElementControlRange(
        piece,
        element,
      )))) continue;
    if (auditRulesV1StaticPlacement(state).ok &&
        auditRulesV1StaticUnitFormation(state).ok) return true;
  }
  members.forEach((piece, index) => {
    piece.position = originals[index];
  });
  return false;
}

function clearUnexpectedElementContesters(state = {}, assignments = [],
  protectedPieceKeys = new Set()) {
  const movedGroupKeys = new Set();
  const movements = [];
  for (const { sideKey, element } of assignments) {
    const unexpected = (state.pieces || []).filter((piece) =>
      piece.sideKey !== sideKey && warmachinePieceInPlayV1(piece) &&
      !protectedPieceKeys.has(piece.pieceKey) &&
      pieceWithinElementControlRange(piece, element));
    for (const piece of unexpected) {
      if (piece.unitGroupId) {
        if (movedGroupKeys.has(piece.unitGroupId)) continue;
        const members = (state.pieces || []).filter((candidate) =>
          candidate.unitGroupId === piece.unitGroupId &&
          warmachinePieceInPlayV1(candidate));
        if (members.some((candidate) =>
          protectedPieceKeys.has(candidate.pieceKey)) ||
            !moveUnitGroupAwayFromElements(
              state,
              members,
              assignments,
              movements.length * 13,
            )) {
          return {
            ok: false,
            reason: "score_terminal_multi_source_contesting_unit_cannot_park",
            unitGroupId: piece.unitGroupId,
            elementKey: element.objectiveKey || element.terrainKey || "",
          };
        }
        movedGroupKeys.add(piece.unitGroupId);
        movements.push(stableGraphValue({
          kind: "unit",
          unitGroupId: piece.unitGroupId,
          pieceKeys: members.map((candidate) => candidate.pieceKey).sort(),
        }));
      } else if (!moveDirectPieceAwayFromElements(
        state,
        piece,
        assignments,
        movements.length * 17,
      )) {
        return {
          ok: false,
          reason: "score_terminal_multi_source_contesting_model_cannot_park",
          pieceKey: piece.pieceKey,
          elementKey: element.objectiveKey || element.terrainKey || "",
        };
      } else {
        movements.push(stableGraphValue({
          kind: "model",
          pieceKey: piece.pieceKey,
        }));
      }
    }
  }
  return { ok: true, movements };
}

function scoreTransitionForTask(evidenceCorpus = {}, representative = {}) {
  return (evidenceCorpus.corpus?.scenarios || []).find((scenario) =>
    scenario.scenarioKey === representative.scenarioKey)
    ?.scoreTransitionDomain?.transitions?.find((transition) =>
      transition.scoreTransitionKey ===
        representative.coordinates?.scoreTransition) || null;
}

function exactTransitionSupported(transition = {}) {
  const gain = transition.scoringGainClass || {};
  return Number(transition.leadBefore) === 2 &&
    Number(transition.leadAfter) === 3 && Number(gain.netGain) === 1 &&
    stableGraphHash(gain.representativeWinnerCounts || {}) ===
      stableGraphHash({ objective_40: 1 }) &&
    stableGraphHash(gain.representativeOpponentCounts || {}) ===
      stableGraphHash({});
}

function exactMultiSourceTransitionSupported(transition = {}) {
  const gain = transition.scoringGainClass || {};
  return transition.scoreTransitionKey === MULTI_SOURCE_SCORE_TRANSITION &&
    Number(transition.leadBefore) === 1 &&
    Number(transition.leadAfter) === 3 && Number(gain.netGain) === 2 &&
    stableGraphHash(gain.representativeWinnerCounts || {}) ===
      stableGraphHash({
        objective_40: 2,
        objective_50: 1,
        scenario_terrain_opponent: 1,
      }) &&
    stableGraphHash(gain.representativeOpponentCounts || {}) ===
      stableGraphHash({
        objective_50: 1,
        scenario_terrain_opponent: 1,
      });
}

function mappedHostRepresentative(task = {}, terminal = {}, evidenceCorpus = {}) {
  const representative = task.representative || {};
  const hostCell = (evidenceCorpus.corpus?.cells || []).find((cell) =>
    cell.scenarioKey === representative.scenarioKey &&
    cell.terminalClassKey === TERMINAL_CLASS &&
    cell.causalActionFamily === ACTION_CATEGORY &&
    cell.resultKind === terminal.resultKind &&
    cell.attackerSideKey === terminal.attackerSideKey &&
    cell.defenderSideKey === terminal.defenderSideKey &&
    cell.endingSideKey === terminal.endingSideKey &&
    cell.winnerSideKey === terminal.winnerSideKey &&
    cell.loserSideKey === terminal.loserSideKey &&
    cell.roundClass?.exactRoundNumber === true &&
    Number(cell.roundClass?.representativeRoundNumber) ===
      Number(representative.roundNumber));
  if (!hostCell) return null;
  const subcellKey = warmachineSteamrollerTerminalScenarioSubcellKeyV1(
    hostCell,
    representative.coordinates,
  );
  return stableGraphValue({
    ...representative,
    cellKey: hostCell.cellKey,
    subcellKey,
    representativeRoundNumber: Number(representative.roundNumber),
    canonicalTerminal: {
      attackerSideKey: terminal.attackerSideKey,
      causalActionFamily: terminal.causalActionFamily,
      defenderSideKey: terminal.defenderSideKey,
      endingSideKey: terminal.endingSideKey,
      loserSideKey: terminal.loserSideKey,
      resultKind: terminal.resultKind,
      winnerSideKey: terminal.winnerSideKey,
    },
  });
}

function buildPredecessor(opening = {}, representative = {}, terminal = {},
  transition = {}) {
  const scoreBefore = terminal.winnerSideKey === "player1"
    ? { player1: Number(transition.leadBefore), player2: 0 }
    : { player1: 0, player2: Number(transition.leadBefore) };
  const state = prepareWarmachineScoreTerminalSeedStateV1(opening.state, {
    roundNumber: representative.roundNumber,
    endingSideKey: terminal.endingSideKey,
    scoreBefore,
    resourceMode: "maximum_native_resource",
  });
  state.strictMode = true;
  state.enforceStrictExecutor = true;
  state.outcome = null;
  state.terminal = null;
  for (const field of WARMACHINE_RULES_V1_RUNTIME_WINDOW_FIELDS) {
    state[field] = null;
  }
  const objective = (state.scenario?.objectives || []).find((row) =>
    Number(row.baseSizeMm) === 40 &&
    row.ownerSideKey === terminal.winnerSideKey && row.active !== false);
  if (!objective) return { reason: "score_terminal_wolves_owned_40mm_missing" };
  objective.progressTokens = 2;
  objective.progressGoalScored = false;
  const leaderGeometry = placeEndingLeaderInKillBox(
    state,
    terminal.endingSideKey,
  );
  if (!leaderGeometry) {
    return { reason: "score_terminal_wolves_ending_leader_geometry_missing" };
  }
  const scoringGeometry = placeWinnerUnitOnObjective(
    state,
    terminal.winnerSideKey,
    objective,
  );
  if (!scoringGeometry) {
    return { reason: "score_terminal_wolves_scoring_unit_geometry_missing" };
  }
  const placementAudit = auditRulesV1StaticPlacement(state);
  const formationAudit = auditRulesV1StaticUnitFormation(state);
  const controlReport = scoreScenarioElements(state);
  const objectiveControl = (controlReport.objectiveControl || []).find((row) =>
    String(row.elementKey || row.objectiveKey || "") === objective.objectiveKey);
  if (!placementAudit.ok || !formationAudit.ok ||
      !(objectiveControl?.securingSides || []).includes(terminal.winnerSideKey) ||
      (objectiveControl?.securingSides || []).length !== 1) {
    return {
      reason: "score_terminal_wolves_host_control_relation_missing",
      placementAudit,
      formationAudit,
      objectiveControl,
    };
  }
  return {
    state,
    scoreBefore,
    objective,
    leaderGeometry,
    scoringGeometry,
    placementAudit,
    formationAudit,
    objectiveControl,
    controlReportHash: stableGraphHash(controlReport),
    actionPatch: stableGraphValue({
      steamroller2026Decision: {
        wolves: {
          addTokenByObjectiveKey: { [objective.objectiveKey]: false },
        },
      },
    }),
  };
}

function buildMultiSourcePredecessor(opening = {}, representative = {},
  terminal = {}, transition = {}) {
  const winnerCounts = transition.scoringGainClass
    ?.representativeWinnerCounts || {};
  const opponentCounts = transition.scoringGainClass
    ?.representativeOpponentCounts || {};
  if (!exactMultiSourceTransitionSupported(transition)) {
    return { reason: "score_terminal_multi_source_transition_contract_drift" };
  }
  const scoreBefore = terminal.winnerSideKey === "player1"
    ? { player1: Number(transition.leadBefore), player2: 0 }
    : { player1: 0, player2: Number(transition.leadBefore) };
  const resourceMode = representative.coordinates?.resource ===
      "maximum_native_resource"
    ? "maximum_native_resource"
    : "zero_available";
  const state = prepareWarmachineScoreTerminalSeedStateV1(opening.state, {
    roundNumber: representative.roundNumber,
    endingSideKey: terminal.endingSideKey,
    scoreBefore,
    resourceMode,
  });
  state.strictMode = true;
  state.enforceStrictExecutor = true;
  state.outcome = null;
  state.terminal = null;
  for (const field of WARMACHINE_RULES_V1_RUNTIME_WINDOW_FIELDS) {
    state[field] = null;
  }
  const reserveHistory = representative.coordinates?.lifecycle ===
      "reserve_replacement_or_dormant_history"
    ? authorAmbushReserveHistory(state)
    : null;
  if (representative.coordinates?.lifecycle ===
      "reserve_replacement_or_dormant_history" && !reserveHistory) {
    return { reason: "score_terminal_multi_source_reserve_history_missing" };
  }
  const resourcePieceKey = representative.coordinates?.resource ===
      "one_additional_purchase_available"
    ? authorOneAdditionalPurchaseResource(state)
    : "";
  if (representative.coordinates?.resource ===
      "one_additional_purchase_available" && !resourcePieceKey) {
    return { reason: "score_terminal_multi_source_warjack_resource_missing" };
  }
  const leaderGeometry = placeEndingLeaderInKillBox(
    state,
    terminal.endingSideKey,
  );
  if (!leaderGeometry) {
    return { reason: "score_terminal_multi_source_ending_leader_geometry_missing" };
  }
  const objectives = (state.scenario?.objectives || []).filter((objective) =>
    objective.active !== false);
  const winner40 = objectives.filter((objective) =>
    Number(objective.baseSizeMm) === 40).sort((left, right) =>
    left.objectiveKey.localeCompare(right.objectiveKey));
  const winner50 = objectives.find((objective) =>
    Number(objective.baseSizeMm) === 50 &&
    objective.ownerSideKey === terminal.winnerSideKey);
  const opponent50 = objectives.find((objective) =>
    Number(objective.baseSizeMm) === 50 &&
    objective.ownerSideKey === terminal.endingSideKey);
  const scenarioTerrain = (state.terrain || []).filter((terrain) =>
    terrain.active !== false && (terrain.isScenarioTerrain ||
      terrain.scenarioTerrain || terrain.scenarioElement));
  const winnerTerrain = scenarioTerrain.find((terrain) =>
    terrain.ownerSideKey === terminal.endingSideKey);
  const opponentTerrain = scenarioTerrain.find((terrain) =>
    terrain.ownerSideKey === terminal.winnerSideKey);
  if (winner40.length !== Number(winnerCounts.objective_40 || 0) ||
      !winner50 || !opponent50 || !winnerTerrain || !opponentTerrain) {
    return {
      reason: "score_terminal_multi_source_element_roster_missing",
      observedWinner40Count: winner40.length,
      winner50Key: winner50?.objectiveKey || "",
      opponent50Key: opponent50?.objectiveKey || "",
      winnerTerrainKey: winnerTerrain?.terrainKey || "",
      opponentTerrainKey: opponentTerrain?.terrainKey || "",
    };
  }
  const scoringGeometry = [];
  const groups = unitGroupCandidates(state, terminal.winnerSideKey);
  const usedGroupKeys = new Set();
  for (let index = 0; index < winner40.length; index += 1) {
    const attempts = [];
    let group = null;
    for (const candidate of groups) {
      if (usedGroupKeys.has(candidate.unitGroupId)) continue;
      const placed = placeUnitGroupNearElement(
        state,
        candidate,
        winner40[index],
        index * 11 + attempts.length * 5,
      );
      attempts.push({ unitGroupId: candidate.unitGroupId, placed });
      if (placed) {
        group = candidate;
        usedGroupKeys.add(candidate.unitGroupId);
        break;
      }
    }
    if (!group) {
      return {
        reason: "score_terminal_multi_source_40mm_unit_geometry_missing",
        objectiveKey: winner40[index].objectiveKey,
        attempts,
      };
    }
    scoringGeometry.push(stableGraphValue({
      elementKey: winner40[index].objectiveKey,
      sideKey: terminal.winnerSideKey,
      sourceFamily: "objective_40",
      unitGroupId: group.unitGroupId,
      pieceKeys: group.members.map((piece) => piece.pieceKey),
    }));
  }
  const usedPieceKeys = new Set();
  for (const [sideKey, objective, sourceFamily, seed] of [
    [terminal.winnerSideKey, winner50, "objective_50", 7],
    [terminal.endingSideKey, opponent50, "objective_50", 19],
  ]) {
    const piece = directObjectiveCandidates(state, sideKey).find((candidate) =>
      !usedPieceKeys.has(candidate.pieceKey));
    if (!piece || !placePieceNearElement(state, piece, objective, seed)) {
      return {
        reason: "score_terminal_multi_source_50mm_model_geometry_missing",
        sideKey,
        objectiveKey: objective.objectiveKey,
        pieceKey: piece?.pieceKey || "",
      };
    }
    usedPieceKeys.add(piece.pieceKey);
    scoringGeometry.push(stableGraphValue({
      elementKey: objective.objectiveKey,
      sideKey,
      sourceFamily,
      pieceKey: piece.pieceKey,
    }));
  }
  for (const [sideKey, terrain, seed] of [
    [terminal.winnerSideKey, winnerTerrain, 29],
    [terminal.endingSideKey, opponentTerrain, 41],
  ]) {
    const piece = soloCandidates(state, sideKey, usedPieceKeys)[0];
    if (!piece || !placePieceNearElement(state, piece, terrain, seed)) {
      return {
        reason: "score_terminal_multi_source_terrain_solo_geometry_missing",
        sideKey,
        terrainKey: terrain.terrainKey,
        pieceKey: piece?.pieceKey || "",
      };
    }
    usedPieceKeys.add(piece.pieceKey);
    scoringGeometry.push(stableGraphValue({
      elementKey: terrain.terrainKey,
      sideKey,
      sourceFamily: "scenario_terrain_opponent",
      pieceKey: piece.pieceKey,
    }));
  }
  const elementAssignments = [
    ...winner40.map((element) => ({
      sideKey: terminal.winnerSideKey,
      element,
    })),
    { sideKey: terminal.winnerSideKey, element: winner50 },
    { sideKey: terminal.endingSideKey, element: opponent50 },
    { sideKey: terminal.winnerSideKey, element: winnerTerrain },
    { sideKey: terminal.endingSideKey, element: opponentTerrain },
  ];
  const protectedPieceKeys = new Set(scoringGeometry.flatMap((geometry) => [
    ...(geometry.pieceKeys || []),
    ...(geometry.pieceKey ? [geometry.pieceKey] : []),
  ]).concat((state.pieces || []).filter(leaderLike).map((piece) =>
    piece.pieceKey)));
  const parking = clearUnexpectedElementContesters(
    state,
    elementAssignments,
    protectedPieceKeys,
  );
  if (!parking.ok) return parking;
  const placementAudit = auditRulesV1StaticPlacement(state);
  const formationAudit = auditRulesV1StaticUnitFormation(state);
  const controlReport = scoreScenarioElements(state);
  const controlRows = [
    ...(controlReport.objectiveControl || []),
    ...(controlReport.scenarioTerrainControl || []),
  ];
  const controlEvidence = scoringGeometry.map((geometry) => {
    const row = controlRows.find((candidate) =>
      String(candidate.elementKey || candidate.objectiveKey ||
        candidate.terrainKey || "") === geometry.elementKey);
    return stableGraphValue({
      elementKey: geometry.elementKey,
      expectedSideKey: geometry.sideKey,
      securingSides: row?.securingSides || [],
      contestingSides: row?.contestingSides || [],
      passed: (row?.securingSides || []).length === 1 &&
        row.securingSides[0] === geometry.sideKey,
    });
  });
  if (!placementAudit.ok || !formationAudit.ok ||
      controlEvidence.some((row) => !row.passed)) {
    return {
      reason: "score_terminal_multi_source_host_control_relation_missing",
      placementAudit,
      formationAudit,
      controlEvidence,
    };
  }
  const actionPatch = representative.scenarioKey === "payload"
    ? stableGraphValue({
      steamroller2026Decision: {
        payload: {
          moveByObjectiveKey: {
            [winner50.objectiveKey]: { decline: true },
            [opponent50.objectiveKey]: { decline: true },
          },
        },
      },
    })
    : stableGraphValue({});
  return {
    kind: "multi_source",
    state,
    scoreBefore,
    objective: winner40[0],
    scoringGeometry,
    parkingMovements: parking.movements,
    leaderGeometry,
    reserveHistory,
    resourcePieceKey,
    placementAudit,
    formationAudit,
    controlEvidence,
    controlReportHash: stableGraphHash(controlReport),
    scenarioControlWitness: {
      elementKey: winner40[0].objectiveKey,
      sideKey: terminal.winnerSideKey,
    },
    actionPatch,
    winnerCounts,
    opponentCounts,
  };
}

export function materializeWarmachineMatchupScoreTerminalTaskV1({
  terminalTask = {},
  groupPlan = {},
  opening = {},
  plan = {},
  evidenceCorpus = {},
} = {}) {
  let terminal;
  let validatedEvidence;
  try {
    if (terminalTask.representative?.terminalClassKey !== TERMINAL_CLASS ||
        terminalTask.executionEnvelope?.actionCategory !== ACTION_CATEGORY) {
      throw new Error("score_terminal_task_kind_required");
    }
    terminal = validateTaskReceipts(terminalTask);
    validateOpening(terminalTask, opening, terminal);
    validatePlanAndGroup(terminalTask, groupPlan, plan);
    validatedEvidence = validateEvidenceCorpus(
      evidenceCorpus,
      terminalTask.representative,
    );
  } catch (error) {
    return inputInvalid(terminalTask, opening, String(error?.message || error));
  }
  if (exactTerminalPaymentIncompatible(terminalTask.representative)) {
    return proposalFiltered(
      terminalTask,
      opening,
      "score_terminal_payment_partition_incompatible",
      {
        requestedResourcePartition:
          terminalTask.representative.coordinates?.resource || "",
        requestedCausalActionFamily:
          terminalTask.representative.canonicalTerminal?.causalActionFamily ||
            "",
        exactTerminalActionType: "end_turn",
        exactTerminalActionSpendsNativeResource: false,
        exactTerminalPaymentWitnessPossible: false,
        relationAuthority: "terminal_candidate_contract",
        hostRulesConclusion: false,
      },
    );
  }
  const transition = scoreTransitionForTask(
    evidenceCorpus,
    terminalTask.representative,
  );
  if (saturatedContestCandidate(terminalTask.representative)) {
    const evidence = saturatedContestEvidence(opening, transition);
    if (!transition || !evidence.everyScoringElementAllocated) {
      return inputInvalid(
        terminalTask,
        opening,
        "score_terminal_saturated_contest_contract_drift",
        evidence,
      );
    }
    return proposalFiltered(
      terminalTask,
      opening,
      "score_terminal_saturated_elements_contest_incompatible",
      evidence,
    );
  }
  if (highStakesZeroCountdownConflictCandidate(
    terminalTask.representative,
  )) {
    const winnerCounts = transition?.scoringGainClass
      ?.representativeWinnerCounts || {};
    const opponentCounts = transition?.scoringGainClass
      ?.representativeOpponentCounts || {};
    const evidence = stableGraphValue({
      requestedCountdownState:
        terminalTask.representative.coordinates?.highStakesCountdownState ||
          "",
      countdownElementCount: 3,
      requiredReducedNonzeroCount: 1,
      requiredAtFiveCount: 2,
      allowedAtZeroCount: 0,
      requestedZeroCountdown50mmBonusCount:
        Number(winnerCounts.zero_countdown_50mm_bonus || 0) +
        Number(opponentCounts.zero_countdown_50mm_bonus || 0),
      scoreTransitionKey: String(transition?.scoreTransitionKey || ""),
      relationAuthority: "terminal_candidate_contract",
      hostRulesConclusion: false,
    });
    if (!transition ||
        evidence.requestedZeroCountdown50mmBonusCount !== 1) {
      return inputInvalid(
        terminalTask,
        opening,
        "score_terminal_high_stakes_countdown_contract_drift",
        evidence,
      );
    }
    return proposalFiltered(
      terminalTask,
      opening,
      "score_terminal_high_stakes_zero_countdown_partition_incompatible",
      evidence,
    );
  }
  if (wolvesDeclinedThirdGoalConflictCandidate(
    terminalTask.representative,
  )) {
    const winnerCounts = transition?.scoringGainClass
      ?.representativeWinnerCounts || {};
    const opponentCounts = transition?.scoringGainClass
      ?.representativeOpponentCounts || {};
    const evidence = stableGraphValue({
      requestedTokenDecision:
        terminalTask.representative.coordinates?.wolvesTokenDecision || "",
      requestedProgressState:
        terminalTask.representative.coordinates?.wolvesProgressState || "",
      requestedThirdProgressTokenGoalCount:
        Number(winnerCounts.third_progress_token_goal || 0) +
        Number(opponentCounts.third_progress_token_goal || 0),
      declinedDecisionAddsProgressToken: false,
      thirdProgressTokenGoalRequiresAddedToken: true,
      scoreTransitionKey: String(transition?.scoreTransitionKey || ""),
      relationAuthority: "terminal_candidate_contract",
      hostRulesConclusion: false,
    });
    if (!transition || evidence.requestedThirdProgressTokenGoalCount !== 1) {
      return inputInvalid(
        terminalTask,
        opening,
        "score_terminal_wolves_third_goal_contract_drift",
        evidence,
      );
    }
    return proposalFiltered(
      terminalTask,
      opening,
      "score_terminal_wolves_declined_third_goal_incompatible",
      evidence,
    );
  }
  const exactWolves = exactSupportedCoordinates(terminalTask.representative);
  const exactMultiSource = exactMultiSourceCoordinates(
    terminalTask.representative,
  );
  if (!exactWolves && !exactMultiSource) {
    return {
      report: sealedReport(terminalTask, opening, {
        disposition: "budget_deferred",
        authority: "execution_coverage",
        reason: "score_terminal_partition_materializer_not_implemented",
      }, { partitionCoordinates: terminalTask.representative?.coordinates || {} }),
      runtime: null,
    };
  }
  if (!transition || (exactWolves
    ? !exactTransitionSupported(transition)
    : !exactMultiSourceTransitionSupported(transition))) {
    return proposalFiltered(
      terminalTask,
      opening,
      "score_terminal_exact_transition_not_supported_by_adapter",
      { transition },
    );
  }
  const hostRepresentative = mappedHostRepresentative(
    terminalTask,
    terminal,
    evidenceCorpus,
  );
  if (!hostRepresentative) {
    return inputInvalid(
      terminalTask,
      opening,
      "score_terminal_side_permuted_host_cell_missing",
    );
  }
  const predecessor = exactWolves
    ? buildPredecessor(
      opening,
      terminalTask.representative,
      terminal,
      transition,
    )
    : buildMultiSourcePredecessor(
      opening,
      terminalTask.representative,
      terminal,
      transition,
    );
  if (!predecessor.state) {
    return proposalFiltered(
      terminalTask,
      opening,
      predecessor.reason || "score_terminal_predecessor_geometry_missing",
      predecessor,
    );
  }
  const hostRoutingGroup = stableGraphValue({
    ...groupPlan,
    cellKeys: [hostRepresentative.cellKey],
    representativeKeys: [hostRepresentative.subcellKey],
    subjectRosterCandidates: [{
      sourceListKey: opening.subjectRosterKey,
    }],
    challengerRosterCandidates: [{
      sourceListKey: opening.challengerRosterKey,
    }],
  });
  let materialization;
  try {
    materialization = materializeWarmachineMatchupScoreTerminalRootV1({
      task: {
        taskHash: String(plan.receipts?.taskHash || plan.taskHash || ""),
      },
      opening,
      routingGroup: hostRoutingGroup,
      representative: hostRepresentative,
      predecessorState: predecessor.state,
      winnerTaskSideKey: terminal.winnerTaskSideKey,
      endingTaskSideKey: terminal.endingTaskSideKey,
      scenarioControlWitness: predecessor.scenarioControlWitness || {
        elementKey: predecessor.objective.objectiveKey,
        sideKey: terminal.winnerSideKey,
      },
      actionPatch: predecessor.actionPatch,
    });
  } catch (error) {
    return inputInvalid(terminalTask, opening, String(error?.message || error));
  }
  const disposition = String(materialization.disposition || "input_invalid");
  if (disposition !== "strict_materialized" ||
      materialization.matchupTerminalRootProven !== true ||
      materialization.runtimeRoot?.strictReplayCertified !== true) {
    return {
      report: sealedReport(terminalTask, opening, {
        disposition,
        authority: String(materialization.batch?.results?.[0]?.authority ||
          (disposition === "strict_rejected" ? "rules_v1_host" :
            "terminal_goal_contract")),
        reason: String(materialization.dispositionReason ||
          "score_terminal_host_materialization_not_proven"),
        strictRulesConclusion: disposition === "strict_rejected",
      }, {
        mappedHostRepresentative: hostRepresentative,
        underlyingMaterializationReportHash: materialization.reportHash,
        underlyingDisposition: disposition,
        underlyingMaterializationResult:
          materialization.batch?.results?.[0] || null,
      }),
      runtime: materialization.runtimeRoot
        ? { scoreMaterializationRoot: materialization.runtimeRoot }
        : null,
    };
  }
  const runtimeRoot = materialization.runtimeRoot;
  const mappingAudit = stableGraphValue({
    taskRepresentativeCellKey: terminalTask.representative.cellKey,
    taskRepresentativeSubcellKey: terminalTask.representative.subcellKey,
    hostRepresentativeCellKey: hostRepresentative.cellKey,
    hostRepresentativeSubcellKey: hostRepresentative.subcellKey,
    sidePermutationKey: terminalTask.sidePermutationKey,
    roleMapping: terminal,
    taskPartitionCoordinatesHash: stableGraphHash(
      terminalTask.representative.coordinates,
    ),
    hostPartitionCoordinatesHash: stableGraphHash(
      runtimeRoot.partitionCoordinates,
    ),
    exactPartitionMappingProven: stableGraphHash(
      terminalTask.representative.coordinates,
    ) === stableGraphHash(runtimeRoot.partitionCoordinates) &&
      runtimeRoot.cellKey === hostRepresentative.cellKey &&
      runtimeRoot.subcellKey === hostRepresentative.subcellKey,
    sourceTaskCellHash: stableGraphHash(validatedEvidence.cell),
  });
  if (!mappingAudit.exactPartitionMappingProven) {
    return proposalFiltered(
      terminalTask,
      opening,
      "score_terminal_side_permuted_partition_mapping_failed",
      mappingAudit,
    );
  }
  const root = stableGraphValue({
    taskKey: terminalTask.taskKey,
    taskRepresentativeSubcellKey: terminalTask.representative.subcellKey,
    hostRepresentativeSubcellKey: hostRepresentative.subcellKey,
    scenarioKey: runtimeRoot.scenarioKey,
    roundNumber: Number(terminalTask.representative.roundNumber),
    actionType: "end_turn",
    winnerSideKey: terminal.winnerSideKey,
    loserSideKey: terminal.loserSideKey,
    endingSideKey: terminal.endingSideKey,
    scoreBefore: runtimeRoot.scoreBefore,
    scoreAfter: runtimeRoot.scoreAfter,
    winnerSourceCounts: runtimeRoot.winnerSourceCounts,
    opponentSourceCounts: runtimeRoot.opponentSourceCounts,
    ...(exactWolves ? {
      objectiveKey: predecessor.objective.objectiveKey,
      objectiveProgressTokensBefore: predecessor.objective.progressTokens,
      wolvesDecision: predecessor.actionPatch.steamroller2026Decision.wolves,
    } : {
      scoringGeometry: predecessor.scoringGeometry,
      controlEvidence: predecessor.controlEvidence,
      reserveHistory: predecessor.reserveHistory,
      resourcePieceKey: predecessor.resourcePieceKey,
      payloadDecision:
        predecessor.actionPatch.steamroller2026Decision?.payload || null,
    }),
    partitionCoordinates: terminalTask.representative.coordinates,
    partitionAudit: runtimeRoot.partitionAudit,
    representativeMappingAudit: mappingAudit,
    completeRealRosterState: true,
    modelCount: predecessor.state.pieces.length,
    receiptHash: runtimeRoot.receiptHash,
    replayReceiptHash: runtimeRoot.replayReceiptHash,
    predecessorStateHash: runtimeRoot.predecessorStateHash,
    terminalStateHash: runtimeRoot.terminalStateHash,
    strictReplayCertified: true,
  });
  return {
    report: sealedReport(terminalTask, opening, {
      disposition: "strict_materialized",
      authority: "rules_v1_host",
      reason: exactWolves
        ? "score_terminal_wolves_threshold_strictly_materialized"
        : "score_terminal_multi_source_threshold_strictly_materialized",
      strictRulesConclusion: true,
    }, {
      root,
      underlyingMaterializationReportHash: materialization.reportHash,
    }),
    runtime: {
      predecessorState: predecessor.state,
      placementAudit: predecessor.placementAudit,
      formationAudit: predecessor.formationAudit,
      objectiveControl: predecessor.objectiveControl || null,
      controlEvidence: predecessor.controlEvidence || [],
      scoringGeometry: predecessor.scoringGeometry,
      leaderGeometry: predecessor.leaderGeometry,
      scoreMaterializationRoot: runtimeRoot,
    },
  };
}

export function warmachineMatchupScoreTerminalTaskSupportedV1(
  terminalTask = {},
) {
  return terminalTask.representative?.terminalClassKey === TERMINAL_CLASS &&
    terminalTask.executionEnvelope?.actionCategory === ACTION_CATEGORY &&
    (exactSupportedCoordinates(terminalTask.representative) ||
      exactMultiSourceCoordinates(terminalTask.representative) ||
      exactTerminalPaymentIncompatible(terminalTask.representative) ||
      saturatedContestCandidate(terminalTask.representative) ||
      highStakesZeroCountdownConflictCandidate(
        terminalTask.representative,
      ) || wolvesDeclinedThirdGoalConflictCandidate(
        terminalTask.representative,
      ));
}

export function buildWarmachineMatchupScoreTerminalTaskAdapterV1() {
  return Object.freeze({
    supports: ({ terminalTask } = {}) =>
      warmachineMatchupScoreTerminalTaskSupportedV1(terminalTask),
    materialize: materializeWarmachineMatchupScoreTerminalTaskV1,
  });
}
