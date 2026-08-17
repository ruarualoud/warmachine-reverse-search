import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { buildWarmachineSteamrollerAssassinationTerminalAnchorEvidenceV1 } from
  "../reverse/steamroller-assassination-terminal-anchor-evidence-v1.mjs";
import { buildWarmachineSteamrollerScoreTerminalAnchorEvidenceV1 } from
  "../reverse/steamroller-score-terminal-anchor-evidence-v1.mjs";
import { selectWarmachineSteamrollerTerminalRepresentativesV1 } from
  "../reverse/steamroller-terminal-representative-selector-v1.mjs";
import { buildWarmachineTerminalDemandGroupsV1 } from
  "./terminal-demand-groups-v1.mjs";

export const WARMACHINE_TERMINAL_DEMAND_EVIDENCE_CORPUS_V1_SCHEMA =
  "warmachine_terminal_demand_evidence_corpus_v1";

export function buildWarmachineTerminalDemandEvidenceCorpusV1(raw = {}) {
  const taskRosterReceiptHash = String(
    raw.rosterReceiptHash || "terminal-demand-unbound-task-roster",
  );
  const scoreCoverage = buildWarmachineSteamrollerScoreTerminalAnchorEvidenceV1();
  const directAssassination = buildWarmachineSteamrollerAssassinationTerminalAnchorEvidenceV1({
    corpus: scoreCoverage.corpus,
  });
  const sharedWitness = directAssassination.proposal.runtimeWitness;
  const assassinationEvidenceSets = [
    directAssassination,
    buildWarmachineSteamrollerAssassinationTerminalAnchorEvidenceV1({
      corpus: scoreCoverage.corpus,
      rosterWitness: sharedWitness,
      actionRange: "outside_direct_action_range_requires_prior_movement",
    }),
    buildWarmachineSteamrollerAssassinationTerminalAnchorEvidenceV1({
      corpus: scoreCoverage.corpus,
      rosterWitness: sharedWitness,
      actionRange: "on_boundary",
    }),
    buildWarmachineSteamrollerAssassinationTerminalAnchorEvidenceV1({
      corpus: scoreCoverage.corpus,
      rosterWitness: sharedWitness,
      leaderControl: "on_boundary",
    }),
    buildWarmachineSteamrollerAssassinationTerminalAnchorEvidenceV1({
      corpus: scoreCoverage.corpus,
      rosterWitness: sharedWitness,
      leaderControl: "outside_or_not_required",
    }),
  ];
  const evidenceSets = [
    scoreCoverage.evidence,
    ...assassinationEvidenceSets.map((row) => row.evidence),
  ];
  const rawEvidenceRoots = evidenceSets.flatMap((evidence) =>
    (evidence.roots || []).map((root) => ({ evidence, root })));
  const selectableEvidenceRoots = rawEvidenceRoots.filter(({ root }) =>
    root.cellKey && root.subcellKey && root.receiptHash);
  const evidencePins = selectableEvidenceRoots.map(({ evidence, root }) =>
    stableGraphValue({
      schemaVersion: evidence.schemaVersion,
      evidenceHash: evidence.evidenceHash,
      scenarioKey: root.scenarioKey,
      cellKey: root.cellKey,
      subcellKey: root.subcellKey,
      disposition: root.disposition,
      receiptHash: root.receiptHash,
      replayReceiptHash: root.replayReceiptHash,
      strictReplayCertified: root.strictReplayCertified === true,
      rulesEngineCapabilityOnly: true,
      matchupRosterRouteProven: false,
    }));
  const representativeSelection = selectWarmachineSteamrollerTerminalRepresentativesV1({
    corpus: scoreCoverage.corpus,
    maximumSkeletonCells: Math.max(1, Number(raw.maximumSkeletonCells || 96)),
    maximumRepresentativeSubcells: Math.max(1,
      Number(raw.maximumRepresentativeSubcells || 50000)),
    pinnedRepresentatives: selectableEvidenceRoots.map(({ root }) => root),
  });
  const selectedKeys = new Set(representativeSelection.selectedRepresentatives.map((row) =>
    row.subcellKey));
  if (!evidencePins.every((pin) => selectedKeys.has(pin.subcellKey))) {
    throw new Error("terminal_demand_evidence_pin_missing_from_selection");
  }
  const demandGroups = buildWarmachineTerminalDemandGroupsV1({
    corpus: scoreCoverage.corpus,
    representativeSelection,
  });
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_TERMINAL_DEMAND_EVIDENCE_CORPUS_V1_SCHEMA,
    taskRosterReceiptHash,
    corpusRosterReceiptHash: scoreCoverage.corpus.rosterReceiptHash,
    corpusHash: scoreCoverage.corpus.corpusHash,
    representativeSelectionHash: representativeSelection.selectionHash,
    demandGroupSetHash: demandGroups.demandGroupSetHash,
    selectedRepresentativeCount: demandGroups.selectedRepresentativeCount,
    evidencePinCount: evidencePins.length,
    excludedIncompleteEvidenceRootCount: rawEvidenceRoots.length - evidencePins.length,
    strictReplayCertifiedEvidencePinCount: evidencePins.filter((pin) =>
      pin.strictReplayCertified).length,
    evidencePins,
    rulesEngineCapabilityEvidenceOnly: true,
    matchupRosterRouteProven: false,
    naturalProbabilityClaimed: false,
    claimBoundary: "Pinned score and assassination anchors remain bound to their verified execution-roster witness and prove current rules-host materializer capabilities. The separately recorded task roster receipt does not rewrite that witness. Pins preserve exact terminal subcells but do not prove that any task roster or deployment reaches those roots; matchup route evaluation remains separate.",
  });
  return {
    corpus: scoreCoverage.corpus,
    representativeSelection,
    demandGroups,
    evidenceSets,
    evidencePins,
    evidenceCorpus: { ...core, evidenceCorpusHash: stableGraphHash(core) },
  };
}
