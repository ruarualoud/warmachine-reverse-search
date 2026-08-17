import { readFileSync } from "node:fs";

import {
  buildWarmachineReverseHookOperator,
  buildWarmachineReversePrimitiveContractRegistry,
} from "../reverse/primitive-contracts-v1.mjs";
import { warmachineRulesetBaselineV1 } from "../contracts/ruleset-baseline-v1.mjs";
import {
  recognizedWarmachineRuleAtoms,
  resolveWarmachineHostPath,
  steamroller2026ScenarioProfiles,
  warmachineHost,
} from "../warmachine-host-runtime.mjs";
import {
  WARMACHINE_CORE_CAPABILITY_PROVIDERS_V2,
  WARMACHINE_LIFECYCLE_STAGE_KEYS_V2,
  WARMACHINE_RESOURCE_OPERATION_KEYS_V2,
  WARMACHINE_TERMINAL_OBLIGATIONS_V2,
  WARMACHINE_TYPED_FACT_CLASSIFIER_V2,
  arrayValues,
  capabilityKeysForOperator,
  flattenStructuredLeaves,
  normalizeGraphKey,
  sortedUnique,
  stableGraphHash,
  stableGraphValue,
  typedFactsForOperator,
  typedInteractionRelation,
} from "./typed-facts-v2.mjs";

export const WARMACHINE_TYPED_INTERACTION_GRAPH_V2_SCHEMA =
  "warmachine_typed_interaction_graph_v2";

const EVIDENCE_GRAPH_RELATIVE_PATH =
  "data/warmachine-rule-interaction-graph-v20260701.json";

const SCENARIO_RUNTIME_FIELDS = Object.freeze([
  "scenario.packetKey",
  "scenario.packetYear",
  "scenario.scenarioKey",
  "scenario.scenarioName",
  "scenario.zones",
  "scenario.flags",
  "scenario.actionObjectives",
  "scenario.objectives",
  "scenario.caches",
  "scenario.scenarioState",
  "scenario.objectiveDestroyPoints",
  "scenario.killBoxEnabled",
  "scenario.killBoxDistanceIn",
  "scenario.killBoxPenaltyPoints",
  "scenario.killBoxCenter",
  "scenario.roundLimitTiebreaker",
  "scenario.attackerSideKey",
  "scenario.defenderSideKey",
  "scenario.scoringStartSideKey",
  "scenario.scoringStartTurnNumber",
  "scenario.score",
  "scenario.scoringHistory",
  "scenario.victoryThreshold",
  "scenario.roundLimit",
  "turnNumber",
  "activeSideKey",
  "firstPlayerSideKey",
]);

const EVIDENCE_SURFACE_TO_HOOKS = Object.freeze({
  targeting: ["targeting_validation"],
  attack_roll: ["attack_modifier", "attack_hit"],
  line_of_sight: ["targeting_validation", "piece_geometry"],
  combined_ranged_attack: ["attack_participation_validation", "attack_sequence_validation"],
  spray_attack: ["targeting_validation", "attack_hit", "damage_modifier"],
  shield_guard_timing: ["attack_hit", "attack_resolved"],
  boost_legality: ["candidate_finalize", "attack_modifier", "damage_modifier"],
  movement: ["movement_allowance", "movement_cost", "movement_validation", "after_move"],
  damage: ["damage_modifier", "damage_applied"],
  lifecycle: ["model_disabled", "model_boxed", "model_destroyed", "model_exploded"],
  scoring: ["turn_end"],
  control_phase: ["control_phase_start"],
  activation: ["activation_start", "activation_end"],
});

function nodeId(kind, key) {
  return `${kind}:${String(key)}`;
}

function graphBuilder() {
  const nodes = new Map();
  const edges = new Map();
  const issues = [];

  const addNode = (node) => {
    if (!node?.nodeId || !node?.nodeKind) {
      issues.push({ issueKind: "invalid_node", node: stableGraphValue(node) });
      return null;
    }
    const prior = nodes.get(node.nodeId);
    if (prior && prior.nodeKind !== node.nodeKind) {
      issues.push({
        issueKind: "node_kind_collision",
        severity: "structural",
        nodeId: node.nodeId,
        priorKind: prior.nodeKind,
        nextKind: node.nodeKind,
      });
      return prior;
    }
    if (!prior) nodes.set(node.nodeId, stableGraphValue(node));
    return nodes.get(node.nodeId);
  };

  const addEdge = (rawEdge) => {
    const edge = {
      direction: "forward_assertion",
      scope: "local",
      timing: "declared",
      polarity: "positive",
      quantifier: "exact",
      applicability: "structured",
      semanticTopologyAuthority: true,
      ...rawEdge,
    };
    const identity = {
      fromNodeId: edge.fromNodeId,
      toNodeId: edge.toNodeId,
      edgeKind: edge.edgeKind,
      provenanceKey: edge.provenanceKey || "",
    };
    const edgeId = `edge:${stableGraphHash(identity, 24)}`;
    if (!edges.has(edgeId)) edges.set(edgeId, stableGraphValue({ edgeId, ...edge }));
    return edges.get(edgeId);
  };

  return { nodes, edges, issues, addNode, addEdge };
}

function addIndexValue(index, key, value) {
  if (!index.has(key)) index.set(key, new Set());
  index.get(key).add(value);
}

function materializedIndex(index) {
  return Object.fromEntries(Array.from(index).sort(([left], [right]) => left.localeCompare(right))
    .map(([key, values]) => [key, sortedUnique(values)]));
}

function sourceContractNodes(builder, atom, atomNodeId, sourceIdToAtomIds) {
  for (const sourceId of sortedUnique(atom.sourceContract?.acceptedSourceIds)) {
    const sourceNodeId = nodeId("rule_source", sourceId);
    builder.addNode({
      nodeId: sourceNodeId,
      nodeKind: "rule_source",
      sourceId,
      sourceBindingKind: "accepted_source_id",
    });
    builder.addEdge({
      fromNodeId: sourceNodeId,
      toNodeId: atomNodeId,
      edgeKind: "source_maps_to_atom",
      traversalClass: "source_binding",
      reverseTraversalPolicy: "query_scoped_exact",
      scope: "source_contract",
      provenanceKey: `${atom.atomKey}|source|${sourceId}`,
    });
    addIndexValue(sourceIdToAtomIds, sourceId, atomNodeId);
  }
  for (const clause of sortedUnique(atom.sourceContract?.requiredTextClauses)) {
    const clauseKey = stableGraphHash({ atomKey: atom.atomKey, clause }, 24);
    const clauseNodeId = nodeId("source_text_clause", clauseKey);
    builder.addNode({
      nodeId: clauseNodeId,
      nodeKind: "source_text_clause",
      clause,
      matchMode: String(atom.sourceContract?.matchMode || ""),
    });
    builder.addEdge({
      fromNodeId: atomNodeId,
      toNodeId: clauseNodeId,
      edgeKind: "atom_requires_source_text_clause",
      traversalClass: "source_binding",
      reverseTraversalPolicy: "query_scoped_exact",
      scope: "source_contract",
      provenanceKey: `${atom.atomKey}|clause|${clauseKey}`,
    });
  }
}

function materializeOperatorFacts(builder, atom, hook, indexes) {
  const operator = buildWarmachineReverseHookOperator(atom, hook);
  const operatorNodeId = nodeId("hook_operator", operator.operatorKey);
  const atomNodeId = nodeId("rule_atom", atom.atomKey);
  const hookNodeId = nodeId("hook_contract", hook.hookKey);
  const primitiveNodeId = nodeId("execution_primitive", hook.primitiveKey);
  const integrationNodeId = nodeId(
    "host_integration",
    hook.hostIntegrationKey || hook.hookKey,
  );
  const familyNodeId = nodeId("reverse_operator_family", operator.operatorFamily);
  const obligationNodeId = nodeId(
    "predecessor_obligation_kind",
    operator.predecessorObligationKind,
  );

  builder.addNode({
    nodeId: operatorNodeId,
    nodeKind: "hook_operator",
    operatorKey: operator.operatorKey,
    atomKey: atom.atomKey,
    hookKey: hook.hookKey,
    primitiveKey: hook.primitiveKey,
    operatorFamily: operator.operatorFamily,
    predecessorObligationKind: operator.predecessorObligationKind,
    maturity: operator.maturity,
    strictForwardWitnessRequired: true,
    hardPruningEnabled: false,
  });
  builder.addNode({ nodeId: hookNodeId, nodeKind: "hook_contract", hookKey: hook.hookKey });
  builder.addNode({
    nodeId: primitiveNodeId,
    nodeKind: "execution_primitive",
    primitiveKey: hook.primitiveKey,
  });
  builder.addNode({
    nodeId: integrationNodeId,
    nodeKind: "host_integration",
    hostIntegrationKey: hook.hostIntegrationKey || hook.hookKey,
  });
  builder.addNode({
    nodeId: familyNodeId,
    nodeKind: "reverse_operator_family",
    operatorFamily: operator.operatorFamily,
  });
  builder.addNode({
    nodeId: obligationNodeId,
    nodeKind: "predecessor_obligation_kind",
    predecessorObligationKind: operator.predecessorObligationKind,
  });

  const structuralTargets = [
    [atomNodeId, operatorNodeId, "atom_defines_operator"],
    [operatorNodeId, hookNodeId, "operator_executes_at_hook"],
    [operatorNodeId, primitiveNodeId, "operator_invokes_primitive"],
    [operatorNodeId, integrationNodeId, "operator_uses_host_integration"],
    [operatorNodeId, familyNodeId, "operator_has_reverse_family"],
    [operatorNodeId, obligationNodeId, "operator_regresses_to_obligation_kind"],
  ];
  for (const [fromNodeId, toNodeId, edgeKind] of structuralTargets) {
    builder.addEdge({
      fromNodeId,
      toNodeId,
      edgeKind,
      traversalClass: "structural",
      reverseTraversalPolicy: "operator_local_only",
      provenanceKey: `${operator.operatorKey}|${edgeKind}`,
    });
  }

  const facts = typedFactsForOperator(operator);
  for (const fact of facts) {
    const factIdentity = [fact.semanticKey];
    if (!["resource_kind", "resource_operation", "lifecycle_stage", "context_field"]
      .includes(fact.nodeKind)) {
      factIdentity.push(stableGraphHash({ path: fact.path, value: fact.value }, 16));
    }
    const factNodeId = nodeId(fact.nodeKind, factIdentity.join(":"));
    builder.addNode({
      nodeId: factNodeId,
      nodeKind: fact.nodeKind,
      semanticKey: fact.semanticKey,
      path: fact.path,
      value: stableGraphValue(fact.value),
      valueKind: fact.valueKind,
      factRole: fact.factRole,
      classifierSchema: WARMACHINE_TYPED_FACT_CLASSIFIER_V2,
    });
    builder.addEdge({
      fromNodeId: operatorNodeId,
      toNodeId: factNodeId,
      edgeKind: fact.factRole === "precondition"
        ? "operator_requires_typed_fact"
        : "operator_declares_typed_fact",
      traversalClass: fact.factRole === "precondition"
        ? "structured_precondition"
        : "structured_parameter",
      reverseTraversalPolicy: "obligation_match_only",
      scope: "operator",
      applicability: fact.factRole,
      provenanceKey: `${operator.operatorKey}|fact|${factNodeId}`,
    });
    addIndexValue(indexes.factKindToOperatorIds, fact.nodeKind, operatorNodeId);
    addIndexValue(indexes.factNodeToOperatorIds, factNodeId, operatorNodeId);
  }

  const capabilityKeys = capabilityKeysForOperator(operator, facts);
  for (const capabilityKey of capabilityKeys) {
    const capabilityNodeId = nodeId("capability", capabilityKey);
    builder.addNode({
      nodeId: capabilityNodeId,
      nodeKind: "capability",
      capabilityKey,
    });
    builder.addEdge({
      fromNodeId: operatorNodeId,
      toNodeId: capabilityNodeId,
      edgeKind: "operator_contributes_capability",
      traversalClass: "typed_capability",
      reverseTraversalPolicy: "terminal_query_only",
      scope: "operator",
      provenanceKey: `${operator.operatorKey}|capability|${capabilityKey}`,
    });
    addIndexValue(indexes.capabilityToOperatorIds, capabilityKey, operatorNodeId);
  }

  addIndexValue(indexes.atomIdToOperatorIds, atomNodeId, operatorNodeId);
  addIndexValue(indexes.operatorFamilyToAtomIds, operator.operatorFamily, atomNodeId);
  indexes.operatorRows.set(operatorNodeId, {
    operatorNodeId,
    operatorKey: operator.operatorKey,
    atomNodeId,
    atomKey: atom.atomKey,
    hookKey: hook.hookKey,
    primitiveKey: hook.primitiveKey,
    operatorFamily: operator.operatorFamily,
    predecessorObligationKind: operator.predecessorObligationKind,
    capabilityKeys,
    factNodeIds: facts.map((fact) => {
      const identity = [fact.semanticKey];
      if (!["resource_kind", "resource_operation", "lifecycle_stage", "context_field"]
        .includes(fact.nodeKind)) {
        identity.push(stableGraphHash({ path: fact.path, value: fact.value }, 16));
      }
      return nodeId(fact.nodeKind, identity.join(":"));
    }).sort(),
  });
}

function materializeDeclaredInteractions(builder, atom, atomNodeId, indexes) {
  for (const interaction of atom.interactions || []) {
    const interactionKey = String(interaction.interactionKey || "");
    const assertionKey = `${atom.atomKey}:${interactionKey || stableGraphHash(interaction, 16)}`;
    const assertionNodeId = nodeId("declared_interaction", assertionKey);
    const relationKind = typedInteractionRelation(interaction);
    const relatedRuleKeys = sortedUnique(interaction.relatedRuleKeys);
    builder.addNode({
      nodeId: assertionNodeId,
      nodeKind: "declared_interaction",
      atomKey: atom.atomKey,
      interactionKey,
      relationText: String(interaction.relation || ""),
      relationKind,
      semanticTopologyAuthority: false,
      hardTraversalEligible: false,
    });
    builder.addEdge({
      fromNodeId: atomNodeId,
      toNodeId: assertionNodeId,
      edgeKind: "atom_declares_interaction",
      traversalClass: "declaration",
      reverseTraversalPolicy: "none",
      semanticTopologyAuthority: false,
      provenanceKey: `${atom.atomKey}|interaction|${interactionKey}`,
    });
    if (!relatedRuleKeys.length) {
      const quarantineNodeId = nodeId("quarantined_interaction_target", assertionKey);
      builder.addNode({
        nodeId: quarantineNodeId,
        nodeKind: "quarantined_interaction_target",
        atomKey: atom.atomKey,
        interactionKey,
        quarantineReason: "missing_related_rule_keys",
      });
      builder.addEdge({
        fromNodeId: assertionNodeId,
        toNodeId: quarantineNodeId,
        edgeKind: "interaction_target_quarantined",
        traversalClass: "diagnostic",
        reverseTraversalPolicy: "none",
        semanticTopologyAuthority: false,
        provenanceKey: `${assertionKey}|quarantine`,
      });
      builder.issues.push({
        issueKind: "declared_interaction_missing_related_keys",
        severity: "hard_pruning_blocker",
        atomKey: atom.atomKey,
        interactionKey,
        quarantineNodeId,
      });
      indexes.quarantinedInteractionIds.add(assertionNodeId);
      continue;
    }
    for (const relatedRuleKey of relatedRuleKeys) {
      const conceptKey = normalizeGraphKey(relatedRuleKey);
      const conceptNodeId = nodeId("declared_concept", conceptKey);
      builder.addNode({
        nodeId: conceptNodeId,
        nodeKind: "declared_concept",
        conceptKey,
        hardTraversalEligible: false,
      });
      builder.addEdge({
        fromNodeId: assertionNodeId,
        toNodeId: conceptNodeId,
        edgeKind: `interaction_${relationKind}`,
        traversalClass: "diagnostic",
        reverseTraversalPolicy: "none",
        semanticTopologyAuthority: false,
        provenanceKey: `${assertionKey}|concept|${relatedRuleKey}`,
      });
    }
  }
}

function materializeRuleAtoms(builder, atoms, reverseRegistry) {
  const indexes = {
    atomIdToOperatorIds: new Map(),
    capabilityToOperatorIds: new Map(),
    factKindToOperatorIds: new Map(),
    factNodeToOperatorIds: new Map(),
    operatorFamilyToAtomIds: new Map(),
    sourceIdToAtomIds: new Map(),
    operatorRows: new Map(),
    quarantinedInteractionIds: new Set(),
  };
  const atomIds = [];
  for (const atom of atoms) {
    const atomNodeId = nodeId("rule_atom", atom.atomKey);
    atomIds.push(atomNodeId);
    builder.addNode({
      nodeId: atomNodeId,
      nodeKind: "rule_atom",
      atomKey: atom.atomKey,
      atomVersion: Number(atom.atomVersion || 1),
      ruleName: String(atom.ruleName || ""),
      definitionModuleKey: String(atom.definitionModuleKey || ""),
      ruleKeys: sortedUnique(atom.ruleKeys),
      sourceMatchMode: String(atom.sourceContract?.matchMode || ""),
      exactWithinScope: atom.exactWithinScope === true,
    });
    sourceContractNodes(builder, atom, atomNodeId, indexes.sourceIdToAtomIds);
    for (const hook of atom.hooks || []) materializeOperatorFacts(builder, atom, hook, indexes);
    materializeDeclaredInteractions(builder, atom, atomNodeId, indexes);
  }
  return {
    atomIds: atomIds.sort(),
    atomIdToOperatorIds: materializedIndex(indexes.atomIdToOperatorIds),
    capabilityToOperatorIds: materializedIndex(indexes.capabilityToOperatorIds),
    factKindToOperatorIds: materializedIndex(indexes.factKindToOperatorIds),
    factNodeToOperatorIds: materializedIndex(indexes.factNodeToOperatorIds),
    operatorFamilyToAtomIds: materializedIndex(indexes.operatorFamilyToAtomIds),
    sourceIdToAtomIds: materializedIndex(indexes.sourceIdToAtomIds),
    operatorRows: Object.fromEntries(Array.from(indexes.operatorRows).sort()),
    quarantinedInteractionIds: sortedUnique(indexes.quarantinedInteractionIds),
    reverseRegistryKey: reverseRegistry.registryKey,
  };
}

function materializeCoreCapabilityProviders(builder) {
  const capabilityToCoreProviderIds = new Map();
  for (const provider of WARMACHINE_CORE_CAPABILITY_PROVIDERS_V2) {
    const providerNodeId = nodeId("host_capability_provider", provider.providerKey);
    builder.addNode({
      nodeId: providerNodeId,
      nodeKind: "host_capability_provider",
      providerKey: provider.providerKey,
      providerKind: provider.providerKind,
      upstreamReceiptHash: warmachineHost.receipt.receiptHash,
    });
    for (const capabilityKey of provider.capabilityKeys) {
      const capabilityNodeId = nodeId("capability", capabilityKey);
      builder.addNode({ nodeId: capabilityNodeId, nodeKind: "capability", capabilityKey });
      builder.addEdge({
        fromNodeId: providerNodeId,
        toNodeId: capabilityNodeId,
        edgeKind: "host_provides_capability",
        traversalClass: "typed_capability",
        reverseTraversalPolicy: "terminal_query_only",
        scope: "host",
        timing: "runtime_authority",
        provenanceKey: `${provider.providerKey}|${capabilityKey}`,
      });
      addIndexValue(capabilityToCoreProviderIds, capabilityKey, providerNodeId);
    }
  }
  return materializedIndex(capabilityToCoreProviderIds);
}

function materializeCanonicalRuleVocabulary(builder) {
  for (const operationKey of WARMACHINE_RESOURCE_OPERATION_KEYS_V2) {
    builder.addNode({
      nodeId: nodeId("resource_operation", operationKey),
      nodeKind: "resource_operation",
      semanticKey: operationKey,
      vocabularyStatus: "canonical_distinct_operation",
    });
  }
  for (const stageKey of WARMACHINE_LIFECYCLE_STAGE_KEYS_V2) {
    builder.addNode({
      nodeId: nodeId("lifecycle_stage", stageKey),
      nodeKind: "lifecycle_stage",
      semanticKey: stageKey,
      vocabularyStatus: "canonical_distinct_stage",
    });
  }
}

function materializeTerminalObligations(builder) {
  const terminalObligationRows = {};
  for (const [goalType, obligations] of Object.entries(WARMACHINE_TERMINAL_OBLIGATIONS_V2)) {
    terminalObligationRows[goalType] = [];
    for (const obligation of obligations) {
      const obligationNodeId = nodeId("terminal_obligation", obligation.obligationKey);
      builder.addNode({
        nodeId: obligationNodeId,
        nodeKind: "terminal_obligation",
        goalType,
        ...obligation,
      });
      for (const capabilityKey of obligation.requiredCapabilityKeys) {
        const capabilityNodeId = nodeId("capability", capabilityKey);
        builder.addNode({ nodeId: capabilityNodeId, nodeKind: "capability", capabilityKey });
        builder.addEdge({
          fromNodeId: obligationNodeId,
          toNodeId: capabilityNodeId,
          edgeKind: "terminal_obligation_requires_capability",
          traversalClass: "terminal_contract",
          reverseTraversalPolicy: "capability_provider_lookup",
          direction: "reverse_requirement",
          scope: goalType,
          timing: "terminal_conditioned",
          provenanceKey: `${obligation.obligationKey}|${capabilityKey}`,
        });
      }
      terminalObligationRows[goalType].push({ obligationNodeId, ...obligation });
    }
  }
  return terminalObligationRows;
}

function materializeSteamrollerProfiles(builder) {
  const profiles = steamroller2026ScenarioProfiles();
  const profileNodeIds = [];
  for (const profile of profiles) {
    const profileNodeId = nodeId("scenario_profile", profile.scenarioKey);
    profileNodeIds.push(profileNodeId);
    builder.addNode({
      nodeId: profileNodeId,
      nodeKind: "scenario_profile",
      scenarioKey: profile.scenarioKey,
      scenarioNumber: profile.scenarioNumber,
      name: profile.name,
      schemaVersion: profile.schemaVersion,
    });
    for (const leaf of flattenStructuredLeaves(profile, "profile")) {
      const fieldKey = `${leaf.path}=${JSON.stringify(stableGraphValue(leaf.value))}`;
      const fieldNodeId = nodeId("scenario_profile_field", stableGraphHash(fieldKey, 24));
      builder.addNode({
        nodeId: fieldNodeId,
        nodeKind: "scenario_profile_field",
        fieldPath: leaf.path,
        value: stableGraphValue(leaf.value),
        valueKind: leaf.valueKind,
      });
      builder.addEdge({
        fromNodeId: profileNodeId,
        toNodeId: fieldNodeId,
        edgeKind: "scenario_profile_declares_field",
        traversalClass: "scenario_contract",
        reverseTraversalPolicy: "scenario_query_only",
        scope: profile.scenarioKey,
        provenanceKey: `${profile.scenarioKey}|${fieldKey}`,
      });
    }
    for (const specialRuleKey of profile.specialRuleKeys || []) {
      const ruleNodeId = nodeId("scenario_rule", specialRuleKey);
      builder.addNode({
        nodeId: ruleNodeId,
        nodeKind: "scenario_rule",
        scenarioRuleKey: specialRuleKey,
      });
      builder.addEdge({
        fromNodeId: profileNodeId,
        toNodeId: ruleNodeId,
        edgeKind: "scenario_profile_uses_rule",
        traversalClass: "scenario_contract",
        reverseTraversalPolicy: "scenario_query_only",
        scope: profile.scenarioKey,
        provenanceKey: `${profile.scenarioKey}|rule|${specialRuleKey}`,
      });
    }
  }
  const steamrollerProviderId = nodeId("host_capability_provider", "steamroller_2026");
  for (const fieldPath of SCENARIO_RUNTIME_FIELDS) {
    const fieldNodeId = nodeId("scenario_state_field", fieldPath);
    builder.addNode({
      nodeId: fieldNodeId,
      nodeKind: "scenario_state_field",
      fieldPath,
      sourceAuthority: "rules_v1_state",
    });
    builder.addEdge({
      fromNodeId: steamrollerProviderId,
      toNodeId: fieldNodeId,
      edgeKind: "steamroller_reads_or_writes_state_field",
      traversalClass: "scenario_contract",
      reverseTraversalPolicy: "terminal_query_only",
      scope: "steamroller_2026",
      timing: "runtime_authority",
      provenanceKey: `steamroller_2026|state|${fieldPath}`,
    });
  }
  return { profileCount: profiles.length, profileNodeIds: profileNodeIds.sort() };
}

function evidenceRows(interaction, corpusByKey) {
  return [
    ...arrayValues(interaction.sourceEvidence).map((entry) => ({
      evidenceKind: "source",
      path: corpusByKey.get(String(entry?.sourceKey || "")) || "",
      contains: sortedUnique(entry?.contains),
    })),
    ...arrayValues(interaction.codeEvidence).map((entry) => ({
      evidenceKind: "code",
      path: String(entry?.path || ""),
      contains: sortedUnique(entry?.contains),
    })),
    ...arrayValues(interaction.testEvidence).map((entry) => ({
      evidenceKind: "test",
      path: String(entry?.path || ""),
      contains: sortedUnique(entry?.contains),
    })),
  ];
}

function evidenceHookKeysForSurface(surface = "") {
  const normalized = normalizeGraphKey(surface);
  const direct = EVIDENCE_SURFACE_TO_HOOKS[normalized] || [];
  if (direct.length) return direct;
  if (normalized.includes("movement")) return EVIDENCE_SURFACE_TO_HOOKS.movement;
  if (normalized.includes("damage")) return EVIDENCE_SURFACE_TO_HOOKS.damage;
  if (/destroy|boxed|disabled|remove|lifecycle|tough/.test(normalized)) {
    return EVIDENCE_SURFACE_TO_HOOKS.lifecycle;
  }
  if (normalized.includes("target")) return EVIDENCE_SURFACE_TO_HOOKS.targeting;
  if (/activation|feat|spell|animus|upkeep/.test(normalized)) {
    return EVIDENCE_SURFACE_TO_HOOKS.activation;
  }
  if (/scenario|score|objective|zone|flag|cache/.test(normalized)) {
    return EVIDENCE_SURFACE_TO_HOOKS.scoring;
  }
  return [];
}

function materializeEvidenceOverlay(builder, evidenceGraph) {
  const corpusByKey = new Map(arrayValues(evidenceGraph.sourceCorpus)
    .map((entry) => [String(entry?.sourceKey || ""), String(entry?.path || "")]));
  let interactionCount = 0;
  let artifactCount = 0;
  let attachedRuleCount = 0;
  const orphanRuleKeys = [];
  for (const rule of arrayValues(evidenceGraph.nodes)) {
    const ruleKey = String(rule?.ruleKey || "");
    const coreRuleNodeId = nodeId("evidence_rule", ruleKey);
    builder.addNode({
      nodeId: coreRuleNodeId,
      nodeKind: "evidence_rule",
      ruleKey,
      ruleName: String(rule?.ruleName || ""),
      semanticTopologyAuthority: false,
    });
    const surfaces = sortedUnique(rule?.executionSurfaces);
    if (surfaces.length) attachedRuleCount += 1;
    else {
      orphanRuleKeys.push(ruleKey);
      builder.issues.push({
        issueKind: "evidence_rule_without_execution_surface",
        severity: "hard_pruning_blocker",
        ruleKey,
      });
    }
    for (const surface of surfaces) {
      const surfaceKey = normalizeGraphKey(surface);
      const surfaceNodeId = nodeId("evidence_surface", surfaceKey);
      builder.addNode({
        nodeId: surfaceNodeId,
        nodeKind: "evidence_surface",
        executionSurfaceKey: surfaceKey,
        semanticTopologyAuthority: false,
      });
      builder.addEdge({
        fromNodeId: coreRuleNodeId,
        toNodeId: surfaceNodeId,
        edgeKind: "evidence_rule_observes_surface",
        traversalClass: "evidence_overlay",
        reverseTraversalPolicy: "none",
        semanticTopologyAuthority: false,
        provenanceKey: `${ruleKey}|surface|${surfaceKey}`,
      });
      for (const hookKey of evidenceHookKeysForSurface(surfaceKey)) {
        const hookNodeId = nodeId("hook_contract", hookKey);
        builder.addNode({ nodeId: hookNodeId, nodeKind: "hook_contract", hookKey });
        builder.addEdge({
          fromNodeId: surfaceNodeId,
          toNodeId: hookNodeId,
          edgeKind: "evidence_surface_observes_hook",
          traversalClass: "evidence_overlay",
          reverseTraversalPolicy: "none",
          semanticTopologyAuthority: false,
          provenanceKey: `${ruleKey}|${surfaceKey}|${hookKey}`,
        });
      }
    }
    for (const interaction of arrayValues(rule?.interactions)) {
      interactionCount += 1;
      const interactionKey = String(interaction?.interactionKey || "");
      const assertionNodeId = nodeId("evidence_assertion", `${ruleKey}:${interactionKey}`);
      builder.addNode({
        nodeId: assertionNodeId,
        nodeKind: "evidence_assertion",
        ruleKey,
        interactionKey,
        relationText: String(interaction?.relation || ""),
        relationKind: typedInteractionRelation(interaction),
        semanticTopologyAuthority: false,
      });
      builder.addEdge({
        fromNodeId: coreRuleNodeId,
        toNodeId: assertionNodeId,
        edgeKind: "evidence_rule_has_assertion",
        traversalClass: "evidence_overlay",
        reverseTraversalPolicy: "none",
        semanticTopologyAuthority: false,
        provenanceKey: `${ruleKey}|assertion|${interactionKey}`,
      });
      for (const evidence of evidenceRows(interaction, corpusByKey)) {
        artifactCount += 1;
        const evidenceKey = stableGraphHash(evidence, 24);
        const evidenceNodeId = nodeId("evidence_artifact", evidenceKey);
        builder.addNode({
          nodeId: evidenceNodeId,
          nodeKind: "evidence_artifact",
          ...evidence,
          semanticTopologyAuthority: false,
        });
        builder.addEdge({
          fromNodeId: assertionNodeId,
          toNodeId: evidenceNodeId,
          edgeKind: "assertion_evidenced_by",
          traversalClass: "evidence_overlay",
          reverseTraversalPolicy: "none",
          semanticTopologyAuthority: false,
          provenanceKey: `${ruleKey}|${interactionKey}|${evidenceKey}`,
        });
      }
    }
  }
  return {
    coreRuleNodeCount: arrayValues(evidenceGraph.nodes).length,
    attachedRuleCount,
    orphanRuleCount: orphanRuleKeys.length,
    orphanRuleKeys,
    evidenceInteractionCount: interactionCount,
    evidenceArtifactCount: artifactCount,
  };
}

function countBy(rows, field) {
  return Object.fromEntries(Array.from(rows.reduce((map, row) => {
    const key = String(row[field] || "unknown");
    map.set(key, (map.get(key) || 0) + 1);
    return map;
  }, new Map())).sort());
}

function validateGraph(nodes, edges, indexes, counts) {
  const expected = warmachineRulesetBaselineV1.interactionGraph;
  const nodeIds = new Set(nodes.map((node) => node.nodeId));
  const danglingEdges = edges.filter((edge) =>
    !nodeIds.has(edge.fromNodeId) || !nodeIds.has(edge.toNodeId));
  const traversableEdgesMissingType = edges.filter((edge) =>
    edge.semanticTopologyAuthority !== false && (
      !edge.edgeKind || !edge.traversalClass || !edge.reverseTraversalPolicy ||
      !edge.direction || !edge.scope || !edge.timing || !edge.polarity ||
      !edge.quantifier || !edge.applicability
    ));
  const falseAtomBridges = edges.filter((edge) =>
    edge.fromNodeId.startsWith("rule_atom:") && edge.toNodeId.startsWith("rule_atom:"));
  const diagnosticTraversalLeaks = edges.filter((edge) =>
    edge.semanticTopologyAuthority === false && edge.reverseTraversalPolicy !== "none");
  const operatorsWithoutCapabilities = Object.values(indexes.operatorRows)
    .filter((operator) => !operator.capabilityKeys.length);
  const operatorsWithoutStructure = Object.values(indexes.operatorRows)
    .filter((operator) => !operator.hookKey || !operator.primitiveKey || !operator.operatorFamily);
  const seriousIssueCount = danglingEdges.length + traversableEdgesMissingType.length +
    falseAtomBridges.length + diagnosticTraversalLeaks.length +
    operatorsWithoutCapabilities.length + operatorsWithoutStructure.length +
    (counts.atomCount === expected.atomCount ? 0 : 1) +
    (counts.hookOperatorCount === expected.hookOperatorCount ? 0 : 1) +
    (counts.declaredInteractionCount === expected.declaredInteractionCount ? 0 : 1) +
    (counts.evidenceInteractionCount === expected.evidenceInteractionCount ? 0 : 1) +
    (counts.scenarioProfileCount === expected.scenarioProfileCount ? 0 : 1);
  return {
    structuralOk: seriousIssueCount === 0,
    seriousIssueCount,
    danglingEdgeCount: danglingEdges.length,
    danglingEdges,
    traversableEdgesMissingTypeCount: traversableEdgesMissingType.length,
    traversableEdgesMissingType,
    falseAtomBridgeCount: falseAtomBridges.length,
    falseAtomBridges,
    diagnosticTraversalLeakCount: diagnosticTraversalLeaks.length,
    diagnosticTraversalLeaks,
    operatorWithoutCapabilityCount: operatorsWithoutCapabilities.length,
    operatorWithoutStructureCount: operatorsWithoutStructure.length,
    expectedCardinalityChecks: {
      atomCount: counts.atomCount === expected.atomCount,
      hookOperatorCount: counts.hookOperatorCount === expected.hookOperatorCount,
      declaredInteractionCount: counts.declaredInteractionCount === expected.declaredInteractionCount,
      evidenceInteractionCount: counts.evidenceInteractionCount === expected.evidenceInteractionCount,
      scenarioProfileCount: counts.scenarioProfileCount === expected.scenarioProfileCount,
    },
  };
}

export function buildWarmachineTypedInteractionGraphV2() {
  const atoms = recognizedWarmachineRuleAtoms();
  const reverseRegistry = buildWarmachineReversePrimitiveContractRegistry();
  const evidenceText = readFileSync(resolveWarmachineHostPath(EVIDENCE_GRAPH_RELATIVE_PATH), "utf8");
  const evidenceGraph = JSON.parse(evidenceText);
  const builder = graphBuilder();
  materializeCanonicalRuleVocabulary(builder);
  const indexes = materializeRuleAtoms(builder, atoms, reverseRegistry);
  indexes.capabilityToCoreProviderIds = materializeCoreCapabilityProviders(builder);
  indexes.terminalObligationRows = materializeTerminalObligations(builder);
  const steamroller = materializeSteamrollerProfiles(builder);
  const evidenceOverlay = materializeEvidenceOverlay(builder, evidenceGraph);
  const nodes = Array.from(builder.nodes.values()).sort((left, right) =>
    left.nodeId.localeCompare(right.nodeId));
  const edges = Array.from(builder.edges.values()).sort((left, right) =>
    left.edgeId.localeCompare(right.edgeId));
  const counts = {
    atomCount: atoms.length,
    hookOperatorCount: reverseRegistry.counts.hookOperatorCount,
    primitiveCount: reverseRegistry.counts.primitiveCount,
    hookKeyCount: reverseRegistry.counts.hookKeyCount,
    declaredInteractionCount: atoms.reduce((sum, atom) => sum + (atom.interactions || []).length, 0),
    quarantinedInteractionCount: indexes.quarantinedInteractionIds.length,
    scenarioProfileCount: steamroller.profileCount,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    genericOperatorConstraintCount: nodes.filter((node) =>
      node.nodeKind === "operator_constraint").length,
    ...evidenceOverlay,
  };
  const validation = validateGraph(nodes, edges, indexes, counts);
  const graphCore = {
    schemaVersion: WARMACHINE_TYPED_INTERACTION_GRAPH_V2_SCHEMA,
    classifierSchema: WARMACHINE_TYPED_FACT_CLASSIFIER_V2,
    upstreamReceiptHash: warmachineHost.receipt.receiptHash,
    upstreamSourceHashes: warmachineHost.receipt.sourceHashes,
    evidenceGraph: {
      relativePath: EVIDENCE_GRAPH_RELATIVE_PATH,
      schemaVersion: evidenceGraph.schemaVersion,
      sourceHash: stableGraphHash(evidenceText),
    },
    counts,
    nodeKindCounts: countBy(nodes, "nodeKind"),
    edgeKindCounts: countBy(edges, "edgeKind"),
    nodes,
    edges,
    indexes,
    issues: builder.issues,
    validation,
    hardPruningEnabled: false,
    reasonsHardPruningDisabled: [
      ...(counts.quarantinedInteractionCount > 0
        ? [`${counts.quarantinedInteractionCount}_declared_interactions_quarantined_without_related_rule_keys`]
        : []),
      "generic_operator_constraints_are_preserved_but_not_semantically_traversable",
      "roster_source_classification_denominator_requires_per_state_projection",
      "opponent_response_and_reaction_preservation_not_proven",
      "held_out_strict_trace_corpus_not_broad_enough_for_hard_pruning",
    ],
    claimBoundary: "The graph provides source-bound typed capability lookup, audit ordering, and explicit unknown mass. Shared strings, hook names, declaration concepts, and evidence surfaces cannot create semantic transitive edges. Hard pruning remains disabled until a state-specific closed source denominator and held-out strict trace preservation proof both pass.",
  };
  return { ...graphCore, graphHash: stableGraphHash(graphCore) };
}
