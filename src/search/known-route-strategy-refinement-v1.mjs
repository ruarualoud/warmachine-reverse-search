import { stableGraphHash, stableGraphValue } from
  "../graph/typed-facts-v2.mjs";

export const WARMACHINE_KNOWN_ROUTE_STRATEGY_REFINEMENT_V1_SCHEMA =
  "warmachine_known_route_strategy_refinement_v1";

function array(value) {
  return Array.isArray(value) ? value : [];
}

function requireText(value, reason) {
  const normalized = String(value || "");
  if (!normalized) throw new Error(reason);
  return normalized;
}

function validateReceipt(raw = {}, hashField, reason) {
  const receiptHash = requireText(raw[hashField], `${reason}_hash_required`);
  const core = { ...raw };
  delete core[hashField];
  delete core.ok;
  if (stableGraphHash(core) !== receiptHash) {
    throw new Error(`${reason}_hash_invalid`);
  }
  return raw;
}

function deviationStep(branch = {}, stepIndex = -1, selectionKind = "") {
  return array(branch.steps).find((step) =>
    Number(step.stepIndex) === stepIndex &&
    String(step.selectionKind || "") === selectionKind) || null;
}

function complementRow(row = {}) {
  const core = stableGraphValue({
    queueKey: String(row.queueKey || ""),
    scope: String(row.scope || ""),
    unresolvedItemCount: row.unresolvedItemCount === null
      ? null
      : Math.max(0, Number(row.unresolvedItemCount || 0)),
    reason: String(row.reason || ""),
    resumeBinding: stableGraphValue(row.resumeBinding || {}),
  });
  return { ...core, complementReceiptHash: stableGraphHash(core) };
}

export function buildWarmachineKnownRouteStrategyRefinementV1(
  counterexampleInput = {},
  localValueInput = {},
  evidenceInput = {},
) {
  const counterexample = validateReceipt(
    counterexampleInput,
    "counterexampleReceiptHash",
    "known_route_strategy_refinement_counterexample",
  );
  const localValue = validateReceipt(
    localValueInput,
    "localValueReceiptHash",
    "known_route_strategy_refinement_local_value",
  );
  if (localValue.counterexampleReceiptHash !==
      counterexample.counterexampleReceiptHash) {
    throw new Error(
      "known_route_strategy_refinement_counterexample_binding_mismatch",
    );
  }

  const deviationStepIndex = Number(counterexample.deviation?.stepIndex);
  const cooperativeStep = deviationStep(
    counterexample.cooperativeRoute,
    deviationStepIndex,
    "saved_cooperative_route",
  );
  const counterresponseStep = deviationStep(
    counterexample.counterresponseRoute,
    deviationStepIndex,
    "opponent_counterresponse",
  );
  const hostAcceptedActionCount = Math.max(
    0,
    Number(cooperativeStep?.acceptedActionCount || 0),
  );
  const hostRejectedActionCount = Math.max(
    0,
    Number(cooperativeStep?.rejectedActionCount || 0),
  );
  const fixedSuffixEvaluatedActionKeys = [...new Set([
    counterexample.deviation?.originalActionKey,
    counterexample.deviation?.selectedCounterActionKey,
  ].map(String).filter(Boolean))].sort();
  const bucketCore = stableGraphValue({
    querySideKey: String(counterexample.taskContract?.querySideKey || ""),
    decisionOwnerSideKey:
      String(counterexample.deviation?.decisionOwnerSideKey || ""),
    goalKey: String(counterexample.taskContract?.goalKey || ""),
    goalKind: String(counterexample.taskContract?.goalKind || ""),
    horizonKind: String(counterexample.taskContract?.horizonKind || ""),
    horizonRound: Number(counterexample.taskContract?.horizonRound || 0),
    informationContractKey:
      String(counterexample.taskContract?.informationContractKey || ""),
    observationBoundary:
      String(counterexample.taskContract?.observationBoundary || ""),
    currentHostReceiptHash:
      String(counterexample.currentHostReceiptHash || ""),
    currentDecisionWindowDomainHash:
      String(counterexample.deviation?.currentDecisionWindowDomainHash || ""),
    replayBoundaryStateHash:
      String(counterexample.replayBoundary?.boundaryStateHash || ""),
  });
  const bucket = { ...bucketCore, bucketHash: stableGraphHash(bucketCore) };

  const adversarialFrontier = evidenceInput.adversarialFrontier
    ? validateReceipt(
      evidenceInput.adversarialFrontier,
      "adversarialFrontierReceiptHash",
      "known_route_strategy_refinement_adversarial_frontier",
    )
    : null;
  let frontierEvidenceReady = false;
  let exploredActionKeys = fixedSuffixEvaluatedActionKeys;
  if (adversarialFrontier) {
    if (adversarialFrontier.currentDecisionWindowDomainHash !==
        bucket.currentDecisionWindowDomainHash) {
      throw new Error(
        "known_route_strategy_refinement_frontier_window_mismatch",
      );
    }
    if (adversarialFrontier.currentHostReceiptHash !==
        bucket.currentHostReceiptHash) {
      throw new Error(
        "known_route_strategy_refinement_frontier_host_mismatch",
      );
    }
    if (adversarialFrontier.taskKey !==
        counterexample.taskContract?.taskKey ||
        adversarialFrontier.querySideKey !== bucket.querySideKey ||
        adversarialFrontier.decisionOwnerSideKey !==
          bucket.decisionOwnerSideKey) {
      throw new Error(
        "known_route_strategy_refinement_frontier_scope_mismatch",
      );
    }
    if (Number(adversarialFrontier.hostAcceptedActionCount || 0) !==
          hostAcceptedActionCount ||
        Number(adversarialFrontier.hostRejectedActionCount || 0) !==
          hostRejectedActionCount) {
      throw new Error(
        "known_route_strategy_refinement_frontier_denominator_mismatch",
      );
    }
    exploredActionKeys = [...new Set(array(adversarialFrontier.edges)
      .map((edge) => String(edge.actionKey || ""))
      .filter(Boolean))].sort();
    frontierEvidenceReady = Boolean(
      adversarialFrontier.onePlyFrontierReady === true &&
      adversarialFrontier.acceptedDenominatorConserved === true &&
      adversarialFrontier.page?.pageExhausted === true &&
      Number(adversarialFrontier.page?.remainingAcceptedActionCount || 0) ===
        0 &&
      exploredActionKeys.length === hostAcceptedActionCount &&
      array(adversarialFrontier.edges).length === hostAcceptedActionCount &&
      array(adversarialFrontier.edges).every((edge) =>
        edge.transitionAccepted === true &&
        Boolean(edge.successorStoredState?.stateId)),
    );
    if (!frontierEvidenceReady) {
      throw new Error(
        "known_route_strategy_refinement_frontier_incomplete",
      );
    }
  }
  const unresolvedCurrentWindowActionCount = Math.max(
    0,
    hostAcceptedActionCount - exploredActionKeys.length,
  );

  const successorActivationPlans = evidenceInput.successorActivationPlans
    ? validateReceipt(
      evidenceInput.successorActivationPlans,
      "reportHash",
      "known_route_strategy_refinement_successor_plans",
    )
    : null;
  let continuationSchedulingEvidenceReady = false;
  let successorContinuationScheduling = null;
  if (successorActivationPlans) {
    if (!adversarialFrontier) {
      throw new Error(
        "known_route_strategy_refinement_frontier_required_for_successor_plans",
      );
    }
    if (successorActivationPlans.sourceReportHash !==
        evidenceInput.adversarialFrontierReportHash) {
      throw new Error(
        "known_route_strategy_refinement_successor_plan_source_mismatch",
      );
    }
    const frontierEdgesByActionKey = new Map(
      array(adversarialFrontier.edges).map((edge) =>
        [String(edge.actionKey || ""), edge]),
    );
    const plans = array(successorActivationPlans.successorPlans);
    const planActionKeys = plans.map((plan) =>
      String(plan.sourceActionKey || ""));
    const uniquePlanActionKeys = [...new Set(planActionKeys)];
    continuationSchedulingEvidenceReady = Boolean(
      successorActivationPlans.currentHostReceiptHash ===
        bucket.currentHostReceiptHash &&
      successorActivationPlans.querySideKey === bucket.querySideKey &&
      successorActivationPlans.sourceDecisionOwnerSideKey ===
        bucket.decisionOwnerSideKey &&
      successorActivationPlans.successorPlanCount ===
        hostAcceptedActionCount &&
      plans.length === hostAcceptedActionCount &&
      uniquePlanActionKeys.length === plans.length &&
      successorActivationPlans.allSuccessorsRecoverable === true &&
      successorActivationPlans.allDiscreteSlotPlansComplete === true &&
      plans.every((plan) => {
        const edge = frontierEdgesByActionKey.get(plan.sourceActionKey);
        const slotCount = Math.max(0, Number(plan.slotCount || 0));
        const materializedSlotCount = Math.max(
          0,
          Number(plan.firstGroupPage?.pageSlotCount || 0),
        );
        const remainingSlotCount = Math.max(
          0,
          Number(plan.firstGroupPage?.remainingSlotCount || 0),
        );
        return Boolean(
          edge &&
          plan.successorStateId === edge.successorStoredState?.stateId &&
          plan.successorStateHash === edge.successorStateHash &&
          plan.firstGroupPage?.cursor?.activationDomainPlanHash ===
            plan.activationDomainPlanHash &&
          slotCount === materializedSlotCount + remainingSlotCount,
        );
      }),
    );
    if (!continuationSchedulingEvidenceReady) {
      throw new Error(
        "known_route_strategy_refinement_successor_plan_incomplete",
      );
    }
    const totalSlotCount = plans.reduce((sum, plan) =>
      sum + Math.max(0, Number(plan.slotCount || 0)), 0);
    const materializedSlotCount = plans.reduce((sum, plan) =>
      sum + Math.max(0, Number(
        plan.firstGroupPage?.pageSlotCount || 0,
      )), 0);
    const remainingSlotCount = plans.reduce((sum, plan) =>
      sum + Math.max(0, Number(
        plan.firstGroupPage?.remainingSlotCount || 0,
      )), 0);
    const materializedAcceptedActionCount = plans.reduce((sum, plan) =>
      sum + Math.max(0, Number(
        plan.firstGroupPage?.acceptedActionCount || 0,
      )), 0);
    const materializedRejectedActionCount = plans.reduce((sum, plan) =>
      sum + Math.max(0, Number(
        plan.firstGroupPage?.rejectedActionCount || 0,
      )), 0);
    successorContinuationScheduling = stableGraphValue({
      evidenceReportHash: successorActivationPlans.reportHash,
      successorPlanCount: plans.length,
      totalSlotCount,
      materializedSlotCount,
      remainingSlotCount,
      materializedAcceptedActionCount,
      materializedRejectedActionCount,
      measuredElapsedMs: Math.max(
        0,
        Number(successorActivationPlans.elapsedMs || 0),
      ),
      acceptedAndRejectedCountsAreStrategyProbabilities: false,
      fullOpponentTurnComplete:
        successorActivationPlans.fullOpponentTurnComplete === true,
      chanceDomainComplete:
        successorActivationPlans.chanceDomainComplete === true,
      resumeCursors: plans.map((plan) => ({
        sourceActionKey: plan.sourceActionKey,
        successorStateId: plan.successorStateId,
        activationDomainPlanHash: plan.activationDomainPlanHash,
        cursor: plan.firstGroupPage.cursor,
      })),
    });
  }

  const originalActionKey = String(
    counterexample.deviation?.originalActionKey || "",
  );
  const counterActionKey = String(
    counterexample.deviation?.selectedCounterActionKey || "",
  );
  const frontierEdgesByActionKey = new Map(
    array(adversarialFrontier?.edges).map((edge) =>
      [String(edge.actionKey || ""), edge]),
  );
  const strategyClassCandidates = stableGraphValue(
    exploredActionKeys.map((actionKey) => {
      const edge = frontierEdgesByActionKey.get(actionKey);
      if (actionKey === originalActionKey) {
        return {
          classKey: "saved_cooperative_action_and_suffix",
          disposition: "retained_conditional_witness",
          actionKey,
          ownerSideKey: bucket.decisionOwnerSideKey,
          hostTransitionAccepted: edge
            ? edge.transitionAccepted === true
            : cooperativeStep?.transitionAccepted === true,
          conditionalSuffixReachesGoal:
            counterexample.currentHostConditionalCooperativeSuffixExists ===
              true,
          branchReceiptHash:
            String(counterexample.cooperativeRoute?.branchReceiptHash || ""),
          edgeReceiptHash: String(edge?.edgeReceiptHash || ""),
          probabilityClaimed: false,
          equivalenceClaimed: false,
        };
      }
      if (actionKey === counterActionKey) {
        return {
          classKey: "strict_fixed_script_counterresponse",
          disposition: "retained_adversarial_counterexample",
          actionKey,
          ownerSideKey: bucket.decisionOwnerSideKey,
          hostTransitionAccepted: edge
            ? edge.transitionAccepted === true
            : counterresponseStep?.transitionAccepted === true,
          blocksFixedCooperativeScript:
            counterexample.counterBlocksFixedRoute === true,
          branchReceiptHash:
            String(
              counterexample.counterresponseRoute?.branchReceiptHash || "",
            ),
          edgeReceiptHash: String(edge?.edgeReceiptHash || ""),
          probabilityClaimed: false,
          equivalenceClaimed: false,
        };
      }
      return {
        classKey: `one_ply_successor:${actionKey}`,
        disposition: "retained_one_ply_successor_deeper_value_unresolved",
        actionKey,
        ownerSideKey: bucket.decisionOwnerSideKey,
        hostTransitionAccepted: edge?.transitionAccepted === true,
        successorStateId: String(edge?.successorStoredState?.stateId || ""),
        edgeReceiptHash: String(edge?.edgeReceiptHash || ""),
        deeperContinuationResolved: false,
        probabilityClaimed: false,
        equivalenceClaimed: false,
      };
    }),
  );

  const forwardComplementChallengeQueue = [
    ...(unresolvedCurrentWindowActionCount > 0
      ? [complementRow({
        queueKey: "current-decision-window-unexecuted-host-actions",
        scope: "current_decision_window",
        unresolvedItemCount: unresolvedCurrentWindowActionCount,
        reason: "host_accepted_actions_not_yet_strict_applied",
        resumeBinding: {
          currentDecisionWindowDomainHash:
            bucket.currentDecisionWindowDomainHash,
          exploredActionKeys,
        },
      })]
      : []),
    ...(successorContinuationScheduling
      ? [complementRow({
        queueKey: "successor-activation-domain-expansion",
        scope: "successor_activation_domain",
        unresolvedItemCount: null,
        reason:
          "materialized_actions_and_remaining_slots_not_yet_strict_expanded",
        resumeBinding: successorContinuationScheduling,
      })]
      : []),
    complementRow({
      queueKey: "adaptive-continuations-after-counterresponse",
      scope: "adaptive_policy_continuation",
      unresolvedItemCount: null,
      reason: "fixed_saved_suffix_failure_does_not_close_adaptive_policy",
      resumeBinding: {
        counterresponseBranchReceiptHash:
          counterexample.counterresponseRoute?.branchReceiptHash,
        successorActivationPlanReportHash:
          successorContinuationScheduling?.evidenceReportHash || "",
      },
    }),
    complementRow({
      queueKey: "chance-support-and-mass",
      scope: "chance_domain",
      unresolvedItemCount: null,
      reason: "route_replay_does_not_enumerate_mutually_exclusive_chance_mass",
      resumeBinding: {
        taskKey: counterexample.taskContract?.taskKey,
      },
    }),
    complementRow({
      queueKey: "opening-to-conditional-boundary",
      scope: "opening_reachability",
      unresolvedItemCount: null,
      reason: "current_opening_to_replay_boundary_not_recertified",
      resumeBinding: {
        routeFixtureHash: counterexample.routeIdentity?.routeFixtureHash,
        replayBoundaryStateHash: bucket.replayBoundaryStateHash,
      },
    }),
    complementRow({
      queueKey: "shared-win-objective-terminal-union",
      scope: "terminal_goal_union",
      unresolvedItemCount: null,
      reason: "single_route_terminal_goal_does_not_cover_other_assassination_or_scoring_wins",
      resumeBinding: {
        goalKey: bucket.goalKey,
        terminalFamilyKey: counterexample.taskContract?.terminalFamilyKey,
      },
    }),
  ];
  const fixedRouteInterval =
    localValue.fixedRouteScriptValueAfterKnownCounterresponse || {};
  const wholeGameInterval =
    localValue.wholeGameValueAfterKnownCounterresponse || {};
  const localRefinementReady = Boolean(
    counterexample.knownCounterexampleStrict === true &&
    counterexample.currentHostConditionalCooperativeSuffixExists === true &&
    counterexample.counterBlocksFixedRoute === true &&
    cooperativeStep?.transitionAccepted === true &&
    counterresponseStep?.transitionAccepted === true &&
    hostAcceptedActionCount >= exploredActionKeys.length &&
    (!adversarialFrontier || frontierEvidenceReady) &&
    (!successorActivationPlans || continuationSchedulingEvidenceReady) &&
    fixedRouteInterval.lowerBound === 0 &&
    fixedRouteInterval.upperBound === 0,
  );
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_KNOWN_ROUTE_STRATEGY_REFINEMENT_V1_SCHEMA,
    counterexampleReceiptHash: counterexample.counterexampleReceiptHash,
    localValueReceiptHash: localValue.localValueReceiptHash,
    bucket,
    hostDecisionWindowAccounting: {
      hostAcceptedActionCount,
      hostRejectedActionCount,
      exploredActionKeys,
      exploredActionCount: exploredActionKeys.length,
      fixedSuffixEvaluatedActionKeys,
      fixedSuffixEvaluatedActionCount:
        fixedSuffixEvaluatedActionKeys.length,
      unresolvedCurrentWindowActionCount,
      acceptedDenominatorConserved:
        hostAcceptedActionCount ===
          exploredActionKeys.length + unresolvedCurrentWindowActionCount,
      onePlyWindowClosed: unresolvedCurrentWindowActionCount === 0 &&
        frontierEvidenceReady,
    },
    strategyClassCandidates,
    evidenceClosure: {
      frontierEvidenceReady,
      continuationSchedulingEvidenceReady,
    },
    successorContinuationScheduling,
    fixedRouteScriptRefinement: {
      interval: fixedRouteInterval,
      numericIntervalCollapsed:
        fixedRouteInterval.lowerBound === fixedRouteInterval.upperBound,
      domainComplete: false,
      hardPruneAllowed: localRefinementReady,
      hardPruneScope:
        "same_fixed_action_script_at_same_bound_decision_window_only",
      numericExpansionRequired: !localRefinementReady,
      actionDomainComplete: false,
    },
    wholeGameValue: {
      interval: wholeGameInterval,
      domainComplete: false,
      hardPruneAllowed: false,
      expansionRequired: true,
    },
    forwardComplementChallengeQueue,
    forwardComplementChallengeCount:
      forwardComplementChallengeQueue.length,
    localRefinementReady,
    strategyClassEquivalenceCertified: false,
    effectiveStrategyQuotientComplete: false,
    completenessClaimAllowed: false,
    strategyValuePublicationAllowed: false,
    claimBoundary:
      "This receipt buckets one current-Host decision window by player, goal, horizon, observation contract and rule receipt. When bound frontier evidence is present, every accepted action in that one window is strict-applied and persisted, while only the saved cooperative action and known counterresponse have fixed suffix values. A zero upper bound may stop numeric expansion only for that same fixed script. Successor activation actions, remaining slots, adaptive continuations, Chance, opening reachability and other winning terminals remain explicit complement challenges, so no whole-game strategy quotient, win rate or optimality claim is allowed.",
  });
  return {
    ...core,
    strategyRefinementReceiptHash: stableGraphHash(core),
    ok: localRefinementReady,
  };
}
