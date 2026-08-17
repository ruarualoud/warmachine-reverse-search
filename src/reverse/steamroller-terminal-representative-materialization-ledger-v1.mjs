import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";

export const WARMACHINE_STEAMROLLER_TERMINAL_REPRESENTATIVE_MATERIALIZATION_LEDGER_V1_SCHEMA =
  "warmachine_steamroller_terminal_representative_materialization_ledger_v1";

const FINAL_DISPOSITIONS = new Set([
  "strict_materialized",
  "strict_rejected",
  "proposal_filtered",
  "input_invalid",
]);
const UNRESOLVED_DISPOSITIONS = new Set([
  "source_unresolved",
  "round_equivalence_unresolved",
]);

function countBy(rows = [], keyFn = () => "") {
  const counts = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) =>
    left.localeCompare(right)));
}

function materializerFamily(terminalClassKey = "") {
  if (terminalClassKey === "lead_three_after_opponent_turn_scoring") {
    return "steamroller_score_terminal_materializer_v1";
  }
  if (terminalClassKey === "unique_leader_assassination") {
    return "terminal_spatial_materializer_v1";
  }
  if (terminalClassKey === "simultaneous_leader_tiebreak") {
    return "steamroller_simultaneous_leader_terminal_materializer_v1";
  }
  if (terminalClassKey === "fixed_round_limit_result") {
    return "fixed_round_limit_materializer_pending";
  }
  return "terminal_materializer_unclassified";
}

export function warmachineSteamrollerTerminalRepresentativeTaskKeyV1({
  corpus = {},
  representativeSelection = {},
  representative = {},
} = {}) {
  if (!corpus.corpusHash || !representativeSelection.selectionHash ||
      !representative.cellKey || !representative.subcellKey) {
    throw new Error("terminal_representative_task_identity_incomplete");
  }
  return `steamroller-terminal-materialization-task-${stableGraphHash({
    schemaVersion:
      WARMACHINE_STEAMROLLER_TERMINAL_REPRESENTATIVE_MATERIALIZATION_LEDGER_V1_SCHEMA,
    corpusHash: corpus.corpusHash,
    selectionHash: representativeSelection.selectionHash,
    hostReceiptHash: corpus.hostReceiptHash,
    cellKey: representative.cellKey,
    subcellKey: representative.subcellKey,
    coordinates: representative.coordinates,
  }, 32)}`;
}

function validateSourceContracts(corpus = {}, representativeSelection = {}) {
  if (corpus.coverage?.denominatorComplete !== true) {
    throw new Error("terminal_representative_ledger_corpus_denominator_incomplete");
  }
  if (representativeSelection.corpusHash !== corpus.corpusHash) {
    throw new Error("terminal_representative_ledger_selection_corpus_mismatch");
  }
  if (representativeSelection.denominator?.conserved !== true) {
    throw new Error("terminal_representative_ledger_selection_denominator_not_conserved");
  }
}

function taskFromRepresentative(corpus, representativeSelection, representative) {
  return stableGraphValue({
    taskKey: warmachineSteamrollerTerminalRepresentativeTaskKeyV1({
      corpus,
      representativeSelection,
      representative,
    }),
    cellKey: representative.cellKey,
    subcellKey: representative.subcellKey,
    scenarioKey: representative.scenarioKey,
    terminalClassKey: representative.terminalClassKey,
    roundClassKey: representative.roundClassKey,
    representativeRoundNumber: representative.representativeRoundNumber,
    sourceResolutionStatus: representative.sourceResolutionStatus,
    selectionReason: representative.selectionReason,
    coordinates: representative.coordinates,
    expectedNextDisposition: representative.expectedNextDisposition,
    expectedStrictOutcome: representative.expectedNextDisposition === "expected_strict_reject"
      ? "strict_rejected"
      : representative.expectedNextDisposition === "strict_materialization_pending"
        ? "strict_materialized"
        : "unresolved",
    materializerFamily: materializerFamily(representative.terminalClassKey),
  });
}

function normalizeEvidenceOutcome(raw = {}, task = {}, hostReceiptHash = "", sourceKind = "") {
  const disposition = String(raw.disposition || "");
  if (!FINAL_DISPOSITIONS.has(disposition)) {
    throw new Error(`terminal_representative_evidence_disposition_invalid:${disposition}`);
  }
  if (String(raw.cellKey || "") !== task.cellKey ||
      String(raw.subcellKey || "") !== task.subcellKey) {
    throw new Error(`terminal_representative_evidence_identity_mismatch:${task.taskKey}`);
  }
  const receiptHash = String(raw.receiptHash || "");
  const replayReceiptHash = String(raw.replayReceiptHash || "");
  if (!receiptHash) {
    throw new Error(`terminal_representative_evidence_receipt_missing:${task.taskKey}`);
  }
  if (["strict_materialized", "proposal_filtered"].includes(disposition) &&
      (raw.strictReplayCertified !== true || !replayReceiptHash)) {
    throw new Error(`terminal_representative_executed_replay_missing:${task.taskKey}`);
  }
  return stableGraphValue({
    taskKey: task.taskKey,
    cellKey: task.cellKey,
    subcellKey: task.subcellKey,
    disposition,
    reason: String(raw.reason || ""),
    receiptHash,
    replayReceiptHash,
    strictReplayCertified: raw.strictReplayCertified === true,
    hostReceiptHash,
    sourceKind,
    trainingTruth: false,
  });
}

function collectOutcomes({
  tasksBySubcellKey,
  hostReceiptHash,
  evidenceSets,
  priorOutcomes,
}) {
  const outcomes = new Map();
  const add = (raw, sourceHostReceiptHash, sourceKind) => {
    if (String(sourceHostReceiptHash || "") !== hostReceiptHash) {
      throw new Error(`terminal_representative_evidence_host_mismatch:${sourceKind}`);
    }
    const task = tasksBySubcellKey.get(String(raw.subcellKey || ""));
    if (!task) {
      throw new Error(`terminal_representative_evidence_not_selected:${raw.subcellKey || ""}`);
    }
    if (raw.taskKey && String(raw.taskKey) !== task.taskKey) {
      throw new Error(`terminal_representative_evidence_task_mismatch:${raw.taskKey}`);
    }
    const outcome = normalizeEvidenceOutcome(raw, task, hostReceiptHash, sourceKind);
    const existing = outcomes.get(task.taskKey);
    if (existing && stableGraphHash(existing) !== stableGraphHash(outcome)) {
      throw new Error(`terminal_representative_evidence_conflict:${task.taskKey}`);
    }
    outcomes.set(task.taskKey, outcome);
  };
  for (const evidenceSet of evidenceSets) {
    for (const root of evidenceSet.roots || []) {
      add(root, evidenceSet.hostReceiptHash, String(evidenceSet.schemaVersion || "evidence_set"));
    }
  }
  for (const outcome of priorOutcomes) {
    add(
      outcome,
      outcome.hostReceiptHash,
      String(outcome.sourceKind || "prior_materialization_ledger"),
    );
  }
  return outcomes;
}

function proposalPriority(task = {}) {
  if (task.expectedNextDisposition === "expected_strict_reject") return 0;
  if (task.terminalClassKey === "unique_leader_assassination") return 1;
  if (task.terminalClassKey === "lead_three_after_opponent_turn_scoring") return 2;
  if (task.terminalClassKey === "simultaneous_leader_tiebreak") return 3;
  return 4;
}

export function buildWarmachineSteamrollerTerminalRepresentativeMaterializationLedgerV1({
  corpus = {},
  representativeSelection = {},
  evidenceSets = [],
  priorOutcomes = [],
  maximumProposedTasks = 0,
} = {}) {
  validateSourceContracts(corpus, representativeSelection);
  const selectedRepresentatives = representativeSelection.selectedRepresentatives || [];
  const tasks = selectedRepresentatives.map((representative) =>
    taskFromRepresentative(corpus, representativeSelection, representative));
  const tasksBySubcellKey = new Map(tasks.map((task) => [task.subcellKey, task]));
  if (tasksBySubcellKey.size !== tasks.length) {
    throw new Error("terminal_representative_ledger_duplicate_selected_subcell");
  }
  const outcomes = collectOutcomes({
    tasksBySubcellKey,
    hostReceiptHash: String(corpus.hostReceiptHash || ""),
    evidenceSets,
    priorOutcomes,
  });
  const pending = tasks.filter((task) =>
    !outcomes.has(task.taskKey) &&
    !UNRESOLVED_DISPOSITIONS.has(task.expectedNextDisposition))
    .sort((left, right) => proposalPriority(left) - proposalPriority(right) ||
      left.scenarioKey.localeCompare(right.scenarioKey) ||
      left.terminalClassKey.localeCompare(right.terminalClassKey) ||
      left.taskKey.localeCompare(right.taskKey));
  const budget = Math.max(0, Math.floor(Number(maximumProposedTasks) || 0));
  const proposedKeys = new Set(pending.slice(0, budget).map((task) => task.taskKey));
  const rows = tasks.map((task) => {
    const outcome = outcomes.get(task.taskKey);
    if (outcome) return stableGraphValue({ ...task, ...outcome });
    if (UNRESOLVED_DISPOSITIONS.has(task.expectedNextDisposition)) {
      return stableGraphValue({
        ...task,
        disposition: task.expectedNextDisposition,
        reason: `terminal_representative_${task.expectedNextDisposition}`,
        strictReplayCertified: false,
        trainingTruth: false,
      });
    }
    return stableGraphValue({
      ...task,
      disposition: proposedKeys.has(task.taskKey) ? "proposed" : "budget_deferred",
      reason: proposedKeys.has(task.taskKey)
        ? "terminal_representative_selected_for_next_materialization_batch"
        : "terminal_representative_materialization_budget_deferred",
      strictReplayCertified: false,
      trainingTruth: false,
    });
  }).sort((left, right) => left.taskKey.localeCompare(right.taskKey));
  const dispositionCounts = countBy(rows, (row) => row.disposition);
  const completedOutcomes = rows.filter((row) => FINAL_DISPOSITIONS.has(row.disposition));
  const selectedMass = BigInt(rows.length);
  const unselectedMass = BigInt(representativeSelection.denominator?.unselectedSubcellCount || 0);
  const corpusMass = BigInt(corpus.counts?.proposedSubcellCount || 0);
  const classifiedSelectedMass = Object.values(dispositionCounts)
    .reduce((total, value) => total + BigInt(value), 0n);
  const core = {
    schemaVersion:
      WARMACHINE_STEAMROLLER_TERMINAL_REPRESENTATIVE_MATERIALIZATION_LEDGER_V1_SCHEMA,
    corpusHash: corpus.corpusHash,
    selectionHash: representativeSelection.selectionHash,
    hostReceiptHash: corpus.hostReceiptHash,
    policy: {
      proposalOrder:
        "expected_reject_then_assassination_then_score_then_simultaneous_then_fixed",
      strategyScoreUsed: false,
      priorFinalOutcomesReexecuted: false,
      evidenceMustBeSelectedByExactSubcellIdentity: true,
    },
    budget: {
      maximumProposedTasks: budget,
      proposedTaskCount: dispositionCounts.proposed || 0,
      remainingPendingTaskCount: dispositionCounts.budget_deferred || 0,
    },
    recovery: {
      suppliedPriorOutcomeCount: priorOutcomes.length,
      acceptedFinalOutcomeCount: outcomes.size,
      resumeByStableTaskIdentity: true,
    },
    denominator: {
      corpusSubcellCount: String(corpusMass),
      selectedRepresentativeSubcellCount: String(selectedMass),
      unselectedSubcellCount: String(unselectedMass),
      classifiedSelectedSubcellCount: String(classifiedSelectedMass),
      selectedMassConserved: classifiedSelectedMass === selectedMass,
      globalAuditMassConserved: selectedMass + unselectedMass === corpusMass,
    },
    dispositionCounts,
    expectedNextDispositionCounts: countBy(tasks, (task) => task.expectedNextDisposition),
    remainingExpectedNextDispositionCounts: countBy(
      rows.filter((row) => ["proposed", "budget_deferred"].includes(row.disposition)),
      (row) => row.expectedNextDisposition,
    ),
    completedOutcomeHash: stableGraphHash(completedOutcomes.map((row) => ({
      taskKey: row.taskKey,
      disposition: row.disposition,
      reason: row.reason || "",
      receiptHash: row.receiptHash || "",
      replayReceiptHash: row.replayReceiptHash || "",
      strictReplayCertified: row.strictReplayCertified === true,
      hostReceiptHash: row.hostReceiptHash || "",
      sourceKind: row.sourceKind || "",
    }))),
    scenarioDispositionCounts: Object.fromEntries([...new Set(rows.map((row) => row.scenarioKey))]
      .sort().map((scenarioKey) => [
        scenarioKey,
        countBy(rows.filter((row) => row.scenarioKey === scenarioKey), (row) => row.disposition),
      ])),
    terminalClassDispositionCounts: Object.fromEntries([
      ...new Set(rows.map((row) => row.terminalClassKey)),
    ].sort().map((terminalClassKey) => [
      terminalClassKey,
      countBy(rows.filter((row) => row.terminalClassKey === terminalClassKey),
        (row) => row.disposition),
    ])),
    tasks: rows,
    claimBoundary: "This ledger schedules exact selected representative subcells and conserves their audit mass. A proposed or budget-deferred task is not executed. strict_materialized records a Host-replayed terminal relation, strict_rejected records a Host rejection, proposal_filtered records a Host-legal independently replayed transition that missed the requested relation, and input_invalid records an invalid hypothesis contract. Unresolved rows remain explicit and no row is training truth.",
    trainingTruth: false,
  };
  if (!core.denominator.selectedMassConserved || !core.denominator.globalAuditMassConserved) {
    throw new Error("terminal_representative_ledger_denominator_not_conserved");
  }
  return stableGraphValue({
    ...core,
    ledgerHash: stableGraphHash(core),
  });
}

export function completedWarmachineSteamrollerTerminalRepresentativeOutcomesV1(ledger = {}) {
  return (ledger.tasks || []).filter((task) => FINAL_DISPOSITIONS.has(task.disposition))
    .map((task) => stableGraphValue({
      taskKey: task.taskKey,
      cellKey: task.cellKey,
      subcellKey: task.subcellKey,
      disposition: task.disposition,
      reason: task.reason || "",
      receiptHash: task.receiptHash || "",
      replayReceiptHash: task.replayReceiptHash || "",
      strictReplayCertified: task.strictReplayCertified === true,
      hostReceiptHash: task.hostReceiptHash || ledger.hostReceiptHash || "",
      sourceKind: task.sourceKind || "prior_materialization_ledger",
      trainingTruth: false,
    }));
}
