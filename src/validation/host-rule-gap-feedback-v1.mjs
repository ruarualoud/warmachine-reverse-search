import {
  applyRulesV1Action,
  enumerateRulesV1Actions,
  normalizeRulesV1State,
  recognizedWarmachineRuleAtomByAtomKey,
  recognizedWarmachineRuleAtoms,
  warmachineHost,
  warmachineRuleAtomSourceContractStatus,
} from "../warmachine-host-runtime.mjs";
import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";

export const WARMACHINE_HOST_RULE_GAP_FEEDBACK_V1_SCHEMA =
  "warmachine_host_rule_gap_feedback_v1";

function matchesSelector(action = {}, selector = {}) {
  return Boolean(
    (!selector.actionKey || action.actionKey === selector.actionKey) &&
    (!selector.actionType || action.actionType === selector.actionType) &&
    (!selector.actorPieceKey || action.actorPieceKey === selector.actorPieceKey) &&
    (!selector.targetPieceKey || action.targetPieceKey === selector.targetPieceKey)
  );
}

function compactAction(action = null) {
  if (!action) return null;
  return stableGraphValue({
    actionKey: String(action.actionKey || ""),
    actionType: String(action.actionType || ""),
    actorPieceKey: String(action.actorPieceKey || ""),
    targetPieceKey: String(action.targetPieceKey || ""),
    rejection: action.rejection || null,
    ruleAtomEffects: (action.metadata?.ruleAtomEffects || []).map((effect) => ({
      atomKey: String(effect.atomKey || ""),
      atomVersion: Number(effect.atomVersion || 0),
      hookKey: String(effect.hookKey || ""),
      ruleKey: String(effect.ruleKey || ""),
      marker: String(effect.marker || ""),
      active: effect.active !== false,
      exactWithinScope: effect.exactWithinScope === true,
    })),
    ruleAtomDiagnostics: action.metadata?.ruleAtomDiagnostics || [],
  });
}

function compactTransition(transition = {}, inputState = {}) {
  return stableGraphValue({
    ok: transition.ok === true,
    reason: String(transition.reason || ""),
    rejection: transition.rejection || transition.error || null,
    eventTypes: (transition.events || []).map((event) => String(event.eventType || "")),
    stateHashBefore: stableGraphHash(inputState),
    stateHashAfter: stableGraphHash(transition.nextState || inputState),
    lifecycleStage: String(
      transition.nextState?.lifecycleTriggerChoiceWindow?.stageKey || "",
    ),
  });
}

function applyFresh(state = {}, enumeration = {}, selected = {}, actionPatch = {}) {
  const action = {
    ...selected,
    ...stableGraphValue(actionPatch),
    metadata: {
      ...(selected.metadata || {}),
      ...(actionPatch.metadata || {}),
    },
    __warmachineTrustedRulesV1Enumeration: enumeration,
  };
  return applyRulesV1Action(enumeration.state || state, action);
}

function sourceMatchedDefinitions(sourceRule = {}, requestedAtomKey = "") {
  const definitions = recognizedWarmachineRuleAtoms();
  const candidates = requestedAtomKey
    ? definitions.filter((definition) => definition.atomKey === requestedAtomKey)
    : definitions;
  return candidates.map((definition) => ({
    definition,
    status: warmachineRuleAtomSourceContractStatus(definition, {
      specialRules: [sourceRule],
    }),
  })).filter((row) => row.status.ok === true);
}

function interactionClosure(atomKeys = []) {
  const rows = [];
  const relatedRuleKeys = new Set();
  for (const atomKey of [...new Set(atomKeys)].sort()) {
    const definition = recognizedWarmachineRuleAtomByAtomKey(atomKey);
    if (!definition) continue;
    for (const interaction of definition.interactions || []) {
      const related = (interaction.relatedRuleKeys || []).map(String).sort();
      related.forEach((ruleKey) => relatedRuleKeys.add(ruleKey));
      rows.push({
        atomKey,
        interactionKey: String(interaction.interactionKey || ""),
        relation: String(interaction.relation || ""),
        relatedRuleKeys: related,
      });
    }
  }
  return {
    atomKeys: [...new Set(atomKeys)].sort(),
    interactionRows: rows.sort((left, right) =>
      `${left.atomKey}:${left.interactionKey}`.localeCompare(
        `${right.atomKey}:${right.interactionKey}`,
      )),
    relatedRuleKeys: [...relatedRuleKeys].sort(),
  };
}

export function auditWarmachineHostRuleGapFeedbackV1(raw = {}) {
  const previous = raw.previous || {};
  const sourceRule = stableGraphValue(raw.sourceRule || {});
  const selector = stableGraphValue(raw.actionSelector || {});
  const normalizedState = normalizeRulesV1State(raw.state || {});
  const firstEnumeration = enumerateRulesV1Actions(normalizedState);
  const secondEnumeration = enumerateRulesV1Actions(normalizedState);
  const firstLegal = (firstEnumeration.actions || []).find((action) =>
    matchesSelector(action, selector)) || null;
  const secondLegal = (secondEnumeration.actions || []).find((action) =>
    matchesSelector(action, selector)) || null;
  const firstRejected = (firstEnumeration.rejectedActions || []).find((action) =>
    matchesSelector(action, selector)) || null;
  const secondRejected = (secondEnumeration.rejectedActions || []).find((action) =>
    matchesSelector(action, selector)) || null;
  const firstTransition = firstLegal
    ? applyFresh(normalizedState, firstEnumeration, firstLegal, raw.actionPatch || {})
    : null;
  const secondTransition = secondLegal
    ? applyFresh(normalizedState, secondEnumeration, secondLegal, raw.actionPatch || {})
    : null;
  const firstTransitionEvidence = firstTransition
    ? compactTransition(firstTransition, firstEnumeration.state)
    : null;
  const secondTransitionEvidence = secondTransition
    ? compactTransition(secondTransition, secondEnumeration.state)
    : null;
  const requestedAtomKey = String(previous.atomKey || raw.atomKey || "");
  const matchedDefinitions = sourceMatchedDefinitions(sourceRule, requestedAtomKey);
  const actionAtomKeys = [
    ...(firstLegal?.metadata?.ruleAtomEffects || []),
    ...(secondLegal?.metadata?.ruleAtomEffects || []),
  ].map((effect) => String(effect.atomKey || "")).filter(Boolean);
  const matchedAtomKeys = matchedDefinitions.map((row) => row.definition.atomKey);
  const atomKeys = [...new Set([...matchedAtomKeys, ...actionAtomKeys])].sort();
  const closure = interactionClosure(atomKeys);
  const legalPayloadStable = Boolean(
    firstLegal && secondLegal &&
    stableGraphHash(compactAction(firstLegal)) === stableGraphHash(compactAction(secondLegal)),
  );
  const transitionStable = Boolean(
    firstTransitionEvidence?.ok && secondTransitionEvidence?.ok &&
    firstTransitionEvidence.stateHashAfter === secondTransitionEvidence.stateHashAfter &&
    stableGraphHash(firstTransitionEvidence.eventTypes) ===
      stableGraphHash(secondTransitionEvidence.eventTypes),
  );
  const sourceContractMatched = matchedDefinitions.length > 0;
  const currentDisposition = transitionStable
    ? "strict_transition_accepted"
    : firstRejected && secondRejected
      ? "strict_rejected"
      : sourceContractMatched
        ? "inverse_unresolved"
        : "rules_unknown";
  const previousDisposition = String(previous.disposition || "rules_unknown");
  const currentHostReceiptHash = warmachineHost.receipt.receiptHash;
  const hostReceiptChanged = Boolean(
    previous.hostReceiptHash && previous.hostReceiptHash !== currentHostReceiptHash,
  );
  const ruleSourceFingerprint = stableGraphHash(sourceRule);
  const affectedArtifacts = (raw.affectedArtifacts || []).map((artifact) => {
    const reasons = [
      ...(String(artifact.hostReceiptHash || "") !== currentHostReceiptHash
        ? ["host_receipt_changed"] : []),
      ...(artifact.ruleSourceFingerprint &&
        artifact.ruleSourceFingerprint !== ruleSourceFingerprint
        ? ["rule_source_changed"] : []),
    ];
    return {
      artifactKey: String(artifact.artifactKey || ""),
      artifactKind: String(artifact.artifactKind || "search_evidence"),
      priorHostReceiptHash: String(artifact.hostReceiptHash || ""),
      invalidated: reasons.length > 0,
      invalidationReasons: reasons,
      requiredAction: reasons.length ? "rebuild_and_independently_replay" : "retain",
    };
  });
  const resolutionProven = Boolean(
    ["rules_unknown", "strict_rejected"].includes(previousDisposition) &&
    sourceContractMatched && legalPayloadStable && transitionStable &&
    currentDisposition === "strict_transition_accepted",
  );
  const dependencyReceipt = stableGraphValue({
    hostReceiptHash: currentHostReceiptHash,
    hostSourceHashes: warmachineHost.receipt.sourceHashes,
    ruleSourceFingerprint,
    atoms: matchedDefinitions.map(({ definition, status }) => ({
      atomKey: definition.atomKey,
      atomVersion: definition.atomVersion,
      definitionHash: stableGraphHash(definition),
      sourceContractStatus: status.status,
    })).sort((left, right) => left.atomKey.localeCompare(right.atomKey)),
    interactionClosureHash: stableGraphHash(closure),
  });
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_HOST_RULE_GAP_FEEDBACK_V1_SCHEMA,
    gapKey: String(raw.gapKey || `rule-gap-${stableGraphHash({ previous, selector })}`),
    previous: {
      hostReceiptHash: String(previous.hostReceiptHash || ""),
      disposition: previousDisposition,
      reason: String(previous.reason || ""),
      ruleKey: String(previous.ruleKey || ""),
      atomKey: requestedAtomKey,
      rejectedAction: previous.rejectedAction || null,
    },
    current: {
      hostReceiptHash: currentHostReceiptHash,
      disposition: currentDisposition,
      sourceContractMatched,
      legalPayloadStable,
      transitionStable,
      firstLegalAction: compactAction(firstLegal),
      secondLegalAction: compactAction(secondLegal),
      firstRejectedAction: compactAction(firstRejected),
      secondRejectedAction: compactAction(secondRejected),
      firstTransition: firstTransitionEvidence,
      secondTransition: secondTransitionEvidence,
    },
    sourceRule,
    actionSelector: selector,
    dependencyReceipt,
    interactionClosure: closure,
    hostReceiptChanged,
    dispositionChanged: previousDisposition !== currentDisposition,
    resolutionProven,
    affectedArtifacts,
    invalidatedArtifactCount: affectedArtifacts.filter((artifact) => artifact.invalidated).length,
    rebuildRequired: affectedArtifacts.some((artifact) => artifact.invalidated),
    hardPruneAllowed: false,
    trainingTruth: false,
    claimBoundary: "This feedback receipt proves only that one previously blocked rule/action case changed disposition under the current Host and identifies evidence that must be rebuilt. It does not prove route reachability, branch value, rule-family completeness, or training truth.",
  });
  return { ...core, feedbackHash: stableGraphHash(core) };
}
