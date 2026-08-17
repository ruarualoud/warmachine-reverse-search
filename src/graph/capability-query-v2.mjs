import {
  recognizedWarmachineRuleAtoms,
  warmachineHost,
} from "../warmachine-host-runtime.mjs";
import {
  normalizeGraphKey,
  sortedUnique,
  stableGraphHash,
  stableGraphValue,
  terminalObligationsForGoal,
} from "./typed-facts-v2.mjs";
import { buildWarmachineTypedInteractionGraphV2 } from "./typed-interaction-graph-v2.mjs";

export const WARMACHINE_ROSTER_SOURCE_PROJECTION_V2_SCHEMA =
  "warmachine_roster_source_projection_v2";
export const WARMACHINE_TERMINAL_QUERY_PROJECTION_V2_SCHEMA =
  "warmachine_terminal_query_projection_v2";
export const WARMACHINE_CAPABILITY_BOTTLENECK_V2_SCHEMA =
  "warmachine_capability_bottleneck_v2";
export const WARMACHINE_TERMINAL_ACTION_ORDERING_V2_SCHEMA =
  "warmachine_terminal_action_ordering_v2";

function nodeId(kind, key) {
  return `${kind}:${String(key)}`;
}

function values(value) {
  return Array.isArray(value) ? value : [];
}

function ruleEntryIdentity(entry = {}, sourceKind = "") {
  const sourceIds = sortedUnique([
    ...values(entry?.sourceIds),
    entry?.sourceId,
    entry?.id,
    entry?.uuid,
  ]);
  const name = String(
    entry?.name || entry?.ruleName || entry?.spellName || entry?.label || "",
  );
  const description = String(
    entry?.description || entry?.ruleText || entry?.text || entry?.sourceText || "",
  );
  const explicitAtomKeys = sortedUnique([
    entry?.atomKey,
    entry?.ruleAtomKey,
    ...values(entry?.atomKeys),
    ...values(entry?.ruleAtomKeys),
  ]);
  if (!sourceIds.length && !name && !description && !explicitAtomKeys.length) return null;
  return {
    sourceKind,
    sourceIds,
    name,
    description,
    explicitAtomKeys,
    active: entry?.active !== false && entry?.expired !== true && entry?.removed !== true,
  };
}

function sourceInventory(state = {}) {
  const rows = new Map();
  const addEntry = (piece, entry, sourceKind, sourcePath) => {
    if (!entry || typeof entry !== "object") return;
    const identity = ruleEntryIdentity(entry, sourceKind);
    if (!identity) return;
    const identityKey = stableGraphHash({
      sourceIds: identity.sourceIds,
      name: identity.name,
      description: identity.description,
      explicitAtomKeys: identity.explicitAtomKeys,
    }, 24);
    if (!rows.has(identityKey)) {
      rows.set(identityKey, {
        sourceEntryKey: identityKey,
        sourceIds: identity.sourceIds,
        name: identity.name,
        description: identity.description,
        explicitAtomKeys: identity.explicitAtomKeys,
        active: identity.active,
        sourceKinds: new Set(),
        sourcePaths: new Set(),
        pieceKeys: new Set(),
        sideKeys: new Set(),
      });
    }
    const row = rows.get(identityKey);
    row.active = row.active || identity.active;
    row.sourceKinds.add(sourceKind);
    row.sourcePaths.add(sourcePath);
    row.pieceKeys.add(String(piece.pieceKey || ""));
    row.sideKeys.add(String(piece.sideKey || ""));
  };
  const addCollection = (piece, collection, sourceKind, sourcePath) => {
    for (const [index, entry] of values(collection).entries()) {
      addEntry(piece, entry, sourceKind, `${sourcePath}[${index}]`);
    }
  };
  const visitExplicitAtoms = (piece, value, sourcePath, depth = 0) => {
    if (!value || depth > 12) return;
    if (Array.isArray(value)) {
      value.forEach((entry, index) =>
        visitExplicitAtoms(piece, entry, `${sourcePath}[${index}]`, depth + 1));
      return;
    }
    if (typeof value !== "object") return;
    const explicitAtomKeys = sortedUnique([
      value.atomKey,
      value.ruleAtomKey,
      ...values(value.atomKeys),
      ...values(value.ruleAtomKeys),
    ]);
    if (explicitAtomKeys.length) {
      addEntry(piece, { ...value, ruleAtomKeys: explicitAtomKeys }, "runtime_atom_binding", sourcePath);
    }
    for (const [key, entry] of Object.entries(value)) {
      if (entry && typeof entry === "object") {
        visitExplicitAtoms(piece, entry, `${sourcePath}.${key}`, depth + 1);
      }
    }
  };

  for (const piece of values(state.pieces)) {
    const card = piece.cardSnapshot || {};
    addCollection(piece, card.cardAbilities, "card_ability", "cardSnapshot.cardAbilities");
    addCollection(piece, card.abilities, "card_ability", "cardSnapshot.abilities");
    addCollection(piece, card.spells, "card_spell", "cardSnapshot.spells");
    for (const [modelIndex, model] of values(card.models).entries()) {
      addCollection(
        piece,
        model?.abilities,
        "model_ability",
        `cardSnapshot.models[${modelIndex}].abilities`,
      );
      addCollection(
        piece,
        model?.advantages,
        "model_advantage",
        `cardSnapshot.models[${modelIndex}].advantages`,
      );
      for (const [weaponIndex, weapon] of values(model?.weapons).entries()) {
        addCollection(
          piece,
          weapon?.abilities,
          "weapon_ability",
          `cardSnapshot.models[${modelIndex}].weapons[${weaponIndex}].abilities`,
        );
      }
    }
    addCollection(piece, piece.spells, "runtime_spell", "spells");
    addCollection(piece, piece.upkeepSpells, "upkeep_spell", "upkeepSpells");
    addCollection(piece, piece.specialRules, "runtime_special_rule", "specialRules");
    addCollection(piece, piece.statusEffects, "status_effect", "statusEffects");
    addCollection(piece, piece.activeSupportEffects, "active_support_effect", "activeSupportEffects");
    addCollection(piece, piece.activeUpkeeps, "active_upkeep", "activeUpkeeps");
    for (const [profileIndex, profile] of values(piece.attackProfiles).entries()) {
      addCollection(
        piece,
        profile?.abilities,
        "attack_profile_ability",
        `attackProfiles[${profileIndex}].abilities`,
      );
    }
    visitExplicitAtoms(piece, {
      specialRules: piece.specialRules,
      statusEffects: piece.statusEffects,
      activeSupportEffects: piece.activeSupportEffects,
      activeUpkeeps: piece.activeUpkeeps,
      ruleAtomState: piece.ruleAtomState,
      attackProfiles: piece.attackProfiles,
      metadata: piece.metadata,
    }, "runtime");
  }
  return Array.from(rows.values()).map((row) => ({
    ...row,
    sourceKinds: sortedUnique(row.sourceKinds),
    sourcePaths: sortedUnique(row.sourcePaths),
    pieceKeys: sortedUnique(row.pieceKeys),
    sideKeys: sortedUnique(row.sideKeys),
  })).sort((left, right) =>
    left.sourceEntryKey.localeCompare(right.sourceEntryKey));
}

function canonicalCoreFactInventory(state = {}) {
  const rows = new Map();
  const addFact = (piece, factKind, factKey, sourcePath) => {
    const normalizedFactKey = normalizeGraphKey(factKey);
    if (!normalizedFactKey) return;
    const rowKey = `${factKind}:${normalizedFactKey}`;
    if (!rows.has(rowKey)) {
      rows.set(rowKey, {
        factKey: rowKey,
        factKind,
        semanticKey: normalizedFactKey,
        pieceKeys: new Set(),
        sourcePaths: new Set(),
      });
    }
    rows.get(rowKey).pieceKeys.add(String(piece.pieceKey || ""));
    rows.get(rowKey).sourcePaths.add(sourcePath);
  };
  for (const piece of values(state.pieces)) {
    for (const [modelIndex, model] of values(piece.cardSnapshot?.models).entries()) {
      for (const [advantageIndex, advantage] of values(model?.advantages).entries()) {
        const value = typeof advantage === "string"
          ? advantage
          : advantage?.name || advantage?.label || advantage?.ruleName;
        const factKind = /^z[_ -]?\d+mm$/i.test(String(value || ""))
          ? "base_geometry_fact"
          : "core_rule_fact";
        addFact(
          piece,
          factKind,
          value,
          `cardSnapshot.models[${modelIndex}].advantages[${advantageIndex}]`,
        );
      }
    }
    for (const [profileIndex, profile] of values(piece.attackProfiles).entries()) {
      addFact(
        piece,
        "attack_profile_fact",
        profile?.mode || profile?.attackKind || profile?.sourceKind || "unknown",
        `attackProfiles[${profileIndex}]`,
      );
    }
  }
  return Array.from(rows.values()).map((row) => ({
    ...row,
    pieceKeys: sortedUnique(row.pieceKeys),
    sourcePaths: sortedUnique(row.sourcePaths),
    classification: row.factKind === "core_rule_fact"
      ? "host_core_rule"
      : "structured_non_atom_fact",
    hardPruningEligible: false,
  })).sort((left, right) => left.factKey.localeCompare(right.factKey));
}

function classifySourceRow(row, graph, atomIdSet) {
  const sourceMappedAtomIds = sortedUnique(row.sourceIds.flatMap((sourceId) =>
    graph.indexes.sourceIdToAtomIds?.[sourceId] || []));
  const explicitMappedAtomIds = sortedUnique(row.explicitAtomKeys
    .map((atomKey) => nodeId("rule_atom", atomKey))
    .filter((atomNodeId) => atomIdSet.has(atomNodeId)));
  const unknownExplicitAtomKeys = row.explicitAtomKeys.filter((atomKey) =>
    !atomIdSet.has(nodeId("rule_atom", atomKey)));
  const atomIds = sortedUnique([...sourceMappedAtomIds, ...explicitMappedAtomIds]);
  let classification = "unresolved_wildcard";
  if (sourceMappedAtomIds.length && explicitMappedAtomIds.length) {
    classification = "exact_source_and_runtime_atom";
  } else if (sourceMappedAtomIds.length) {
    classification = "exact_source_id";
  } else if (explicitMappedAtomIds.length) {
    classification = row.sourceKinds.includes("runtime_atom_binding")
      ? "exact_runtime_atom"
      : "exact_granted_or_inherited_atom";
  } else if (!row.active) {
    classification = "inactive_unresolved_wildcard";
  }
  return {
    ...row,
    classification,
    atomIds,
    sourceMappedAtomIds,
    explicitMappedAtomIds,
    unknownExplicitAtomKeys,
    hardPruningEligible: false,
  };
}

function groupPieceAtoms(sourceRows) {
  const map = new Map();
  for (const row of sourceRows) {
    for (const pieceKey of row.pieceKeys) {
      if (!map.has(pieceKey)) map.set(pieceKey, new Set());
      for (const atomId of row.atomIds) map.get(pieceKey).add(atomId);
    }
  }
  return Object.fromEntries(Array.from(map).sort(([left], [right]) => left.localeCompare(right))
    .map(([pieceKey, atomIds]) => [pieceKey, sortedUnique(atomIds)]));
}

function capabilityKeysForCoreFact(row = {}) {
  if (row.factKind === "base_geometry_fact") return ["geometry:state"];
  if (row.factKind === "attack_profile_fact") {
    return ["action:attack", "attack:legality"];
  }
  const capabilities = new Set();
  const key = String(row.semanticKey || "");
  if (/advance_deployment|ambush|flight|incorporeal|pathfinder|unstopable/.test(key)) {
    capabilities.add("movement:legality");
    capabilities.add("geometry:state");
    capabilities.add("scenario:element_control");
  }
  if (/combined_melee_attack|dual_attack|gunfighter|headbutt|slam|trample/.test(key)) {
    capabilities.add("action:attack");
    capabilities.add("attack:legality");
  }
  if (/eyeless_sight|stealth/.test(key)) {
    capabilities.add("attack:legality");
    capabilities.add("geometry:state");
  }
  if (key === "tough") capabilities.add("lifecycle:tough_resolution");
  return [...capabilities].sort();
}

export function buildWarmachineRosterSourceProjectionV2(inputState = {}, graph = null) {
  const semanticGraph = graph || buildWarmachineTypedInteractionGraphV2();
  const atomIdSet = new Set(semanticGraph.indexes.atomIds || []);
  const sourceRows = sourceInventory(inputState)
    .map((row) => classifySourceRow(row, semanticGraph, atomIdSet));
  const canonicalCoreFactRows = canonicalCoreFactInventory(inputState);
  const exactRows = sourceRows.filter((row) => row.atomIds.length > 0);
  const unresolvedRows = sourceRows.filter((row) => row.atomIds.length === 0);
  const unknownRuntimeAtomRows = sourceRows.filter((row) => row.unknownExplicitAtomKeys.length);
  const pieceAtomIds = groupPieceAtoms(exactRows);
  const exactMappedAtomIds = sortedUnique(exactRows.flatMap((row) => row.atomIds));
  const wildcardPieceKeys = sortedUnique(unresolvedRows.flatMap((row) => row.pieceKeys));
  const rosterPieceKeys = sortedUnique(values(inputState.pieces).map((piece) => piece.pieceKey));
  const piecesWithoutRecordedSources = rosterPieceKeys.filter((pieceKey) =>
    !sourceRows.some((row) => row.pieceKeys.includes(pieceKey)));
  const sourceClassificationDenominatorClosed = unresolvedRows.length === 0 &&
    unknownRuntimeAtomRows.length === 0;
  const projectionCore = {
    schemaVersion: WARMACHINE_ROSTER_SOURCE_PROJECTION_V2_SCHEMA,
    graphHash: semanticGraph.graphHash,
    upstreamReceiptHash: warmachineHost.receipt.receiptHash,
    counts: {
      rosterPieceCount: rosterPieceKeys.length,
      sourceEntryCount: sourceRows.length,
      sourceOccurrenceCount: sourceRows.reduce((sum, row) => sum + row.pieceKeys.length, 0),
      exactMappedSourceEntryCount: exactRows.length,
      unresolvedSourceEntryCount: unresolvedRows.length,
      unknownRuntimeAtomEntryCount: unknownRuntimeAtomRows.length,
      exactMappedAtomCount: exactMappedAtomIds.length,
      exactMappedPieceCount: Object.keys(pieceAtomIds).length,
      wildcardPieceCount: wildcardPieceKeys.length,
      piecesWithoutRecordedSourceCount: piecesWithoutRecordedSources.length,
      coreRuleFactCount: canonicalCoreFactRows.filter((row) =>
        row.factKind === "core_rule_fact").length,
      baseGeometryFactCount: canonicalCoreFactRows.filter((row) =>
        row.factKind === "base_geometry_fact").length,
      attackProfileFactCount: canonicalCoreFactRows.filter((row) =>
        row.factKind === "attack_profile_fact").length,
      canonicalDenominatorCount: sourceRows.length + canonicalCoreFactRows.length,
    },
    sourceRows,
    canonicalCoreFactRows,
    pieceAtomIds,
    exactMappedAtomIds,
    wildcardPieceKeys,
    piecesWithoutRecordedSources,
    sourceClassificationDenominatorClosed,
    hardPruningEnabled: false,
    reasonsHardPruningDisabled: sortedUnique([
      ...(unresolvedRows.length ? ["unresolved_roster_sources_preserved_as_wildcard"] : []),
      ...(unknownRuntimeAtomRows.length ? ["unknown_runtime_atom_keys"] : []),
      "held_out_strict_trace_preservation_required",
      "opponent_reaction_preservation_required",
    ]),
    claimBoundary: "Only exact accepted source IDs and explicit runtime atom keys attach a card/model to an atom. Text similarity is not a mapping. Every unresolved source keeps its owning piece wildcard-relevant; pieces with no recorded special source still retain all core Host actions.",
  };
  return { ...projectionCore, projectionHash: stableGraphHash(projectionCore) };
}

function providerRowsForCapability(capabilityKey, rosterProjection, graph) {
  const exactOperatorProviders = [];
  const operatorIds = graph.indexes.capabilityToOperatorIds?.[capabilityKey] || [];
  for (const operatorNodeId of operatorIds) {
    const operator = graph.indexes.operatorRows?.[operatorNodeId];
    if (!operator) continue;
    const pieceKeys = Object.entries(rosterProjection.pieceAtomIds)
      .filter(([, atomIds]) => atomIds.includes(operator.atomNodeId))
      .map(([pieceKey]) => pieceKey)
      .sort();
    if (!pieceKeys.length) continue;
    exactOperatorProviders.push({
      providerKind: "rule_atom_operator",
      providerNodeId: operatorNodeId,
      atomNodeId: operator.atomNodeId,
      atomKey: operator.atomKey,
      hookKey: operator.hookKey,
      primitiveKey: operator.primitiveKey,
      pieceKeys,
      factNodeIds: operator.factNodeIds,
    });
  }
  const coreProviders = (graph.indexes.capabilityToCoreProviderIds?.[capabilityKey] || [])
    .map((providerNodeId) => ({ providerKind: "host_core", providerNodeId }));
  const exactCoreFactProviders = rosterProjection.canonicalCoreFactRows
    .filter((row) => capabilityKeysForCoreFact(row).includes(capabilityKey))
    .map((row) => ({
      providerKind: "roster_core_fact",
      providerNodeId: `roster_fact:${row.factKey}`,
      factKey: row.factKey,
      factKind: row.factKind,
      semanticKey: row.semanticKey,
      pieceKeys: row.pieceKeys,
    }));
  return { exactOperatorProviders, exactCoreFactProviders, coreProviders };
}

function relevantFactSummary(providerRows, graph) {
  const nodeById = new Map(graph.nodes.map((node) => [node.nodeId, node]));
  const facts = providerRows.flatMap((provider) => provider.factNodeIds || [])
    .map((factNodeId) => nodeById.get(factNodeId))
    .filter(Boolean);
  const byKind = new Map();
  for (const fact of facts) {
    if (!byKind.has(fact.nodeKind)) byKind.set(fact.nodeKind, new Set());
    byKind.get(fact.nodeKind).add(fact.semanticKey || fact.nodeId);
  }
  return Object.fromEntries(Array.from(byKind).sort(([left], [right]) => left.localeCompare(right))
    .map(([kind, keys]) => [kind, sortedUnique(keys)]));
}

export function buildWarmachineTerminalQueryProjectionV2(
  inputState = {},
  template = {},
  graph = null,
) {
  const semanticGraph = graph || buildWarmachineTypedInteractionGraphV2();
  const rosterProjection = buildWarmachineRosterSourceProjectionV2(inputState, semanticGraph);
  const goalType = template.goalType === "scenario_score" ? "scenario_score" : "assassination";
  const obligations = terminalObligationsForGoal(goalType).map((obligation) => {
    const capabilityRequirements = obligation.requiredCapabilityKeys.map((capabilityKey) => {
      const providers = providerRowsForCapability(capabilityKey, rosterProjection, semanticGraph);
      return {
        capabilityKey,
        ...providers,
        exactProviderCount: providers.exactOperatorProviders.length +
          providers.exactCoreFactProviders.length + providers.coreProviders.length,
        wildcardPieceKeys: rosterProjection.wildcardPieceKeys,
        unavailable: providers.exactOperatorProviders.length === 0 &&
          providers.exactCoreFactProviders.length === 0 &&
          providers.coreProviders.length === 0 &&
          rosterProjection.wildcardPieceKeys.length === 0,
      };
    });
    const operatorProviders = capabilityRequirements.flatMap((row) => row.exactOperatorProviders);
    return {
      ...obligation,
      capabilityRequirements,
      exactProviderComplete: capabilityRequirements.every((row) => row.exactProviderCount > 0),
      unresolvedByWildcard: capabilityRequirements.some((row) =>
        row.exactProviderCount === 0 && row.wildcardPieceKeys.length > 0),
      requiredFactSummary: relevantFactSummary(operatorProviders, semanticGraph),
    };
  });
  const relevantOperatorIds = sortedUnique(obligations.flatMap((obligation) =>
    obligation.capabilityRequirements.flatMap((requirement) =>
      requirement.exactOperatorProviders.map((provider) => provider.providerNodeId))));
  const relevantAtomIds = sortedUnique(relevantOperatorIds.map((operatorNodeId) =>
    semanticGraph.indexes.operatorRows?.[operatorNodeId]?.atomNodeId).filter(Boolean));
  const relevantPieceKeys = sortedUnique(obligations.flatMap((obligation) =>
    obligation.capabilityRequirements.flatMap((requirement) =>
      [...requirement.exactOperatorProviders, ...requirement.exactCoreFactProviders]
        .flatMap((provider) => provider.pieceKeys))));
  const relevantCoreFactKeys = sortedUnique(obligations.flatMap((obligation) =>
    obligation.capabilityRequirements.flatMap((requirement) =>
      requirement.exactCoreFactProviders.map((provider) => provider.factKey))));
  const projectionCore = {
    schemaVersion: WARMACHINE_TERMINAL_QUERY_PROJECTION_V2_SCHEMA,
    graphHash: semanticGraph.graphHash,
    rosterProjectionHash: rosterProjection.projectionHash,
    upstreamReceiptHash: warmachineHost.receipt.receiptHash,
    templateKey: String(template.templateKey || ""),
    goalType,
    attackerPieceKey: String(template.attackerPieceKey || ""),
    targetPieceKey: String(template.targetPieceKey || ""),
    obligations,
    relevantOperatorIds,
    relevantAtomIds,
    relevantCoreFactKeys,
    relevantPieceKeys,
    wildcardPieceKeys: rosterProjection.wildcardPieceKeys,
    counts: {
      obligationCount: obligations.length,
      exactProviderCompleteObligationCount: obligations.filter((row) => row.exactProviderComplete).length,
      wildcardDependentObligationCount: obligations.filter((row) => row.unresolvedByWildcard).length,
      relevantOperatorCount: relevantOperatorIds.length,
      relevantAtomCount: relevantAtomIds.length,
      relevantCoreFactCount: relevantCoreFactKeys.length,
      relevantPieceCount: relevantPieceKeys.length,
      wildcardPieceCount: rosterProjection.wildcardPieceKeys.length,
    },
    hardPruningEnabled: false,
    orderingOnly: true,
    reasonsHardPruningDisabled: sortedUnique([
      ...rosterProjection.reasonsHardPruningDisabled,
      "terminal_query_is_capability_relevance_not_reachability_proof",
      "strict_forward_witness_required_per_route",
    ]),
    claimBoundary: "The query returns exact Host/core, source-bound atom/operator, model, resource, timing, lifecycle, event and geometry candidates for each terminal obligation. Wildcards remain relevant. Non-selected actions are neither illegal nor unreachable.",
  };
  return { ...projectionCore, projectionHash: stableGraphHash(projectionCore) };
}

export function buildWarmachineCapabilityBottleneckV2(queryProjection = {}) {
  const rows = [];
  for (const obligation of queryProjection.obligations || []) {
    for (const requirement of obligation.capabilityRequirements || []) {
      const exactPieceKeys = sortedUnique(requirement.exactOperatorProviders
        .concat(requirement.exactCoreFactProviders || [])
        .flatMap((provider) => provider.pieceKeys));
      const exactAtomIds = sortedUnique(requirement.exactOperatorProviders
        .map((provider) => provider.atomNodeId));
      const exactCoreFactKeys = sortedUnique((requirement.exactCoreFactProviders || [])
        .map((provider) => provider.factKey));
      const coreProviderIds = sortedUnique(requirement.coreProviders
        .map((provider) => provider.providerNodeId));
      const wildcardPieceKeys = sortedUnique(requirement.wildcardPieceKeys);
      let bottleneckKind = "open_or_unknown";
      if (coreProviderIds.length) bottleneckKind = "core_capability_not_model_locked";
      else if (wildcardPieceKeys.length) bottleneckKind = "wildcard_blocks_lock";
      else if (exactPieceKeys.length === 1) bottleneckKind = "unique_model_candidate";
      else if (exactAtomIds.length === 1 && !exactCoreFactKeys.length) {
        bottleneckKind = "unique_rule_candidate";
      }
      else if (exactPieceKeys.length > 1) bottleneckKind = "bounded_model_candidates";
      else if (!exactPieceKeys.length) bottleneckKind = "no_exact_provider";
      rows.push({
        obligationKey: obligation.obligationKey,
        capabilityKey: requirement.capabilityKey,
        bottleneckKind,
        exactPieceKeys,
        exactAtomIds,
        exactCoreFactKeys,
        coreProviderIds,
        wildcardPieceKeys,
        orderingLockEligible: ["unique_model_candidate", "unique_rule_candidate"]
          .includes(bottleneckKind),
        hardBranchLockEligible: false,
      });
    }
  }
  const core = {
    schemaVersion: WARMACHINE_CAPABILITY_BOTTLENECK_V2_SCHEMA,
    queryProjectionHash: String(queryProjection.projectionHash || ""),
    rows,
    counts: {
      requirementCount: rows.length,
      uniqueModelCandidateCount: rows.filter((row) =>
        row.bottleneckKind === "unique_model_candidate").length,
      uniqueRuleCandidateCount: rows.filter((row) =>
        row.bottleneckKind === "unique_rule_candidate").length,
      wildcardBlockedLockCount: rows.filter((row) =>
        row.bottleneckKind === "wildcard_blocks_lock").length,
    },
    hardPruningEnabled: false,
    claimBoundary: "Capability bottlenecks may prioritize a unique exact model or rule only when no wildcard can satisfy the requirement. They never remove branches until strict trace preservation, source closure, reaction closure and route witnesses are proven.",
  };
  return { ...core, bottleneckHash: stableGraphHash(stableGraphValue(core)) };
}

export function orderWarmachineActionsByTerminalQueryV2(actions = [], queryProjection = {}) {
  const relevantPieceKeys = new Set(queryProjection.relevantPieceKeys || []);
  const wildcardPieceKeys = new Set(queryProjection.wildcardPieceKeys || []);
  const annotated = actions.map((action, inputIndex) => {
    const actorPieceKey = String(
      action?.actorPieceKey || action?.sourcePieceKey || action?.pieceKey || "",
    );
    const actionKey = String(action?.actionKey || `input-${inputIndex}`);
    const orderingClass = actorPieceKey && relevantPieceKeys.has(actorPieceKey)
      ? "exact_terminal_relevant_actor"
      : actorPieceKey && wildcardPieceKeys.has(actorPieceKey)
        ? "wildcard_relevant_actor"
        : actorPieceKey
          ? "core_action_actor"
          : "global_or_reaction_action";
    const orderingRank = {
      exact_terminal_relevant_actor: 0,
      wildcard_relevant_actor: 1,
      global_or_reaction_action: 2,
      core_action_actor: 3,
    }[orderingClass];
    return { action, actionKey, actorPieceKey, inputIndex, orderingClass, orderingRank };
  });
  annotated.sort((left, right) => left.orderingRank - right.orderingRank ||
    left.actionKey.localeCompare(right.actionKey) || left.inputIndex - right.inputIndex);
  const inputIdentities = actions.map((action, index) =>
    String(action?.actionKey || `input-${index}`)).sort();
  const outputIdentities = annotated.map((row) => row.actionKey).sort();
  const preservedExactly = inputIdentities.length === outputIdentities.length &&
    inputIdentities.every((actionKey, index) => actionKey === outputIdentities[index]);
  return {
    schemaVersion: WARMACHINE_TERMINAL_ACTION_ORDERING_V2_SCHEMA,
    queryProjectionHash: String(queryProjection.projectionHash || ""),
    inputActionCount: actions.length,
    outputActionCount: annotated.length,
    preservedExactly,
    hardFilteringPerformed: false,
    orderedActions: annotated.map((row) => row.action),
    orderingEvidence: annotated.map(({ action, ...row }) => row),
  };
}

export function recognizedWarmachineGraphAtomCountV2() {
  return recognizedWarmachineRuleAtoms().length;
}
