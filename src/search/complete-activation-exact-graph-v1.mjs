import { stableGraphHash, stableGraphValue } from
  "../graph/typed-facts-v2.mjs";
import { guardWarmachineActionWithTaskLocalRuleClosureV1 } from
  "../contracts/task-local-action-rule-guard-v1.mjs";
import {
  enumerateWarmachineBenchmarkActionsV2,
} from "../benchmark/fixed-steamroller-benchmark-v2.mjs";
import { buildWarmachineActivationGroups } from "./matchup-search-v1.mjs";
import {
  buildWarmachineCurrentDecisionWindowDomainFromHostEnumerationV1,
} from "./current-decision-window-domain-v1.mjs";
import { canonicalWarmachineActingSideActionsV1 } from
  "./opponent-response-v1.mjs";
import { expandWarmachineStrictPolicyStepV1 } from
  "./strict-policy-step-v1.mjs";
import {
  WARMACHINE_STRICT_ACTIVATION_WINDOW_CONTRACT,
  WARMACHINE_STRICT_CONTINUATION_WINDOW_CONTRACT,
  applyRulesV1Action,
  normalizeRulesV1State,
  strictOpponentReactionRequirementsForAction,
  warmachineHost,
} from "../warmachine-host-runtime.mjs";

export const WARMACHINE_COMPLETE_ACTIVATION_EXACT_GRAPH_V1_SCHEMA =
  "warmachine_complete_activation_exact_graph_v1";
export const WARMACHINE_COMPLETE_ACTIVATION_EXACT_GRAPH_REPORT_V1_SCHEMA =
  "warmachine_complete_activation_exact_graph_report_v1";

const ACTION_FAMILY_KEYS = Object.freeze([
  "movement",
  "attack_or_effect",
  "timing",
  "resource",
  "scenario",
  "special",
]);

function array(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueSorted(values = []) {
  return [...new Set(values.map(String).filter(Boolean))].sort();
}

function boundedPositiveInteger(value, fallback, maximum, reason) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error(reason);
  }
  return parsed;
}

function checkpointCore(checkpoint = {}) {
  const core = stableGraphValue(structuredClone(checkpoint));
  delete core.checkpointHash;
  return core;
}

function sealCheckpoint(checkpoint = {}) {
  const core = checkpointCore(checkpoint);
  return { ...core, checkpointHash: stableGraphHash(core) };
}

function exactStateHash(state = {}) {
  return stableGraphHash(stableGraphValue(normalizeRulesV1State(state)));
}

function pieceAlive(piece = {}) {
  return piece.destroyed !== true && piece.removedFromPlay !== true &&
    piece.offTable !== true && piece.notDeployed !== true &&
    Number(piece.damage?.boxesRemaining ?? piece.boxesRemaining ?? 1) > 0;
}

function activationGroupKey(piece = {}) {
  return String(
    piece.unitGroupId || piece.unitId || piece.metadata?.unitGroupId ||
      piece.metadata?.unitId || piece.pieceKey || "",
  );
}

function activeStrictWindowFields(state = {}) {
  return uniqueSorted([
    ...array(WARMACHINE_STRICT_ACTIVATION_WINDOW_CONTRACT),
    ...array(WARMACHINE_STRICT_CONTINUATION_WINDOW_CONTRACT),
  ].map((entry) => entry.runtimeField).filter((field) =>
    state[field]?.active === true || Boolean(state[field]?.phase)));
}

function activationBoundary(state = {}, groupKey = "") {
  const members = array(state.pieces).filter((piece) =>
    activationGroupKey(piece) === groupKey);
  const livingMembers = members.filter(pieceAlive);
  const activeWindowFields = activeStrictWindowFields(state);
  return stableGraphValue({
    groupKey,
    memberPieceKeys: uniqueSorted(members.map((piece) => piece.pieceKey)),
    livingMemberPieceKeys: uniqueSorted(livingMembers.map((piece) => piece.pieceKey)),
    allLivingMembersActivated: livingMembers.length === 0 ||
      livingMembers.every((piece) => piece.activated === true),
    activeWindowFields,
    reached: (livingMembers.length === 0 ||
      livingMembers.every((piece) => piece.activated === true)) &&
      activeWindowFields.length === 0,
  });
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
    attackProfileKey: String(
      action.attackProfileKey || action.metadata?.attackProfileKey || "",
    ),
  });
}

function terminalEvents(events = []) {
  return array(events).filter((event) => event.eventType === "terminal")
    .map((event) => stableGraphValue({
      winnerSideKey: String(event.winnerSideKey || ""),
      reason: String(event.reason || ""),
      marker: String(event.marker || ""),
    }));
}

function rationalProduct(leftNumerator, leftDenominator, rightNumerator, rightDenominator) {
  let numerator = BigInt(String(leftNumerator ?? "1")) *
    BigInt(String(rightNumerator ?? "1"));
  let denominator = BigInt(String(leftDenominator ?? "1")) *
    BigInt(String(rightDenominator ?? "1"));
  const absolute = (value) => value < 0n ? -value : value;
  let a = absolute(numerator);
  let b = absolute(denominator);
  while (b !== 0n) [a, b] = [b, a % b];
  const divisor = a || 1n;
  numerator /= divisor;
  denominator /= divisor;
  return {
    numerator: String(numerator),
    denominator: String(denominator),
  };
}

function nodeKey(stateId = "", groupKey = "") {
  return `activation-node:${stableGraphHash({ stateId, groupKey })}`;
}

function actionBranchKey(parentNodeKey = "", actionKey = "") {
  return `activation-action:${stableGraphHash({ parentNodeKey, actionKey })}`;
}

function edgeKey(payload = {}) {
  return `activation-edge:${stableGraphHash(stableGraphValue(payload))}`;
}

function workKey(payload = {}) {
  return `activation-work:${stableGraphHash(stableGraphValue(payload))}`;
}

function buildNode(stateRecord = {}, stateHash = "", depth = 0, groupKey = "") {
  const key = nodeKey(stateRecord.id, groupKey);
  return stableGraphValue({
    nodeKey: key,
    stateId: String(stateRecord.id || ""),
    stateHash,
    depth,
    status: "pending",
    decisionOwnerSideKey: "",
    quantifier: "",
    enumerationContentId: "",
    acceptedActionCount: 0,
    rejectedActionCount: 0,
    actionBranchKeys: [],
    edgeKeys: [],
    unresolvedReasons: [],
    activeWindowFields: [],
  });
}

function appendUnresolved(checkpoint, payload = {}) {
  const row = stableGraphValue(payload);
  const identity = stableGraphHash(row);
  if (checkpoint.unresolvedRows.some((entry) => entry.identity === identity)) return;
  checkpoint.unresolvedRows.push({ identity, ...row });
}

function enqueueUnique(queue = [], key = "") {
  if (key && !queue.includes(key)) queue.push(key);
}

function addSuccessorNode(checkpoint, store, parentNode, state, witnessActionKeys = []) {
  const normalized = normalizeRulesV1State(state);
  const stateHash = exactStateHash(normalized);
  const stateRecord = store.putState(normalized, { parentStateId: parentNode.stateId });
  let key = checkpoint.stateIdToNodeKey[stateRecord.id];
  if (!key) {
    const child = buildNode(
      stateRecord,
      stateHash,
      Number(parentNode.depth || 0) + 1,
      checkpoint.activationGroupKey,
    );
    child.witnessActionKeys = uniqueSorted(witnessActionKeys);
    key = child.nodeKey;
    checkpoint.nodes.push(child);
    checkpoint.stateIdToNodeKey[stateRecord.id] = key;
    enqueueUnique(checkpoint.nodeQueue, key);
  }
  return { nodeKey: key, stateId: stateRecord.id, stateHash };
}

function enumerationForNode(state = {}, checkpoint = {}) {
  const boundary = activationBoundary(state, checkpoint.activationGroupKey);
  if (boundary.reached) return { boundary, scoped: null };
  const rootLike = boundary.activeWindowFields.length === 0 &&
    boundary.allLivingMembersActivated !== true;
  const options = {
    stateAlreadyNormalized: true,
    inputStateHash: exactStateHash(state),
    includeUntargetedActions: true,
    actionFamilyKeys: ACTION_FAMILY_KEYS,
    ...(rootLike
      ? { activationGroupKey: checkpoint.activationGroupKey }
      : {}),
  };
  return {
    boundary,
    scoped: enumerateWarmachineBenchmarkActionsV2(state, options),
  };
}

function persistEnumeration(store, node, scoped = {}) {
  const {
    state: _duplicateState,
    enumeration,
    ...scopedMetadata
  } = scoped;
  const payload = stableGraphValue({
    schemaVersion: "warmachine_complete_activation_exact_enumeration_v2",
    nodeKey: node.nodeKey,
    stateHash: node.stateHash,
    enumeration,
    scopedMetadata,
  });
  return store.putContent("label", payload);
}

function restoreEnumeration(store, contentId = "", node = {}) {
  const record = store.readContent(contentId);
  const payload = record.value || {};
  if (payload.schemaVersion !==
      "warmachine_complete_activation_exact_enumeration_v2" ||
      payload.nodeKey !== node.nodeKey || payload.stateHash !== node.stateHash) {
    throw new Error("complete_activation_exact_enumeration_binding_invalid");
  }
  if (!payload.enumeration?.state) {
    throw new Error("complete_activation_exact_enumeration_state_missing");
  }
  return {
    ...(payload.scopedMetadata || {}),
    enumeration: payload.enumeration,
    state: payload.enumeration.state,
  };
}

function restoreCachedEnumeration(store, contentId = "", node = {}, runtimeCache = {}) {
  const cache = runtimeCache.enumerations;
  if (!(cache instanceof Map)) return restoreEnumeration(store, contentId, node);
  const cached = cache.get(contentId);
  if (cached) {
    cache.delete(contentId);
    cache.set(contentId, cached);
    return cached;
  }
  const scoped = restoreEnumeration(store, contentId, node);
  cache.set(contentId, scoped);
  while (cache.size > 4) cache.delete(cache.keys().next().value);
  return scoped;
}

function classifyResult(querySideKey = "") {
  return ({ events }) => {
    const terminal = terminalEvents(events)[0];
    if (!terminal) return { outcome: "continue" };
    return {
      outcome: terminal.winnerSideKey === querySideKey ? "success" : "failure",
      reason: terminal.reason || "terminal",
    };
  };
}

function addEdge(checkpoint, parentNode, branch, payload = {}) {
  const core = stableGraphValue({
    parentNodeKey: parentNode.nodeKey,
    childNodeKey: String(payload.childNodeKey || ""),
    actionBranchKey: branch.actionBranchKey,
    actionKey: branch.action.actionKey,
    actionType: branch.action.actionType,
    actorPieceKey: branch.action.actorPieceKey,
    targetPieceKey: branch.action.targetPieceKey,
    stepType: String(payload.stepType || ""),
    chanceGroupKey: String(payload.chanceGroupKey || ""),
    responseKey: String(payload.responseKey || ""),
    responseOwnerSideKey: String(payload.responseOwnerSideKey || ""),
    responseQuantifier: String(payload.responseQuantifier || ""),
    primaryProbability: stableGraphValue(payload.primaryProbability || {
      numerator: "1",
      denominator: "1",
    }),
    postResponseProbability: stableGraphValue(payload.postResponseProbability || {
      numerator: "1",
      denominator: "1",
    }),
    combinedChanceProbability: stableGraphValue(payload.combinedChanceProbability || {
      numerator: "1",
      denominator: "1",
    }),
    transitionAccepted: payload.transitionAccepted === true,
    transitionReason: String(payload.transitionReason || ""),
    terminalEvents: stableGraphValue(payload.terminalEvents || []),
    terminalOutcome: String(payload.terminalOutcome || ""),
    receiptHashes: uniqueSorted(payload.receiptHashes || []),
  });
  const key = edgeKey(core);
  if (!checkpoint.edges.some((edge) => edge.edgeKey === key)) {
    checkpoint.edges.push({ edgeKey: key, ...core });
    parentNode.edgeKeys.push(key);
    branch.edgeKeys.push(key);
  }
}

function addDeterministicSuccessor(checkpoint, store, node, branch, step) {
  const terminal = terminalEvents(step.successor?.terminalEvents || []);
  const terminalOutcome = String(step.successor?.outcome || "");
  const child = terminal.length || terminalOutcome
    ? null
    : addSuccessorNode(
      checkpoint,
      store,
      node,
      step.successor.state,
      [...array(node.witnessActionKeys), branch.action.actionKey],
    );
  addEdge(checkpoint, node, branch, {
    childNodeKey: child?.nodeKey || "",
    stepType: "deterministic",
    transitionAccepted: true,
    terminalEvents: terminal,
    terminalOutcome,
    receiptHashes: [step.successor?.receiptHash],
  });
  branch.status = "complete";
  branch.completedWorkCount = 1;
  branch.totalWorkCount = 1;
  checkpoint.counts.deterministicActionCount += 1;
  checkpoint.counts.completedActionBranchCount += 1;
}

function addDirectDeterministicSuccessor(
  checkpoint,
  store,
  node,
  branch,
  transition,
) {
  const successorState = normalizeRulesV1State(transition.nextState);
  const terminals = terminalEvents(transition.events || []);
  const terminalOutcome = terminals.length
    ? (terminals.some((entry) =>
      entry.winnerSideKey === checkpoint.querySideKey)
      ? "success"
      : "failure")
    : "";
  const child = terminals.length
    ? null
    : addSuccessorNode(
      checkpoint,
      store,
      node,
      successorState,
      [...array(node.witnessActionKeys), branch.action.actionKey],
    );
  const transitionEvidenceHash = stableGraphHash(stableGraphValue({
    hostReceiptHash: checkpoint.hostReceiptHash,
    parentStateHash: node.stateHash,
    actionKey: branch.action.actionKey,
    successorStateHash: exactStateHash(successorState),
    terminalEvents: terminals,
  }));
  addEdge(checkpoint, node, branch, {
    childNodeKey: child?.nodeKey || "",
    stepType: "deterministic_host_apply",
    transitionAccepted: true,
    terminalEvents: terminals,
    terminalOutcome,
    receiptHashes: [transitionEvidenceHash],
  });
  branch.status = "complete";
  branch.completedWorkCount = 1;
  branch.totalWorkCount = 1;
  checkpoint.counts.deterministicActionCount += 1;
  checkpoint.counts.completedActionBranchCount += 1;
}

function deferChanceAction(checkpoint, node, branch, step) {
  branch.status = "waiting_chance_response_work";
  branch.responseOwnerSideKey = String(step.responseSet?.ownerSideKey || "");
  branch.responseQuantifier = step.responseSet?.ownerSideKey
    ? (step.responseSet.ownerSideKey === checkpoint.querySideKey
      ? "owner_max"
      : "opponent_and_min")
    : "deterministic_singleton";
  branch.chanceMass = {
    numerator: String(step.chanceAudit?.massNumerator ?? "0"),
    denominator: String(step.chanceAudit?.massDenominator ?? "1"),
  };
  branch.chanceMassConserved =
    step.chanceAudit?.equivalenceMassConserved === true;
  branch.responseSetComplete = step.responseSet?.responseSetComplete === true;
  const works = array(step.groups).flatMap((group) =>
    array(group.responses).map((response) => {
      const core = stableGraphValue({
        workKind: "chance_response",
        parentNodeKey: node.nodeKey,
        actionBranchKey: branch.actionBranchKey,
        enumerationContentId: node.enumerationContentId,
        actionKey: branch.action.actionKey,
        chanceGroupKey: String(group.groupKey || ""),
        primaryProbability: {
          numerator: String(group.numerator ?? "0"),
          denominator: String(group.denominator ?? "1"),
        },
        responseOwnerSideKey: branch.responseOwnerSideKey,
        responseQuantifier: branch.responseQuantifier,
        chanceResponseWork: stableGraphValue(response.workCursor || {}),
      });
      return { workKey: workKey(core), status: "pending", ...core };
    }));
  branch.totalWorkCount = works.length;
  branch.completedWorkCount = 0;
  checkpoint.workItems.push(...works);
  checkpoint.workQueue.push(...works.map((work) => work.workKey));
  checkpoint.counts.chanceActionCount += 1;
  checkpoint.counts.totalChanceResponseWorkCount += works.length;
  if (!works.length || !branch.chanceMassConserved || !branch.responseSetComplete) {
    branch.status = "unresolved";
    checkpoint.counts.unresolvedActionBranchCount += 1;
    appendUnresolved(checkpoint, {
      nodeKey: node.nodeKey,
      actionBranchKey: branch.actionBranchKey,
      actionKey: branch.action.actionKey,
      reason: !works.length
        ? "exact_chance_action_has_no_response_work"
        : !branch.chanceMassConserved
          ? "primary_chance_mass_not_conserved"
          : "opponent_response_set_incomplete",
    });
  }
}

function expandNode(checkpoint, store, closure, node) {
  const stateRecord = store.readState(node.stateId);
  if (exactStateHash(stateRecord.value) !== node.stateHash) {
    throw new Error("complete_activation_exact_state_hash_mismatch");
  }
  const { boundary, scoped } = enumerationForNode(stateRecord.value, checkpoint);
  node.activeWindowFields = boundary.activeWindowFields;
  if (boundary.reached) {
    node.status = "activation_boundary";
    checkpoint.counts.activationBoundaryNodeCount += 1;
    return;
  }
  const enumerationRecord = persistEnumeration(store, node, scoped);
  node.enumerationContentId = enumerationRecord.id;
  const domain = buildWarmachineCurrentDecisionWindowDomainFromHostEnumerationV1(
    scoped.state,
    scoped.enumeration,
    {
      enumeratedInputStateReference: scoped.state,
      taskLocalRuleClosure: closure,
    },
  );
  node.decisionOwnerSideKey = domain.decisionOwnerSideKey;
  node.quantifier = domain.decisionOwnerSideKey === checkpoint.querySideKey
    ? "owner_max"
    : "opponent_and_min";
  node.acceptedActionCount = Number(scoped.enumeration.actionCount || 0);
  node.rejectedActionCount = Number(scoped.enumeration.rejectedActionCount || 0);
  node.hostEnumerationScope = domain.hostEnumerationScope;
  const optionByActionKey = new Map(array(domain.optionRows)
    .filter((row) => row.disposition === "host_accepted")
    .map((row) => [row.actionKey, row]));
  const legalActions = canonicalWarmachineActingSideActionsV1(scoped.enumeration)
    .slice().sort((left, right) => left.actionKey.localeCompare(right.actionKey));
  for (const action of legalActions) {
    const branch = stableGraphValue({
      actionBranchKey: actionBranchKey(node.nodeKey, action.actionKey),
      parentNodeKey: node.nodeKey,
      action: actionAudit(action),
      status: "pending",
      responseOwnerSideKey: "",
      responseQuantifier: "",
      chanceMass: null,
      chanceMassConserved: false,
      responseSetComplete: false,
      totalWorkCount: 0,
      completedWorkCount: 0,
      edgeKeys: [],
      domainUnresolvedReasons: uniqueSorted(
        optionByActionKey.get(action.actionKey)?.unresolvedReasons || [],
      ),
    });
    checkpoint.actionBranches.push(branch);
    node.actionBranchKeys.push(branch.actionBranchKey);
    const guard = guardWarmachineActionWithTaskLocalRuleClosureV1(
      { action },
      closure,
    );
    if (guard.disposition === "rules_unknown") {
      branch.status = "unresolved";
      checkpoint.counts.unresolvedActionBranchCount += 1;
      appendUnresolved(checkpoint, {
        nodeKey: node.nodeKey,
        actionBranchKey: branch.actionBranchKey,
        actionKey: action.actionKey,
        reason: "task_local_rule_dependency_unresolved",
        actionAtomKeys: guard.actionAtomKeys || [],
        unknownActionAtomKeys: guard.unknownActionAtomKeys || [],
        unresolvedInteractionObligationKeys:
          guard.unresolvedInteractionObligationKeys || [],
        unresolvedHookOrderingObligationKeys:
          guard.unresolvedHookOrderingObligationKeys || [],
        actionRuleGuardHash: guard.actionRuleGuardHash || "",
      });
      continue;
    }
    const core = stableGraphValue({
      workKind: "action",
      parentNodeKey: node.nodeKey,
      actionBranchKey: branch.actionBranchKey,
      enumerationContentId: node.enumerationContentId,
      actionKey: action.actionKey,
    });
    const work = { workKey: workKey(core), status: "pending", ...core };
    checkpoint.workItems.push(work);
    checkpoint.workQueue.push(work.workKey);
    checkpoint.counts.totalActionExpansionWorkCount += 1;
  }
  node.status = "waiting_chance_response_work";
}

function processActionWork(checkpoint, store, work, runtimeCache) {
  const node = checkpoint.nodes.find((candidate) =>
    candidate.nodeKey === work.parentNodeKey);
  const branch = checkpoint.actionBranches.find((candidate) =>
    candidate.actionBranchKey === work.actionBranchKey);
  if (!node || !branch) {
    throw new Error("complete_activation_exact_action_work_parent_missing");
  }
  const scoped = restoreCachedEnumeration(
    store,
    work.enumerationContentId,
    node,
    runtimeCache,
  );
  const action = canonicalWarmachineActingSideActionsV1(scoped.enumeration)
    .find((candidate) => candidate.actionKey === work.actionKey);
  if (!action) throw new Error("complete_activation_exact_action_work_missing");
  const declaresChance = actionDeclaresChance(action);
  if (!declaresChance) {
    const reactionRequirements = strictOpponentReactionRequirementsForAction(
      action,
      {
        rulesV1State: scoped.state,
        rulesV1Enumeration: scoped.enumeration,
      },
      scoped.state.activeSideKey,
    );
    if (reactionRequirements.length) {
      work.status = "unresolved";
      work.reason = "deterministic_action_opponent_response_domain_pending";
      branch.status = "unresolved";
      checkpoint.counts.unresolvedActionBranchCount += 1;
      appendUnresolved(checkpoint, {
        nodeKey: node.nodeKey,
        actionBranchKey: branch.actionBranchKey,
        actionKey: action.actionKey,
        reason: work.reason,
        reactionRequirementCount: reactionRequirements.length,
        reactionKinds: uniqueSorted(reactionRequirements.map((entry) =>
          entry.kind || "reaction")),
      });
    } else {
      const transition = applyRulesV1Action(scoped.state, {
        ...action,
        __warmachineTrustedRulesV1Enumeration: scoped.enumeration,
      });
      if (transition.ok === true) {
        addDirectDeterministicSuccessor(
          checkpoint,
          store,
          node,
          branch,
          transition,
        );
        work.status = "complete";
      } else {
        work.status = "unresolved";
        work.reason = transition.reason ||
          "host_legal_deterministic_action_strict_rejected";
        branch.status = "unresolved";
        checkpoint.counts.unresolvedActionBranchCount += 1;
        checkpoint.counts.strictTransitionFailureCount += 1;
        appendUnresolved(checkpoint, {
          nodeKey: node.nodeKey,
          actionBranchKey: branch.actionBranchKey,
          actionKey: action.actionKey,
          reason: work.reason,
        });
      }
    }
    checkpoint.counts.completedActionExpansionWorkCount += 1;
    completeNodeIfReady(checkpoint, node);
    return;
  }
  const step = expandWarmachineStrictPolicyStepV1(
    scoped.state,
    () => ({
      scoped,
      action,
      deterministicAction: !declaresChance,
      nextPolicyCursor: 1,
    }),
    {
      routeKey: `complete-activation:${checkpoint.sourceHash}:${work.workKey}`,
      perspectiveSideKey: checkpoint.querySideKey,
      inputStateAlreadyNormalized: true,
      inputStateHash: node.stateHash,
      deferChanceResponseExecution: declaresChance,
      chanceContextCache: runtimeCache.chanceContexts,
      classifyResult: classifyResult(checkpoint.querySideKey),
    },
  );
  if (step.stepType === "deterministic" &&
      step.successor?.transitionAccepted === true) {
    addDeterministicSuccessor(checkpoint, store, node, branch, step);
    work.status = "complete";
  } else if (step.stepType === "chance_worklist") {
    deferChanceAction(checkpoint, node, branch, step);
    work.status = "complete";
  } else {
    work.status = "unresolved";
    work.reason = step.reason || `unexpected_strict_step_type:${step.stepType}`;
    branch.status = "unresolved";
    checkpoint.counts.unresolvedActionBranchCount += 1;
    appendUnresolved(checkpoint, {
      nodeKey: node.nodeKey,
      actionBranchKey: branch.actionBranchKey,
      actionKey: action.actionKey,
      reason: work.reason,
      strictRejectedDeterministicCount:
        Number(step.strictRejectedDeterministicCount || 0),
      strictRejectedResponseCount:
        Number(step.strictRejectedResponseCount || 0),
    });
  }
  checkpoint.counts.completedActionExpansionWorkCount += 1;
  completeNodeIfReady(checkpoint, node);
}

function completeBranchIfReady(checkpoint, branch) {
  if (branch.status === "unresolved" ||
      branch.completedWorkCount < branch.totalWorkCount) return;
  branch.status = "complete";
  checkpoint.counts.completedActionBranchCount += 1;
}

function completeNodeIfReady(checkpoint, node) {
  if (!["waiting_chance_response_work", "expanded"].includes(node.status)) return;
  const branches = node.actionBranchKeys.map((key) =>
    checkpoint.actionBranches.find((branch) => branch.actionBranchKey === key))
    .filter(Boolean);
  if (branches.length !== node.actionBranchKeys.length) return;
  if (branches.every((branch) => ["complete", "unresolved"].includes(branch.status))) {
    node.status = "expanded";
    checkpoint.counts.expandedNodeCount += 1;
  }
}

function processChanceResponseWork(checkpoint, store, work, runtimeCache) {
  const node = checkpoint.nodes.find((candidate) =>
    candidate.nodeKey === work.parentNodeKey);
  const branch = checkpoint.actionBranches.find((candidate) =>
    candidate.actionBranchKey === work.actionBranchKey);
  if (!node || !branch) {
    throw new Error("complete_activation_exact_work_parent_missing");
  }
  const scoped = restoreCachedEnumeration(
    store,
    work.enumerationContentId,
    node,
    runtimeCache,
  );
  const action = canonicalWarmachineActingSideActionsV1(scoped.enumeration)
    .find((candidate) => candidate.actionKey === work.actionKey);
  if (!action) throw new Error("complete_activation_exact_work_action_missing");
  const step = expandWarmachineStrictPolicyStepV1(
    scoped.state,
    () => ({
      scoped,
      action,
      deterministicAction: false,
      nextPolicyCursor: 1,
    }),
    {
      routeKey: `complete-activation-work:${checkpoint.sourceHash}:${work.workKey}`,
      perspectiveSideKey: checkpoint.querySideKey,
      inputStateAlreadyNormalized: true,
      inputStateHash: node.stateHash,
      chanceResponseWork: work.chanceResponseWork,
      deferChanceResponseExecution: true,
      chanceContextCache: runtimeCache.chanceContexts,
      classifyResult: classifyResult(checkpoint.querySideKey),
    },
  );
  if (step.stepType === "response_unavailable") {
    work.status = "unavailable";
    work.reason = step.reason || "response_unavailable";
    branch.completedWorkCount += 1;
    checkpoint.counts.completedChanceResponseWorkCount += 1;
    checkpoint.counts.unavailableChanceResponseWorkCount += 1;
    completeBranchIfReady(checkpoint, branch);
    completeNodeIfReady(checkpoint, node);
    return;
  }
  if (step.stepType !== "chance" ||
      step.chanceAudit?.equivalenceMassConserved !== true ||
      step.responseSet?.responseSetComplete !== true) {
    work.status = "unresolved";
    work.reason = step.reason || "chance_response_work_not_exact";
    branch.status = "unresolved";
    branch.completedWorkCount += 1;
    checkpoint.counts.completedChanceResponseWorkCount += 1;
    appendUnresolved(checkpoint, {
      nodeKey: node.nodeKey,
      actionBranchKey: branch.actionBranchKey,
      workKey: work.workKey,
      actionKey: branch.action.actionKey,
      reason: work.reason,
    });
    completeNodeIfReady(checkpoint, node);
    return;
  }
  let outcomeCount = 0;
  for (const group of array(step.groups)) {
    for (const response of array(group.responses)) {
      const postOutcomes = array(response.postResponseOutcomes);
      const effectiveOutcomes = postOutcomes.length
        ? postOutcomes
        : (response.transitionAccepted && response.state
          ? [{
            classKey: "deterministic_post_response",
            probabilityNumerator: "1",
            probabilityDenominator: "1",
            transitionAccepted: true,
            resultStateHash: response.stateHash,
            outcome: response.outcome,
            outcomeReason: response.outcomeReason,
            receiptHash: response.receiptHash,
            terminalEvents: response.terminalEvents,
            executedState: response.state,
          }]
          : []);
      for (const outcome of effectiveOutcomes) {
        outcomeCount += 1;
        if (!outcome.transitionAccepted || !outcome.executedState) {
          appendUnresolved(checkpoint, {
            nodeKey: node.nodeKey,
            actionBranchKey: branch.actionBranchKey,
            workKey: work.workKey,
            actionKey: branch.action.actionKey,
            reason: outcome.reason || "strict_chance_response_transition_rejected",
          });
          continue;
        }
        const postProbability = {
          numerator: String(outcome.probabilityNumerator ?? "1"),
          denominator: String(outcome.probabilityDenominator ?? "1"),
        };
        const combinedProbability = rationalProduct(
          work.primaryProbability.numerator,
          work.primaryProbability.denominator,
          postProbability.numerator,
          postProbability.denominator,
        );
        const terminals = terminalEvents(outcome.terminalEvents || []);
        const terminalOutcome = String(outcome.outcome || "");
        const child = terminals.length || ["success", "failure"].includes(terminalOutcome)
          ? null
          : addSuccessorNode(
            checkpoint,
            store,
            node,
            outcome.executedState,
            [...array(node.witnessActionKeys), branch.action.actionKey],
          );
        addEdge(checkpoint, node, branch, {
          childNodeKey: child?.nodeKey || "",
          stepType: "chance",
          chanceGroupKey: work.chanceGroupKey,
          responseKey: String(response.responseKey || ""),
          responseOwnerSideKey: work.responseOwnerSideKey,
          responseQuantifier: work.responseQuantifier,
          primaryProbability: work.primaryProbability,
          postResponseProbability: postProbability,
          combinedChanceProbability: combinedProbability,
          transitionAccepted: true,
          terminalEvents: terminals,
          terminalOutcome,
          receiptHashes: [outcome.receiptHash, response.receiptHash],
        });
        checkpoint.counts.exactChanceOutcomeEdgeCount += 1;
      }
    }
  }
  work.status = outcomeCount ? "complete" : "unresolved";
  work.reason = outcomeCount ? "" : "chance_response_work_has_no_outcome";
  branch.completedWorkCount += 1;
  checkpoint.counts.completedChanceResponseWorkCount += 1;
  if (!outcomeCount) {
    branch.status = "unresolved";
    appendUnresolved(checkpoint, {
      nodeKey: node.nodeKey,
      actionBranchKey: branch.actionBranchKey,
      workKey: work.workKey,
      actionKey: branch.action.actionKey,
      reason: work.reason,
    });
  }
  completeBranchIfReady(checkpoint, branch);
  completeNodeIfReady(checkpoint, node);
}

function refreshDerived(checkpoint) {
  checkpoint.counts.nodeCount = checkpoint.nodes.length;
  checkpoint.counts.edgeCount = checkpoint.edges.length;
  checkpoint.counts.actionBranchCount = checkpoint.actionBranches.length;
  checkpoint.counts.pendingNodeCount = checkpoint.nodeQueue.length;
  const pendingWorks = checkpoint.workQueue.map((key) =>
    checkpoint.workItems.find((work) => work.workKey === key)).filter(Boolean);
  checkpoint.counts.pendingActionExpansionWorkCount = pendingWorks.filter((work) =>
    work.workKind === "action").length;
  checkpoint.counts.pendingChanceResponseWorkCount = pendingWorks.filter((work) =>
    work.workKind === "chance_response").length;
  checkpoint.counts.unresolvedRowCount = checkpoint.unresolvedRows.length;
  checkpoint.searchFinished = checkpoint.nodeQueue.length === 0 &&
    checkpoint.workQueue.length === 0;
  checkpoint.currentHostFiniteActivationGraphComplete = checkpoint.searchFinished &&
    checkpoint.unresolvedRows.length === 0 &&
    checkpoint.nodes.every((node) =>
      ["expanded", "activation_boundary"].includes(node.status));
}

export function validateWarmachineCompleteActivationExactGraphCheckpointV1(
  checkpoint = {},
  expected = {},
) {
  if (checkpoint.schemaVersion !==
      WARMACHINE_COMPLETE_ACTIVATION_EXACT_GRAPH_V1_SCHEMA ||
      stableGraphHash(checkpointCore(checkpoint)) !== checkpoint.checkpointHash) {
    throw new Error("complete_activation_exact_checkpoint_invalid");
  }
  for (const [field, value] of Object.entries(expected)) {
    if (value !== undefined && checkpoint[field] !== value) {
      throw new Error(`complete_activation_exact_checkpoint_${field}_mismatch`);
    }
  }
  return checkpoint;
}

export function initializeWarmachineCompleteActivationExactGraphV1(
  initialStateInput = {},
  taskLocalRuleClosure = {},
  store,
  rawOptions = {},
) {
  if (!store || typeof store.putState !== "function") {
    throw new Error("complete_activation_exact_store_required");
  }
  if (taskLocalRuleClosure.readiness?.boundedSearchLaunchReady !== true ||
      taskLocalRuleClosure.hostReceiptHash !== warmachineHost.receipt.receiptHash) {
    throw new Error("complete_activation_exact_rule_closure_not_current");
  }
  const state = normalizeRulesV1State(initialStateInput);
  const priorityPieceKey = String(rawOptions.priorityPieceKey || "");
  const group = buildWarmachineActivationGroups(state).find((candidate) =>
    candidate.actorPieceKeys.includes(priorityPieceKey));
  if (!group) throw new Error("complete_activation_exact_group_missing");
  const rootStateRecord = store.putState(state);
  const rootNode = buildNode(
    rootStateRecord,
    exactStateHash(state),
    0,
    group.groupKey,
  );
  rootNode.witnessActionKeys = [];
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_COMPLETE_ACTIVATION_EXACT_GRAPH_V1_SCHEMA,
    taskKey: String(rawOptions.taskKey || taskLocalRuleClosure.taskKey || ""),
    querySideKey: String(rawOptions.querySideKey || state.activeSideKey || ""),
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    taskLocalRuleClosureHash: taskLocalRuleClosure.taskLocalRuleClosureHash,
    sourceHash: String(rawOptions.sourceHash || ""),
    configHash: String(rawOptions.configHash || ""),
    sourceStateHash: exactStateHash(state),
    activationGroupKey: group.groupKey,
    activationPieceKeys: uniqueSorted(group.actorPieceKeys),
    rootNodeKey: rootNode.nodeKey,
    nodes: [rootNode],
    stateIdToNodeKey: { [rootStateRecord.id]: rootNode.nodeKey },
    actionBranches: [],
    edges: [],
    workItems: [],
    nodeQueue: [rootNode.nodeKey],
    workQueue: [],
    unresolvedRows: [],
    counts: {
      completedWorkUnitCount: 0,
      nodeCount: 1,
      edgeCount: 0,
      actionBranchCount: 0,
      completedActionBranchCount: 0,
      unresolvedActionBranchCount: 0,
      deterministicActionCount: 0,
      chanceActionCount: 0,
      totalActionExpansionWorkCount: 0,
      completedActionExpansionWorkCount: 0,
      pendingActionExpansionWorkCount: 0,
      totalChanceResponseWorkCount: 0,
      completedChanceResponseWorkCount: 0,
      unavailableChanceResponseWorkCount: 0,
      exactChanceOutcomeEdgeCount: 0,
      strictTransitionFailureCount: 0,
      expandedNodeCount: 0,
      activationBoundaryNodeCount: 0,
      pendingNodeCount: 1,
      pendingChanceResponseWorkCount: 0,
      unresolvedRowCount: 0,
    },
    searchFinished: false,
    currentHostFiniteActivationGraphComplete: false,
  });
  return sealCheckpoint(core);
}

export function advanceWarmachineCompleteActivationExactGraphV1(
  priorCheckpoint = {},
  taskLocalRuleClosure = {},
  store,
  rawOptions = {},
) {
  validateWarmachineCompleteActivationExactGraphCheckpointV1(priorCheckpoint, {
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    taskLocalRuleClosureHash: taskLocalRuleClosure.taskLocalRuleClosureHash,
    taskKey: taskLocalRuleClosure.taskKey,
  });
  const workUnitBudget = boundedPositiveInteger(
    rawOptions.workUnitBudget,
    1,
    10000,
    "complete_activation_exact_work_unit_budget_invalid",
  );
  const runtimeCache = {
    enumerations: new Map(),
    chanceContexts: new Map(),
  };
  const checkpoint = checkpointCore(priorCheckpoint);
  let completed = 0;
  while (completed < workUnitBudget &&
      (checkpoint.workQueue.length || checkpoint.nodeQueue.length)) {
    let progress;
    if (checkpoint.workQueue.length) {
      const nextWorkKey = checkpoint.workQueue.shift();
      const work = checkpoint.workItems.find((candidate) =>
        candidate.workKey === nextWorkKey);
      if (!work || work.status !== "pending") {
        throw new Error("complete_activation_exact_work_queue_invalid");
      }
      if (work.workKind === "action") {
        processActionWork(checkpoint, store, work, runtimeCache);
      } else if (work.workKind === "chance_response") {
        processChanceResponseWork(checkpoint, store, work, runtimeCache);
      } else {
        throw new Error("complete_activation_exact_work_kind_invalid");
      }
      progress = {
        workKind: work.workKind,
        workKey: nextWorkKey,
        status: work.status,
        remainingActionExpansionWorkCount:
          checkpoint.workQueue.map((key) => checkpoint.workItems.find((item) =>
            item.workKey === key)).filter((item) =>
            item?.workKind === "action").length,
        remainingChanceResponseWorkCount:
          checkpoint.workQueue.map((key) => checkpoint.workItems.find((item) =>
            item.workKey === key)).filter((item) =>
            item?.workKind === "chance_response").length,
        pendingNodeCount: checkpoint.nodeQueue.length,
      };
    } else {
      const nextNodeKey = checkpoint.nodeQueue.shift();
      const node = checkpoint.nodes.find((candidate) =>
        candidate.nodeKey === nextNodeKey);
      if (!node || node.status !== "pending") {
        throw new Error("complete_activation_exact_node_queue_invalid");
      }
      expandNode(checkpoint, store, taskLocalRuleClosure, node);
      completeNodeIfReady(checkpoint, node);
      progress = {
        workKind: "decision_node",
        nodeKey: nextNodeKey,
        status: node.status,
        acceptedActionCount: node.acceptedActionCount,
        actionBranchCount: node.actionBranchKeys.length,
        remainingActionExpansionWorkCount:
          checkpoint.workQueue.map((key) => checkpoint.workItems.find((item) =>
            item.workKey === key)).filter((item) =>
            item?.workKind === "action").length,
        remainingChanceResponseWorkCount:
          checkpoint.workQueue.map((key) => checkpoint.workItems.find((item) =>
            item.workKey === key)).filter((item) =>
            item?.workKind === "chance_response").length,
        pendingNodeCount: checkpoint.nodeQueue.length,
      };
    }
    completed += 1;
    checkpoint.counts.completedWorkUnitCount += 1;
    refreshDerived(checkpoint);
    rawOptions.onWorkUnitComplete?.(stableGraphValue(progress));
    rawOptions.onCheckpoint?.(sealCheckpoint(checkpoint), progress);
  }
  refreshDerived(checkpoint);
  return sealCheckpoint(checkpoint);
}

export function buildWarmachineCompleteActivationExactGraphReportV1(
  checkpoint = {},
) {
  validateWarmachineCompleteActivationExactGraphCheckpointV1(checkpoint);
  const root = checkpoint.nodes.find((node) =>
    node.nodeKey === checkpoint.rootNodeKey);
  const rootBranches = checkpoint.actionBranches.filter((branch) =>
    branch.parentNodeKey === checkpoint.rootNodeKey)
    .sort((left, right) => left.action.actionKey.localeCompare(
      right.action.actionKey,
    ));
  const continuousDebtActionCount = rootBranches.filter((branch) =>
    branch.domainUnresolvedReasons.some((reason) =>
      /continuous|parameter|path|placement/.test(reason))).length;
  const unresolvedReasons = uniqueSorted([
    ...checkpoint.unresolvedRows.map((row) => row.reason),
    ...(checkpoint.nodeQueue.length ? ["decision_nodes_pending"] : []),
    ...(checkpoint.counts.pendingActionExpansionWorkCount
      ? ["action_expansion_work_pending"]
      : []),
    ...(checkpoint.counts.pendingChanceResponseWorkCount
      ? ["chance_response_work_pending"]
      : []),
    ...(continuousDebtActionCount ? ["continuous_parameter_domain_unresolved"] : []),
  ]);
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_COMPLETE_ACTIVATION_EXACT_GRAPH_REPORT_V1_SCHEMA,
    taskKey: checkpoint.taskKey,
    querySideKey: checkpoint.querySideKey,
    hostReceiptHash: checkpoint.hostReceiptHash,
    taskLocalRuleClosureHash: checkpoint.taskLocalRuleClosureHash,
    sourceHash: checkpoint.sourceHash,
    configHash: checkpoint.configHash,
    checkpointHash: checkpoint.checkpointHash,
    sourceStateHash: checkpoint.sourceStateHash,
    activationGroupKey: checkpoint.activationGroupKey,
    activationPieceKeys: checkpoint.activationPieceKeys,
    rootNodeKey: checkpoint.rootNodeKey,
    rootDecisionOwnerSideKey: root?.decisionOwnerSideKey || "",
    rootQuantifier: root?.quantifier || "",
    rootAcceptedActionDenominator: Number(root?.acceptedActionCount || 0),
    rootCanonicalActionDenominator: rootBranches.length,
    rootRejectedActionCount: Number(root?.rejectedActionCount || 0),
    counts: checkpoint.counts,
    rootActionRows: rootBranches.map((branch) => ({
      actionBranchKey: branch.actionBranchKey,
      ...branch.action,
      status: branch.status,
      responseOwnerSideKey: branch.responseOwnerSideKey,
      responseQuantifier: branch.responseQuantifier,
      chanceMass: branch.chanceMass,
      chanceMassConserved: branch.chanceMassConserved,
      responseSetComplete: branch.responseSetComplete,
      totalWorkCount: branch.totalWorkCount,
      completedWorkCount: branch.completedWorkCount,
      successorEdgeCount: branch.edgeKeys.length,
      domainUnresolvedReasons: branch.domainUnresolvedReasons,
    })),
    unresolvedRows: checkpoint.unresolvedRows,
    unresolvedReasons,
    continuousDebtActionCount,
    searchFinished: checkpoint.searchFinished,
    currentHostFiniteActivationGraphComplete:
      checkpoint.currentHostFiniteActivationGraphComplete,
    fullRulesActivationDomainComplete:
      checkpoint.currentHostFiniteActivationGraphComplete &&
      continuousDebtActionCount === 0,
    strategyValuePublicationAllowed: false,
    claimBoundary:
      "This receipt enumerates every current-Host legal choice for one selected activation and executes deterministic transitions plus exact Chance/response work through fresh successor enumeration. Player actions, Chance classes and response choices remain distinct. Pending work, task-rule debt and continuous geometry remain explicit; finite Host graph closure does not by itself certify the full continuous rules domain or a match value.",
  });
  return { ...core, reportHash: stableGraphHash(core) };
}
