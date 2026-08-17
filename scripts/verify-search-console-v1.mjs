import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertWarmachineSearchConsoleCommandV1,
  createWarmachineSearchConsoleEventV1,
  validateWarmachineSearchConsoleSeedV1,
  WARMACHINE_SEARCH_CONSOLE_EVENT_V1_SCHEMA,
} from "../src/report/search-console-contract-v1.mjs";
import {
  projectWarmachineSearchConsoleSnapshotV1,
  summarizeWarmachineSearchConsoleBranchEvidenceV1,
  WARMACHINE_SEARCH_CONSOLE_SNAPSHOT_V1_SCHEMA,
} from "../src/report/search-console-projection-v1.mjs";
import { WARMACHINE_SEARCH_CONSOLE_PRESET_CATALOG_V1 } from
  "../src/report/search-console-presets-v1.mjs";
import {
  WARMACHINE_SEARCH_CONSOLE_EXACT_CARD_ASSETS_V1,
  WARMACHINE_SEARCH_CONSOLE_EXACT_CARD_ASSET_SOURCE_V1,
} from
  "../src/report/search-console-exact-card-assets-v1.mjs";
import { WARMACHINE_SEARCH_CONSOLE_OFFICIAL_SCENARIO_ASSETS_V1 } from
  "../src/report/search-console-official-scenario-assets-v1.mjs";
import { enrichWarmachineSearchConsolePresentationV1 } from
  "../src/report/search-console-presentation-evidence-v1.mjs";
import { projectWarmachineSearchConsoleScenarioCoverageV1 } from
  "../src/report/search-console-scenario-coverage-v1.mjs";
import { buildWarmachineSteamrollerScoreTerminalAnchorEvidenceV1 } from
  "../src/reverse/steamroller-score-terminal-anchor-evidence-v1.mjs";
import { buildWarmachineSteamrollerAssassinationTerminalAnchorEvidenceV1 } from
  "../src/reverse/steamroller-assassination-terminal-anchor-evidence-v1.mjs";
import {
  buildWarmachineSteamrollerAssassinationTerminalRepresentativeRejectEvidenceV1,
} from
  "../src/reverse/steamroller-assassination-terminal-representative-reject-evidence-v1.mjs";
import {
  buildWarmachineSteamrollerSimultaneousLeaderTerminalAnchorEvidenceV1,
} from
  "../src/reverse/steamroller-simultaneous-leader-terminal-anchor-evidence-v1.mjs";
import {
  buildWarmachineSteamrollerStrygonSpraySimultaneousLeaderTerminalEvidenceV1,
} from
  "../src/reverse/steamroller-strygon-spray-simultaneous-leader-terminal-evidence-v1.mjs";
import { buildWarmachineSteamrollerFixedRoundTerminalAnchorEvidenceV1 } from
  "../src/reverse/steamroller-fixed-round-terminal-anchor-evidence-v1.mjs";
import { buildWarmachineSteamrollerScoreTerminalRepresentativeEvidenceV1 } from
  "../src/reverse/steamroller-score-terminal-representative-evidence-v1.mjs";
import {
  buildWarmachineSteamrollerScoreTerminalRepresentativeRejectEvidenceV1,
} from
  "../src/reverse/steamroller-score-terminal-representative-reject-evidence-v1.mjs";
import { buildWarmachineSteamrollerTerminalRepresentativeMaterializationLedgerV1 } from
  "../src/reverse/steamroller-terminal-representative-materialization-ledger-v1.mjs";
import { selectWarmachineSteamrollerTerminalRepresentativesV1 } from
  "../src/reverse/steamroller-terminal-representative-selector-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const anchorCoverage = buildWarmachineSteamrollerScoreTerminalAnchorEvidenceV1();
const scenarioCorpus = anchorCoverage.corpus;
const assassinationAnchorCoverage =
  buildWarmachineSteamrollerAssassinationTerminalAnchorEvidenceV1({
    corpus: scenarioCorpus,
  });
const assassinationMovementCoverage =
  buildWarmachineSteamrollerAssassinationTerminalAnchorEvidenceV1({
    corpus: scenarioCorpus,
    rosterWitness: assassinationAnchorCoverage.proposal.runtimeWitness,
    actionRange: "outside_direct_action_range_requires_prior_movement",
  });
const simultaneousLeaderCoverage =
  buildWarmachineSteamrollerSimultaneousLeaderTerminalAnchorEvidenceV1({
    corpus: scenarioCorpus,
    rosterWitness: assassinationAnchorCoverage.proposal.runtimeWitness,
    scenarioProposal: anchorCoverage.proposals.find((proposal) =>
      proposal.hostScenarioKey === "high_stakes"),
  });
const simultaneousLeaderPresenceCoverage =
  buildWarmachineSteamrollerSimultaneousLeaderTerminalAnchorEvidenceV1({
    corpus: scenarioCorpus,
    rosterWitness: assassinationAnchorCoverage.proposal.runtimeWitness,
    scenarioProposal: anchorCoverage.proposals.find((proposal) =>
      proposal.hostScenarioKey === "high_stakes"),
    tiebreakClassKey: "victory_points_tied_scenario_presence_advantage",
  });
const strygonSprayCoverage =
  buildWarmachineSteamrollerStrygonSpraySimultaneousLeaderTerminalEvidenceV1({
    corpus: scenarioCorpus,
    rosterWitness: assassinationAnchorCoverage.proposal.runtimeWitness,
    scenarioProposal: anchorCoverage.proposals.find((proposal) =>
      proposal.hostScenarioKey === "high_stakes"),
  });
const fixedRoundCoverage = buildWarmachineSteamrollerFixedRoundTerminalAnchorEvidenceV1({
  corpus: scenarioCorpus,
  rosterWitness: assassinationAnchorCoverage.proposal.runtimeWitness,
  scenarioProposals: anchorCoverage.proposals,
});
const representativeSelection = selectWarmachineSteamrollerTerminalRepresentativesV1({
  corpus: scenarioCorpus,
  maximumSkeletonCells: 96,
  maximumRepresentativeSubcells: 50000,
  pinnedRepresentatives: [
    ...anchorCoverage.evidence.roots,
    ...assassinationAnchorCoverage.evidence.roots,
    ...assassinationMovementCoverage.evidence.roots,
    ...simultaneousLeaderCoverage.evidence.roots,
    ...simultaneousLeaderPresenceCoverage.evidence.roots,
    ...strygonSprayCoverage.evidence.roots,
    ...fixedRoundCoverage.evidence.roots,
  ],
});
const scoreRepresentativeCoverage =
  buildWarmachineSteamrollerScoreTerminalRepresentativeEvidenceV1({
    corpus: scenarioCorpus,
    representativeSelection,
    anchorEvidence: anchorCoverage,
    anchorProposals: anchorCoverage.proposals,
  });
const scoreRepresentativeRejectCoverage =
  buildWarmachineSteamrollerScoreTerminalRepresentativeRejectEvidenceV1({
    corpus: scenarioCorpus,
    representativeSelection,
    anchorEvidence: anchorCoverage,
    anchorProposals: anchorCoverage.proposals,
  });
const assassinationRepresentativeRejectCoverage =
  buildWarmachineSteamrollerAssassinationTerminalRepresentativeRejectEvidenceV1({
    corpus: scenarioCorpus,
    representativeSelection,
    rosterWitness: assassinationAnchorCoverage.proposal.runtimeWitness,
  });
const representativeMaterializationLedger =
  buildWarmachineSteamrollerTerminalRepresentativeMaterializationLedgerV1({
    corpus: scenarioCorpus,
    representativeSelection,
    evidenceSets: [
      scoreRepresentativeCoverage.evidence,
      scoreRepresentativeRejectCoverage.evidence,
      assassinationAnchorCoverage.evidence,
      assassinationMovementCoverage.evidence,
      simultaneousLeaderCoverage.evidence,
      simultaneousLeaderPresenceCoverage.evidence,
      strygonSprayCoverage.evidence,
      fixedRoundCoverage.evidence,
      assassinationRepresentativeRejectCoverage,
    ],
    maximumProposedTasks: 0,
  });
const scenarioCoverage = projectWarmachineSearchConsoleScenarioCoverageV1({
  corpus: scenarioCorpus,
  presetCatalog: WARMACHINE_SEARCH_CONSOLE_PRESET_CATALOG_V1,
  representativeSelection,
  representativeMaterializationLedger,
});
assert.equal(scenarioCoverage.scenarioCount, 7);
assert.equal(scenarioCoverage.runnableScenarioCount, 7);
assert.equal(scenarioCoverage.scenarios.find((row) => row.scenarioKey === "two-fronts")
  ?.runnablePresetCount, 3);
assert.equal(scenarioCoverage.scenarios.find((row) => row.scenarioKey === "two-fronts")
  ?.hostScenarioKey, "two_fronts");
assert.equal(scenarioCoverage.scenarios.find((row) => row.scenarioKey === "payload")
  ?.runnable, true);
assert.equal(scenarioCoverage.scenarios.find((row) => row.scenarioKey === "payload")
  ?.runnablePresetCount, 1);
assert.equal(anchorCoverage.evidence.complete, true);
assert.equal(anchorCoverage.evidence.strictMaterializedRootCount, 7);
assert.equal(anchorCoverage.evidence.strictRejectedRootCount, 0);
assert.equal(assassinationAnchorCoverage.evidence.strictMaterializedRootCount, 1);
assert.equal(assassinationMovementCoverage.evidence.strictMaterializedRootCount, 1);
assert.equal(simultaneousLeaderCoverage.evidence.strictMaterializedRootCount, 1);
assert.equal(simultaneousLeaderPresenceCoverage.evidence.strictMaterializedRootCount, 1);
assert.equal(strygonSprayCoverage.evidence.strictMaterializedRootCount, 1);
assert.equal(fixedRoundCoverage.evidence.strictMaterializedRootCount, 6);
assert.equal(scenarioCoverage.strictMaterializedSubcellCount, "18");
const expectedStrictRejectedSubcellCount = new Set([
  ...scoreRepresentativeRejectCoverage.evidence.roots,
  ...assassinationRepresentativeRejectCoverage.roots,
].map((root) => root.subcellKey)).size;
assert.equal(
  scenarioCoverage.strictRejectedSubcellCount,
  String(expectedStrictRejectedSubcellCount),
);
assert.equal(scenarioCoverage.scenarios.find((row) => row.scenarioKey === "fault-line")
  ?.coverage.strictRejectedRepresentativeCount, 2);
assert.equal(scenarioCoverage.scenarios.find((row) => row.scenarioKey === "two-fronts")
  ?.coverage.strictRejectedRepresentativeCount, 2);
assert.ok(scenarioCoverage.representativePlan.selectedSkeletonCellCount >= 7);
assert.ok(BigInt(scenarioCoverage.representativePlan.selectedRepresentativeSubcellCount) >= 7n);
assert.equal(scenarioCoverage.representativePlan.evidencePinCoverage.selectedUniquePinCount, 18);
assert.ok(scenarioCoverage.representativePlan.executionDispositionCounts.strict_materialized >= 18);
assert.ok(Number(scenarioCoverage.representativePlan.remainingExpectedNextDispositionCounts
  .expected_strict_reject || 0) > 0);
assert.ok(Number(scenarioCoverage.representativePlan.remainingExpectedNextDispositionCounts
  .strict_materialization_pending || 0) > 0);
assert.equal(scenarioCoverage.representativePlan.skeletonObligationCoverageComplete, true);
assert.equal(scenarioCoverage.representativePlan.partitionValueCoverageComplete, true);
assert.equal(
  BigInt(scenarioCoverage.proposedSubcellCount),
  BigInt(scenarioCoverage.strictMaterializedSubcellCount) +
    BigInt(scenarioCoverage.strictRejectedSubcellCount) +
    BigInt(scenarioCoverage.budgetDeferredSubcellCount),
);

const preset = validateWarmachineSearchConsoleSeedV1({
  seedKind: "preset_reference",
  presetKey: "fixed-cryx-fane-assassination",
  scenarioKey: "two-fronts",
  goalType: "assassination",
  roundNumber: 3,
  anchorKey: "round-three-west-lower-objective-flank",
});
assert.equal(preset.ok, true);
assert.equal(preset.seed.provenance, "user_injected");
assert.equal(preset.seed.randomSeed, "fixed-terminal-position-domain-v1");
assert.equal(preset.presetMaterializationPending, true);
assert.equal(preset.trainingTruth, false);

const payloadScoreAnchorPreset = validateWarmachineSearchConsoleSeedV1({
  seedKind: "preset_reference",
  presetKey: "steamroller-score-anchor-payload",
  scenarioKey: "payload",
  goalType: "scenario_score",
  roundNumber: 3,
  anchorKey: "score-terminal-anchor:payload",
});
assert.equal(payloadScoreAnchorPreset.ok, true);
assert.equal(payloadScoreAnchorPreset.seed.roundNumber, 3);
assert.equal(payloadScoreAnchorPreset.seed.randomSeed, "steamroller-score-terminal-anchor-v1");

const wrongPayloadRound = validateWarmachineSearchConsoleSeedV1({
  seedKind: "preset_reference",
  presetKey: "steamroller-score-anchor-payload",
  scenarioKey: "payload",
  goalType: "scenario_score",
  roundNumber: 2,
  anchorKey: "score-terminal-anchor:payload",
});
assert.equal(wrongPayloadRound.ok, false);
assert.ok(wrongPayloadRound.issues.includes("search_console_seed_preset_round_mismatch"));

const mismatchedPreset = validateWarmachineSearchConsoleSeedV1({
  seedKind: "preset_reference",
  presetKey: "fixed-cryx-fane-assassination",
  scenarioKey: "not-two-fronts",
  goalType: "scenario_score",
  roundNumber: 3,
  anchorKey: "not-an-anchor",
});
assert.equal(mismatchedPreset.ok, false);
assert.ok(mismatchedPreset.issues.includes("search_console_seed_preset_scenario_mismatch"));
assert.ok(mismatchedPreset.issues.includes("search_console_seed_preset_goal_mismatch"));
assert.ok(mismatchedPreset.issues.includes("search_console_seed_preset_anchor_unknown"));

const forbidden = validateWarmachineSearchConsoleSeedV1({
  seedKind: "exact_terminal_root",
  scenarioKey: "two-fronts",
  goalType: "assassination",
  roundNumber: 3,
  forwardRoute: [{ actionType: "run" }],
  terminalState: {},
  terminalCell: {},
});
assert.equal(forbidden.ok, false);
assert.ok(forbidden.issues.includes("search_console_seed_contains_forward_oracle"));
assert.ok(forbidden.forbiddenOraclePaths.includes("seed.forwardRoute"));

assert.equal(assertWarmachineSearchConsoleCommandV1("start", "ready"), true);
assert.equal(assertWarmachineSearchConsoleCommandV1("pause", "running"), true);
assert.equal(assertWarmachineSearchConsoleCommandV1("resume", "paused"), true);
assert.throws(() => assertWarmachineSearchConsoleCommandV1("resume", "completed"),
  /search_console_command_state_invalid/);

const event = createWarmachineSearchConsoleEventV1({
  sessionId: "verification-session",
  sequence: 1,
  eventType: "session_created",
  state: "ready",
  occurredAt: "2026-08-12T00:00:00.000Z",
  payload: { seedKey: preset.seed.seedKey },
});
assert.equal(event.schemaVersion, WARMACHINE_SEARCH_CONSOLE_EVENT_V1_SCHEMA);
assert.ok(event.eventId.startsWith("search-console-event-"));

const emptyTerminalState = {
  stateKey: "empty-terminal",
  strictMode: true,
  enforceStrictExecutor: true,
  turnNumber: 3,
  activeSideKey: "player1",
  phaseKey: "activation",
  board: { widthIn: 48, heightIn: 48 },
  pieces: [],
  terrain: [],
  scenario: { score: { player1: 0, player2: 0 }, scoringHistory: [] },
};
const snapshot = projectWarmachineSearchConsoleSnapshotV1({
  sessionId: "verification-session",
  seed: preset.seed,
  terminalCell: {
    cellKey: "verification-cell",
    scenarioKey: "two-fronts",
    goalType: "assassination",
    roundNumber: 3,
    winnerSideKey: "player1",
    endingSideKey: "player1",
  },
  terminalState: emptyTerminalState,
  search: {
    routes: [],
    runtimeReachedPriorTurnFrontiers: [],
    rejected: [{ stageKey: "terminal", reason: "strict_rejected_by_rules" }],
    unresolved: [
      { stageKey: "activation", reason: "route_label_budget_exhausted" },
      { stageKey: "movement", reason: "inverse_preimage_unresolved" },
      { stageKey: "effect", reason: "unknown_rule_source_contract" },
    ],
    movementProposalUniverse: { exhaustiveOverContinuousPaths: false },
  },
});
assert.equal(snapshot.schemaVersion, WARMACHINE_SEARCH_CONSOLE_SNAPSHOT_V1_SCHEMA);
assert.equal(snapshot.graph.branches.length, 0);
assert.equal(snapshot.dispositionCounts.strict_rejected, 1);
assert.equal(snapshot.dispositionCounts.budget_deferred, 1);
assert.equal(snapshot.dispositionCounts.inverse_unresolved, 1);
assert.equal(snapshot.dispositionCounts.rules_unknown, 1);
assert.equal(snapshot.trainingTruth, false);
assert.equal(snapshot.strategyScorePresent, false);

const branchEvidence = summarizeWarmachineSearchConsoleBranchEvidenceV1({
  branchEdgeIds: ["edge-run", "edge-hit"],
  nodes: [{
    nodeId: "state-before",
    stateHash: "before",
    turnNumber: 2,
    activeSideKey: "player1",
    phaseKey: "activation",
    score: { player1: 0, player2: 0 },
    pieces: [{
      pieceKey: "attacker",
      sideKey: "player1",
      boxesRemaining: 8,
      resourcePoints: 2,
    }, {
      pieceKey: "target",
      sideKey: "player2",
      boxesRemaining: 6,
      resourcePoints: 0,
    }],
  }, {
    nodeId: "state-middle",
    stateHash: "middle",
    turnNumber: 2,
    activeSideKey: "player1",
    phaseKey: "activation",
    score: { player1: 0, player2: 0 },
    pieces: [{
      pieceKey: "attacker",
      sideKey: "player1",
      boxesRemaining: 8,
      resourcePoints: 2,
    }, {
      pieceKey: "target",
      sideKey: "player2",
      boxesRemaining: 6,
      resourcePoints: 0,
    }],
  }, {
    nodeId: "state-after",
    stateHash: "after",
    turnNumber: 2,
    activeSideKey: "player1",
    phaseKey: "activation",
    score: { player1: 1, player2: 0 },
    pieces: [{
      pieceKey: "attacker",
      sideKey: "player1",
      boxesRemaining: 8,
      resourcePoints: 1,
    }, {
      pieceKey: "target",
      sideKey: "player2",
      boxesRemaining: 0,
      resourcePoints: 0,
      destroyed: true,
    }],
  }],
  edges: [{
    edgeId: "edge-run",
    predecessorNodeId: "state-before",
    successorNodeId: "state-middle",
    actionType: "run",
    actionLabel: "奔跑",
    actorPieceKey: "attacker",
    strictReceiptHash: "receipt-run",
    legalActionSpaceCompleteWithinDeclaredScope: true,
  }, {
    edgeId: "edge-hit",
    predecessorNodeId: "state-middle",
    successorNodeId: "state-after",
    actionType: "melee_attack",
    actionLabel: "近战攻击",
    actorPieceKey: "attacker",
    targetPieceKey: "target",
    strictReceiptHash: "receipt-hit",
    legalActionSpaceCompleteWithinDeclaredScope: true,
  }],
  probabilityInterval: { lower: "3/4", upper: "3/4" },
});
assert.equal(branchEvidence.actionCount, 2);
assert.equal(branchEvidence.decisiveActionCount, 2);
assert.equal(branchEvidence.movementActionCount, 1);
assert.equal(branchEvidence.attackActionCount, 1);
assert.equal(branchEvidence.scoreDeltaBySide.player1, 1);
assert.equal(branchEvidence.boxesLostBySide.player2, 6);
assert.equal(branchEvidence.removedPieceCountBySide.player2, 1);
assert.equal(branchEvidence.resourceDeltaBySide.player1, -1);
assert.equal(branchEvidence.strictActionSpaceClosedWithinDeclaredScope, true);
assert.equal(branchEvidence.strategyScorePresent, false);

const exactOverseerCardId = "1fa46814-1472-419d-bf95-6d7342ca157a";
const similarNamePresentation = enrichWarmachineSearchConsolePresentationV1({
  snapshot: {
    graph: {
      nodes: [{
        nodeId: "similar-name-test",
        board: { widthIn: 48, heightIn: 48 },
        terrain: [{
          terrainKey: "exact-forest",
          isForest: true,
          xIn: 12,
          yIn: 12,
          radiusIn: 3,
          geometryExactWithinScope: true,
          geometryIssues: [],
        }],
        objectives: [],
        caches: [],
        pieces: [{
          pieceKey: "sythyss",
          label: "Sythyss Overseer",
          portraitPath: "",
        }, {
          pieceKey: "unbound",
          label: "Unknown Overseer",
          portraitPath: "/Media/Portraits/portrait circle druid of orboros overseer.png",
        }],
      }],
    },
  },
  checkpoint: {
    state: {
      pieces: [{
        pieceKey: "sythyss",
        cardId: exactOverseerCardId,
        modelId: "0419d034-26cc-4d83-818d-b9d46dc89a84",
        cardSnapshot: { id: exactOverseerCardId, name: "Sythyss Overseer", portraitPath: "" },
      }],
    },
  },
  checkpointFileName: "checkpoint-similar-name.json",
  exactAssetByCardId: WARMACHINE_SEARCH_CONSOLE_EXACT_CARD_ASSETS_V1,
  exactMediaAssetByPortraitPath: {
    "/Media/Portraits/portrait circle druid of orboros overseer.png": {
      assetUrl: "/wartable-media/Media/Portraits/portrait%20circle%20druid%20of%20orboros%20overseer.png",
      sha256: "fixture-media-hash",
      sourceKind: "official_warmachine_app_media_library_exact_path",
      sourceMemberPath: "Media/Portraits/portrait circle druid of orboros overseer.png",
    },
  },
});
const presentationPieces = similarNamePresentation.graph.nodes[0].pieces;
assert.equal(presentationPieces[0].cardId, exactOverseerCardId);
assert.equal(presentationPieces[0].portraitUrl,
  `/assets/pieces/${exactOverseerCardId}.png`);
assert.equal(presentationPieces[0].portraitEvidenceKind, "exact_card_asset_override");
assert.equal(presentationPieces[1].presentationIdentityExact, false);
assert.equal(presentationPieces[1].portraitPath, "");
assert.equal(similarNamePresentation.replayPresentationEvidence.fuzzyIdentityMatchingUsed, false);
assert.equal(similarNamePresentation.replayPresentationEvidence.board.renderMode,
  "rules_state_geometry");
assert.equal(similarNamePresentation.replayPresentationEvidence.board.backgroundAssetBound, false);
assert.equal(similarNamePresentation.replayPresentationEvidence.pieceIdentity.projectedPieceCount, 2);
assert.equal(similarNamePresentation.replayPresentationEvidence.pieceIdentity
  .exactIdentityMatchedPieceCount, 1);
assert.equal(similarNamePresentation.replayPresentationEvidence.pieceIdentity
  .exactPortraitPieceCount, 1);
assert.equal(similarNamePresentation.replayPresentationEvidence.pieceIdentity
  .exactCardOverridePieceCount, 1);
assert.equal(similarNamePresentation.replayPresentationEvidence.pieceIdentity
  .exactMediaLibraryPieceCount, 0);

const exactMediaPresentation = enrichWarmachineSearchConsolePresentationV1({
  snapshot: {
    graph: { nodes: [{
      pieces: [{ pieceKey: "media-bound", cardId: "media-card", cardName: "Media Card" }],
    }] },
  },
  checkpoint: {
    pieces: [{
      pieceKey: "media-bound",
      cardId: "media-card",
      cardSnapshot: {
        id: "media-card",
        name: "Media Card",
        portraitPath: "/Media/Portraits/exact-media-card.png",
      },
    }],
  },
  exactMediaAssetByPortraitPath: {
    "/Media/Portraits/exact-media-card.png": {
      assetUrl: "/wartable-media/Media/Portraits/exact-media-card.png",
      sha256: "exact-media-hash",
      sourceKind: "official_warmachine_app_media_library_exact_path",
      sourceMemberPath: "Media/Portraits/exact-media-card.png",
    },
  },
});
assert.equal(exactMediaPresentation.graph.nodes[0].pieces[0].portraitEvidenceKind,
  "exact_media_library_path");
assert.equal(exactMediaPresentation.graph.nodes[0].pieces[0].portraitEvidenceHash,
  "exact-media-hash");
assert.equal(exactMediaPresentation.replayPresentationEvidence.pieceIdentity
  .exactMediaLibraryPieceCount, 1);
assert.equal(exactMediaPresentation.replayPresentationEvidence.pieceIdentity
  .missingExactPortraitPieceCount, 0);

const missingMediaPresentation = enrichWarmachineSearchConsolePresentationV1({
  snapshot: {
    graph: { nodes: [{
      pieces: [{ pieceKey: "missing-media", cardId: "missing-card", cardName: "Missing Card" }],
    }] },
  },
  checkpoint: {
    pieces: [{
      pieceKey: "missing-media",
      cardId: "missing-card",
      cardSnapshot: {
        id: "missing-card",
        name: "Missing Card",
        portraitPath: "/Media/Portraits/not-downloaded.png",
      },
    }],
  },
});
assert.equal(missingMediaPresentation.graph.nodes[0].pieces[0].portraitUrl, "");
assert.equal(missingMediaPresentation.graph.nodes[0].pieces[0].portraitEvidenceKind,
  "missing_exact_card_asset");
assert.equal(missingMediaPresentation.replayPresentationEvidence.pieceIdentity
  .missingExactPortraitPieceCount, 1);

const officialMapPresentation = enrichWarmachineSearchConsolePresentationV1({
  snapshot: {
    terminal: { scenarioKey: "two-fronts" },
    graph: { nodes: [{ nodeId: "official-map-test", board: { widthIn: 48, heightIn: 48 }, terrain: [], objectives: [], caches: [], pieces: [] }] },
  },
  scenarioAssetByScenarioKey: WARMACHINE_SEARCH_CONSOLE_OFFICIAL_SCENARIO_ASSETS_V1,
});
assert.equal(officialMapPresentation.replayPresentationEvidence.board.renderMode,
  "official_scenario_diagram_plus_rules_state_geometry");
assert.equal(officialMapPresentation.replayPresentationEvidence.board.backgroundAssetBound,
  true);
assert.equal(officialMapPresentation.replayPresentationEvidence.board.backgroundImageUrl,
  "/assets/scenarios/steamroller-2026-map-2.png");
assert.equal(officialMapPresentation.replayPresentationEvidence.board
  .canvasYAxisInvertedFromRulesCoordinates, true);
assert.equal(WARMACHINE_SEARCH_CONSOLE_OFFICIAL_SCENARIO_ASSETS_V1.two_fronts
  .officialGeometryBound, true);
assert.equal(Object.values(WARMACHINE_SEARCH_CONSOLE_OFFICIAL_SCENARIO_ASSETS_V1)
  .every((asset) => asset.officialGeometryBound === true), true);

const driftPresentation = enrichWarmachineSearchConsolePresentationV1({
  snapshot: {
    ok: true,
    hostReceiptHash: "old-host-receipt",
    graph: {
      nodes: [],
      branches: [{
        branchKey: "old-strict-branch",
        disposition: "strict_certified",
        strictReplay: { certified: true },
      }],
    },
    dispositions: [],
    dispositionCounts: { rules_drift: 0 },
    searchCoverage: { strictCertifiedBranchCount: 1 },
  },
  currentHostReceiptHash: "current-host-receipt",
});
assert.equal(driftPresentation.ok, false);
assert.equal(driftPresentation.graph.branches[0].disposition, "rules_drift");
assert.equal(driftPresentation.graph.branches[0].historicalDisposition,
  "strict_certified");
assert.equal(driftPresentation.graph.branches[0].strictReplay.certified, false);
assert.equal(driftPresentation.graph.branches[0].strictReplay.historicalCertified, true);
assert.equal(driftPresentation.dispositionCounts.rules_drift, 1);
assert.equal(driftPresentation.searchCoverage.strictCertifiedBranchCount, 0);
assert.equal(driftPresentation.replayPresentationEvidence.hostCompatibility.compatible,
  false);

for (const [cardId, asset] of Object.entries(WARMACHINE_SEARCH_CONSOLE_EXACT_CARD_ASSETS_V1)) {
  const assetPath = path.join(root, "web/search-console", asset.assetUrl);
  assert.ok(fs.existsSync(assetPath), `missing exact replay asset ${cardId}`);
  assert.equal(createHash("sha256").update(fs.readFileSync(assetPath)).digest("hex"),
    asset.sha256, `exact replay asset hash mismatch ${cardId}`);
}
assert.equal(Object.keys(WARMACHINE_SEARCH_CONSOLE_EXACT_CARD_ASSETS_V1).length, 16);
assert.equal(WARMACHINE_SEARCH_CONSOLE_EXACT_CARD_ASSET_SOURCE_V1.remoteVersion, "40042");
assert.equal(new Set(Object.values(WARMACHINE_SEARCH_CONSOLE_EXACT_CARD_ASSETS_V1)
  .map((asset) => asset.sourceArchiveName)).size,
WARMACHINE_SEARCH_CONSOLE_EXACT_CARD_ASSET_SOURCE_V1.sourceArchiveCount);
for (const asset of Object.values(WARMACHINE_SEARCH_CONSOLE_EXACT_CARD_ASSETS_V1)) {
  assert.equal(WARMACHINE_SEARCH_CONSOLE_EXACT_CARD_ASSET_SOURCE_V1
    .sourceArchiveSha256ByName[asset.sourceArchiveName], asset.sourceArchiveSha256,
  `unregistered source archive ${asset.sourceArchiveName}`);
}
for (const [scenarioKey, asset] of Object.entries(
  WARMACHINE_SEARCH_CONSOLE_OFFICIAL_SCENARIO_ASSETS_V1,
)) {
  const assetPath = path.join(root, "web/search-console", asset.assetUrl);
  assert.ok(fs.existsSync(assetPath), `missing official scenario map ${scenarioKey}`);
  assert.equal(createHash("sha256").update(fs.readFileSync(assetPath)).digest("hex"),
    asset.sha256, `official scenario map hash mismatch ${scenarioKey}`);
}

const consoleHtml = fs.readFileSync(path.join(root, "web/search-console/index.html"), "utf8");
const consoleApp = fs.readFileSync(path.join(root, "web/search-console/app.js"), "utf8");
const consoleStyles = fs.readFileSync(path.join(root, "web/search-console/styles.css"), "utf8");
for (const requiredId of [
  "branchCards",
  "strategyHeadline",
  "strategySteps",
  "winRateMetric",
  "comparisonRows",
  "playStateButton",
  "boardStepRail",
  "boardSiblingBranches",
  "liveProgressBar",
  "assumptionList",
  "quickSeedView",
  "exactSeedView",
]) {
  assert.ok(consoleHtml.includes(`id="${requiredId}"`), `missing UI control ${requiredId}`);
}
assert.ok(consoleApp.includes("new EventSource("));
assert.ok(consoleApp.includes("strategyScorePresent: false"));
assert.ok(consoleApp.includes("selectedScenarioDiffers"));
assert.ok(consoleApp.includes("winProbabilityEvidence"));
assert.ok(consoleApp.includes("portraitUrlForPiece"));
assert.ok(consoleApp.includes('return String(piece.portraitUrl || "")'));
assert.ok(consoleApp.includes("rules_state_geometry"));
assert.ok(consoleApp.includes("official_scenario_diagram_plus_rules_state_geometry"));
assert.ok(consoleApp.includes("boardCanvasPoint"));
assert.ok(consoleApp.includes('searchParams.get("session")'));
assert.ok(consoleApp.includes('searchParams.set("session", session.sessionId)'));
assert.ok(!consoleApp.includes("portraitLookupKey"));
assert.ok(!consoleApp.includes("encodeAssetPath"));
assert.ok(!consoleApp.includes("defaultBattlefieldUrl"));
assert.ok(consoleStyles.includes('.result-panel[data-active-view="board"] .branch-cards'));
assert.ok(consoleStyles.includes("grid-template-rows: auto clamp(340px"));
assert.ok(consoleHtml.includes("路径概率证据"));
assert.ok(!consoleHtml.includes("获胜概率证据"));

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_search_console_v1",
  presetSeedKey: preset.seed.seedKey,
  eventId: event.eventId,
  snapshotHash: snapshot.snapshotHash,
  branchEvidence,
  dispositionCounts: snapshot.dispositionCounts,
  scenarioCoverage: {
    scenarioCount: scenarioCoverage.scenarioCount,
    runnableScenarioCount: scenarioCoverage.runnableScenarioCount,
    proposedSubcellCount: scenarioCoverage.proposedSubcellCount,
    coverageHash: scenarioCoverage.coverageHash,
  },
}, null, 2));
