import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { guardWarmachineActionWithTaskLocalRuleClosureV1 } from
  "../contracts/task-local-action-rule-guard-v1.mjs";
import { warmachineRuleBehaviorStateHashV1 } from
  "../state/semantic-hash-v1.mjs";
import {
  WARMACHINE_STRICT_ACTIVATION_WINDOW_CONTRACT,
  WARMACHINE_STRICT_CONTINUATION_WINDOW_CONTRACT,
  applyRulesV1Action,
  buildWarmachineRulesV1ActionWithStrictRngOutcome,
  enumerateRulesV1Actions,
  normalizeRulesV1State,
  strictExternalDecisionBoundaryFromEnumeration,
  warmachineHost,
} from "../warmachine-host-runtime.mjs";
import { classifyWarmachineCompleteActivationActionFamilyV2 } from
  "./complete-activation-domain-v2.mjs";
import { buildWarmachineOpponentResponseDomainV2 } from
  "./opponent-response-domain-v2.mjs";

export const WARMACHINE_CURRENT_DECISION_WINDOW_DOMAIN_V1_SCHEMA =
  "warmachine_current_decision_window_domain_v1";
export const WARMACHINE_CURRENT_DECISION_WINDOW_PAGE_V1_SCHEMA =
  "warmachine_current_decision_window_page_v1";
export const WARMACHINE_CURRENT_DECISION_WINDOW_TRANSITION_V1_SCHEMA =
  "warmachine_current_decision_window_transition_v1";

function array(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueSorted(values = []) {
  return [...new Set(Array.from(values).map(String).filter(Boolean))].sort();
}

function boundedPageLimit(value) {
  const parsed = Number(value ?? 32);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 256) {
    throw new Error("current_decision_window_page_limit_invalid");
  }
  return parsed;
}

function actionMetadataValues(action = {}, keys = []) {
  const values = [];
  for (const owner of [action, action.metadata || {}]) {
    for (const key of keys) {
      const value = owner[key];
      if (value !== undefined && value !== null && value !== "") {
        values.push(String(value));
      }
    }
  }
  return uniqueSorted(values);
}

function actionParameterAxes(action = {}) {
  const axes = [];
  const actorPieceKey = String(action.actorPieceKey || "");
  const targetPieceKey = String(action.targetPieceKey || "");
  if (actorPieceKey) {
    axes.push({
      axisKey: "actor_piece",
      valueKind: "discrete_host_value",
      selectedValues: [actorPieceKey],
      domainCompleteness: "accounted_by_current_host_enumeration",
    });
  }
  if (targetPieceKey) {
    axes.push({
      axisKey: "target_piece",
      valueKind: "discrete_host_value",
      selectedValues: [targetPieceKey],
      domainCompleteness: "accounted_by_current_host_enumeration",
    });
  }
  const profileKeys = actionMetadataValues(action, [
    "attackProfileKey",
    "effectProfileKey",
    "meleeProfileKey",
    "rangedProfileKey",
    "weaponProfileKey",
  ]);
  if (profileKeys.length) {
    axes.push({
      axisKey: "profile",
      valueKind: "discrete_host_value",
      selectedValues: profileKeys,
      domainCompleteness: "accounted_by_current_host_enumeration",
    });
  }
  const spellNames = actionMetadataValues(action, ["spellName", "animusName"]);
  if (spellNames.length) {
    axes.push({
      axisKey: "spell_or_animus",
      valueKind: "discrete_host_value",
      selectedValues: spellNames,
      domainCompleteness: "accounted_by_current_host_enumeration",
    });
  }
  const boostKeys = actionMetadataValues(action, [
    "boostConfigurationKey",
    "boostKey",
  ]);
  if (boostKeys.length) {
    axes.push({
      axisKey: "boost_configuration",
      valueKind: "discrete_host_value",
      selectedValues: boostKeys,
      domainCompleteness: "accounted_by_current_host_enumeration",
    });
  }
  const sequenceKeys = actionMetadataValues(action, [
    "attackSequenceKey",
    "sequenceKey",
  ]);
  if (sequenceKeys.length) {
    axes.push({
      axisKey: "ordered_action_sequence",
      valueKind: "discrete_host_value",
      selectedValues: sequenceKeys,
      domainCompleteness: "host_value_preserved_sequence_domain_not_globally_certified",
    });
  }
  const hasCoordinateParameter = Boolean(
    action.destination ||
    array(action.groupDestinations).length ||
    array(action.destinationsByModel).length ||
    action.metadata?.destination ||
    array(action.metadata?.movementPathPoints).length ||
    array(action.metadata?.destinationsByModel).length,
  );
  if (hasCoordinateParameter) {
    axes.push({
      axisKey: "position_path_or_joint_placement",
      valueKind: "continuous_player_parameter",
      selectedValues: [],
      representedHostValueCount: Math.max(
        action.destination ? 1 : 0,
        array(action.groupDestinations).length,
        array(action.destinationsByModel).length,
        array(action.metadata?.destinationsByModel).length,
      ),
      domainCompleteness: "unresolved_without_ticket20_geometry_certificate",
    });
  }
  return stableGraphValue(axes);
}

function actionRuleUnknownKeys(action = {}) {
  return uniqueSorted([
    ...array(action.metadata?.specialRuleAnalysis?.unresolvedRuleKeys),
    ...array(action.metadata?.unresolvedRuleKeys),
  ]);
}

function responseSummary(action = {}, enumeration = {}, windowContext = {}) {
  const domain = buildWarmachineOpponentResponseDomainV2(
    action,
    enumeration,
    windowContext,
  );
  const sequentialResponsePrefixStateAvailable = domain.requirementCount <= 1 ||
    action.metadata?.sequentialEnemyEnterReactionWindowSupported === true ||
    action.metadata?.sequentialFreeStrikeWindowSupported === true ||
    action.metadata?.sequentialDamageTransferWindowSupported === true;
  return stableGraphValue({
    opponentResponseDomainHash: domain.opponentResponseDomainHash,
    requirementCount: domain.requirementCount,
    responseOwners: uniqueSorted(domain.requirementRows.map((row) =>
      row.ownerSideKey)),
    requirementKinds: uniqueSorted(domain.requirementRows.map((row) => row.kind)),
    declaredFiniteChoiceCandidateCount:
      domain.declaredFiniteChoiceCandidateCount,
    finiteDeclaredChoiceProductWellFormed:
      domain.finiteDeclaredChoiceProductWellFormed,
    destinationParameterDomainComplete:
      domain.destinationParameterDomainComplete,
    reactionOrderDomainComplete: domain.reactionOrderDomainComplete,
    reactionChanceOutcomeDomainComplete:
      domain.reactionChanceOutcomeDomainComplete,
    damageTransferResolutionComplete:
      domain.damageTransferResolutionComplete ||
      action.metadata?.sequentialDamageTransferWindowSupported === true,
    requiresSequentialHostReenumeration: domain.requirementCount > 0,
    sequentialResponsePrefixStateAvailable,
    dynamicEligibilityReevaluationComplete:
      sequentialResponsePrefixStateAvailable,
    sequentialReactionWindowSupported:
      action.metadata?.sequentialEnemyEnterReactionWindowSupported === true,
    sequentialReactionWindowScope: String(
      action.metadata?.sequentialEnemyEnterReactionWindowScope || "",
    ),
    sequentialFreeStrikeWindowSupported:
      action.metadata?.sequentialFreeStrikeWindowSupported === true,
    sequentialFreeStrikeWindowScope: String(
      action.metadata?.sequentialFreeStrikeWindowScope || "",
    ),
    sequentialDamageTransferWindowSupported:
      action.metadata?.sequentialDamageTransferWindowSupported === true,
    independentCartesianExpansionAuthorized: false,
  });
}

function compactCheckEvidence(check = {}) {
  return stableGraphValue({
    status: String(check.status || ""),
    code: String(check.code || ""),
    marker: String(check.marker || ""),
    atomKey: String(check.atomKey || ""),
    ruleKey: String(check.ruleKey || ""),
    sourceId: String(check.sourceId || check.sourceRuleId || ""),
  });
}

function compactRuleEffectEvidence(effect = {}) {
  return stableGraphValue({
    atomKey: String(effect.atomKey || ""),
    ruleKey: String(effect.ruleKey || ""),
    hookKey: String(effect.hookKey || effect.hook || ""),
    effectType: String(effect.effectType || ""),
    implementationStatus: String(effect.implementationStatus || ""),
    exactWithinScope: effect.exactWithinScope === true,
  });
}

function compactAcceptedActionEvidence(action = {}) {
  const metadata = action.metadata || {};
  const specialAnalysis = metadata.specialRuleAnalysis || {};
  return stableGraphValue({
    schemaVersion: String(action.schemaVersion || ""),
    actionKey: String(action.actionKey || ""),
    actionType: String(action.actionType || ""),
    actorPieceKey: String(action.actorPieceKey || ""),
    targetPieceKey: String(action.targetPieceKey || ""),
    status: String(action.status || action.legality?.status || ""),
    resourceCost: Number(action.resourceCost || 0),
    resourceKind: String(action.resourceKind || ""),
    spellName: String(action.spellName || ""),
    hasDestinationParameter: Boolean(
      action.destination ||
      array(action.groupDestinations).length ||
      array(action.destinationsByModel).length ||
      metadata.destination ||
      array(metadata.movementPathPoints).length ||
      array(metadata.destinationsByModel).length
    ),
    exactWithinScope: metadata.exactWithinScope === true,
    checks: array(action.checks).map(compactCheckEvidence),
    ruleAtomEffects: array(metadata.ruleAtomEffects)
      .map(compactRuleEffectEvidence),
    specialRuleEffects: array(specialAnalysis.effects)
      .map(compactRuleEffectEvidence),
    unresolvedRuleKeys: uniqueSorted([
      ...array(specialAnalysis.unresolvedRuleKeys),
      ...array(metadata.unresolvedRuleKeys),
    ]),
  });
}

function acceptedOptionRow(
  action = {},
  enumeration = {},
  windowContext = {},
  taskLocalRuleClosure = null,
) {
  const parameterAxes = actionParameterAxes(action);
  const response = responseSummary(
    action,
    enumeration,
    windowContext,
  );
  const ruleUnknownKeys = actionRuleUnknownKeys(action);
  const taskLocalRuleGuard = guardWarmachineActionWithTaskLocalRuleClosureV1(
    action,
    taskLocalRuleClosure,
  );
  const unresolvedReasons = uniqueSorted([
    ...(parameterAxes.some((axis) =>
      axis.domainCompleteness.startsWith("unresolved_"))
      ? ["continuous_parameter_domain_unresolved"]
      : []),
    ...(response.requirementCount > 0 && (
      !response.destinationParameterDomainComplete ||
      !response.reactionOrderDomainComplete ||
      !response.reactionChanceOutcomeDomainComplete ||
      !response.damageTransferResolutionComplete)
      ? ["opponent_response_domain_unresolved"]
      : []),
    ...(!response.sequentialResponsePrefixStateAvailable
      ? ["multiple_response_host_prefix_state_unavailable"]
      : []),
    ...(ruleUnknownKeys.length ? ["action_rule_source_unresolved"] : []),
    ...(taskLocalRuleClosure &&
      taskLocalRuleGuard.disposition === "rules_unknown"
      ? ["task_local_atom_relation_unresolved"]
      : []),
  ]);
  const core = stableGraphValue({
    disposition: "host_accepted",
    actionKey: String(action.actionKey || ""),
    actionType: String(action.actionType || ""),
    familyKey: classifyWarmachineCompleteActivationActionFamilyV2(action),
    parameterAxes,
    parameterAxisCount: parameterAxes.length,
    immediateResponseDomain: response,
    ruleUnknownKeys,
    taskLocalRuleGuard,
    unresolvedReasons,
    actionEvidence: compactAcceptedActionEvidence(action),
  });
  return {
    ...core,
    optionRowKey: `accepted:${core.actionKey}`,
    optionReceiptHash: stableGraphHash(core),
  };
}

function rejectedOptionRow(rejected = {}) {
  const rejection = rejected.rejection || {};
  const core = stableGraphValue({
    disposition: "host_rejected",
    actionKey: String(rejected.actionKey || ""),
    actionType: String(rejected.actionType || ""),
    familyKey: classifyWarmachineCompleteActivationActionFamilyV2(rejected),
    rejection: {
      marker: String(rejection.marker || ""),
      reason: String(rejection.reason || ""),
      reasons: uniqueSorted(rejection.reasons || []),
      issues: array(rejection.issues).map((issue) => stableGraphValue({
        code: String(issue.code || ""),
        reason: String(issue.reason || ""),
        marker: String(issue.marker || ""),
      })),
      evidenceHash: rejection.evidence
        ? stableGraphHash(rejection.evidence)
        : "",
    },
    checkEvidence: array(rejected.checks).map(compactCheckEvidence),
  });
  const identity = stableGraphHash(core);
  return {
    ...core,
    optionRowKey: `rejected:${identity}`,
    optionReceiptHash: identity,
  };
}

function authoritySummary() {
  const authority = warmachineHost.focusedSourceReceipt?.ruleSemanticsAuthority || {};
  const verdict = authority.verdict || {};
  return stableGraphValue({
    hostReceiptHash: String(warmachineHost.receipt?.receiptHash || ""),
    focusedExecutionReceiptCurrent:
      warmachineHost.focusedSourceReceipt?.current === true,
    authorityReceiptHash: String(authority.authorityReceiptHash || ""),
    authorityDisposition: String(
      authority.disposition || "rules_semantics_unreviewed",
    ),
    sourceAuthorityCurrent: authority.sourceAuthority?.current === true,
    globalStrictReady: verdict.globalStrictReady === true,
    strictExecutorReady: verdict.strictExecutorReady === true,
    quarantineActive: authority.quarantine?.active !== false,
  });
}

function activeWindowContract(enumeration = {}) {
  const state = enumeration.state || {};
  const strictContinuationWindowFlags = array(
    WARMACHINE_STRICT_CONTINUATION_WINDOW_CONTRACT,
  ).map((entry) => String(entry.enumerationFlag || "")).filter((flag) =>
    flag && enumeration[flag] === true);
  const activeRuntimeWindowFields = uniqueSorted([
    ...array(WARMACHINE_STRICT_CONTINUATION_WINDOW_CONTRACT)
      .map((entry) => entry.runtimeField)
      .filter((field) => state[field]?.active === true),
    ...array(WARMACHINE_STRICT_ACTIVATION_WINDOW_CONTRACT)
      .map((entry) => entry.runtimeField)
      .filter((field) => state[field]?.active === true),
  ]);
  const externalDecisionBoundary =
    strictExternalDecisionBoundaryFromEnumeration(enumeration, "") || null;
  return stableGraphValue({
    strictContinuationWindowFlags,
    activeRuntimeWindowFields,
    externalDecisionBoundary,
    explicitStrictContinuationWindow:
      strictContinuationWindowFlags.length > 0,
    crossSideDecision: Boolean(
      enumeration.decisionSideKey && state.activeSideKey &&
      enumeration.decisionSideKey !== state.activeSideKey,
    ),
  });
}

function hostEnumerationScope(enumeration = {}) {
  const dimensions = [
    ["actor", "actorScopeRequested", "actorScopeApplied", "actorScopePieceKeys"],
    ["target", "targetScopeRequested", "targetScopeApplied", "targetScopePieceKeys"],
    ["action_family", "actionFamilyScopeRequested", "actionFamilyScopeApplied", "actionFamilyScopeKeys"],
    ["boost_configuration", "boostConfigurationScopeRequested", "boostConfigurationScopeApplied", "boostConfigurationKeys"],
    ["resource_amount", "resourceAmountScopeRequested", "resourceAmountScopeApplied", "resourceAmountValues"],
    ["effect_profile", "effectProfileScopeRequested", "effectProfileScopeApplied", "effectProfileKeys"],
    ["attack_sequence", "attackSequenceScopeRequested", "attackSequenceScopeApplied", "attackSequenceKeys"],
    ["movement_path_kind", "movementPathKindScopeRequested", "movementPathKindScopeApplied", "movementPathKindKeys"],
    ["generated_movement_target", "generatedMovementTargetScopeRequested", "generatedMovementTargetScopeApplied", "generatedMovementTargetKeys"],
  ];
  const rows = dimensions.map(([scopeKey, requestedKey, appliedKey, valuesKey]) =>
    stableGraphValue({
      scopeKey,
      requested: enumeration[requestedKey] === true,
      applied: enumeration[appliedKey] === true,
      values: array(enumeration[valuesKey]),
    }));
  const appliedScopeKeys = rows.filter((row) => row.applied)
    .map((row) => row.scopeKey);
  const requestedButNotAppliedScopeKeys = rows.filter((row) =>
    row.requested && !row.applied).map((row) => row.scopeKey);
  return stableGraphValue({
    rows,
    appliedScopeKeys,
    requestedButNotAppliedScopeKeys,
    hostActionSpaceNarrowed: appliedScopeKeys.length > 0,
    fullHostActionSpaceEnumerated: appliedScopeKeys.length === 0,
  });
}

function buildCurrentDecisionWindowDomainFromEnumeration(
  state = {},
  enumeration = {},
  options = {},
) {
  if (options.taskLocalRuleClosure &&
      options.taskLocalRuleClosure.hostReceiptHash !==
        warmachineHost.receipt.receiptHash) {
    throw new Error("current_decision_window_task_local_host_receipt_mismatch");
  }
  const normalizedEnumerationState = enumeration.state || state;
  const inputRuleBehaviorStateHash = String(
    options.inputRuleBehaviorStateHash ||
    warmachineRuleBehaviorStateHashV1(normalizedEnumerationState),
  );
  const windowContext = {
    normalizedEnumerationState,
    inputRuleBehaviorStateHash,
  };
  const acceptedRows = array(enumeration.actions).map((action) =>
    acceptedOptionRow(
      action,
      enumeration,
      windowContext,
      options.taskLocalRuleClosure || null,
    ));
  const rejectedRows = array(enumeration.rejectedActions).map(rejectedOptionRow);
  const optionRows = [...acceptedRows, ...rejectedRows].sort((left, right) =>
    left.optionRowKey.localeCompare(right.optionRowKey));
  const authority = authoritySummary();
  const windowContract = activeWindowContract(enumeration);
  const enumerationScope = hostEnumerationScope(enumeration);
  const ruleUnknownKeys = uniqueSorted(acceptedRows.flatMap((row) =>
    row.ruleUnknownKeys));
  const taskLocalRuleGuardEnabled = Boolean(options.taskLocalRuleClosure);
  const taskLocalRulesUnknownOptionCount = acceptedRows.filter((row) =>
    row.taskLocalRuleGuard?.disposition === "rules_unknown").length;
  const unresolvedReasons = uniqueSorted([
    ...acceptedRows.flatMap((row) => row.unresolvedReasons),
    ...(!enumeration.decisionSideKey
      ? ["host_decision_owner_missing"]
      : []),
    ...(!authority.focusedExecutionReceiptCurrent
      ? ["focused_engine_receipt_not_current"]
      : []),
    ...(!authority.globalStrictReady || !authority.strictExecutorReady ||
      authority.quarantineActive
      ? ["global_rule_semantics_not_certified"]
      : []),
    ...(enumerationScope.hostActionSpaceNarrowed
      ? ["host_enumeration_scope_narrowed"]
      : []),
    "unclassified_action_parameter_schema_pending",
  ]);
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_CURRENT_DECISION_WINDOW_DOMAIN_V1_SCHEMA,
    inputRuleBehaviorStateHash,
    stateKey: String(state.stateKey || ""),
    phaseKey: String(state.phaseKey || ""),
    activeSideKey: String(state.activeSideKey || ""),
    decisionOwnerSideKey: String(enumeration.decisionSideKey || ""),
    windowContract,
    hostEnumerationScope: enumerationScope,
    authority,
    hostEnumerationSchemaVersion: String(enumeration.schemaVersion || ""),
    hostAcceptedActionCount: Number(enumeration.actionCount || 0),
    hostRejectedActionCount: Number(enumeration.rejectedActionCount || 0),
    acceptedOptionCount: acceptedRows.length,
    rejectedOptionCount: rejectedRows.length,
    optionCount: optionRows.length,
    optionRows,
    ruleUnknownKeys,
    taskLocalRuleClosureHash: String(
      options.taskLocalRuleClosure?.taskLocalRuleClosureHash || "",
    ),
    taskLocalRuleGuardEnabled,
    taskLocalRulesUnknownOptionCount,
    unresolvedReasons,
    hostDiscreteRowsAccounted:
      acceptedRows.length === Number(enumeration.actionCount || 0) &&
      rejectedRows.length === Number(enumeration.rejectedActionCount || 0),
    stableCursorAvailable: true,
    requiresHostReenumerationAfterEverySelection: true,
    independentCartesianExpansionAuthorized: false,
    chanceMassAssigned: false,
    currentWindowResearchReady: Boolean(enumeration.decisionSideKey) &&
      acceptedRows.length === Number(enumeration.actionCount || 0) &&
      rejectedRows.length === Number(enumeration.rejectedActionCount || 0),
    currentWindowStrictComplete: false,
    strategyValuePublicationAllowed: false,
    claimBoundary:
      "This receipt accounts for the exact accepted and rejected rows returned by one Host enumeration, including any applied enumeration scope, and exposes their declared parameters and immediate response debts. A narrowed Host enumeration is not the full decision window. It does not certify unclassified parameters, continuous domains, later response windows, Chance closure, task rule coverage, strategy value or global Strict readiness. Every selected action must be applied by Host and the successor window must be re-enumerated.",
  });
  return {
    ...core,
    currentDecisionWindowDomainHash: stableGraphHash(core),
  };
}

export function buildWarmachineCurrentDecisionWindowDomainV1(
  inputState = {},
) {
  const state = normalizeRulesV1State(inputState);
  const enumeration = enumerateRulesV1Actions(state);
  return buildCurrentDecisionWindowDomainFromEnumeration(state, enumeration);
}

export function buildWarmachineCurrentDecisionWindowDomainFromHostEnumerationV1(
  inputState = {},
  enumeration = {},
  options = {},
) {
  const enumeratedState = enumeration.state || null;
  const trustedInputReference =
    options.enumeratedInputStateReference === inputState;
  if (!enumeratedState) {
    throw new Error("current_decision_window_host_enumeration_state_mismatch");
  }
  if (trustedInputReference) {
    const inputRuleBehaviorStateHash =
      warmachineRuleBehaviorStateHashV1(inputState);
    return buildCurrentDecisionWindowDomainFromEnumeration(
      enumeratedState,
      enumeration,
      {
        inputRuleBehaviorStateHash,
        taskLocalRuleClosure: options.taskLocalRuleClosure || null,
      },
    );
  }
  const state = normalizeRulesV1State(inputState);
  const enumeratedStateHash = warmachineRuleBehaviorStateHashV1(enumeratedState);
  const inputRuleBehaviorStateHash = warmachineRuleBehaviorStateHashV1(state);
  if (enumeratedStateHash !== inputRuleBehaviorStateHash) {
    throw new Error("current_decision_window_host_enumeration_state_mismatch");
  }
  return buildCurrentDecisionWindowDomainFromEnumeration(
    enumeratedState,
    enumeration,
    {
      inputRuleBehaviorStateHash,
      taskLocalRuleClosure: options.taskLocalRuleClosure || null,
    },
  );
}

function selectedActionWithPatch(action = {}, patch = {}) {
  if (patch.actionKey && patch.actionKey !== action.actionKey) {
    throw new Error("current_decision_window_action_patch_key_mismatch");
  }
  return stableGraphValue({
    ...action,
    ...patch,
    actionKey: action.actionKey,
    metadata: {
      ...(action.metadata || {}),
      ...(patch.metadata || {}),
    },
  });
}

function strictCurrentWindowAction(
  action = {},
  state = {},
  enumeration = {},
) {
  if (action.metadata?.damageTransferWindowDecision === true) {
    if (action.metadata?.damageTransferChoice !== "transfer") return action;
    return buildWarmachineRulesV1ActionWithStrictRngOutcome(action, {
      room: {
        id: `current-window-damage-transfer-${String(state.stateKey || "state")}`,
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
      selectedActionKey: String(action.metadata?.sourceActionKey || action.actionKey),
    });
  }
  if (action.metadata?.freeStrikeWindowDecision === true) {
    const choiceKey = String(action.metadata?.freeStrikeChoiceKey || action.actorPieceKey || "");
    const use = action.metadata?.freeStrikeChoice === "use";
    return buildWarmachineRulesV1ActionWithStrictRngOutcome(action, {
      room: {
        id: `current-window-free-strike-${String(state.stateKey || "state")}`,
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
      humanReactionChoices: {
        freeStrikeOutcomesByEnemy: {
          [choiceKey]: use ? { use: true } : { decline: true },
        },
      },
    });
  }
  if (action.metadata?.enemyEnterReactionWindowDecision === true) {
    const choiceKey = String(action.metadata?.reactionChoiceKey || action.actorPieceKey || "");
    const use = action.metadata?.reactionChoice === "use";
    return buildWarmachineRulesV1ActionWithStrictRngOutcome(action, {
      room: {
        id: `current-window-reaction-${String(state.stateKey || "state")}`,
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
      humanReactionChoices: {
        reactionOutcomesByReactor: {
          [choiceKey]: use
            ? {
                use: true,
                destinationOptionId: String(
                  action.metadata?.destinationOptionId || "",
                ),
                destination: action.metadata?.reactionDestination ||
                  action.destination || null,
              }
            : { decline: true },
        },
      },
    });
  }
  const metadata = { ...(action.metadata || {}) };
  let sequentialProtocolAdded = false;
  if (
    array(metadata.reactionResolutionRequirements).length > 0 &&
    metadata.sequentialEnemyEnterReactionWindowSupported === true
  ) {
    Object.assign(metadata, {
      strictSequentialEnemyEnterReactionResolution: true,
      strictSequentialEnemyEnterReactionOrderPrefix: [],
      ...(metadata.simultaneousPlacementEnemyEnterReactionWindowSupported === true
        ? {
            strictSequentialEnemyEnterReactionBatchResolution: true,
            strictSequentialEnemyEnterReactionBatchOrderPrefix: [],
          }
        : {}),
    });
    sequentialProtocolAdded = true;
  }
  if (
    array(metadata.freeStrikeResolutionRequirements).length > 0 &&
    metadata.sequentialFreeStrikeWindowSupported === true
  ) {
    Object.assign(metadata, {
      strictSequentialFreeStrikeResolution: true,
      strictSequentialFreeStrikeScope: {
        movedPieceKey: String(action.actorPieceKey || ""),
        expectedFreeStrikeOrderKeys:
          array(metadata.freeStrikeResolutionRequirements)
            .map((entry) => String(entry.enemyPieceKey || ""))
            .filter(Boolean),
      },
      strictSequentialFreeStrikeOrderPrefix: [],
    });
    sequentialProtocolAdded = true;
  }
  if (
    metadata.damageTransferDecisionAvailable === true &&
    metadata.damageTransferDecisionChoice === "decline" &&
    metadata.sequentialDamageTransferWindowSupported === true
  ) {
    metadata.strictSequentialDamageTransferResolution = true;
    sequentialProtocolAdded = true;
  }
  return sequentialProtocolAdded
    ? stableGraphValue({ ...action, metadata })
    : action;
}

export function advanceWarmachineCurrentDecisionWindowV1(
  inputState = {},
  selectedActionKey = "",
  options = {},
) {
  const state = normalizeRulesV1State(inputState);
  const enumeration = enumerateRulesV1Actions(state);
  const domain = buildCurrentDecisionWindowDomainFromEnumeration(state, enumeration);
  const action = array(enumeration.actions).find((candidate) =>
    candidate.actionKey === selectedActionKey) || null;
  if (!action) {
    throw new Error("current_decision_window_action_not_host_accepted");
  }
  const actionPatch = options.actionPatch || {};
  const generatedAction = strictCurrentWindowAction(
    selectedActionWithPatch(action, actionPatch),
    state,
    enumeration,
  );
  const suppliedStrictRollOutcome = actionPatch.metadata?.strictRollOutcome;
  const selectedAction = suppliedStrictRollOutcome &&
      typeof suppliedStrictRollOutcome === "object"
    ? stableGraphValue({
        ...generatedAction,
        metadata: {
          ...(generatedAction.metadata || {}),
          strictRollOutcome: {
            ...(generatedAction.metadata?.strictRollOutcome || {}),
            ...suppliedStrictRollOutcome,
          },
        },
      })
    : generatedAction;
  const transition = applyRulesV1Action(state, {
    ...selectedAction,
    __warmachineTrustedRulesV1Enumeration: enumeration,
  });
  const transitionAccepted = transition.ok === true;
  const successorState = transitionAccepted
    ? normalizeRulesV1State(transition.nextState)
    : null;
  const nextDecisionWindowDomain = successorState
    ? buildWarmachineCurrentDecisionWindowDomainV1(successorState)
    : null;
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_CURRENT_DECISION_WINDOW_TRANSITION_V1_SCHEMA,
    currentDecisionWindowDomainHash: domain.currentDecisionWindowDomainHash,
    selectedActionKey: action.actionKey,
    selectedOptionReceiptHash: domain.optionRows.find((row) =>
      row.disposition === "host_accepted" && row.actionKey === action.actionKey)
      ?.optionReceiptHash || "",
    actingDecisionOwnerSideKey: domain.decisionOwnerSideKey,
    transitionAccepted,
    transitionReason: String(transition.reason || ""),
    transitionEvents: stableGraphValue(array(transition.events)),
    successorRuleBehaviorStateHash: successorState
      ? warmachineRuleBehaviorStateHashV1(successorState)
      : "",
    nextDecisionWindowDomain,
    nextDecisionOwnerSideKey:
      String(nextDecisionWindowDomain?.decisionOwnerSideKey || ""),
    nextStrictContinuationWindowFlags:
      nextDecisionWindowDomain?.windowContract?.strictContinuationWindowFlags || [],
    nextActiveRuntimeWindowFields:
      nextDecisionWindowDomain?.windowContract?.activeRuntimeWindowFields || [],
    nextWindowReenumerated: transitionAccepted && Boolean(nextDecisionWindowDomain),
    independentCartesianExpansionUsed: false,
    chanceMassAssigned: false,
    strategyValuePublicationAllowed: false,
    claimBoundary:
      "One action selected from the exact current Host enumeration is strict-applied. On success the next decision window is always re-enumerated from the Host successor, including any changed owner or explicit continuation flag. Caller-supplied action patches may materialize a declared Host parameter or exact outcome, but this transition neither enumerates Chance nor proves response-order completeness.",
  });
  return {
    ...core,
    successorState,
    currentDecisionWindowTransitionHash: stableGraphHash(core),
  };
}

export function enumerateWarmachineCurrentDecisionWindowPageV1(
  inputState = {},
  cursor = {},
  options = {},
) {
  const domain = buildWarmachineCurrentDecisionWindowDomainV1(inputState);
  if (cursor.currentDecisionWindowDomainHash &&
      cursor.currentDecisionWindowDomainHash !==
        domain.currentDecisionWindowDomainHash) {
    throw new Error("current_decision_window_cursor_domain_hash_mismatch");
  }
  const nextRowIndex = Number(cursor.nextRowIndex ?? 0);
  if (!Number.isInteger(nextRowIndex) || nextRowIndex < 0 ||
      nextRowIndex > domain.optionCount) {
    throw new Error("current_decision_window_cursor_out_of_range");
  }
  const pageLimit = boundedPageLimit(options.pageLimit);
  const optionRows = domain.optionRows.slice(nextRowIndex, nextRowIndex + pageLimit);
  const followingRowIndex = nextRowIndex + optionRows.length;
  const exhausted = followingRowIndex >= domain.optionCount;
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_CURRENT_DECISION_WINDOW_PAGE_V1_SCHEMA,
    currentDecisionWindowDomainHash: domain.currentDecisionWindowDomainHash,
    decisionOwnerSideKey: domain.decisionOwnerSideKey,
    pageStartRowIndex: nextRowIndex,
    pageEndRowIndexExclusive: followingRowIndex,
    pageRowCount: optionRows.length,
    optionRows,
    cursor: {
      currentDecisionWindowDomainHash: domain.currentDecisionWindowDomainHash,
      nextRowIndex: followingRowIndex,
      exhausted,
    },
    exhausted,
    remainingRowCount: domain.optionCount - followingRowIndex,
    chanceMassAssigned: false,
  });
  return {
    ...core,
    currentDecisionWindowPageHash: stableGraphHash(core),
  };
}
