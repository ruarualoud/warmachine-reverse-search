import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { warmachineRuleBehaviorStateHashV1 } from
  "../state/semantic-hash-v1.mjs";
import {
  applyRulesV1Action,
  buildWarmachineRulesV1ActionWithStrictRngOutcome,
  enumerateRulesV1Actions,
  normalizeRulesV1State,
  strictOpponentReactionRequirementsForAction,
} from "../warmachine-host-runtime.mjs";
import { buildWarmachineExactActionChanceClasses } from
  "./chance-outcomes-v1.mjs";

export const WARMACHINE_OPPONENT_RESPONSE_DOMAIN_V2_SCHEMA =
  "warmachine_opponent_response_domain_v2";
export const WARMACHINE_OPPONENT_RESPONSE_WORKLIST_V2_SCHEMA =
  "warmachine_opponent_response_worklist_v2";
export const WARMACHINE_OPPONENT_RESPONSE_CHECKPOINT_V2_SCHEMA =
  "warmachine_opponent_response_checkpoint_v2";

function array(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueSorted(values = []) {
  return [...new Set(values.map(String).filter(Boolean))].sort();
}

function validReceipt(value = {}, hashKey = "") {
  const hash = String(value[hashKey] || "");
  if (!hash) return false;
  const core = { ...value };
  delete core[hashKey];
  return stableGraphHash(core) === hash;
}

function boundedInteger(value, fallback, maximum = 10000) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= maximum
    ? parsed
    : fallback;
}

function requirementKey(requirement = {}, index = 0) {
  return [
    String(requirement.kind || "reaction"),
    String(requirement.ruleKey || "reaction"),
    String(requirement.ownerSideKey || ""),
    String(requirement.ownerPieceKey || requirement.choiceKey || ""),
    String(requirement.targetPieceKey || ""),
    String(index),
  ].join(":");
}

function damageTransferOptions(requirement = {}) {
  const rows = array(requirement.requirement?.options);
  return rows.map((row, index) => ({
    optionKey: `damage-transfer:${String(row.choiceKey || row.actionKey || index)}`,
    choice: row.damageTransfer === true ? "transfer" : "decline",
    actionKey: String(row.actionKey || ""),
    recipientPieceKey: String(row.recipientPieceKey || ""),
    payload: row.damageTransfer === true
      ? {
          use: true,
          actionKey: String(row.actionKey || ""),
          recipientPieceKey: String(row.recipientPieceKey || ""),
        }
      : { decline: true },
  }));
}

function normalizedRuleIdentity(rule = null) {
  const value = typeof rule === "string"
    ? rule
    : rule?.ruleKey || rule?.key || rule?.name || rule?.label || "";
  return String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function plainReactionChanceExpansion(requirement = {}, state = {}) {
  const detail = requirement.requirement || {};
  const attackProfileKey = String(detail.attackProfileKey || "");
  if (!attackProfileKey) {
    return {
      exactComplete: true,
      chanceRequired: false,
      reasons: [],
      classes: [{
        classKey: "deterministic-nonattack-reaction",
        numerator: 1,
        denominator: 1,
        strictRollOutcome: {},
      }],
    };
  }
  const reactor = array(state.pieces).find((piece) =>
    piece.pieceKey === requirement.ownerPieceKey) || null;
  const target = array(state.pieces).find((piece) =>
    piece.pieceKey === requirement.targetPieceKey) || null;
  const reasons = [];
  if (requirement.requiresDestination || detail.damageDiceCountDependsOnDestination === true) {
    reasons.push("reaction_destination_can_change_attack_resolution");
  }
  if (!reactor || !target) reasons.push("reaction_actor_or_target_not_bound");
  if (!detail.attackResolution || typeof detail.attackResolution !== "object") {
    reasons.push("reaction_attack_resolution_missing");
  }
  if (array(detail.atomDiagnostics).length || detail.sourceContractMismatch) {
    reasons.push("reaction_rule_source_not_exact");
  }
  if (array(detail.attackProfile?.specialRules).length) {
    reasons.push("reaction_weapon_special_rules_present");
  }
  const grantingRuleKey = normalizedRuleIdentity(requirement.ruleKey);
  const additionalReactorRules = [
    ...array(reactor?.specialRules),
    ...array(reactor?.rules),
    ...array(reactor?.abilities),
  ].filter((rule) => normalizedRuleIdentity(rule) !== grantingRuleKey);
  if (additionalReactorRules.length || array(reactor?.statusEffects).length) {
    reasons.push("reaction_actor_additional_rules_or_statuses_present");
  }
  if (reasons.length) {
    return { exactComplete: false, chanceRequired: true, reasons: uniqueSorted(reasons), classes: [] };
  }
  const syntheticAction = {
    actionKey: `reaction-chance:${requirement.choiceKey}:${requirement.targetPieceKey}`,
    actionType: "reaction_attack_chance_probe",
    actorPieceKey: requirement.ownerPieceKey,
    targetPieceKey: requirement.targetPieceKey,
    metadata: {
      attackProfile: detail.attackProfile || {},
      attackResolution: detail.attackResolution,
      specialRuleAnalysis: detail.specialRuleAnalysis || {},
      attackProfileExecutableEffects: [],
      ruleAtomEffects: array(detail.attackResolution?.ruleAtomEffects),
      ruleAtomDiagnostics: array(detail.attackResolution?.ruleAtomDiagnostics),
    },
  };
  const model = buildWarmachineExactActionChanceClasses(syntheticAction, { state });
  return {
    exactComplete: model.exactComplete === true,
    chanceRequired: true,
    reasons: uniqueSorted(model.reasons || []),
    classes: model.exactComplete === true ? array(model.classes) : [],
  };
}

function exactReactionUseOptions(requirement = {}, baseOption = {}, state = {}) {
  const chance = plainReactionChanceExpansion(requirement, state);
  if (!chance.exactComplete) {
    return [{
      ...baseOption,
      chanceOutcomeExact: false,
      chanceReasons: chance.reasons,
    }];
  }
  return [{
    ...baseOption,
    chanceOutcomeExact: true,
    chanceRequired: chance.chanceRequired,
    chanceModel: stableGraphValue({
      exactComplete: true,
      classCount: chance.classes.length,
      massNumerator: chance.classes.reduce((sum, chanceClass) =>
        sum + Number(chanceClass.numerator || 0), 0),
      massDenominator: Number(chance.classes[0]?.denominator || 1),
      classes: chance.classes.map((chanceClass) => ({
        classKey: String(chanceClass.classKey || ""),
        numerator: Number(chanceClass.numerator || 0),
        denominator: Number(chanceClass.denominator || 1),
        strictRollOutcome: stableGraphValue(chanceClass.strictRollOutcome || {}),
      })),
    }),
    chanceReasons: [],
  }];
}

function localResponseOptions(requirement = {}, state = {}) {
  if (requirement.kind === "damage_transfer") {
    return damageTransferOptions(requirement);
  }
  const rows = [{
    optionKey: `${requirement.kind}:decline`,
    choice: "decline",
    payload: { decline: true },
  }];
  if (requirement.requiresDestination) {
    for (const destination of array(
      requirement.requirement?.destinationOptions,
    )) {
      rows.push({
        optionKey: `${requirement.kind}:use:${String(destination.optionId || "")}`,
        choice: "use",
        destinationOptionId: String(destination.optionId || ""),
        destination: destination.destination || null,
        payload: {
          use: true,
          destination: destination.destination || null,
        },
      });
    }
    return rows;
  }
  rows.push(...exactReactionUseOptions(requirement, {
    optionKey: `${requirement.kind}:use`,
    choice: "use",
    payload: { use: true },
  }, state));
  return rows;
}

function responseBucket(requirement = {}) {
  if (requirement.kind === "free_strike") {
    return "freeStrikeOutcomesByEnemy";
  }
  if (requirement.kind === "damage_transfer") {
    return "damageTransferOutcomesByOwner";
  }
  return "reactionOutcomesByReactor";
}

export function buildWarmachineOpponentResponseDomainV2(
  action = {},
  enumeration = {},
  options = {},
) {
  const cachedEnumerationState =
    options.normalizedEnumerationState === enumeration.state
      ? options.normalizedEnumerationState
      : null;
  const state = cachedEnumerationState ||
    normalizeRulesV1State(enumeration.state || {});
  const inputRuleBehaviorStateHash = cachedEnumerationState &&
    options.inputRuleBehaviorStateHash
    ? String(options.inputRuleBehaviorStateHash)
    : warmachineRuleBehaviorStateHashV1(state);
  const requirements = strictOpponentReactionRequirementsForAction(
    action,
    { rulesV1State: state, rulesV1Enumeration: enumeration },
    state.activeSideKey,
  );
  const issues = [];
  const bucketChoiceKeys = new Set();
  const rows = requirements.map((requirement, index) => {
    const options = localResponseOptions(requirement, state);
    const bucket = responseBucket(requirement);
    const projectionKey = `${bucket}:${String(requirement.choiceKey || "")}`;
    if (!requirement.choiceKey) {
      issues.push(`opponent_response_choice_key_missing:${index}`);
    }
    if (bucketChoiceKeys.has(projectionKey)) {
      issues.push(`opponent_response_choice_projection_collision:${projectionKey}`);
    }
    bucketChoiceKeys.add(projectionKey);
    if (!options.length) {
      issues.push(`opponent_response_local_option_domain_empty:${index}`);
    }
    if (requirement.requiresDestination && options.length === 1) {
      issues.push(`opponent_response_destination_option_missing:${index}`);
    }
    return stableGraphValue({
      requirementKey: requirementKey(requirement, index),
      requirementIndex: index,
      kind: String(requirement.kind || ""),
      ruleKey: String(requirement.ruleKey || ""),
      choiceKey: String(requirement.choiceKey || ""),
      ownerSideKey: String(requirement.ownerSideKey || ""),
      ownerPieceKey: String(requirement.ownerPieceKey || ""),
      targetPieceKey: String(requirement.targetPieceKey || ""),
      requiresDestination: requirement.requiresDestination === true,
      requiresRecipientChoice: requirement.requiresRecipientChoice === true,
      responseBucket: bucket,
      options,
      localOptionCount: options.length,
      reactionChanceOutcomeDomainComplete: requirements.length === 1 && options
        .filter((option) => option.choice === "use")
        .every((option) => option.chanceOutcomeExact === true),
      originalRequirement: requirement,
    });
  });
  const candidateCount = rows.reduce((product, row) =>
    product * BigInt(row.localOptionCount), 1n);
  const destinationParameterDomainComplete = rows.every((row) =>
    !row.requiresDestination);
  const damageTransferResolutionComplete = rows.every((row) =>
    row.kind !== "damage_transfer");
  const reactionOrderDomainComplete = rows.length <= 1;
  const finiteDeclaredChoiceProductWellFormed = issues.length === 0;
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_OPPONENT_RESPONSE_DOMAIN_V2_SCHEMA,
    inputRuleBehaviorStateHash,
    actionKey: String(action.actionKey || ""),
    actingSideKey: String(state.activeSideKey || ""),
    requirementRows: rows,
    requirementCount: rows.length,
    declaredFiniteChoiceCandidateCount: candidateCount.toString(),
    finiteDeclaredChoiceProductWellFormed,
    destinationParameterDomainComplete,
    reactionOrderDomainComplete,
    reactionChanceOutcomeDomainComplete: rows.every((row) =>
      row.kind === "damage_transfer" || row.reactionChanceOutcomeDomainComplete === true),
    damageTransferResolutionComplete,
    opponentQuantifier: "opponent_and",
    chanceMassAssigned: false,
    validationIssues: uniqueSorted(issues),
    claimBoundary:
      "This domain preserves every opponent-owned requirement projected by the current Host and every declared finite use/decline, destination-probe or damage-transfer option. It does not treat the current finite destination probes as a complete continuous destination domain, does not invent alternate reaction priority orders, and does not replace reaction attack dice with decision probability. Those remain independent completion debts.",
  });
  return {
    ...core,
    opponentResponseDomainHash: stableGraphHash(core),
  };
}

function selectedOptionsAtOffset(domain = {}, offset = 0n) {
  let remainder = offset;
  return domain.requirementRows.map((row) => {
    const count = BigInt(row.localOptionCount);
    const optionIndex = Number(remainder % count);
    remainder /= count;
    return {
      requirementKey: row.requirementKey,
      requirementIndex: row.requirementIndex,
      kind: row.kind,
      ruleKey: row.ruleKey,
      choiceKey: row.choiceKey,
      responseBucket: row.responseBucket,
      targetPieceKey: row.targetPieceKey,
      option: row.options[optionIndex],
    };
  });
}

function humanReactionChoices(selectedOptions = []) {
  const choices = {
    freeStrikeOutcomesByEnemy: {},
    reactionOutcomesByReactor: {},
    damageTransferOutcomesByOwner: {},
  };
  for (const selected of selectedOptions) {
    choices[selected.responseBucket][selected.choiceKey] =
      stableGraphValue(selected.option.payload || {});
  }
  return choices;
}

function initialCheckpoint(domain = {}) {
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_OPPONENT_RESPONSE_CHECKPOINT_V2_SCHEMA,
    opponentResponseDomainHash: domain.opponentResponseDomainHash,
    nextCandidateOffset: "0",
    strictDecisionLedgerHash: stableGraphHash(stableGraphValue({
      opponentResponseDomainHash: domain.opponentResponseDomainHash,
      purpose: "opponent_response_decision_ledger_v2",
    })),
    strictAcceptedCount: "0",
    strictRejectedCount: "0",
    pendingSpecialResolutionCount: "0",
    strictChanceBranchExecutionCount: "0",
    acceptedSamples: [],
    rejectedSamples: [],
  });
  return { ...core, checkpointHash: stableGraphHash(core) };
}

function checkpointValid(checkpoint = {}, domain = {}) {
  return checkpoint.schemaVersion ===
      WARMACHINE_OPPONENT_RESPONSE_CHECKPOINT_V2_SCHEMA &&
    validReceipt(checkpoint, "checkpointHash") &&
    checkpoint.opponentResponseDomainHash === domain.opponentResponseDomainHash &&
    /^\d+$/.test(String(checkpoint.nextCandidateOffset || "")) &&
    /^\d+$/.test(String(checkpoint.strictAcceptedCount ?? "")) &&
    /^\d+$/.test(String(checkpoint.strictRejectedCount ?? "")) &&
    /^\d+$/.test(String(checkpoint.pendingSpecialResolutionCount ?? "")) &&
    /^\d+$/.test(String(checkpoint.strictChanceBranchExecutionCount ?? ""));
}

function sealCheckpoint(checkpoint = {}) {
  const core = stableGraphValue({ ...checkpoint });
  delete core.checkpointHash;
  return { ...core, checkpointHash: stableGraphHash(core) };
}

function increment(checkpoint = {}, key = "") {
  checkpoint[key] = (BigInt(checkpoint[key] || "0") + 1n).toString();
}

function incrementBy(checkpoint = {}, key = "", amount = 0) {
  checkpoint[key] = (BigInt(checkpoint[key] || "0") + BigInt(amount)).toString();
}

export function advanceWarmachineOpponentResponseWorklistV2(
  inputState = {},
  actionKey = "",
  options = {},
) {
  const state = normalizeRulesV1State(inputState);
  const enumeration = enumerateRulesV1Actions(state);
  const action = array(enumeration.actions).find((candidate) =>
    candidate.actionKey === actionKey) || null;
  if (!action) throw new Error("opponent_response_action_not_in_current_host_enumeration");
  const domain = buildWarmachineOpponentResponseDomainV2(action, enumeration);
  if (!domain.finiteDeclaredChoiceProductWellFormed) {
    throw new Error(`opponent_response_domain_invalid:${domain.validationIssues.join(",")}`);
  }
  const checkpoint = options.checkpoint
    ? structuredClone(options.checkpoint)
    : initialCheckpoint(domain);
  if (!checkpointValid(checkpoint, domain)) {
    throw new Error("opponent_response_checkpoint_invalid");
  }
  delete checkpoint.checkpointHash;
  const total = BigInt(domain.declaredFiniteChoiceCandidateCount);
  let cursor = BigInt(checkpoint.nextCandidateOffset);
  const candidateBudget = boundedInteger(options.candidateBudget, 16);
  const maximumStoredSampleCount = boundedInteger(
    options.maximumStoredSampleCount,
    32,
    512,
  );
  let consumed = 0;
  while (cursor < total && consumed < candidateBudget) {
    const selectedOptions = selectedOptionsAtOffset(domain, cursor);
    const damageTransferPending = selectedOptions.some((selected) =>
      selected.kind === "damage_transfer");
    let transition = null;
    let branchTransitions = [];
    let successorChanceDistribution = [];
    let status = "pending_special_resolution";
    if (!damageTransferPending) {
      const exactChanceSelection = domain.reactionChanceOutcomeDomainComplete === true
        ? selectedOptions.find((selected) =>
            selected.option.choice === "use" &&
            selected.option.chanceOutcomeExact === true &&
            selected.option.chanceModel?.exactComplete === true)
        : null;
      const chanceClasses = exactChanceSelection
        ? array(exactChanceSelection.option.chanceModel.classes)
        : [null];
      for (const [chanceIndex, chanceClass] of chanceClasses.entries()) {
        const branchSelectedOptions = selectedOptions.map((selected) => {
          if (selected !== exactChanceSelection || !chanceClass) return selected;
          return {
            ...selected,
            option: {
              ...selected.option,
              payload: {
                ...(selected.option.payload || {}),
                ...stableGraphValue(chanceClass.strictRollOutcome || {}),
              },
            },
          };
        });
        const choices = humanReactionChoices(branchSelectedOptions);
        const strictAction = buildWarmachineRulesV1ActionWithStrictRngOutcome(
          action,
          {
            room: {
              id: `opponent-response-v2-${domain.opponentResponseDomainHash}-${cursor}-chance-${chanceIndex}`,
              game: {
                round: state.turnNumber,
                turnNumber: state.turnNumber,
                activeSideKey: state.activeSideKey,
              },
            },
            sourceContext: {
              rulesV1State: state,
              rulesV1Enumeration: enumeration,
            },
            selectedActionKey: action.actionKey,
            reactionResolutionPolicy: "bot_confirmed",
            humanReactionChoices: choices,
          },
        );
        const strictRollOutcome = strictAction.metadata?.strictRollOutcome || {};
        for (const selected of branchSelectedOptions.filter((entry) =>
          entry.option.chanceOutcomeExact === true && entry.kind !== "damage_transfer")) {
          const exactPayload = {
            reactivePieceKey: selected.choiceKey,
            targetPieceKey: selected.targetPieceKey,
            ruleKey: selected.ruleKey,
            ...stableGraphValue(selected.option.payload || {}),
          };
          strictRollOutcome[selected.responseBucket] ||= {};
          strictRollOutcome[selected.responseBucket][selected.choiceKey] = exactPayload;
        }
        strictAction.metadata = {
          ...(strictAction.metadata || {}),
          strictRollOutcome,
        };
        const branchTransition = applyRulesV1Action(state, {
          ...strictAction,
          __warmachineTrustedRulesV1Enumeration: enumeration,
        });
        branchTransitions.push({ chanceClass, transition: branchTransition });
      }
      transition = branchTransitions[0]?.transition || null;
      status = branchTransitions.every((entry) => entry.transition?.ok === true)
        ? "strict_accepted"
        : "strict_rejected";
      incrementBy(checkpoint, "strictChanceBranchExecutionCount", branchTransitions.length);
      if (exactChanceSelection) {
        const bySuccessor = new Map();
        for (const { chanceClass, transition: branchTransition } of branchTransitions) {
          const accepted = branchTransition?.ok === true;
          const successorKey = accepted
            ? warmachineRuleBehaviorStateHashV1(branchTransition.nextState)
            : `rejected:${String(branchTransition?.reason || "unknown")}`;
          const prior = bySuccessor.get(successorKey) || {
            successorRuleBehaviorStateHash: accepted ? successorKey : "",
            strictRejectedReason: accepted ? "" : String(branchTransition?.reason || ""),
            numerator: 0,
            denominator: Number(chanceClass?.denominator || 1),
            chanceClassKeys: [],
          };
          prior.numerator += Number(chanceClass?.numerator || 0);
          prior.chanceClassKeys.push(String(chanceClass?.classKey || ""));
          bySuccessor.set(successorKey, prior);
        }
        successorChanceDistribution = [...bySuccessor.values()]
          .map((entry) => ({ ...entry, chanceClassKeys: uniqueSorted(entry.chanceClassKeys) }))
          .sort((left, right) =>
            String(left.successorRuleBehaviorStateHash || left.strictRejectedReason)
              .localeCompare(String(right.successorRuleBehaviorStateHash || right.strictRejectedReason)));
      }
    }
    const decision = stableGraphValue({
      candidateOffset: cursor.toString(),
      selectedOptions: selectedOptions.map((selected) => ({
        requirementKey: selected.requirementKey,
        choiceKey: selected.choiceKey,
        optionKey: selected.option.optionKey,
        choice: selected.option.choice,
        destinationOptionId: selected.option.destinationOptionId || "",
        actionKey: selected.option.actionKey || "",
        recipientPieceKey: selected.option.recipientPieceKey || "",
        chanceOutcomeExact: selected.option.chanceOutcomeExact === true,
        chanceClassCount: Number(selected.option.chanceModel?.classCount || 0),
        chanceMassNumerator: selected.option.chanceModel?.massNumerator ?? null,
        chanceMassDenominator: selected.option.chanceModel?.massDenominator ?? null,
      })),
      status,
      transitionReason: uniqueSorted(branchTransitions.map((entry) =>
        String(entry.transition?.reason || ""))).filter(Boolean).join(","),
      successorRuleBehaviorStateHash: branchTransitions.length === 1 && transition?.ok === true
        ? warmachineRuleBehaviorStateHashV1(transition.nextState)
        : "",
      successorChanceDistribution,
      chanceBranchExecutionCount: branchTransitions.length,
      transitionEventTypes: uniqueSorted(branchTransitions.flatMap((entry) =>
        array(entry.transition?.events).map((event) => event.eventType))),
    });
    checkpoint.strictDecisionLedgerHash = stableGraphHash(stableGraphValue({
      previousStrictDecisionLedgerHash: checkpoint.strictDecisionLedgerHash,
      decision,
    }));
    if (status === "strict_accepted") {
      increment(checkpoint, "strictAcceptedCount");
      if (checkpoint.acceptedSamples.length < maximumStoredSampleCount) {
        checkpoint.acceptedSamples.push(decision);
      }
    } else if (status === "strict_rejected") {
      increment(checkpoint, "strictRejectedCount");
      if (checkpoint.rejectedSamples.length < maximumStoredSampleCount) {
        checkpoint.rejectedSamples.push(decision);
      }
    } else {
      increment(checkpoint, "pendingSpecialResolutionCount");
    }
    cursor += 1n;
    consumed += 1;
  }
  checkpoint.nextCandidateOffset = cursor.toString();
  const sealedCheckpoint = sealCheckpoint(checkpoint);
  const declaredFiniteChoiceProductComplete = cursor === total;
  const accounted = BigInt(checkpoint.strictAcceptedCount) +
    BigInt(checkpoint.strictRejectedCount) +
    BigInt(checkpoint.pendingSpecialResolutionCount);
  const accountingConserved = accounted === cursor;
  const opponentResponseDomainComplete =
    declaredFiniteChoiceProductComplete &&
    domain.destinationParameterDomainComplete &&
    domain.reactionOrderDomainComplete &&
    domain.reactionChanceOutcomeDomainComplete &&
    domain.damageTransferResolutionComplete &&
    BigInt(checkpoint.strictRejectedCount) === 0n &&
    BigInt(checkpoint.pendingSpecialResolutionCount) === 0n;
  const completionDebts = uniqueSorted([
    ...(!declaredFiniteChoiceProductComplete
      ? ["declared_opponent_response_choice_product_pending"]
      : []),
    ...(!domain.destinationParameterDomainComplete
      ? ["opponent_reaction_continuous_destination_domain_pending"]
      : []),
    ...(!domain.reactionOrderDomainComplete
      ? ["opponent_reaction_priority_order_domain_pending"]
      : []),
    ...(!domain.reactionChanceOutcomeDomainComplete
      ? ["opponent_reaction_chance_distribution_pending"]
      : []),
    ...(!domain.damageTransferResolutionComplete
      ? ["damage_transfer_compound_action_resolution_pending"]
      : []),
    ...(BigInt(checkpoint.strictRejectedCount) > 0n
      ? ["declared_opponent_response_option_strict_rejected"]
      : []),
  ]);
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_OPPONENT_RESPONSE_WORKLIST_V2_SCHEMA,
    ok: accountingConserved,
    opponentResponseDomainHash: domain.opponentResponseDomainHash,
    inputRuleBehaviorStateHash: domain.inputRuleBehaviorStateHash,
    actionKey: domain.actionKey,
    opponentQuantifier: "opponent_and",
    requirementCount: domain.requirementCount,
    declaredFiniteChoiceCandidateCount:
      domain.declaredFiniteChoiceCandidateCount,
    examinedCandidateCount: cursor.toString(),
    pendingCandidateCount: (total - cursor).toString(),
    strictAcceptedCount: checkpoint.strictAcceptedCount,
    strictRejectedCount: checkpoint.strictRejectedCount,
    pendingSpecialResolutionCount: checkpoint.pendingSpecialResolutionCount,
    strictChanceBranchExecutionCount: checkpoint.strictChanceBranchExecutionCount,
    strictDecisionLedgerHash: checkpoint.strictDecisionLedgerHash,
    acceptedSamples: checkpoint.acceptedSamples,
    rejectedSamples: checkpoint.rejectedSamples,
    declaredFiniteChoiceProductComplete,
    destinationParameterDomainComplete:
      domain.destinationParameterDomainComplete,
    reactionOrderDomainComplete: domain.reactionOrderDomainComplete,
    reactionChanceOutcomeDomainComplete:
      domain.reactionChanceOutcomeDomainComplete,
    damageTransferResolutionComplete:
      domain.damageTransferResolutionComplete,
    opponentResponseDomainComplete,
    accountingConserved,
    chanceMassAssigned: false,
    completionDebts,
    resumeCheckpoint: sealedCheckpoint,
    claimBoundary:
      "Completion of this worklist exhausts only the Host-declared finite response option product for one action. The complete opponent response domain additionally requires continuous reaction destinations, legal priority orders, exact Chance distributions and compound damage-transfer execution wherever applicable.",
  });
  return {
    ...core,
    opponentResponseWorklistReceiptHash: stableGraphHash(core),
  };
}
