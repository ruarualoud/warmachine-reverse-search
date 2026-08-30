import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import {
  enumerateRulesV1Actions,
  normalizeRulesV1State,
  strictOpponentReactionRequirementsForAction,
} from "../warmachine-host-runtime.mjs";
import { expandWarmachineStrictPolicyStepV1 } from "./strict-policy-step-v1.mjs";
import { canonicalWarmachineActingSideActionsV1 } from
  "./opponent-response-v1.mjs";

export const WARMACHINE_UNIT_COMBAT_ACTION_SEQUENCE_DOMAIN_V1_SCHEMA =
  "warmachine_unit_combat_action_sequence_domain_v1";
export const WARMACHINE_UNIT_COMBAT_ACTION_SEQUENCE_CHECKPOINT_V1_SCHEMA =
  "warmachine_unit_combat_action_sequence_checkpoint_v1";

function array(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueSorted(values = []) {
  return [...new Set(values.map(String).filter(Boolean))].sort();
}

function boundedInteger(value, fallback, maximum = 100000) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= maximum
    ? parsed
    : fallback;
}

function exactStateHash(state = {}) {
  return stableGraphHash(stableGraphValue(normalizeRulesV1State(state)));
}

function checkpointCore(checkpoint = {}) {
  const core = stableGraphValue({ ...checkpoint });
  delete core.checkpointHash;
  return core;
}

function sealCheckpoint(checkpoint = {}) {
  const core = checkpointCore(checkpoint);
  return { ...core, checkpointHash: stableGraphHash(core) };
}

function checkpointValid(checkpoint = {}, initialStateHash = "", unitGroupId = "") {
  return checkpoint.schemaVersion ===
      WARMACHINE_UNIT_COMBAT_ACTION_SEQUENCE_CHECKPOINT_V1_SCHEMA &&
    checkpoint.checkpointHash === stableGraphHash(checkpointCore(checkpoint)) &&
    checkpoint.initialStateHash === initialStateHash &&
    checkpoint.unitGroupId === unitGroupId &&
    Number.isInteger(Number(checkpoint.nextNodeIndex)) &&
    Number(checkpoint.nextNodeIndex) >= 0 &&
    array(checkpoint.nodes).every((node) =>
      node.exactStateHash === exactStateHash(node.state));
}

function unitWindowFor(state = {}, unitGroupId = "") {
  const window = state.unitActivationWindow || null;
  return window?.active && window.unitGroupId === unitGroupId ? window : null;
}

function unitCombatBoundaryReached(state = {}, unitGroupId = "") {
  const window = unitWindowFor(state, unitGroupId);
  return !window || window.phase !== "combat_actions";
}

function unitPieceKeys(state = {}, unitGroupId = "") {
  return uniqueSorted(array(state.pieces)
    .filter((piece) => piece.unitGroupId === unitGroupId)
    .map((piece) => piece.pieceKey));
}

function actionDeclaresChance(action = {}) {
  const metadata = action.metadata || {};
  return Boolean(
    metadata.attackResolution ||
    metadata.randomRofDeclaration === true ||
    metadata.chanceKind ||
    array(metadata.outcomeRequirements).length ||
    array(metadata.randomRofRequirements).length ||
    /random|roll/.test(String(action.actionType || "")),
  );
}

function actionAudit(action = {}) {
  return stableGraphValue({
    actionKey: String(action.actionKey || ""),
    actionType: String(action.actionType || ""),
    actorPieceKey: String(action.actorPieceKey || ""),
    targetPieceKey: String(action.targetPieceKey || ""),
    combinedAttackKind: String(action.metadata?.combinedAttackKind || ""),
    combinedAttackContributions: array(
      action.metadata?.combinedAttackContributions,
    ).map((entry) => ({
      pieceKey: String(entry.pieceKey || ""),
      attackSlotOrigin: String(entry.attackSlotOrigin || ""),
      attackIdentityKey: String(entry.attackIdentityKey || ""),
      attackProfileKey: String(entry.attackProfileKey || ""),
      participantRole: String(entry.participantRole || ""),
    })),
  });
}

function initialCheckpoint(initialState = {}, unitGroupId = "") {
  const state = normalizeRulesV1State(initialState);
  const initialStateHash = exactStateHash(state);
  return sealCheckpoint({
    schemaVersion: WARMACHINE_UNIT_COMBAT_ACTION_SEQUENCE_CHECKPOINT_V1_SCHEMA,
    initialStateHash,
    unitGroupId,
    nextNodeIndex: 0,
    nodes: [{
      nodeKey: `unit-combat-state:${initialStateHash}`,
      exactStateHash: initialStateHash,
      state,
      depth: 0,
      status: "pending",
      witnessActionKeys: [],
    }],
    edges: [],
    exactStateHashToNodeKey: {
      [initialStateHash]: `unit-combat-state:${initialStateHash}`,
    },
    expandedNodeCount: 0,
    terminalNodeKeys: [],
    unresolvedRows: [],
    strictRejectedRows: [],
    foreignActorRows: [],
    actionTypeCounts: {},
    chanceActionCount: 0,
    deterministicActionCount: 0,
    exactChanceEdgeCount: 0,
    deterministicEdgeCount: 0,
  });
}

function incrementCount(target = {}, key = "") {
  target[key] = Number(target[key] || 0) + 1;
}

function appendUniqueAudit(rows = [], row = {}, maximum = 256) {
  const identity = stableGraphHash(stableGraphValue(row));
  if (rows.some((entry) => entry.identity === identity)) return;
  if (rows.length >= maximum) return;
  rows.push({ identity, ...stableGraphValue(row) });
}

function chanceMassConserved(step = {}) {
  return step.stepType !== "chance" ||
    step.chanceAudit?.equivalenceMassConserved === true;
}

function stepSuccessors(step = {}) {
  if (step.stepType === "deterministic" && step.successor?.transitionAccepted) {
    return [{
      state: step.successor.state,
      chanceGroupKey: "",
      responseKey: "",
      chanceNumerator: "1",
      chanceDenominator: "1",
      outcome: String(step.successor.outcome || ""),
    }];
  }
  if (step.stepType !== "chance") return [];
  return array(step.groups).flatMap((group) =>
    array(group.responses)
      .filter((response) => response.transitionAccepted && response.state)
      .map((response) => ({
        state: response.state,
        chanceGroupKey: String(group.groupKey || ""),
        responseKey: String(response.responseKey || ""),
        chanceNumerator: String(group.numerator ?? "0"),
        chanceDenominator: String(group.denominator ?? "1"),
        outcome: String(response.outcome || ""),
      })));
}

function reportFromCheckpoint(checkpoint = {}, options = {}) {
  const frontierExhausted = Number(checkpoint.nextNodeIndex) >=
    checkpoint.nodes.length;
  const unresolvedCount = checkpoint.unresolvedRows.length +
    checkpoint.strictRejectedRows.length + checkpoint.foreignActorRows.length;
  const currentHostFiniteSequenceComplete = frontierExhausted &&
    unresolvedCount === 0;
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_UNIT_COMBAT_ACTION_SEQUENCE_DOMAIN_V1_SCHEMA,
    initialStateHash: checkpoint.initialStateHash,
    unitGroupId: checkpoint.unitGroupId,
    sourceUnitPieceKeys: uniqueSorted(options.sourceUnitPieceKeys || []),
    nodeCount: checkpoint.nodes.length,
    edgeCount: checkpoint.edges.length,
    expandedNodeCount: checkpoint.expandedNodeCount,
    pendingNodeCount: Math.max(
      0,
      checkpoint.nodes.length - Number(checkpoint.nextNodeIndex),
    ),
    terminalNodeCount: checkpoint.terminalNodeKeys.length,
    maximumDepth: checkpoint.nodes.reduce((maximum, node) =>
      Math.max(maximum, Number(node.depth || 0)), 0),
    actionTypeCounts: checkpoint.actionTypeCounts,
    chanceActionCount: checkpoint.chanceActionCount,
    deterministicActionCount: checkpoint.deterministicActionCount,
    exactChanceEdgeCount: checkpoint.exactChanceEdgeCount,
    deterministicEdgeCount: checkpoint.deterministicEdgeCount,
    unresolvedRows: checkpoint.unresolvedRows,
    strictRejectedRows: checkpoint.strictRejectedRows,
    foreignActorRows: checkpoint.foreignActorRows,
    terminalWitnesses: checkpoint.nodes
      .filter((node) => checkpoint.terminalNodeKeys.includes(node.nodeKey))
      .slice(0, boundedInteger(options.maximumStoredTerminalWitnesses, 32, 512))
      .map((node) => ({
        nodeKey: node.nodeKey,
        exactStateHash: node.exactStateHash,
        depth: node.depth,
        actionKeys: node.witnessActionKeys,
      })),
    frontierExhausted,
    exactStateOnlyMerge: true,
    chanceMassComplete: currentHostFiniteSequenceComplete,
    opponentResponseDomainComplete: currentHostFiniteSequenceComplete,
    currentHostFiniteSequenceComplete,
    fullRulesActionDenominatorComplete: false,
    transitionStableRuleQuotientComplete: false,
    chanceMassAssigned: checkpoint.chanceActionCount > 0,
    claimBoundary:
      "This worklist exhausts the current Host's finite strict Unit Combat Action state graph only when every reachable node, legal action, exact Chance class and opponent response executes without debt. It merges exact normalized states only. It does not by itself prove that the Host action generator covers every continuous/non-mapped rules parameter, nor does it prove a transition-stable Q_rule quotient.",
  });
  return {
    ...core,
    unitCombatActionSequenceDomainHash: stableGraphHash(core),
  };
}

export function advanceWarmachineUnitCombatActionSequenceDomainV1(
  inputState = {},
  rawOptions = {},
) {
  const normalizedInput = normalizeRulesV1State(inputState);
  const initialWindow = normalizedInput.unitActivationWindow || null;
  const unitGroupId = String(
    rawOptions.unitGroupId || initialWindow?.unitGroupId || "",
  );
  if (!unitGroupId) throw new Error("unit_combat_sequence_unit_group_required");
  if (!initialWindow?.active || initialWindow.unitGroupId !== unitGroupId ||
      initialWindow.phase !== "combat_actions") {
    throw new Error("unit_combat_sequence_initial_window_required");
  }
  const initialStateHash = exactStateHash(normalizedInput);
  const checkpoint = rawOptions.checkpoint
    ? structuredClone(rawOptions.checkpoint)
    : initialCheckpoint(normalizedInput, unitGroupId);
  if (!checkpointValid(checkpoint, initialStateHash, unitGroupId)) {
    throw new Error("unit_combat_sequence_checkpoint_invalid");
  }
  delete checkpoint.checkpointHash;
  const nodeBudget = boundedInteger(rawOptions.nodeBudget, 8, 10000);
  const maximumNodeCount = boundedInteger(
    rawOptions.maximumNodeCount,
    10000,
    100000,
  );
  const maximumStoredAuditRows = boundedInteger(
    rawOptions.maximumStoredAuditRows,
    256,
    4096,
  );
  const sourceUnitPieceKeys = unitPieceKeys(normalizedInput, unitGroupId);
  let consumedNodes = 0;

  while (
    Number(checkpoint.nextNodeIndex) < checkpoint.nodes.length &&
    consumedNodes < nodeBudget
  ) {
    const nodeIndex = Number(checkpoint.nextNodeIndex);
    const node = checkpoint.nodes[nodeIndex];
    if (unitCombatBoundaryReached(node.state, unitGroupId)) {
      node.status = "terminal";
      checkpoint.terminalNodeKeys = uniqueSorted([
        ...checkpoint.terminalNodeKeys,
        node.nodeKey,
      ]);
      checkpoint.nextNodeIndex = nodeIndex + 1;
      checkpoint.expandedNodeCount += 1;
      consumedNodes += 1;
      continue;
    }

    const enumeration = enumerateRulesV1Actions(node.state);
    const legalActions = canonicalWarmachineActingSideActionsV1(enumeration);
    const pendingPieceKeys = new Set(array(
      enumeration.state.unitActivationWindow?.pendingTrooperPieceKeys,
    ).map(String));
    const foreignActions = legalActions.filter((action) =>
      action.actorPieceKey && !pendingPieceKeys.has(String(action.actorPieceKey)));
    for (const action of foreignActions) {
      appendUniqueAudit(checkpoint.foreignActorRows, {
        nodeKey: node.nodeKey,
        reason: "legal_action_actor_outside_pending_unit_combat_window",
        ...actionAudit(action),
      }, maximumStoredAuditRows);
    }
    if (!legalActions.length) {
      appendUniqueAudit(checkpoint.unresolvedRows, {
        nodeKey: node.nodeKey,
        reason: "active_unit_combat_window_has_no_legal_action",
      }, maximumStoredAuditRows);
    }

    for (const action of legalActions) {
      incrementCount(checkpoint.actionTypeCounts, action.actionType || "unknown");
      const reactionRequirements = strictOpponentReactionRequirementsForAction(
        action,
        {
          rulesV1State: enumeration.state,
          rulesV1Enumeration: enumeration,
        },
        enumeration.state.activeSideKey,
      );
      if (reactionRequirements.length) {
        appendUniqueAudit(checkpoint.unresolvedRows, {
          nodeKey: node.nodeKey,
          reason: "opponent_response_domain_not_expanded_in_unit_sequence_v1",
          reactionRequirementCount: reactionRequirements.length,
          reactionKinds: uniqueSorted(reactionRequirements.map((entry) =>
            entry.kind || "reaction")),
          ...actionAudit(action),
        }, maximumStoredAuditRows);
        continue;
      }
      const declaresChance = actionDeclaresChance(action);
      if (declaresChance) checkpoint.chanceActionCount += 1;
      else checkpoint.deterministicActionCount += 1;
      const step = expandWarmachineStrictPolicyStepV1(
        enumeration.state,
        () => ({
          action,
          scoped: {
            state: enumeration.state,
            enumeration,
          },
          deterministicAction: !declaresChance,
        }),
        {
          routeKey: `unit-combat-sequence:${checkpoint.initialStateHash}:${node.exactStateHash}`,
          perspectiveSideKey: enumeration.state.activeSideKey,
        },
      );
      if (step.stepType === "unresolved" || !chanceMassConserved(step)) {
        appendUniqueAudit(checkpoint.unresolvedRows, {
          nodeKey: node.nodeKey,
          reason: step.reason || "unit_combat_sequence_step_unresolved",
          chanceMassConserved: chanceMassConserved(step),
          chanceAudit: step.chanceAudit || null,
          ...actionAudit(action),
        }, maximumStoredAuditRows);
        continue;
      }
      if (step.strictRejectedDeterministicCount > 0 ||
          step.strictRejectedResponseCount > 0) {
        appendUniqueAudit(checkpoint.strictRejectedRows, {
          nodeKey: node.nodeKey,
          reason: "host_legal_unit_combat_action_strict_rejected",
          strictRejectedDeterministicCount:
            step.strictRejectedDeterministicCount || 0,
          strictRejectedResponseCount: step.strictRejectedResponseCount || 0,
          ...actionAudit(action),
        }, maximumStoredAuditRows);
        continue;
      }
      if (step.stepType === "chance" &&
          step.responseSet?.responseSetComplete !== true) {
        appendUniqueAudit(checkpoint.unresolvedRows, {
          nodeKey: node.nodeKey,
          reason: "opponent_response_set_incomplete",
          responseSet: step.responseSet,
          ...actionAudit(action),
        }, maximumStoredAuditRows);
        continue;
      }
      const successors = stepSuccessors(step);
      if (!successors.length) {
        appendUniqueAudit(checkpoint.unresolvedRows, {
          nodeKey: node.nodeKey,
          reason: "strict_unit_combat_action_has_no_successor",
          ...actionAudit(action),
        }, maximumStoredAuditRows);
        continue;
      }
      for (const successor of successors) {
        const successorState = normalizeRulesV1State(successor.state);
        const successorHash = exactStateHash(successorState);
        let successorNodeKey = checkpoint.exactStateHashToNodeKey[successorHash];
        if (!successorNodeKey) {
          if (checkpoint.nodes.length >= maximumNodeCount) {
            appendUniqueAudit(checkpoint.unresolvedRows, {
              nodeKey: node.nodeKey,
              reason: "unit_combat_sequence_maximum_node_count_reached",
              maximumNodeCount,
              successorHash,
              ...actionAudit(action),
            }, maximumStoredAuditRows);
            continue;
          }
          successorNodeKey = `unit-combat-state:${successorHash}`;
          checkpoint.exactStateHashToNodeKey[successorHash] = successorNodeKey;
          checkpoint.nodes.push({
            nodeKey: successorNodeKey,
            exactStateHash: successorHash,
            state: successorState,
            depth: Number(node.depth || 0) + 1,
            status: "pending",
            witnessActionKeys: [
              ...array(node.witnessActionKeys),
              String(action.actionKey || ""),
            ],
          });
        }
        checkpoint.edges.push(stableGraphValue({
          edgeKey: stableGraphHash(stableGraphValue({
            fromNodeKey: node.nodeKey,
            toNodeKey: successorNodeKey,
            actionKey: action.actionKey,
            chanceGroupKey: successor.chanceGroupKey,
            responseKey: successor.responseKey,
          })),
          fromNodeKey: node.nodeKey,
          toNodeKey: successorNodeKey,
          action: actionAudit(action),
          stepType: step.stepType,
          chanceGroupKey: successor.chanceGroupKey,
          responseKey: successor.responseKey,
          chanceNumerator: successor.chanceNumerator,
          chanceDenominator: successor.chanceDenominator,
          outcome: successor.outcome,
        }));
        if (step.stepType === "chance") checkpoint.exactChanceEdgeCount += 1;
        else checkpoint.deterministicEdgeCount += 1;
      }
    }
    node.status = "expanded";
    checkpoint.nextNodeIndex = nodeIndex + 1;
    checkpoint.expandedNodeCount += 1;
    consumedNodes += 1;
  }

  const sealedCheckpoint = sealCheckpoint(checkpoint);
  return {
    ok: true,
    checkpoint: sealedCheckpoint,
    report: reportFromCheckpoint(sealedCheckpoint, {
      ...rawOptions,
      sourceUnitPieceKeys,
    }),
  };
}
