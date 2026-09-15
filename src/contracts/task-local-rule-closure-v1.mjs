import { createHash } from "node:crypto";
import fs from "node:fs";

import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import {
  buildWarmachineRosterRuleDependencyInventoryV1,
  buildWarmachineTerminalRelevanceClosure,
} from "../search/terminal-relevance-closure-v1.mjs";
import { WARMACHINE_TASK_LOCAL_ACTION_RULE_GUARD_V1_SCHEMA } from
  "./task-local-action-rule-guard-v1.mjs";
import {
  recognizedWarmachineRuleAtoms,
  resolveWarmachineHostPath,
  warmachineHost,
} from "../warmachine-host-runtime.mjs";

export const WARMACHINE_TASK_LOCAL_RULE_CLOSURE_V1_SCHEMA =
  "warmachine_task_local_rule_closure_v1";

const ENGINE_INTERACTION_REPORT_PATH =
  "data/function3-rules/warmachine-semantic-interaction-closure-v1.json";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function leaderPieceKey(state = {}, sideKey = "") {
  return String((state.pieces || []).find((piece) =>
    piece.sideKey === sideKey &&
    (piece.isLeader === true || piece.isWarcaster === true || piece.isWarlock === true))
    ?.pieceKey || "");
}

function terminalClosures(state = {}) {
  const player1Leader = leaderPieceKey(state, "player1");
  const player2Leader = leaderPieceKey(state, "player2");
  const branch = {
    terminalBranchKey: "task-local-rule-closure",
    approachKind: "already_in_attack_range",
    resourceDemand: { total: 0 },
    resourceSource: { sourceKind: "no_resource_required" },
  };
  return [
    buildWarmachineTerminalRelevanceClosure(state, {
      templateKey: "player1_assassination",
      goalType: "assassination",
      attackerPieceKey: player1Leader,
      targetPieceKey: player2Leader,
      attackMode: "melee",
      initialEffectiveRuleClosure: { rules: [] },
    }, branch),
    buildWarmachineTerminalRelevanceClosure(state, {
      templateKey: "player2_assassination",
      goalType: "assassination",
      attackerPieceKey: player2Leader,
      targetPieceKey: player1Leader,
      attackMode: "melee",
      initialEffectiveRuleClosure: { rules: [] },
    }, branch),
    buildWarmachineTerminalRelevanceClosure(state, {
      templateKey: "scenario_score",
      goalType: "scenario_score",
      attackerPieceKey: player1Leader,
      initialEffectiveRuleClosure: { rules: [] },
    }, branch),
  ];
}

export function buildWarmachineTaskLocalRuleClosureV1(raw = {}) {
  const state = raw.state || {};
  const inventory = buildWarmachineRosterRuleDependencyInventoryV1(state);
  const interactionBytes = fs.readFileSync(
    resolveWarmachineHostPath(ENGINE_INTERACTION_REPORT_PATH),
  );
  const engineInteractionReport = JSON.parse(interactionBytes);
  if (engineInteractionReport.schemaVersion !==
      "warmachine_semantic_interaction_closure_v1") {
    throw new Error("task_local_engine_interaction_report_schema_mismatch");
  }

  const candidateAtomKeys = new Set(inventory.candidateAtomKeys);
  const candidateObligationKeys = new Set(
    inventory.candidateInteractionObligationKeys,
  );
  const unresolvedCandidateInteractions =
    (engineInteractionReport.unresolved?.atomInteractions || [])
      .filter((row) => candidateObligationKeys.has(row.obligationKey))
      .map((row) => stableGraphValue(row))
      .sort((left, right) => left.obligationKey.localeCompare(right.obligationKey));
  const closures = terminalClosures(state);
  const selectedAtomKeys = [...new Set(closures.flatMap((closure) =>
    closure.selectedAtomKeys || []))].sort();
  const selectedAtomKeySet = new Set(selectedAtomKeys);
  const selectedUnresolvedInteractions = unresolvedCandidateInteractions
    .filter((row) => selectedAtomKeySet.has(row.atomKey));
  const candidateAtoms = recognizedWarmachineRuleAtoms().filter((atom) =>
    candidateAtomKeys.has(atom.atomKey));
  const relevantUnresolvedHookGroups =
    (engineInteractionReport.unresolved?.hookConcurrency || [])
      .filter((row) => inventory.candidateHookKeys.includes(row.hookKey))
      .map((row) => stableGraphValue(row))
      .sort((left, right) => left.obligationKey.localeCompare(right.obligationKey));
  const candidateInteractionCount = candidateAtoms.reduce((sum, atom) =>
    sum + (atom.interactions || []).length, 0);

  const core = stableGraphValue({
    schemaVersion: WARMACHINE_TASK_LOCAL_RULE_CLOSURE_V1_SCHEMA,
    taskKey: String(raw.task?.taskKey || ""),
    taskHash: String(raw.task?.taskHash || ""),
    fixtureHash: String(raw.fixtureHash || ""),
    openingStateHash: String(raw.openingStateHash || ""),
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    engineInteractionReport: {
      relativePath: ENGINE_INTERACTION_REPORT_PATH,
      contentHash: sha256(interactionBytes),
      reportHash: String(engineInteractionReport.reportHash || ""),
    },
    rosterDependencyInventory: inventory,
    terminalOrderingClosures: closures.map((closure) => ({
      templateKey: closure.templateKey,
      goalType: closure.goalType,
      selectedAtomKeys: closure.selectedAtomKeys,
      selectedCoreRuleKeys: closure.selectedCoreRuleKeys,
      hardPruningEnabled: closure.hardPruningEnabled,
      reasonsHardPruningDisabled: closure.reasonsHardPruningDisabled,
    })),
    taskAtomInteractions: {
      candidateAtomCount: inventory.candidateAtomKeys.length,
      candidateInteractionCount,
      boundInteractionCount:
        candidateInteractionCount - unresolvedCandidateInteractions.length,
      unresolvedInteractionCount: unresolvedCandidateInteractions.length,
      unresolvedInteractions: unresolvedCandidateInteractions,
      selectedAtomCount: selectedAtomKeys.length,
      selectedUnresolvedInteractionCount: selectedUnresolvedInteractions.length,
      selectedUnresolvedInteractions,
    },
    taskAtomHooks: {
      candidateAtomHookBindings: candidateAtoms.map((atom) => ({
        atomKey: atom.atomKey,
        hookKeys: [...new Set((atom.hooks || []).map((hook) => hook.hookKey))]
          .filter(Boolean)
          .sort(),
      })),
    },
    taskHookConcurrency: {
      candidateHookKeyCount: inventory.candidateHookKeys.length,
      relevantGlobalUnresolvedGroupCount: relevantUnresolvedHookGroups.length,
      relevantGlobalUnresolvedGroups: relevantUnresolvedHookGroups,
      exactTaskLocalOrderingProofImplemented: false,
    },
    globalContextOnly: {
      unresolvedSemanticRelationCount:
        Number(engineInteractionReport.unresolvedCounts?.semanticRelationCount || 0),
      unresolvedSemanticStateInteractionCount:
        Number(engineInteractionReport.unresolvedCounts?.semanticStateInteractionCount || 0),
      unresolvedAtomInteractionCount:
        Number(engineInteractionReport.unresolvedCounts?.atomInteractionCount || 0),
      unresolvedHookConcurrencyCount:
        Number(engineInteractionReport.unresolvedCounts?.hookConcurrencyCount || 0),
    },
    readiness: {
      exactRosterSourceMappingComplete: inventory.sourceMappingComplete,
      allCandidateAtomInteractionsBound:
        unresolvedCandidateInteractions.length === 0,
      taskLocalHookOrderingProofComplete: false,
      runtimeActionDependencyGuardImplemented: true,
      runtimeActionDependencyGuardSchema:
        WARMACHINE_TASK_LOCAL_ACTION_RULE_GUARD_V1_SCHEMA,
      runtimeHookConflictGuardImplemented: true,
      boundedSearchLaunchReady: inventory.sourceMappingComplete,
      strategyValuePublicationAllowed: false,
    },
    claimBoundary: "This task-local closure narrows rule evidence to every source-mapped atom on one exact Cryx/Nyrro roster state and separately records terminal relevance as ordering only. A bounded interval search may launch because every action is checked before execution and again against transition events; unknown atoms, unresolved atom relations and unresolved same-hook multi-atom ordering remain explicit [0,1] branches. Exact strategy values remain forbidden until those branches and the complete response/Chance/continuous domains close. Global unrelated-faction debt is context only.",
  });
  return { ...core, taskLocalRuleClosureHash: stableGraphHash(core) };
}
