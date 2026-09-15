import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { warmachineRuleBehaviorStateHashV1 } from
  "../state/semantic-hash-v1.mjs";
import {
  applyRulesV1Action,
  buildRulesV1ParameterizedPursuitReactionDomainContract,
  buildWarmachineRulesV1ActionWithStrictRngOutcome,
  enumerateRulesV1Actions,
  normalizeRulesV1State,
  strictOpponentReactionRequirementsForAction,
  warmachineHost,
} from "../warmachine-host-runtime.mjs";
import { buildWarmachineGeometryPredicatePlanV1 } from
  "../geometry/predicate-plan-v1.mjs";
import { buildWarmachineExactActionChanceClasses } from
  "./chance-outcomes-v1.mjs";

export const WARMACHINE_OPPONENT_RESPONSE_DOMAIN_V2_SCHEMA =
  "warmachine_opponent_response_domain_v2";
export const WARMACHINE_OPPONENT_RESPONSE_WORKLIST_V2_SCHEMA =
  "warmachine_opponent_response_worklist_v2";
export const WARMACHINE_OPPONENT_RESPONSE_CHECKPOINT_V2_SCHEMA =
  "warmachine_opponent_response_checkpoint_v2";
export const WARMACHINE_PURSUIT_REACTION_ENDPOINT_DOMAIN_V1_SCHEMA =
  "warmachine_pursuit_reaction_endpoint_domain_v1";

const HOST_PURSUIT_REACTION_ENDPOINT_THEOREM =
  "host_open_convex_quantized_pursuit_reaction_straight_path_universal_strict_execution_v1";

function array(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueSorted(values = []) {
  return [...new Set(values.map(String).filter(Boolean))].sort();
}

function finiteQuantizedPoint(value = {}) {
  const xIn = Number(value?.xIn);
  const yIn = Number(value?.yIn);
  if (!Number.isFinite(xIn) || !Number.isFinite(yIn) ||
      Math.abs(xIn * 100 - Math.round(xIn * 100)) > 1e-8 ||
      Math.abs(yIn * 100 - Math.round(yIn * 100)) > 1e-8) {
    return null;
  }
  return {
    xIn: Number(xIn.toFixed(2)),
    yIn: Number(yIn.toFixed(2)),
  };
}

function samePoint(left = {}, right = {}) {
  return Math.hypot(
    Number(left.xIn) - Number(right.xIn),
    Number(left.yIn) - Number(right.yIn),
  ) <= 0.001;
}

function validReceipt(value = {}, hashKey = "") {
  const hash = String(value[hashKey] || "");
  if (!hash) return false;
  const core = { ...value };
  delete core[hashKey];
  return stableGraphHash(core) === hash;
}

function sameStringSet(left = [], right = []) {
  return JSON.stringify(uniqueSorted(left)) === JSON.stringify(uniqueSorted(right));
}

function buildPursuitReactionEndpointDomain(
  inputState = {},
  sourceActionKey = "",
  sourceSpellcasterPieceKey = "",
  selectedMovedModelPieceKey = "",
) {
  const state = normalizeRulesV1State(inputState);
  const source = buildRulesV1ParameterizedPursuitReactionDomainContract(
    state,
    {
      sourceActionKey,
      sourceSpellcasterPieceKey,
      selectedMovedModelPieceKey,
    },
  );
  const hostReceipt = source.parameterizedPursuitReactionDomainContract || {};
  const hostPredicatePlan = source.predicatePlan || {};
  const projectedReactionState = source.projectedReactionState || null;
  const searchPredicatePlan = projectedReactionState
    ? buildWarmachineGeometryPredicatePlanV1(projectedReactionState, {
        actorPieceKey: selectedMovedModelPieceKey,
        actionType: "advance",
        hostPlan: hostPredicatePlan,
      })
    : null;
  const issues = [];
  if (hostReceipt.schemaVersion !==
      "warmachine_parameterized_pursuit_reaction_domain_contract_v1") {
    issues.push("host_pursuit_parameterized_domain_schema_invalid");
  }
  if (!validReceipt(
    hostReceipt,
    "parameterizedPursuitReactionDomainContractHash",
  )) {
    issues.push("host_pursuit_parameterized_domain_hash_invalid");
  }
  if (String(hostReceipt.sourceActionKey || "") !== String(sourceActionKey) ||
      String(hostReceipt.sourceSpellcasterPieceKey || "") !==
        String(sourceSpellcasterPieceKey) ||
      String(hostReceipt.selectedMovedModelPieceKey || "") !==
        String(selectedMovedModelPieceKey)) {
    issues.push("host_pursuit_parameterized_domain_binding_mismatch");
  }
  if (!array(hostReceipt.eligibleMovedModelPieceKeys)
      .map(String).includes(String(selectedMovedModelPieceKey))) {
    issues.push("host_pursuit_parameterized_selected_model_not_eligible");
  }
  if (hostReceipt.predicatePlanHash !== hostPredicatePlan.predicatePlanHash ||
      searchPredicatePlan?.hostPredicatePlanHash !==
        hostPredicatePlan.predicatePlanHash ||
      searchPredicatePlan?.hostPredicatePlanHashMatches !== true ||
      searchPredicatePlan?.ok !== true) {
    issues.push("host_pursuit_parameterized_predicate_plan_invalid");
  }
  if (Number(hostReceipt.endpointDomain?.quantizationIn) !== 0.01 ||
      !sameStringSet(hostReceipt.endpointDomain?.predicates, [
        "endpoint_within_board_after_base_inset",
        "endpoint_within_movement_allowance",
      ]) ||
      hostReceipt.canonicalPathFamily !==
        "straight_segment_from_selected_model_start_to_endpoint") {
    issues.push("host_pursuit_parameterized_endpoint_contract_invalid");
  }
  if (hostReceipt.continuousChoiceKind !== "player_choice_not_chance" ||
      hostReceipt.chanceMassAssigned !== false) {
    issues.push("host_pursuit_parameterized_chance_contract_invalid");
  }
  if (hostReceipt.ok !== true) {
    issues.push(...array(hostReceipt.issues).map((issue) =>
      `host_pursuit_parameterized_not_ok:${String(issue)}`));
  }
  if (hostReceipt.strictUniversalReactionActionExecutionComplete !== true ||
      hostReceipt.theoremKey !== HOST_PURSUIT_REACTION_ENDPOINT_THEOREM ||
      !hostReceipt.zeroDistanceWitnessReceiptHash ||
      !hostReceipt.positiveDistanceWitnessReceiptHash) {
    issues.push("host_pursuit_parameterized_universal_execution_missing");
  }
  const validationIssues = uniqueSorted(issues);
  const destinationParameterLegalityComplete = validationIssues.length === 0;
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_PURSUIT_REACTION_ENDPOINT_DOMAIN_V1_SCHEMA,
    ok: destinationParameterLegalityComplete,
    inputRuleBehaviorStateHash: warmachineRuleBehaviorStateHashV1(state),
    sourceActionKey: String(sourceActionKey),
    sourceActionTargetPieceKey: String(
      hostReceipt.sourceActionTargetPieceKey || "",
    ),
    sourceSpellcasterPieceKey: String(sourceSpellcasterPieceKey),
    selectedMovedModelPieceKey: String(selectedMovedModelPieceKey),
    eligibleMovedModelPieceKeys: uniqueSorted(
      hostReceipt.eligibleMovedModelPieceKeys,
    ),
    hostParameterizedPursuitReactionDomainContractHash: String(
      hostReceipt.parameterizedPursuitReactionDomainContractHash || "",
    ),
    hostPredicatePlanHash: String(hostPredicatePlan.predicatePlanHash || ""),
    searchPredicatePlanReceiptHash: String(
      searchPredicatePlan?.predicatePlanReceiptHash || "",
    ),
    configurationObstacleExclusionProofs: stableGraphValue(
      searchPredicatePlan?.configurationObstacleExclusionProofs || [],
    ),
    endpointDomain: stableGraphValue(hostReceipt.endpointDomain || {}),
    canonicalPathFamily: String(hostReceipt.canonicalPathFamily || ""),
    theoremKey: String(hostReceipt.theoremKey || ""),
    destinationParameterLegalityComplete,
    transitionStable: false,
    fullDestinationParameterDomainComplete: false,
    hostFocusedExecutionReceiptCurrent:
      warmachineHost.focusedSourceReceipt?.current === true,
    continuousChoiceKind: "player_choice_not_chance",
    chanceMassAssigned: false,
    validationIssues,
    completionDebts: [
      ...(destinationParameterLegalityComplete
        ? []
        : ["selected_pursuit_endpoint_legality_not_proven"]),
      "pursuit_path_class_partition_not_proven",
      "pursuit_transition_stability_not_proven",
    ],
    claimBoundary:
      "This Search receipt validates one Engine-owned open Pursuit endpoint theorem for one selected eligible battlegroup model. It proves one canonical straight strict path exists for every admitted cent-inch endpoint. It does not certify other eligible models, nonstraight path classes, transition stability, strategy equivalence or the complete opponent response domain.",
  });
  return {
    ...core,
    pursuitReactionEndpointDomainHash: stableGraphHash(core),
  };
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

function normalizeParameterizedDestinationProposals(options = {}) {
  const issues = [];
  const seenKeys = new Set();
  const rows = array(options.parameterizedDestinationProposals).map((proposal, index) => {
    const proposalKey = String(proposal?.proposalKey || "");
    const ruleKey = String(proposal?.ruleKey || "");
    const ownerPieceKey = String(
      proposal?.ownerPieceKey || proposal?.reactivePieceKey || "",
    );
    const targetPieceKey = String(proposal?.targetPieceKey || "");
    const choiceKey = String(proposal?.choiceKey || "");
    const selectedMovedModelPieceKey = String(
      proposal?.selectedMovedModelPieceKey || "",
    );
    const movementPathPoints = array(proposal?.movementPathPoints)
      .map(finiteQuantizedPoint);
    const destination = finiteQuantizedPoint(proposal?.destination);
    const prefix = `parameterized_destination_proposal_${index}`;
    if (!proposalKey) issues.push(`${prefix}_key_missing`);
    if (proposalKey && seenKeys.has(proposalKey)) {
      issues.push(`${prefix}_key_duplicate:${proposalKey}`);
    }
    seenKeys.add(proposalKey);
    if (!ruleKey || !ownerPieceKey || !targetPieceKey) {
      issues.push(`${prefix}_requirement_identity_missing`);
    }
    if (ruleKey && ruleKey !== "pursuit") {
      issues.push(`${prefix}_rule_not_supported:${ruleKey}`);
    }
    if (!selectedMovedModelPieceKey) {
      issues.push(`${prefix}_selected_moved_model_missing`);
    }
    if (!movementPathPoints.length || movementPathPoints.some((point) => !point)) {
      issues.push(`${prefix}_path_invalid_or_not_cent_inch_quantized`);
    }
    if (!destination) {
      issues.push(`${prefix}_destination_invalid_or_not_cent_inch_quantized`);
    } else if (movementPathPoints.length &&
        movementPathPoints.every(Boolean) &&
        !samePoint(movementPathPoints.at(-1), destination)) {
      issues.push(`${prefix}_path_destination_mismatch`);
    }
    return stableGraphValue({
      proposalKey,
      ruleKey,
      ownerPieceKey,
      targetPieceKey,
      choiceKey,
      selectedMovedModelPieceKey,
      destination,
      movementPathPoints: movementPathPoints.filter(Boolean),
    });
  });
  return { rows, issues: uniqueSorted(issues) };
}

function parameterizedProposalMatchesRequirement(proposal = {}, requirement = {}) {
  if (proposal.choiceKey &&
      proposal.choiceKey !== String(requirement.choiceKey || "")) {
    return false;
  }
  return proposal.ruleKey === String(requirement.ruleKey || "") &&
    proposal.ownerPieceKey === String(requirement.ownerPieceKey || "") &&
    proposal.targetPieceKey === String(requirement.targetPieceKey || "");
}

function localResponseOptions(
  requirement = {},
  state = {},
  parameterizedDestinationProposals = [],
) {
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
      const destinationOutcomeRequirements =
        destination.outcomeRequirements &&
        typeof destination.outcomeRequirements === "object"
          ? destination.outcomeRequirements
          : {};
      const deterministicNonAttackDestination =
        !requirement.requirement?.attackProfileKey &&
        !destination.attackResolution &&
        destination.damageDiceCount == null &&
        Object.keys(destinationOutcomeRequirements).length === 0;
      rows.push({
        optionKey: `${requirement.kind}:use:${String(destination.optionId || "")}`,
        choice: "use",
        optionSource: "host_declared_destination_probe",
        destinationOptionId: String(destination.optionId || ""),
        destination: destination.destination || null,
        payload: {
          use: true,
          destinationOptionId: String(destination.optionId || ""),
          ...(destination.movedModelPieceKey ? {
            selectedMovedModelPieceKey: String(destination.movedModelPieceKey),
          } : {}),
          destination: destination.destination || null,
          ...(array(destination.movementPathPoints).length ? {
            movementPathPoints: stableGraphValue(destination.movementPathPoints),
          } : {}),
        },
        chanceOutcomeExact: deterministicNonAttackDestination,
        chanceRequired: false,
        chanceReasons: deterministicNonAttackDestination
          ? []
          : ["reaction_destination_attack_or_outcome_chance_unresolved"],
      });
    }
    const existingPayloadHashes = new Set(rows
      .filter((row) => row.choice === "use")
      .map((row) => stableGraphHash(stableGraphValue(row.payload || {}))));
    for (const proposal of parameterizedDestinationProposals) {
      const payload = stableGraphValue({
        use: true,
        selectedMovedModelPieceKey: proposal.selectedMovedModelPieceKey,
        destination: proposal.destination,
        movementPathPoints: proposal.movementPathPoints,
      });
      const payloadHash = stableGraphHash(payload);
      if (existingPayloadHashes.has(payloadHash)) continue;
      existingPayloadHashes.add(payloadHash);
      rows.push({
        optionKey: `${requirement.kind}:use:parameterized:${proposal.proposalKey}`,
        choice: "use",
        optionSource: "search_parameterized_destination_proposal",
        destinationOptionId: `parameterized:${proposal.proposalKey}`,
        parameterizedDestinationProposalKey: proposal.proposalKey,
        destination: proposal.destination,
        payload,
        chanceOutcomeExact: false,
        chanceRequired: false,
        chanceRequirementUnknown: true,
        chanceReasons: [
          "parameterized_reaction_destination_outcome_requires_strict_execution",
        ],
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
  const parameterizedDestinationProposals =
    normalizeParameterizedDestinationProposals(options);
  const issues = [...parameterizedDestinationProposals.issues];
  const requestedPursuitMovedModelPieceKeys = uniqueSorted(
    options.parameterizedPursuitSelectedMovedModelPieceKeys,
  );
  const pursuitRequirements = requirements.filter((requirement) =>
    String(requirement.ruleKey || "") === "pursuit");
  const parameterizedPursuitCertificationIssues = [];
  if (requestedPursuitMovedModelPieceKeys.length &&
      pursuitRequirements.length !== 1) {
    parameterizedPursuitCertificationIssues.push(
      "parameterized_pursuit_selected_models_require_single_pursuit_scope",
    );
  }
  const pursuitRequirement = pursuitRequirements.length === 1
    ? pursuitRequirements[0]
    : null;
  const parameterizedPursuitReactionEndpointDomains = pursuitRequirement
    ? requestedPursuitMovedModelPieceKeys.map((selectedMovedModelPieceKey) =>
        buildPursuitReactionEndpointDomain(
          state,
          action.actionKey,
          String(
            pursuitRequirement.requirement?.sourceSpellcasterPieceKey ||
              pursuitRequirement.ownerPieceKey || "",
          ),
          selectedMovedModelPieceKey,
        ))
    : [];
  if (parameterizedDestinationProposals.rows.length && requirements.length !== 1) {
    issues.push("parameterized_destination_proposals_require_single_reaction_scope");
  }
  for (const proposal of parameterizedDestinationProposals.rows) {
    const matchCount = requirements.filter((requirement) =>
      parameterizedProposalMatchesRequirement(proposal, requirement)).length;
    if (matchCount !== 1) {
      issues.push(
        `parameterized_destination_proposal_requirement_match_count:${proposal.proposalKey}:${matchCount}`,
      );
    }
  }
  const bucketChoiceKeys = new Set();
  const rows = requirements.map((requirement, index) => {
    const matchedProposals = parameterizedDestinationProposals.rows.filter((proposal) =>
      parameterizedProposalMatchesRequirement(proposal, requirement));
    const localOptions = localResponseOptions(requirement, state, matchedProposals);
    const parameterizedEndpointDomains =
      parameterizedPursuitReactionEndpointDomains.filter((domain) =>
        domain.sourceActionTargetPieceKey ===
          String(requirement.targetPieceKey || "") &&
        domain.sourceSpellcasterPieceKey ===
          String(requirement.ownerPieceKey || ""));
    const eligibleMovedModelPieceKeys = uniqueSorted([
      ...array(requirement.eligibleMovedModelPieceKeys),
      ...array(requirement.requirement?.eligibleMovedModelPieceKeys),
    ]);
    const certifiedMovedModelPieceKeys = uniqueSorted(
      parameterizedEndpointDomains
        .filter((domain) => domain.destinationParameterLegalityComplete === true)
        .map((domain) => domain.selectedMovedModelPieceKey),
    );
    const uncertifiedEligibleMovedModelPieceKeys =
      eligibleMovedModelPieceKeys.filter((pieceKey) =>
        !certifiedMovedModelPieceKeys.includes(pieceKey));
    const destinationParameterLegalityComplete =
      requirement.requiresDestination !== true || (
        eligibleMovedModelPieceKeys.length > 0 &&
        uncertifiedEligibleMovedModelPieceKeys.length === 0
      );
    const bucket = responseBucket(requirement);
    const projectionKey = `${bucket}:${String(requirement.choiceKey || "")}`;
    if (!requirement.choiceKey) {
      issues.push(`opponent_response_choice_key_missing:${index}`);
    }
    if (bucketChoiceKeys.has(projectionKey)) {
      issues.push(`opponent_response_choice_projection_collision:${projectionKey}`);
    }
    bucketChoiceKeys.add(projectionKey);
    if (!localOptions.length) {
      issues.push(`opponent_response_local_option_domain_empty:${index}`);
    }
    if (requirement.requiresDestination && localOptions.length === 1) {
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
      options: localOptions,
      localOptionCount: localOptions.length,
      parameterizedDestinationProposalCount: matchedProposals.length,
      eligibleMovedModelPieceKeys,
      certifiedMovedModelPieceKeys,
      uncertifiedEligibleMovedModelPieceKeys,
      parameterizedEndpointDomains,
      destinationParameterLegalityComplete,
      reactionChanceOutcomeDomainComplete: requirements.length === 1 && localOptions
        .filter((option) => option.choice === "use")
        .every((option) => option.chanceOutcomeExact === true),
      originalRequirement: requirement,
    });
  });
  const candidateCount = rows.reduce((product, row) =>
    product * BigInt(row.localOptionCount), 1n);
  const destinationParameterDomainComplete = rows.every((row) =>
    !row.requiresDestination);
  const destinationParameterLegalityComplete = rows.every((row) =>
    row.destinationParameterLegalityComplete === true);
  const requestedDestinationParameterLegalityComplete =
    requestedPursuitMovedModelPieceKeys.length > 0 &&
    parameterizedPursuitReactionEndpointDomains.length ===
      requestedPursuitMovedModelPieceKeys.length &&
    parameterizedPursuitReactionEndpointDomains.every((domain) =>
      domain.destinationParameterLegalityComplete === true);
  const damageTransferResolutionComplete = rows.every((row) =>
    row.kind !== "damage_transfer");
  const reactionOrderDomainComplete = rows.length <= 1;
  const declaredDestinationProbeChanceOutcomeDomainComplete = rows.every((row) =>
    row.kind === "damage_transfer" || row.options
      .filter((option) => option.choice === "use" &&
        !option.parameterizedDestinationProposalKey)
      .every((option) => option.chanceOutcomeExact === true));
  const chanceMassAssigned = rows.some((row) => row.options.some((option) =>
    option.chanceRequired === true &&
    option.chanceOutcomeExact === true &&
    option.chanceModel?.exactComplete === true));
  const finiteDeclaredChoiceProductWellFormed = issues.length === 0;
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_OPPONENT_RESPONSE_DOMAIN_V2_SCHEMA,
    inputRuleBehaviorStateHash,
    actionKey: String(action.actionKey || ""),
    actingSideKey: String(state.activeSideKey || ""),
    requirementRows: rows,
    requirementCount: rows.length,
    parameterizedDestinationProposalCount:
      parameterizedDestinationProposals.rows.length,
    requestedPursuitMovedModelPieceKeys,
    parameterizedPursuitReactionEndpointDomains,
    parameterizedPursuitCertificationIssues:
      uniqueSorted(parameterizedPursuitCertificationIssues),
    declaredFiniteChoiceCandidateCount: candidateCount.toString(),
    finiteDeclaredChoiceProductWellFormed,
    requestedDestinationParameterLegalityComplete,
    destinationParameterLegalityComplete,
    destinationParameterDomainComplete,
    reactionOrderDomainComplete,
    reactionChanceOutcomeDomainComplete: rows.every((row) =>
      row.kind === "damage_transfer" || row.reactionChanceOutcomeDomainComplete === true),
    declaredDestinationProbeChanceOutcomeDomainComplete,
    damageTransferResolutionComplete,
    opponentQuantifier: "opponent_and",
    chanceMassAssigned,
    validationIssues: uniqueSorted(issues),
    claimBoundary:
      "This domain preserves every opponent-owned requirement projected by the current Host, every declared finite use/decline, destination-probe or damage-transfer option, and structurally bound cent-inch parameterized destination proposals awaiting strict Host execution. A selected Pursuit model may additionally carry an Engine-owned theorem proving canonical straight-path legality for every admitted endpoint; the whole requirement remains incomplete until every eligible model, path class and transition partition is certified. Host probes or Search proposals never close that domain, reaction priority orders are not invented, and reaction attack dice remain Chance rather than decisions.",
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
    parameterizedDestinationProposalExecutionCount: "0",
    parameterizedDestinationProposalExactOutcomeCount: "0",
    parameterizedDestinationProposalUnresolvedCount: "0",
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
    /^\d+$/.test(String(checkpoint.strictChanceBranchExecutionCount ?? "")) &&
    /^\d+$/.test(String(
      checkpoint.parameterizedDestinationProposalExecutionCount ?? "",
    )) &&
    /^\d+$/.test(String(
      checkpoint.parameterizedDestinationProposalExactOutcomeCount ?? "",
    )) &&
    /^\d+$/.test(String(
      checkpoint.parameterizedDestinationProposalUnresolvedCount ?? "",
    ));
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
  const domain = buildWarmachineOpponentResponseDomainV2(
    action,
    enumeration,
    {
      parameterizedDestinationProposals:
        options.parameterizedDestinationProposals,
      parameterizedPursuitSelectedMovedModelPieceKeys:
        options.parameterizedPursuitSelectedMovedModelPieceKeys,
    },
  );
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
        parameterizedDestinationProposalKey:
          selected.option.parameterizedDestinationProposalKey || "",
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
    const parameterizedSelections = selectedOptions.filter((selected) =>
      selected.option.parameterizedDestinationProposalKey);
    incrementBy(
      checkpoint,
      "parameterizedDestinationProposalExecutionCount",
      parameterizedSelections.length,
    );
    if (parameterizedSelections.length) {
      const exactDeterministicOutcome = status === "strict_accepted" &&
        branchTransitions.length === 1 &&
        branchTransitions[0]?.transition?.ok === true;
      incrementBy(
        checkpoint,
        exactDeterministicOutcome
          ? "parameterizedDestinationProposalExactOutcomeCount"
          : "parameterizedDestinationProposalUnresolvedCount",
        parameterizedSelections.length,
      );
    }
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
  const parameterizedDestinationProposalOutcomeDomainComplete =
    domain.parameterizedDestinationProposalCount === 0 || (
      declaredFiniteChoiceProductComplete &&
      BigInt(checkpoint.parameterizedDestinationProposalExecutionCount) ===
        BigInt(domain.parameterizedDestinationProposalCount) &&
      BigInt(checkpoint.parameterizedDestinationProposalExactOutcomeCount) ===
        BigInt(domain.parameterizedDestinationProposalCount) &&
      BigInt(checkpoint.parameterizedDestinationProposalUnresolvedCount) === 0n
    );
  const reactionChanceOutcomeDomainComplete =
    domain.reactionChanceOutcomeDomainComplete || (
      domain.parameterizedDestinationProposalCount > 0 &&
      domain.declaredDestinationProbeChanceOutcomeDomainComplete === true &&
      parameterizedDestinationProposalOutcomeDomainComplete
    );
  const opponentResponseDomainComplete =
    declaredFiniteChoiceProductComplete &&
    domain.destinationParameterDomainComplete &&
    domain.reactionOrderDomainComplete &&
    reactionChanceOutcomeDomainComplete &&
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
    ...(!domain.destinationParameterLegalityComplete
      ? ["opponent_reaction_destination_parameter_legality_pending"]
      : []),
    ...(!domain.reactionOrderDomainComplete
      ? ["opponent_reaction_priority_order_domain_pending"]
      : []),
    ...(!reactionChanceOutcomeDomainComplete
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
    parameterizedDestinationProposalCount:
      domain.parameterizedDestinationProposalCount,
    declaredFiniteChoiceCandidateCount:
      domain.declaredFiniteChoiceCandidateCount,
    examinedCandidateCount: cursor.toString(),
    pendingCandidateCount: (total - cursor).toString(),
    strictAcceptedCount: checkpoint.strictAcceptedCount,
    strictRejectedCount: checkpoint.strictRejectedCount,
    pendingSpecialResolutionCount: checkpoint.pendingSpecialResolutionCount,
    strictChanceBranchExecutionCount: checkpoint.strictChanceBranchExecutionCount,
    parameterizedDestinationProposalExecutionCount:
      checkpoint.parameterizedDestinationProposalExecutionCount,
    parameterizedDestinationProposalExactOutcomeCount:
      checkpoint.parameterizedDestinationProposalExactOutcomeCount,
    parameterizedDestinationProposalUnresolvedCount:
      checkpoint.parameterizedDestinationProposalUnresolvedCount,
    parameterizedDestinationProposalOutcomeDomainComplete,
    strictDecisionLedgerHash: checkpoint.strictDecisionLedgerHash,
    acceptedSamples: checkpoint.acceptedSamples,
    rejectedSamples: checkpoint.rejectedSamples,
    declaredFiniteChoiceProductComplete,
    requestedDestinationParameterLegalityComplete:
      domain.requestedDestinationParameterLegalityComplete,
    destinationParameterLegalityComplete:
      domain.destinationParameterLegalityComplete,
    destinationParameterDomainComplete:
      domain.destinationParameterDomainComplete,
    reactionOrderDomainComplete: domain.reactionOrderDomainComplete,
    reactionChanceOutcomeDomainComplete,
    damageTransferResolutionComplete:
      domain.damageTransferResolutionComplete,
    opponentResponseDomainComplete,
    accountingConserved,
    chanceMassAssigned: domain.chanceMassAssigned,
    completionDebts,
    resumeCheckpoint: sealedCheckpoint,
    claimBoundary:
      "Completion of this worklist exhausts only the Host-declared finite response options plus any explicitly supplied parameterized destination proposals for one action. Every proposal is passed to the strict Host, but neither accepted proposals nor finite probes close the continuous destination domain. Complete opponent response additionally requires a certified continuous denominator, legal priority orders, exact Chance distributions and compound damage-transfer execution wherever applicable.",
  });
  return {
    ...core,
    opponentResponseWorklistReceiptHash: stableGraphHash(core),
  };
}
