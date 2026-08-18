import { buildWarmachineRosterPointLedger } from
  "../construction/roster-investment-v1.mjs";
import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { warmachineConstructionHost } from
  "../warmachine-construction-host-runtime.mjs";
import { warmachineHost } from "../warmachine-host-runtime.mjs";

export const WARMACHINE_MATCHUP_TERMINAL_PARTITION_CAPABILITY_AUDIT_V1_SCHEMA =
  "warmachine_matchup_terminal_partition_capability_audit_v1";

const PLAN_SCHEMA = "warmachine_matchup_terminal_root_batch_plan_v1";
const OPENING_REPORT_SCHEMA =
  "warmachine_matchup_terminal_root_opening_batch_v1";
const OPENING_RUNTIME_SCHEMA =
  "warmachine_matchup_terminal_root_opening_batch_runtime_v1";

const CAPABILITY_BY_DAMAGE_PARTITION = Object.freeze({
  warjack_system_disabled: Object.freeze({
    capabilityKey: "warjack",
    cardTypeName: "Warjack",
    pieceFlag: "isWarjack",
  }),
  warbeast_aspect_disabled: Object.freeze({
    capabilityKey: "warbeast",
    cardTypeName: "Warbeast",
    pieceFlag: "isWarbeast",
  }),
});

function capabilityRequirementForTask(terminalTask = {}) {
  const coordinates = terminalTask.representative?.coordinates || {};
  const damage = String(coordinates.damage || "");
  if (CAPABILITY_BY_DAMAGE_PARTITION[damage]) {
    return {
      partitionAxis: "damage",
      partitionValue: damage,
      requirementKind: "structured_model_type",
      ...CAPABILITY_BY_DAMAGE_PARTITION[damage],
    };
  }
  if (terminalTask.representative?.scenarioKey === "payload" &&
      coordinates.leaderControl === "on_boundary") {
    return {
      partitionAxis: "leaderControl",
      partitionValue: "on_boundary",
      requirementKind: "ending_side_controlled_cohort",
      capabilityKey: "ending_side_controller_with_controlled_cohort",
      cardTypeName: "",
      pieceFlag: "controllerPieceKey",
    };
  }
  return null;
}

export function warmachineMatchupTerminalPartitionCapabilityAuditRequiredV1(
  terminalTask = {},
) {
  return capabilityRequirementForTask(terminalTask) !== null;
}

function fail(code, detail = "") {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function assertSealed(artifact = {}, hashField = "", code = "") {
  const core = { ...artifact };
  const declaredHash = String(core[hashField] || "");
  delete core[hashField];
  if (!declaredHash || stableGraphHash(core) !== declaredHash) fail(code);
}

function assertCurrentReceipts(artifact = {}, prefix = "") {
  if (String(artifact.hostReceiptHash || "") !==
      warmachineHost.receipt.receiptHash) {
    fail(`${prefix}_host_receipt_drift`);
  }
  if (String(artifact.constructionHostReceiptHash || "") !==
      warmachineConstructionHost.receipt.receiptHash) {
    fail(`${prefix}_construction_host_receipt_drift`);
  }
}

function assertPlan(plan = {}) {
  if (plan.schemaVersion !== PLAN_SCHEMA) {
    fail("terminal_partition_capability_plan_schema_invalid");
  }
  assertSealed(
    plan,
    "planHash",
    "terminal_partition_capability_plan_hash_invalid",
  );
  assertCurrentReceipts(
    {
      hostReceiptHash: plan.receipts?.hostReceiptHash,
      constructionHostReceiptHash:
        plan.receipts?.constructionHostReceiptHash,
    },
    "terminal_partition_capability_plan",
  );
  if (!String(plan.receipts?.taskHash || "") ||
      !Array.isArray(plan.selectedTasks)) {
    fail("terminal_partition_capability_plan_contract_invalid");
  }
}

function assertOpeningArtifacts(plan = {}, report = {}, runtime = {}) {
  if (report.schemaVersion !== OPENING_REPORT_SCHEMA ||
      runtime.schemaVersion !== OPENING_RUNTIME_SCHEMA) {
    fail("terminal_partition_capability_opening_schema_invalid");
  }
  assertSealed(
    report,
    "reportHash",
    "terminal_partition_capability_opening_report_hash_invalid",
  );
  assertSealed(
    runtime,
    "runtimeHash",
    "terminal_partition_capability_opening_runtime_hash_invalid",
  );
  assertCurrentReceipts(report, "terminal_partition_capability_opening_report");
  assertCurrentReceipts(runtime, "terminal_partition_capability_opening_runtime");
  if (String(report.planHash || "") !== String(plan.planHash || "") ||
      String(runtime.planHash || "") !== String(plan.planHash || "") ||
      String(runtime.reportHash || "") !== String(report.reportHash || "") ||
      String(report.taskHash || "") !== String(plan.receipts.taskHash || "") ||
      String(runtime.taskHash || "") !== String(plan.receipts.taskHash || "") ||
      !Array.isArray(report.taskLedger) || !Array.isArray(runtime.openings)) {
    fail("terminal_partition_capability_opening_artifact_binding_mismatch");
  }
}

function taskByKey(plan = {}, taskKey = "") {
  const rows = (plan.selectedTasks || []).filter((task) =>
    String(task.taskKey || "") === taskKey);
  if (rows.length !== 1) {
    fail("terminal_partition_capability_task_membership_invalid", taskKey);
  }
  const terminalTask = rows[0];
  const envelope = terminalTask.executionEnvelope || {};
  assertSealed(
    envelope,
    "executionEnvelopeHash",
    "terminal_partition_capability_execution_envelope_hash_invalid",
  );
  const required = capabilityRequirementForTask(terminalTask);
  if (!required) {
    fail(
      "terminal_partition_capability_partition_unsupported",
      "missing",
    );
  }
  const partitionValue = required.partitionValue;
  if (required.partitionAxis === "damage" &&
      !(envelope.healthAndSystemAxis || []).includes(partitionValue)) {
    fail("terminal_partition_capability_envelope_partition_mismatch");
  }
  if (required.partitionAxis === "leaderControl" &&
      String(envelope.positionAxis?.leaderControl || "") !== partitionValue) {
    fail("terminal_partition_capability_envelope_partition_mismatch");
  }
  const sourceRosterKeys = envelope.sourceRosterKeys || {};
  if (!String(sourceRosterKeys.subject || "") ||
      !String(sourceRosterKeys.challenger || "")) {
    fail("terminal_partition_capability_source_roster_keys_missing");
  }
  return { terminalTask, partitionValue, required };
}

function exactOpeningForTask(
  terminalTask = {},
  report = {},
  runtime = {},
) {
  const ledgers = (report.taskLedger || []).filter((row) =>
    String(row.terminalTaskKey || "") === terminalTask.taskKey);
  if (ledgers.length !== 1 ||
      ledgers[0].disposition !== "strict_opening_materialized") {
    fail("terminal_partition_capability_task_opening_ledger_invalid");
  }
  const taskLedger = ledgers[0];
  const openings = (runtime.openings || []).filter((opening) =>
    String(opening.openingKey || "") === String(taskLedger.openingKey || ""));
  if (openings.length !== 1) {
    fail("terminal_partition_capability_exact_opening_missing");
  }
  const opening = openings[0];
  const envelope = terminalTask.executionEnvelope || {};
  const checks = [
    [opening.disposition, "strict_opening_materialized"],
    [opening.strictOpeningStateHash, taskLedger.strictOpeningStateHash],
    [opening.strictDeploymentReceiptHash,
      taskLedger.strictDeploymentReceiptHash],
    [opening.scenarioBindingHash, taskLedger.scenarioBindingHash],
    [opening.subjectRosterKey, envelope.sourceRosterKeys?.subject],
    [opening.challengerRosterKey, envelope.sourceRosterKeys?.challenger],
    [opening.scenarioKey, terminalTask.representative?.scenarioKey],
    [opening.mapKey, terminalTask.mapKey],
    [opening.deploymentSeedKey, terminalTask.deploymentSeedKey],
    [opening.firstPlayerTaskSideKey, terminalTask.firstPlayerTaskSideKey],
  ];
  if (checks.some(([actual, expected]) => String(actual || "") !==
      String(expected || ""))) {
    fail("terminal_partition_capability_task_opening_binding_mismatch");
  }
  if (!opening.state || !Array.isArray(opening.state.pieces) ||
      Number(opening.modelCount) !== opening.state.pieces.length ||
      stableGraphHash(opening.state) !== opening.strictOpeningStateHash) {
    fail("terminal_partition_capability_opening_state_hash_invalid");
  }
  return { taskLedger, opening };
}

function validateActorEnvelope(terminalTask = {}, ledger = {}) {
  const actorAxis = terminalTask.executionEnvelope?.actorAxis;
  if (!actorAxis) return [];
  const candidates = actorAxis.candidates || [];
  if (!Array.isArray(candidates) ||
      Number(actorAxis.candidateCount) !== candidates.length) {
    fail("terminal_partition_capability_actor_axis_count_invalid");
  }
  const sideKey = actorAxis.taskSideKey === "subject"
    ? "player1"
    : actorAxis.taskSideKey === "challenger" ? "player2" : "";
  if (!sideKey) fail("terminal_partition_capability_actor_side_invalid");
  const available = ledger.sides?.[sideKey]?.entries || [];
  const evidence = candidates.map((candidate) => {
    const cardId = String(candidate.cardId || "");
    const cardTypeName = String(candidate.cardTypeName || "");
    const entryId = String(candidate.entryId || "");
    if (!cardId || !cardTypeName || !entryId) {
      fail("terminal_partition_capability_actor_identity_incomplete");
    }
    const matches = available.filter((entry) =>
      String(entry.cardId || "") === cardId &&
      String(entry.cardTypeName || "") === cardTypeName);
    if (!matches.length) {
      fail("terminal_partition_capability_actor_not_in_exact_roster", entryId);
    }
    return stableGraphValue({
      taskSideKey: actorAxis.taskSideKey,
      sideKey,
      entryId,
      cardId,
      cardTypeName,
      matchingRosterEntryKeys: matches.map((entry) => entry.entryKey).sort(),
    });
  });
  return evidence.sort((left, right) =>
    left.entryId.localeCompare(right.entryId));
}

function validateRosterLedger(opening = {}) {
  const ledger = opening.rosterPointLedger || {};
  if (ledger.schemaVersion !== "warmachine_roster_point_ledger_v1" ||
      ledger.pointAccountingComplete !== true) {
    fail("terminal_partition_capability_roster_ledger_incomplete");
  }
  const sideKeys = Object.keys(ledger.sides || {}).sort();
  if (stableGraphHash(sideKeys) !== stableGraphHash(["player1", "player2"])) {
    fail("terminal_partition_capability_roster_sides_invalid");
  }
  const completeArmyPointsBySide = {};
  for (const sideKey of sideKeys) {
    const side = ledger.sides[sideKey] || {};
    if (side.sideKey !== sideKey || side.pointAccountingComplete !== true ||
        !Array.isArray(side.entries) ||
        Number(side.entryCount) !== side.entries.length ||
        !Array.isArray(side.unresolvedEntries) ||
        side.unresolvedEntries.length !== 0) {
      fail("terminal_partition_capability_roster_side_incomplete", sideKey);
    }
    completeArmyPointsBySide[sideKey] = side.referenceCompleteArmyPoints;
  }
  const rebuilt = buildWarmachineRosterPointLedger(opening.state, {
    completeArmyPointsBySide,
  });
  if (stableGraphHash(rebuilt) !== stableGraphHash(ledger)) {
    fail("terminal_partition_capability_roster_ledger_state_mismatch");
  }
  return ledger;
}

function structuredRosterInventory(opening = {}, ledger = {}) {
  const pieceByKey = new Map((opening.state.pieces || []).map((piece) => [
    String(piece.pieceKey || ""),
    piece,
  ]));
  const inventory = [];
  const coveredPieceKeys = [];
  for (const sideKey of ["player1", "player2"]) {
    for (const entry of ledger.sides[sideKey].entries || []) {
      const cardId = String(entry.cardId || "");
      const cardTypeName = String(entry.cardTypeName || "");
      const entryKey = String(entry.entryKey || "");
      const instanceKey = String(entry.instanceKey || "");
      const pieceKeys = (entry.pieceKeys || []).map(String).sort();
      if (!cardId || !cardTypeName || !entryKey || !instanceKey ||
          !pieceKeys.length) {
        fail("terminal_partition_capability_roster_entry_identity_incomplete");
      }
      const pieces = pieceKeys.map((pieceKey) => {
        const piece = pieceByKey.get(pieceKey);
        if (!piece || String(piece.sideKey || "") !== sideKey ||
            String(piece.cardId || piece.cardSnapshot?.id || "") !== cardId ||
            String(piece.cardTypeName ||
              piece.cardSnapshot?.cardTypeName || "") !== cardTypeName) {
          fail("terminal_partition_capability_piece_card_binding_mismatch", pieceKey);
        }
        coveredPieceKeys.push(pieceKey);
        return piece;
      });
      inventory.push({
        sideKey,
        entryKey,
        instanceKey,
        cardId,
        cardTypeName,
        pieceKeys,
        pieces,
      });
    }
  }
  const allPieceKeys = [...pieceByKey.keys()].sort();
  const uniqueCovered = [...new Set(coveredPieceKeys)].sort();
  if (coveredPieceKeys.length !== uniqueCovered.length ||
      stableGraphHash(uniqueCovered) !== stableGraphHash(allPieceKeys)) {
    fail("terminal_partition_capability_roster_piece_coverage_mismatch");
  }
  return inventory.sort((left, right) =>
    left.sideKey.localeCompare(right.sideKey) ||
    left.entryKey.localeCompare(right.entryKey));
}

function matchingIdentities(inventory = [], required = {}) {
  const matchingCards = [];
  const matchingPieces = [];
  for (const entry of inventory) {
    const typeMatch = entry.cardTypeName === required.cardTypeName;
    const flaggedPieces = entry.pieces.filter((piece) =>
      piece[required.pieceFlag] === true);
    const contradictoryPieces = entry.pieces.filter((piece) =>
      piece[required.pieceFlag] !== typeMatch);
    if (contradictoryPieces.length) {
      fail(
        "terminal_partition_capability_structured_type_conflict",
        contradictoryPieces.map((piece) => piece.pieceKey).sort().join(","),
      );
    }
    if (!typeMatch) continue;
    matchingCards.push(stableGraphValue({
      sideKey: entry.sideKey,
      entryKey: entry.entryKey,
      instanceKey: entry.instanceKey,
      cardId: entry.cardId,
      cardTypeName: entry.cardTypeName,
      pieceKeys: entry.pieceKeys,
    }));
    matchingPieces.push(...flaggedPieces.map((piece) => stableGraphValue({
      sideKey: entry.sideKey,
      pieceKey: String(piece.pieceKey || ""),
      cardId: entry.cardId,
      cardTypeName: entry.cardTypeName,
      structuredCapabilityFlag: required.pieceFlag,
      structuredCapabilityFlagValue: true,
    })));
  }
  return {
    matchingCards: matchingCards.sort((left, right) =>
      left.sideKey.localeCompare(right.sideKey) ||
      left.entryKey.localeCompare(right.entryKey)),
    matchingPieces: matchingPieces.sort((left, right) =>
      left.sideKey.localeCompare(right.sideKey) ||
      left.pieceKey.localeCompare(right.pieceKey)),
  };
}

function endingSideControlledCohortIdentities(
  inventory = [],
  terminalTask = {},
) {
  const endingTaskSideKey = String(
    terminalTask.executionEnvelope?.sideBinding?.endingTaskSideKey || "",
  );
  const endingSideKey = endingTaskSideKey === "subject"
    ? "player1" : endingTaskSideKey === "challenger" ? "player2" : "";
  if (!endingSideKey) {
    fail("terminal_partition_capability_ending_side_binding_invalid");
  }
  const entriesByPieceKey = new Map();
  const pieces = [];
  for (const entry of inventory) {
    for (const piece of entry.pieces || []) {
      entriesByPieceKey.set(String(piece.pieceKey || ""), entry);
      pieces.push(piece);
    }
  }
  const controllers = pieces.filter((piece) =>
    piece.sideKey === endingSideKey &&
    (piece.isWarcaster === true || piece.isWarlock === true ||
      piece.isLeader === true) && Number(piece.controlRangeIn || 0) > 0);
  const relations = [];
  for (const controller of controllers) {
    for (const cohort of pieces) {
      if (cohort.sideKey !== endingSideKey ||
          String(cohort.controllerPieceKey || cohort.controllerKey || "") !==
            String(controller.pieceKey || "")) continue;
      relations.push(stableGraphValue({
        endingTaskSideKey,
        endingSideKey,
        controllerPieceKey: String(controller.pieceKey || ""),
        controllerCardId: String(controller.cardId ||
          controller.cardSnapshot?.id || ""),
        controlRangeIn: Number(controller.controlRangeIn || 0),
        cohortPieceKey: String(cohort.pieceKey || ""),
        cohortCardId: String(cohort.cardId || cohort.cardSnapshot?.id || ""),
        cohortControllerPieceKey: String(
          cohort.controllerPieceKey || cohort.controllerKey || "",
        ),
      }));
    }
  }
  const involvedPieceKeys = [...new Set(relations.flatMap((relation) => [
    relation.controllerPieceKey,
    relation.cohortPieceKey,
  ]))].sort();
  const involvedEntries = [...new Map(involvedPieceKeys.map((pieceKey) => {
    const entry = entriesByPieceKey.get(pieceKey);
    return [entry?.entryKey || pieceKey, entry];
  }).filter(([, entry]) => entry)).values()];
  return {
    matchingCards: involvedEntries.map((entry) => stableGraphValue({
      sideKey: entry.sideKey,
      entryKey: entry.entryKey,
      instanceKey: entry.instanceKey,
      cardId: entry.cardId,
      cardTypeName: entry.cardTypeName,
      pieceKeys: entry.pieceKeys,
    })).sort((left, right) => left.entryKey.localeCompare(right.entryKey)),
    matchingPieces: involvedPieceKeys.map((pieceKey) => {
      const piece = pieces.find((candidate) => candidate.pieceKey === pieceKey);
      return stableGraphValue({
        sideKey: endingSideKey,
        pieceKey,
        cardId: String(piece?.cardId || piece?.cardSnapshot?.id || ""),
        cardTypeName: String(piece?.cardTypeName ||
          piece?.cardSnapshot?.cardTypeName || ""),
        structuredCapabilityFlag: "controllerPieceKey_relation",
        structuredCapabilityFlagValue: true,
      });
    }),
    relationEvidence: relations.sort((left, right) =>
      left.controllerPieceKey.localeCompare(right.controllerPieceKey) ||
      left.cohortPieceKey.localeCompare(right.cohortPieceKey)),
  };
}

export function auditWarmachineMatchupTerminalPartitionCapabilityV1(raw = {}) {
  const plan = raw.plan || {};
  const openingReport = raw.openingReport || {};
  const openingRuntime = raw.openingRuntime || {};
  const taskKey = String(raw.taskKey || "");
  const artifactsPrevalidatedByBatch = raw.artifactsPrevalidatedByBatch === true;
  if (!taskKey) fail("terminal_partition_capability_task_key_required");
  if (artifactsPrevalidatedByBatch) {
    // The batch executor has already verified the full sealed plan and opening
    // artifacts before leasing this task. Preserve receipt and identity checks
    // here, but avoid rebuilding their large canonical graphs per task.
    if (plan.schemaVersion !== PLAN_SCHEMA ||
        openingReport.schemaVersion !== OPENING_REPORT_SCHEMA ||
        openingRuntime.schemaVersion !== OPENING_RUNTIME_SCHEMA ||
        String(openingReport.planHash || "") !== String(plan.planHash || "") ||
        String(openingRuntime.planHash || "") !== String(plan.planHash || "") ||
        String(openingRuntime.reportHash || "") !== String(openingReport.reportHash || "")) {
      fail("terminal_partition_capability_batch_prevalidation_identity_invalid");
    }
    assertCurrentReceipts(plan.receipts || {}, "terminal_partition_capability_plan");
    assertCurrentReceipts(openingReport, "terminal_partition_capability_opening_report");
    assertCurrentReceipts(openingRuntime, "terminal_partition_capability_opening_runtime");
  } else {
    assertPlan(plan);
    assertOpeningArtifacts(plan, openingReport, openingRuntime);
  }
  const { terminalTask, partitionValue, required } = taskByKey(plan, taskKey);
  const { taskLedger, opening } = exactOpeningForTask(
    terminalTask,
    openingReport,
    openingRuntime,
  );
  const ledger = validateRosterLedger(opening);
  const inventory = structuredRosterInventory(opening, ledger);
  const actorEnvelopeEvidence = validateActorEnvelope(terminalTask, ledger);
  const matches = required.requirementKind === "ending_side_controlled_cohort"
    ? endingSideControlledCohortIdentities(inventory, terminalTask)
    : { ...matchingIdentities(inventory, required), relationEvidence: [] };
  const { matchingCards, matchingPieces, relationEvidence } = matches;
  const supported = required.requirementKind === "ending_side_controlled_cohort"
    ? relationEvidence.length > 0
    : matchingCards.length > 0 && matchingPieces.length > 0;
  const core = stableGraphValue({
    schemaVersion:
      WARMACHINE_MATCHUP_TERMINAL_PARTITION_CAPABILITY_AUDIT_V1_SCHEMA,
    taskKey,
    artifactValidationMode: artifactsPrevalidatedByBatch
      ? "batch_prevalidated_sealed_artifacts" : "standalone_sealed_artifacts",
    openingKey: opening.openingKey,
    constructionOpeningKey: String(opening.constructionOpeningKey || ""),
    planHash: plan.planHash,
    openingReportHash: openingReport.reportHash,
    openingRuntimeHash: openingRuntime.runtimeHash,
    strictOpeningStateHash: opening.strictOpeningStateHash,
    strictDeploymentReceiptHash: opening.strictDeploymentReceiptHash,
    scenarioBindingHash: opening.scenarioBindingHash,
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    constructionHostReceiptHash:
      warmachineConstructionHost.receipt.receiptHash,
    requiredPartitionAxis: required.partitionAxis,
    requiredPartitionValue: partitionValue,
    requiredCapability: required.capabilityKey,
    requirementKind: required.requirementKind,
    requiredStructuredCardTypeName: required.cardTypeName,
    requiredStructuredPieceFlag: required.pieceFlag,
    matchingCardIdentities: matchingCards,
    matchingPieceIdentities: matchingPieces,
    matchingCardCount: matchingCards.length,
    matchingPieceCount: matchingPieces.length,
    relationEvidence,
    relationCount: relationEvidence.length,
    supported,
    exactCandidateRoutingMismatch: !supported,
    proposalDispositionEvidence: supported ? "not_applicable" : "proposal_filtered",
    evidenceSources: stableGraphValue({
      taskPartition:
        `plan.selectedTasks[*].representative.coordinates.${required.partitionAxis}`,
      taskRosterBinding:
        "plan.selectedTasks[*].executionEnvelope.sourceRosterKeys",
      primaryCardInventory:
        "opening.rosterPointLedger.sides.*.entries[*].cardTypeName",
      corroboratingPieceInventory:
        required.requirementKind === "ending_side_controlled_cohort"
          ? "opening.state.pieces[*].controllerPieceKey"
          : `opening.state.pieces[*].${required.pieceFlag}`,
      executionEnvelopeActorInventory:
        "plan.selectedTasks[*].executionEnvelope.actorAxis.candidates[*].cardTypeName",
      openingTaskLedgerKey: taskLedger.openingKey,
      rosterPointLedgerKey: ledger.ledgerKey,
      actorEnvelopeEvidence,
    }),
    exactRosterInventory: stableGraphValue({
      sideKeys: ["player1", "player2"],
      rosterEntryCount: inventory.length,
      physicalModelCount: opening.state.pieces.length,
      pointAccountingComplete: ledger.pointAccountingComplete === true,
    }),
    strictRulesConclusion: false,
    hostExecutionPerformed: false,
    terminalStateMaterialized: false,
    deploymentToTerminalReachabilityProven: false,
    trainingTruth: false,
    claimBoundary: supported
      ? "This sealed audit proves only that at least one exact card and piece in the task-bound rosters has the structured model type required to carry the selected state partition. Host legality, state authorship, reachability, strategy value and win rate remain unproven."
      : "This sealed audit proves only that the complete exact rosters bound to this selected task contain no structured model type capable of carrying the requested state partition. It is exact candidate/routing mismatch evidence for proposal filtering, not a Host rules rejection, family-level unreachability proof, strategy claim or training truth.",
  });
  return stableGraphValue({ ...core, auditHash: stableGraphHash(core) });
}
