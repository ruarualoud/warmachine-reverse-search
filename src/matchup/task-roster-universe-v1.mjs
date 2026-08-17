import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import {
  buildWarmachineFiniteRosterProposalLedgerV2,
  buildWarmachineRosterPoolSourceEvidenceV2,
} from "../construction/nested-roster-deployment-v2.mjs";

export const WARMACHINE_TASK_ROSTER_UNIVERSE_V1_SCHEMA =
  "warmachine_task_roster_universe_v1";

function baseEntryName(value = "") {
  return String(value).replace(/\s+#\d+$/i, "").trim();
}

function entryCopyNumber(value = "") {
  const match = String(value).match(/\s+#(\d+)$/i);
  return match ? Math.max(1, Number.parseInt(match[1], 10) || 1) : 1;
}

function entryMatchesConstraint(entry = {}, constraint = {}) {
  if (constraint.cardId && String(entry.cardId || "") === constraint.cardId) return true;
  return Boolean(
    constraint.cardName && baseEntryName(entry.name || entry.cardName) === constraint.cardName,
  );
}

function leaderAllowed(list = {}, side = {}) {
  if (side.leaderMode === "all_in_army") return true;
  return side.leaderNames.includes(String(list.leader || "")) ||
    side.leaderIds.includes(String(list.leaderId || ""));
}

function armyAllowed(list = {}, side = {}) {
  const armyId = String(list.armyId || "");
  const armyName = String(list.army || list.armyName || "");
  if (side.armyMode === "all_in_faction") return true;
  return side.armyIds.includes(armyId) || side.armyNames.includes(armyName) ||
    (side.armyId && side.armyId === armyId) ||
    (side.armyName && side.armyName === armyName);
}

function optionSelectionsMatch(left = {}, right = {}) {
  return stableGraphHash(left || {}) === stableGraphHash(right || {});
}

function entryMatchesLoadoutConstraint(entry = {}, constraint = {}) {
  if ((constraint.allowedLoadouts || []).length &&
      !(constraint.allowedLoadouts || []).some((loadout) =>
        optionSelectionsMatch(entry.optionSelections, loadout.optionSelections))) {
    return false;
  }
  for (const [slotKey, choiceIds] of Object.entries(
    constraint.allowedChoiceIdsBySlot || {},
  )) {
    if (choiceIds.length && !(entry.optionSelections?.[slotKey] || []).every((choiceId) =>
      choiceIds.includes(choiceId))) return false;
  }
  for (const [slotKey, choiceIds] of Object.entries(
    constraint.excludedChoiceIdsBySlot || {},
  )) {
    if ((entry.optionSelections?.[slotKey] || []).some((choiceId) =>
      choiceIds.includes(choiceId))) return false;
  }
  return true;
}

function rosterTaskIssues(list = {}, side = {}, expectedPoints = 100) {
  const issues = [];
  if (Number(list.totalPoints) !== Number(expectedPoints)) issues.push("point_limit_mismatch");
  if (!armyAllowed(list, side)) {
    issues.push("army_name_mismatch");
  }
  const declaredFactionName = String(list.faction || list.factionName || "");
  if (side.factionName && declaredFactionName && declaredFactionName !== side.factionName) {
    issues.push("faction_name_mismatch");
  }
  if (!leaderAllowed(list, side)) issues.push("leader_constraint_mismatch");
  const entries = list.entries || [];
  for (const constraint of side.requiredCards || []) {
    const matching = entries.filter((entry) => entryMatchesConstraint(entry, constraint));
    if (matching.length < constraint.minimumCount) {
      issues.push(`required_card_below_minimum:${constraint.cardId || constraint.cardName}`);
    }
    if (constraint.maximumCount != null && matching.length > constraint.maximumCount) {
      issues.push(`required_card_above_maximum:${constraint.cardId || constraint.cardName}`);
    }
    if (constraint.attachmentTargetCardId || constraint.attachmentTargetCardName) {
      const attached = matching.filter((entry) =>
        (constraint.attachmentTargetCardId &&
          String(entry.attachedToCardId || "") === constraint.attachmentTargetCardId) ||
        (constraint.attachmentTargetCardName &&
          baseEntryName(entry.attachedTo) === constraint.attachmentTargetCardName));
      if (attached.length !== matching.length) {
        issues.push(`required_attachment_target_mismatch:${constraint.cardId || constraint.cardName}`);
      }
      for (const [index, copyNumber] of
        (constraint.attachmentTargetCopyNumbers || []).entries()) {
        if (!matching[index] || entryCopyNumber(matching[index].attachedTo) !== copyNumber) {
          issues.push(`required_attachment_target_copy_mismatch:${
            constraint.cardId || constraint.cardName}:${index + 1}`);
        }
      }
    }
    if (constraint.battlegroupControllerCardId || constraint.battlegroupControllerCardName) {
      const assigned = matching.filter((entry) =>
        (constraint.battlegroupControllerCardId &&
          String(entry.battlegroupControllerCardId || "") ===
            constraint.battlegroupControllerCardId) ||
        (constraint.battlegroupControllerCardName &&
          baseEntryName(entry.battlegroupController) ===
            constraint.battlegroupControllerCardName));
      if (assigned.length !== matching.length) {
        issues.push(`required_battlegroup_controller_mismatch:${
          constraint.cardId || constraint.cardName}`);
      }
      for (const [index, copyNumber] of
        (constraint.battlegroupControllerCopyNumbers || []).entries()) {
        if (!matching[index] ||
            entryCopyNumber(matching[index].battlegroupController) !== copyNumber) {
          issues.push(`required_battlegroup_controller_copy_mismatch:${
            constraint.cardId || constraint.cardName}:${index + 1}`);
        }
      }
    }
    for (const [index, loadout] of (constraint.loadouts || []).entries()) {
      if (!matching[index] || !optionSelectionsMatch(
        matching[index].optionSelections,
        loadout.optionSelections,
      )) {
        issues.push(`required_card_loadout_mismatch:${
          constraint.cardId || constraint.cardName}:${index + 1}`);
      }
    }
    if (!(constraint.loadouts || []).length &&
        Object.keys(constraint.optionSelections || {}).length &&
        matching.some((entry) => !optionSelectionsMatch(
          entry.optionSelections,
          constraint.optionSelections,
        ))) {
      issues.push(`required_card_loadout_mismatch:${constraint.cardId || constraint.cardName}`);
    }
  }
  if ((side.excludedCardIds || []).some((cardId) =>
    entries.some((entry) => String(entry.cardId || "") === cardId))) {
    issues.push("excluded_card_present");
  }
  if ((side.excludedCardNames || []).some((cardName) =>
    entries.some((entry) => baseEntryName(entry.name || entry.cardName) === cardName))) {
    issues.push("excluded_card_present");
  }
  if ((side.excludedCardTypeNames || []).some((cardTypeName) =>
    entries.some((entry) => String(entry.cardTypeName || "") === cardTypeName))) {
    issues.push("excluded_card_type_present");
  }
  for (const constraint of side.loadoutConstraints || []) {
    const matching = entries.filter((entry) => entryMatchesConstraint(entry, constraint));
    if (matching.some((entry) => !entryMatchesLoadoutConstraint(entry, constraint))) {
      issues.push(`loadout_constraint_mismatch:${constraint.cardId || constraint.cardName}`);
    }
  }
  if (side.rosterMode === "fixed_complete") {
    const unexpected = entries.filter((entry) =>
      !/warcaster|warlock/i.test(String(entry.cardTypeName || "")) &&
      entry.autoAddedCompanion !== true &&
      !(side.requiredCards || []).some((constraint) =>
        entryMatchesConstraint(entry, constraint)));
    if (unexpected.length) issues.push("fixed_complete_unexpected_card_present");
  }
  return [...new Set(issues)].sort();
}

function compactRoster(row = {}) {
  const list = row.list || row;
  return {
    rosterKey: String(row.canonicalRosterKey || list.key || ""),
    sourceListKey: String(list.key || ""),
    leaderId: String(list.leaderId || ""),
    leaderName: String(list.leader || ""),
    armyId: String(list.armyId || ""),
    armyName: String(list.army || list.armyName || ""),
    factionName: String(list.faction || list.factionName || ""),
    totalPoints: Number(list.totalPoints),
    physicalModelCount: Number(list.physicalModels || 0),
    featureBucket: String(list.featureBucket || ""),
    features: stableGraphValue(list.features || {}),
    constructionGoalScores: stableGraphValue(list.constructionGoalScores || {}),
    constructionGoalProfileCoverageKeys: [
      ...(list.constructionGoalProfileCoverageKeys || []),
    ].map(String).sort(),
    screeningScore: Number(list.screeningScore || 0),
    sourceAliasCount: Number(row.sourceAliasCount || 1),
    sourceProposalMass: Number(row.sourceProposalMass || 0),
    exportText: String(list.exportText || ""),
    entries: (list.entries || []).map((entry) => ({
      name: String(entry.name || ""),
      cardId: String(entry.cardId || ""),
      cardTypeName: String(entry.cardTypeName || ""),
      linePoints: Number(entry.linePoints || 0),
      physicalModels: Number(entry.physicalModels || 0),
      options: String(entry.options || ""),
      optionSelections: stableGraphValue(entry.optionSelections || {}),
      attachedTo: String(entry.attachedTo || ""),
      attachedToCardId: String(entry.attachedToCardId || ""),
      battlegroupController: String(entry.battlegroupController || ""),
      battlegroupControllerCardId: String(entry.battlegroupControllerCardId || ""),
      autoAddedCompanion: entry.autoAddedCompanion === true,
    })),
  };
}

function leaderCoverage(rosters = []) {
  return Object.entries(rosters.reduce((counts, roster) => {
    counts[roster.leaderName] = (counts[roster.leaderName] || 0) + 1;
    return counts;
  }, {})).map(([leaderName, rosterCount]) => ({ leaderName, rosterCount }))
    .sort((left, right) => left.leaderName.localeCompare(right.leaderName));
}

function compileSide(task = {}, taskSideKey = "subject", pool = {}) {
  const side = task.sides[taskSideKey];
  const sourceLists = pool.lists || [];
  const acceptedSourceLists = [];
  const taskRejected = [];
  for (const [sourceIndex, list] of sourceLists.entries()) {
    const issues = rosterTaskIssues(list, side, task.format.pointLimit);
    if (issues.length) {
      taskRejected.push({
        sourceIndex,
        sourceListKey: String(list.key || `source-${sourceIndex}`),
        leaderName: String(list.leader || ""),
        issues,
      });
    } else {
      acceptedSourceLists.push(list);
    }
  }
  const sourceEvidence = buildWarmachineRosterPoolSourceEvidenceV2(
    acceptedSourceLists,
    {
      sourceContentHash: pool.sourceContentHash,
      sourceSchemaVersion: pool.sourceSchemaVersion,
      exactListLegality: pool.exactListLegality === true,
      forceBuilderContract: pool.forceBuilderContract,
      remoteVersion: pool.remoteVersion,
      exhaustiveAllFactionRosters: pool.exhaustiveAllFactionRosters === true,
    },
  );
  const ledger = buildWarmachineFiniteRosterProposalLedgerV2(
    acceptedSourceLists,
    taskSideKey,
    {
      expectedPoints: task.format.pointLimit,
      maximumSelectedUniqueRosters: Math.max(1, acceptedSourceLists.length),
      seed: `${task.taskHash}:${taskSideKey}`,
      sourceEvidence,
    },
  );
  const rosters = ledger.selected.map(compactRoster);
  const sourceCount = sourceLists.length;
  const core = {
    taskSideKey,
    poolKey: pool.poolKey,
    sourceContentHash: pool.sourceContentHash,
    remoteVersion: pool.remoteVersion,
    sourceProposalCount: sourceCount,
    taskConstraintAcceptedCount: acceptedSourceLists.length,
    taskConstraintRejectedCount: taskRejected.length,
    exactLegalUniqueRosterCount: rosters.length,
    taskConstraintRejectedMass: sourceCount ? taskRejected.length / sourceCount : 0,
    exactLegalSourceMass: sourceCount ? acceptedSourceLists.length / sourceCount : 0,
    leaderCoverage: leaderCoverage(rosters),
    rosterMode: side.rosterMode,
    searchScope: side.rosterMode === "fixed_complete"
      ? "deployment_and_routes_only"
      : "roster_deployment_and_routes",
    sourceEvidence,
    finiteLedger: ledger,
    rosters,
    taskRejected,
  };
  return { ...core, sideUniverseHash: stableGraphHash(core) };
}

export function compileWarmachineTaskRosterUniverseV1(raw = {}) {
  const task = raw.task || {};
  if (task.validation?.ok !== true) {
    throw new Error(`custom_matchup_task_invalid:${(task.validation?.issues || []).join(",")}`);
  }
  const poolsByKey = raw.poolsByKey || {};
  for (const taskSideKey of ["subject", "challenger"]) {
    const poolKey = task.sides[taskSideKey].sourcePoolKey;
    if (!poolsByKey[poolKey]) throw new Error(`task_roster_pool_missing:${poolKey}`);
    if (poolsByKey[poolKey].poolKey !== poolKey) {
      throw new Error(`task_roster_pool_identity_mismatch:${poolKey}`);
    }
  }
  const sides = {
    subject: compileSide(
      task,
      "subject",
      poolsByKey[task.sides.subject.sourcePoolKey],
    ),
    challenger: compileSide(
      task,
      "challenger",
      poolsByKey[task.sides.challenger.sourcePoolKey],
    ),
  };
  const core = {
    schemaVersion: WARMACHINE_TASK_ROSTER_UNIVERSE_V1_SCHEMA,
    taskKey: task.taskKey,
    taskHash: task.taskHash,
    sides,
    rosterPairCount: String(
      BigInt(sides.subject.rosters.length) * BigInt(sides.challenger.rosters.length),
    ),
    exactListLegality: [sides.subject, sides.challenger].every((side) =>
      side.finiteLedger.counts.sourceInvalidProposalCount === 0),
    exhaustiveAllLegalRosters: [sides.subject, sides.challenger].every((side) =>
      side.sourceEvidence.exhaustiveAllFactionRosters === true),
    naturalRosterDistributionClaimed: false,
    globalOptimalityProven: false,
    claimBoundary: "Task constraints are rechecked over content-bound Force Builder proposal pools. Accepted rosters are exact legal members of those finite pools; the pool is not an exhaustive or naturally distributed set of every legal army list unless its source evidence explicitly proves that stronger claim.",
  };
  return { ...stableGraphValue(core), universeHash: stableGraphHash(core) };
}
