import { readFileSync } from "node:fs";

import { buildWarmachineTypedInteractionGraphV2 } from
  "../graph/typed-interaction-graph-v2.mjs";
import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { buildWarmachineReversePrimitiveContractRegistry } from
  "../reverse/primitive-contracts-v1.mjs";
import {
  resolveWarmachineHostPath,
  warmachineHost,
} from "../warmachine-host-runtime.mjs";
import { warmachineRulesetBaselineV1 } from "./ruleset-baseline-v1.mjs";

export const WARMACHINE_RULESET_SEMANTIC_INDEX_V1_SCHEMA =
  "warmachine_ruleset_semantic_index_v1";
export const WARMACHINE_RULESET_CHANGE_IMPACT_V1_SCHEMA =
  "warmachine_ruleset_change_impact_v1";

export const REVIEWED_RULESET_SEMANTIC_INDEX_V1_URL = new URL(
  "../../config/warmachine-ruleset-semantic-index-v1.json",
  import.meta.url,
);

const PRESENTATION_KEYS = new Set([
  "generatedAt",
  "portraitPath",
  "searchText",
  "sortName",
]);

function objectFromSortedEntries(entries) {
  return Object.fromEntries([...entries].sort(([left], [right]) =>
    String(left).localeCompare(String(right))));
}

function sortedUnique(values) {
  return [...new Set([...(values || [])].filter((value) => value !== undefined &&
    value !== null && String(value).length > 0).map(String))].sort();
}

function stripPresentation(value, { omitIds = false } = {}) {
  if (Array.isArray(value)) {
    return value.map((entry) => stripPresentation(entry, { omitIds }));
  }
  if (!value || typeof value !== "object") return value;
  return objectFromSortedEntries(Object.entries(value)
    .filter(([key]) => !PRESENTATION_KEYS.has(key) && !(omitIds && key === "id"))
    .map(([key, entry]) => [key, stripPresentation(entry, { omitIds })]));
}

function cardRulesPayload(card = {}) {
  return stripPresentation({
    cardTypeId: card.cardTypeId,
    cardTypeName: card.cardTypeName,
    keywords: card.keywords,
    healthType: card.healthType,
    healthValues: card.healthValues,
    forceField: card.forceField,
    spellRackOptions: card.spellRackOptions,
    featName: card.featName,
    featDescription: card.featDescription,
    cardAbilities: card.cardAbilities,
    models: card.models,
    spells: card.spells,
  });
}

function cardConstructionPayload(card = {}) {
  return stableGraphValue({
    factionId: card.factionId,
    cardTypeId: card.cardTypeId,
    editionId: card.editionId,
    pointCost: card.pointCost,
    pointCostNumber: card.pointCostNumber,
    pointCostDescription: card.pointCostDescription,
    fieldAllowance: card.fieldAllowance,
    isCampaignOnly: card.isCampaignOnly,
    optionSlots: card.optionSlots,
    validAttachmentIds: card.validAttachmentIds,
    requiredAttachmentIds: card.requiredAttachmentIds,
    requiredAttachmentCount: card.requiredAttachmentCount,
    companionIds: card.companionIds,
    armyIds: card.armyIds,
  });
}

function ruleSourceKind(path) {
  if (path.includes("cardAbilities")) return "card_ability";
  if (path.includes("weapons") && path.includes("abilities")) {
    return "weapon_ability";
  }
  if (path.includes("abilities")) return "model_ability";
  if (path.includes("spells")) return "spell";
  return "described_rule";
}

function extractCardRuleSources(card = {}) {
  const records = [];
  function visit(value, path = []) {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => visit(entry, [...path, String(index)]));
      return;
    }
    if (!value || typeof value !== "object") return;
    if (typeof value.id === "string" && typeof value.name === "string" &&
      (typeof value.description === "string" || path.includes("spells"))) {
      const semanticPayload = stripPresentation(value);
      const fingerprintPayload = stripPresentation(value, { omitIds: true });
      records.push({
        sourceId: value.id,
        sourceKind: ruleSourceKind(path),
        name: value.name,
        semanticHash: stableGraphHash(semanticPayload),
        fingerprintHash: stableGraphHash(fingerprintPayload),
      });
    }
    for (const [key, entry] of Object.entries(value)) {
      visit(entry, [...path, key]);
    }
  }
  visit(cardRulesPayload(card));
  if (String(card.featName || "").trim() || String(card.featDescription || "").trim()) {
    const feat = {
      name: String(card.featName || ""),
      description: String(card.featDescription || ""),
    };
    records.push({
      sourceId: `feat:${card.id}`,
      sourceKind: "feat",
      name: feat.name,
      semanticHash: stableGraphHash({ id: `feat:${card.id}`, ...feat }),
      fingerprintHash: stableGraphHash(feat),
    });
  }
  return records;
}

function extractBehaviorTokens(card = {}) {
  const tokens = [];
  for (const model of card.models || []) {
    for (const value of model.advantages || []) {
      tokens.push({ kind: "advantage", value: String(value) });
    }
    for (const weapon of model.weapons || []) {
      for (const value of weapon.qualities || []) {
        tokens.push({ kind: "weapon_quality", value: String(value) });
      }
    }
  }
  return tokens;
}

function atomKeyFromNodeId(nodeId) {
  return String(nodeId || "").replace(/^rule_atom:/, "");
}

function buildGraphAtomConcepts(graph) {
  const interactionToAtom = new Map(graph.nodes
    .filter((node) => node.nodeKind === "declared_interaction")
    .map((node) => [node.nodeId, node.atomKey]));
  const conceptsByAtom = new Map();
  for (const edge of graph.edges) {
    const atomKey = interactionToAtom.get(edge.fromNodeId);
    if (!atomKey || !String(edge.toNodeId).startsWith("declared_concept:")) continue;
    if (!conceptsByAtom.has(atomKey)) conceptsByAtom.set(atomKey, new Set());
    conceptsByAtom.get(atomKey).add(edge.toNodeId);
  }
  return conceptsByAtom;
}

function buildAtomIndex(registry, graph) {
  const operatorsByAtom = new Map();
  for (const operator of registry.operators || []) {
    if (!operatorsByAtom.has(operator.atomKey)) operatorsByAtom.set(operator.atomKey, []);
    operatorsByAtom.get(operator.atomKey).push(operator);
  }
  const sourceIdsByAtom = new Map();
  for (const [sourceId, atomNodeIds] of Object.entries(
    graph.indexes.sourceIdToAtomIds || {},
  )) {
    for (const atomNodeId of atomNodeIds) {
      const atomKey = atomKeyFromNodeId(atomNodeId);
      if (!sourceIdsByAtom.has(atomKey)) sourceIdsByAtom.set(atomKey, []);
      sourceIdsByAtom.get(atomKey).push(sourceId);
    }
  }
  const conceptsByAtom = buildGraphAtomConcepts(graph);
  return objectFromSortedEntries([...operatorsByAtom.entries()].map(([atomKey, rows]) => {
    const operators = rows
      .map(({ operatorKey: _operatorKey, schemaVersion: _schemaVersion, ...row }) =>
        stableGraphValue(row))
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
    const localInteractionNodes = graph.nodes
      .filter((node) => node.atomKey === atomKey &&
        node.nodeKind === "declared_interaction")
      .map((node) => stableGraphValue(node))
      .sort((left, right) => String(left.nodeId).localeCompare(String(right.nodeId)));
    const hookKeys = sortedUnique(rows.map((row) => row.hookKey));
    return [atomKey, {
      atomKey,
      atomVersion: Math.max(...rows.map((row) => Number(row.atomVersion || 0))),
      ruleNames: sortedUnique(rows.map((row) => row.ruleName)),
      hookKeys,
      primitiveKeys: sortedUnique(rows.map((row) => row.primitiveKey)),
      maturities: sortedUnique(rows.map((row) => row.maturity)),
      sourceIds: sortedUnique(sourceIdsByAtom.get(atomKey)),
      reviewConceptIds: sortedUnique(conceptsByAtom.get(atomKey)),
      operatorCount: rows.length,
      semanticHash: stableGraphHash({ operators, localInteractionNodes }),
    }];
  }));
}

function buildHookIndex(registry) {
  const rowsByHook = new Map();
  for (const operator of registry.operators || []) {
    if (!rowsByHook.has(operator.hookKey)) rowsByHook.set(operator.hookKey, []);
    rowsByHook.get(operator.hookKey).push(operator);
  }
  return objectFromSortedEntries([...rowsByHook.entries()].map(([hookKey, rows]) => {
    const semantics = rows.map(({ operatorKey: _operatorKey, ...row }) =>
      stableGraphValue(row)).sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)));
    return [hookKey, {
      hookKey,
      atomKeys: sortedUnique(rows.map((row) => row.atomKey)),
      primitiveKeys: sortedUnique(rows.map((row) => row.primitiveKey)),
      operatorCount: rows.length,
      semanticHash: stableGraphHash(semantics),
    }];
  }));
}

function buildCardAndSourceIndexes(cards, graph) {
  const cardRows = [];
  const sources = new Map();
  const tokens = new Map();
  const sourceIdToAtomKeys = objectFromSortedEntries(Object.entries(
    graph.indexes.sourceIdToAtomIds || {},
  ).map(([sourceId, atomNodeIds]) => [
    sourceId,
    sortedUnique(atomNodeIds.map(atomKeyFromNodeId)),
  ]));
  for (const card of cards) {
    const cardId = String(card.id || "");
    if (!cardId) continue;
    const ruleSources = extractCardRuleSources(card);
    for (const source of ruleSources) {
      if (!sources.has(source.sourceId)) {
        sources.set(source.sourceId, {
          sourceId: source.sourceId,
          sourceKinds: new Set(),
          names: new Set(),
          semanticHashes: new Set(),
          fingerprintHashes: new Set(),
          mappedAtomKeys: new Set(sourceIdToAtomKeys[source.sourceId] || []),
        });
      }
      const row = sources.get(source.sourceId);
      row.sourceKinds.add(source.sourceKind);
      row.names.add(source.name);
      row.semanticHashes.add(source.semanticHash);
      row.fingerprintHashes.add(source.fingerprintHash);
    }
    const behaviorTokens = extractBehaviorTokens(card);
    for (const token of behaviorTokens) {
      const tokenKey = `${token.kind}:${token.value.trim().toLowerCase()}`;
      if (!tokens.has(tokenKey)) {
        tokens.set(tokenKey, {
          tokenKey,
          kind: token.kind,
          values: new Set(),
        });
      }
      tokens.get(tokenKey).values.add(token.value);
    }
    cardRows.push([cardId, {
      cardId,
      name: String(card.name || ""),
      factionId: String(card.factionId || ""),
      factionName: String(card.factionName || ""),
      cardTypeName: String(card.cardTypeName || ""),
      rulesHash: stableGraphHash(cardRulesPayload(card)),
      constructionHash: stableGraphHash(cardConstructionPayload(card)),
      metadataHash: stableGraphHash({
        name: card.name,
        factionName: card.factionName,
        editionName: card.editionName,
      }),
      ruleSourceIds: sortedUnique(ruleSources.map((source) => source.sourceId)),
      behaviorTokenKeys: sortedUnique(behaviorTokens.map((token) =>
        `${token.kind}:${token.value.trim().toLowerCase()}`)),
    }]);
  }
  return {
    cards: objectFromSortedEntries(cardRows),
    ruleSources: objectFromSortedEntries([...sources.entries()].map(([key, row]) => [key, {
      sourceId: key,
      sourceKinds: sortedUnique(row.sourceKinds),
      names: sortedUnique(row.names),
      semanticHashes: sortedUnique(row.semanticHashes),
      fingerprintHashes: sortedUnique(row.fingerprintHashes),
      mappedAtomKeys: sortedUnique(row.mappedAtomKeys),
      ambiguousSourceIdentity: row.semanticHashes.size > 1,
    }])),
    behaviorTokens: objectFromSortedEntries([...tokens.entries()].map(([key, row]) => [key, {
      tokenKey: key,
      kind: row.kind,
      values: sortedUnique(row.values),
    }])),
  };
}

function scenarioKey(profile, index) {
  return String(profile?.scenarioKey || profile?.key || profile?.id ||
    profile?.name || `scenario-${index}`);
}

export function buildWarmachineRulesetSemanticIndexV1(rawOptions = {}) {
  const baseline = rawOptions.baseline || warmachineRulesetBaselineV1;
  const registry = rawOptions.registry || buildWarmachineReversePrimitiveContractRegistry();
  const graph = rawOptions.graph || buildWarmachineTypedInteractionGraphV2();
  const cardData = rawOptions.cardData || JSON.parse(readFileSync(
    resolveWarmachineHostPath(baseline.cardData.primaryRelativePath),
    "utf8",
  ));
  const profiles = rawOptions.scenarioProfiles ||
    warmachineHost.steamroller.steamroller2026ScenarioProfiles();
  const atomIndex = buildAtomIndex(registry, graph);
  const hookIndex = buildHookIndex(registry);
  const cardIndexes = buildCardAndSourceIndexes(cardData.cards || [], graph);
  const allRuleFingerprints = new Set();
  const atomMappedRuleFingerprints = new Set();
  for (const row of Object.values(cardIndexes.ruleSources)) {
    for (const fingerprintHash of row.fingerprintHashes) {
      allRuleFingerprints.add(fingerprintHash);
      if (row.mappedAtomKeys.length > 0) atomMappedRuleFingerprints.add(fingerprintHash);
    }
  }
  const scenarios = objectFromSortedEntries(profiles.map((profile, index) => {
    const key = scenarioKey(profile, index);
    return [key, { scenarioKey: key, semanticHash: stableGraphHash(profile) }];
  }));
  const core = {
    schemaVersion: WARMACHINE_RULESET_SEMANTIC_INDEX_V1_SCHEMA,
    baselineKey: String(baseline.baselineKey || ""),
    cardData: {
      remoteVersion: String(cardData.source?.remoteVersion ||
        cardData.remoteVersion || ""),
      rawContentHash: stableGraphHash(cardData),
      cardCount: Object.keys(cardIndexes.cards).length,
    },
    hostSourceHashes: stableGraphValue(rawOptions.hostSourceHashes ||
      warmachineHost.receipt.sourceHashes),
    atoms: atomIndex,
    hooks: hookIndex,
    cards: cardIndexes.cards,
    ruleSources: cardIndexes.ruleSources,
    behaviorTokens: cardIndexes.behaviorTokens,
    scenarios,
    counts: {
      atomCount: Object.keys(atomIndex).length,
      hookCount: Object.keys(hookIndex).length,
      cardCount: Object.keys(cardIndexes.cards).length,
      ruleSourceCount: Object.keys(cardIndexes.ruleSources).length,
      mappedRuleSourceCount: Object.values(cardIndexes.ruleSources)
        .filter((row) => row.mappedAtomKeys.length > 0).length,
      unmappedRuleSourceCount: Object.values(cardIndexes.ruleSources)
        .filter((row) => row.mappedAtomKeys.length === 0).length,
      distinctRuleFingerprintCount: allRuleFingerprints.size,
      explicitlyAtomMappedFingerprintCount: atomMappedRuleFingerprints.size,
      behaviorTokenCount: Object.keys(cardIndexes.behaviorTokens).length,
      scenarioCount: Object.keys(scenarios).length,
    },
  };
  return { ...core, semanticIndexHash: stableGraphHash(core) };
}

export function loadReviewedWarmachineRulesetSemanticIndexV1() {
  return JSON.parse(readFileSync(REVIEWED_RULESET_SEMANTIC_INDEX_V1_URL, "utf8"));
}

function diffKeys(previousMap = {}, currentMap = {}, changed) {
  const previousKeys = new Set(Object.keys(previousMap));
  const currentKeys = new Set(Object.keys(currentMap));
  return {
    added: [...currentKeys].filter((key) => !previousKeys.has(key)).sort(),
    removed: [...previousKeys].filter((key) => !currentKeys.has(key)).sort(),
    changed: [...currentKeys].filter((key) => previousKeys.has(key) &&
      changed(previousMap[key], currentMap[key])).sort(),
  };
}

function changedMapKeys(previous = {}, current = {}) {
  return sortedUnique([...Object.keys(previous), ...Object.keys(current)]
    .filter((key) => previous[key] !== current[key]));
}

function addAtomKeys(target, source) {
  for (const atomKey of source || []) target.add(atomKey);
}

function cardMappedAtomKeys(card, sources) {
  return sortedUnique((card?.ruleSourceIds || []).flatMap((sourceId) =>
    sources?.[sourceId]?.mappedAtomKeys || []));
}

function sourceOwnerCardIds(index, sourceId) {
  return Object.entries(index.cards || {})
    .filter(([, card]) => (card.ruleSourceIds || []).includes(sourceId))
    .map(([cardId]) => cardId)
    .sort();
}

function buildReviewNeighbors(atomKeys, previous, current) {
  const concepts = new Set();
  for (const atomKey of atomKeys) {
    addAtomKeys(concepts, previous.atoms?.[atomKey]?.reviewConceptIds);
    addAtomKeys(concepts, current.atoms?.[atomKey]?.reviewConceptIds);
  }
  const neighbors = new Set();
  for (const index of [previous, current]) {
    for (const [atomKey, row] of Object.entries(index.atoms || {})) {
      if ((row.reviewConceptIds || []).some((concept) => concepts.has(concept))) {
        neighbors.add(atomKey);
      }
    }
  }
  return sortedUnique(neighbors);
}

export function compareWarmachineRulesetSemanticIndexesV1(previous, current) {
  if (previous?.schemaVersion !== WARMACHINE_RULESET_SEMANTIC_INDEX_V1_SCHEMA ||
    current?.schemaVersion !== WARMACHINE_RULESET_SEMANTIC_INDEX_V1_SCHEMA) {
    throw new Error("ruleset_semantic_index_schema_mismatch");
  }
  const atoms = diffKeys(previous.atoms, current.atoms,
    (left, right) => left.semanticHash !== right.semanticHash);
  const hooks = diffKeys(previous.hooks, current.hooks,
    (left, right) => left.semanticHash !== right.semanticHash);
  const cards = diffKeys(previous.cards, current.cards,
    (left, right) => left.rulesHash !== right.rulesHash ||
      left.constructionHash !== right.constructionHash ||
      left.metadataHash !== right.metadataHash);
  cards.rulesChanged = cards.changed.filter((cardId) =>
    previous.cards[cardId].rulesHash !== current.cards[cardId].rulesHash);
  cards.constructionChanged = cards.changed.filter((cardId) =>
    previous.cards[cardId].constructionHash !== current.cards[cardId].constructionHash);
  cards.metadataChanged = cards.changed.filter((cardId) =>
    previous.cards[cardId].metadataHash !== current.cards[cardId].metadataHash);
  const ruleSources = diffKeys(previous.ruleSources, current.ruleSources,
    (left, right) => stableGraphHash(left) !== stableGraphHash(right));
  const behaviorTokens = diffKeys(previous.behaviorTokens, current.behaviorTokens,
    (left, right) => stableGraphHash(left) !== stableGraphHash(right));
  const scenarios = diffKeys(previous.scenarios, current.scenarios,
    (left, right) => left.semanticHash !== right.semanticHash);
  const hostSourcesChanged = changedMapKeys(
    previous.hostSourceHashes,
    current.hostSourceHashes,
  );

  const previousSourcesByFingerprint = new Map();
  for (const row of Object.values(previous.ruleSources || {})) {
    for (const fingerprintHash of row.fingerprintHashes || []) {
      if (!previousSourcesByFingerprint.has(fingerprintHash)) {
        previousSourcesByFingerprint.set(fingerprintHash, []);
      }
      previousSourcesByFingerprint.get(fingerprintHash).push(row);
    }
  }
  const addedSourceRows = ruleSources.added.map((sourceId) => {
    const row = current.ruleSources[sourceId];
    const candidates = sortedUnique((row.fingerprintHashes || []).flatMap(
      (fingerprintHash) => previousSourcesByFingerprint.get(fingerprintHash) || [],
    ).flatMap((candidate) => candidate.mappedAtomKeys || []));
    return {
      sourceId,
      cardIds: sourceOwnerCardIds(current, sourceId),
      sourceKinds: row.sourceKinds,
      mappedAtomKeys: row.mappedAtomKeys,
      exactSemanticReuseCandidateAtomKeys: candidates,
      disposition: row.mappedAtomKeys.length > 0
        ? "mapped_current_atom"
        : candidates.length > 0
          ? "review_exact_semantic_reuse"
          : "execution_classification_required_fail_closed",
    };
  });
  const modifiedSourceRows = ruleSources.changed.map((sourceId) => ({
    sourceId,
    previousMappedAtomKeys: previous.ruleSources[sourceId]?.mappedAtomKeys || [],
    currentMappedAtomKeys: current.ruleSources[sourceId]?.mappedAtomKeys || [],
    semanticChanged: stableGraphHash({
      semanticHashes: previous.ruleSources[sourceId]?.semanticHashes,
      fingerprintHashes: previous.ruleSources[sourceId]?.fingerprintHashes,
    }) !== stableGraphHash({
      semanticHashes: current.ruleSources[sourceId]?.semanticHashes,
      fingerprintHashes: current.ruleSources[sourceId]?.fingerprintHashes,
    }),
  }));

  const impactedAtomSet = new Set([...atoms.added, ...atoms.removed, ...atoms.changed]);
  for (const row of addedSourceRows) addAtomKeys(impactedAtomSet, row.mappedAtomKeys);
  for (const row of modifiedSourceRows) {
    addAtomKeys(impactedAtomSet, row.previousMappedAtomKeys);
    addAtomKeys(impactedAtomSet, row.currentMappedAtomKeys);
  }
  for (const sourceId of ruleSources.removed) {
    addAtomKeys(impactedAtomSet, previous.ruleSources[sourceId]?.mappedAtomKeys);
  }
  const directlyChangedCards = sortedUnique([
    ...cards.added,
    ...cards.removed,
    ...cards.rulesChanged,
  ]);
  for (const cardId of directlyChangedCards) {
    addAtomKeys(impactedAtomSet, cardMappedAtomKeys(
      previous.cards[cardId], previous.ruleSources,
    ));
    addAtomKeys(impactedAtomSet, cardMappedAtomKeys(
      current.cards[cardId], current.ruleSources,
    ));
  }
  const impactedAtomKeys = sortedUnique(impactedAtomSet);
  const reviewNeighborAtomKeys = buildReviewNeighbors(
    impactedAtomKeys,
    previous,
    current,
  );
  const impactedCardIds = sortedUnique([
    ...directlyChangedCards,
    ...Object.entries(previous.cards || {}).filter(([, card]) =>
      cardMappedAtomKeys(card, previous.ruleSources)
        .some((atomKey) => impactedAtomSet.has(atomKey))).map(([cardId]) => cardId),
    ...Object.entries(current.cards || {}).filter(([, card]) =>
      cardMappedAtomKeys(card, current.ruleSources)
        .some((atomKey) => impactedAtomSet.has(atomKey))).map(([cardId]) => cardId),
  ]);

  const newSemanticGapSourceIds = addedSourceRows
    .filter((row) => row.disposition === "execution_classification_required_fail_closed")
    .map((row) => row.sourceId);
  const semanticReuseReviewSourceIds = addedSourceRows
    .filter((row) => row.disposition === "review_exact_semantic_reuse")
    .map((row) => row.sourceId);
  const coreExecutorChanged = hostSourcesChanged.length > 0;
  const scenarioSemanticsChanged = scenarios.added.length + scenarios.removed.length +
    scenarios.changed.length > 0;
  const atomOrHookChanged = atoms.added.length + atoms.removed.length +
    atoms.changed.length + hooks.added.length + hooks.removed.length +
    hooks.changed.length > 0;
  const cardRulesChanged = cards.added.length + cards.removed.length +
    cards.rulesChanged.length > 0 || ruleSources.added.length +
    ruleSources.removed.length + ruleSources.changed.length > 0 ||
    behaviorTokens.added.length + behaviorTokens.removed.length > 0;
  const constructionChanged = cards.added.length + cards.removed.length +
    cards.constructionChanged.length > 0;
  const rawDataChanged = previous.cardData.rawContentHash !==
    current.cardData.rawContentHash;
  const semanticDrift = coreExecutorChanged || scenarioSemanticsChanged ||
    atomOrHookChanged || cardRulesChanged || constructionChanged;

  const changeClasses = [
    ...(coreExecutorChanged ? ["core_executor_changed"] : []),
    ...(scenarioSemanticsChanged ? ["scenario_semantics_changed"] : []),
    ...(atomOrHookChanged ? ["atom_hook_or_interaction_changed"] : []),
    ...(newSemanticGapSourceIds.length ? ["new_unmapped_rule_semantics"] : []),
    ...(semanticReuseReviewSourceIds.length ? ["existing_atom_reuse_review"] : []),
    ...(cardRulesChanged ? ["card_rule_semantics_changed"] : []),
    ...(constructionChanged ? ["construction_semantics_changed"] : []),
    ...(!semanticDrift && rawDataChanged ? ["raw_data_only_changed"] : []),
    ...(!semanticDrift && !rawDataChanged ? ["no_change"] : []),
  ];
  const requiredActions = sortedUnique([
    ...(rawDataChanged ? ["verify_card_data_mirror_and_import_receipt"] : []),
    ...(cards.added.length || cards.rulesChanged.length
      ? ["add_impacted_card_positive_negative_strict_scenes"] : []),
    ...(semanticReuseReviewSourceIds.length
      ? ["review_and_bind_exact_semantic_reuse_candidates"] : []),
    ...(newSemanticGapSourceIds.length
      ? ["classify_then_bind_generic_execution_or_implement_new_atom_hooks"] : []),
    ...(atomOrHookChanged
      ? ["regenerate_typed_interaction_graph", "rerun_atom_hook_and_reverse_contract_gates"]
      : []),
    ...(scenarioSemanticsChanged
      ? ["rerun_all_steamroller_terminal_and_scoring_gates"] : []),
    ...(coreExecutorChanged
      ? ["rerun_full_strict_rules_and_fixed_benchmarks"] : []),
    ...(constructionChanged
      ? ["regenerate_construction_pool_and_legal_openings"] : []),
    ...(semanticDrift
      ? [
          "invalidate_old_search_checkpoint_resume",
          "recalibrate_rules_skills_ctx2skill_skill2ctx",
          "review_then_promote_new_ruleset_baseline",
        ]
      : []),
  ]);
  const core = {
    schemaVersion: WARMACHINE_RULESET_CHANGE_IMPACT_V1_SCHEMA,
    previousSemanticIndexHash: previous.semanticIndexHash,
    currentSemanticIndexHash: current.semanticIndexHash,
    compatible: !semanticDrift && !rawDataChanged,
    semanticDrift,
    rawDataChanged,
    changeClasses,
    hostSourcesChanged,
    atoms,
    hooks,
    cards,
    ruleSources: {
      ...ruleSources,
      addedRows: addedSourceRows,
      modifiedRows: modifiedSourceRows,
      newSemanticGapSourceIds,
      semanticReuseReviewSourceIds,
    },
    behaviorTokens,
    scenarios,
    blastRadius: {
      coreExecutorChanged,
      scenarioSemanticsChanged,
      impactedAtomKeys,
      reviewNeighborAtomKeys,
      impactedCardIds,
      allStrictWitnessesRequireRevalidation: coreExecutorChanged ||
        scenarioSemanticsChanged || atomOrHookChanged,
      coverageClaimsRequireRevalidation: semanticDrift,
      constructionPoolsRequireRevalidation: constructionChanged ||
        cardRulesChanged || coreExecutorChanged,
      rulesSkillsRequireRecalibration: coreExecutorChanged ||
        scenarioSemanticsChanged || atomOrHookChanged || cardRulesChanged,
    },
    gates: {
      checkpointResumeAllowed: !semanticDrift,
      priorDirectionCalibrationUsable: !semanticDrift,
      priorTrainingMaterialCurrent: !semanticDrift,
      currentCoverageClaimAllowed: !semanticDrift,
      unknownNewSemanticsFailClosed: newSemanticGapSourceIds.length === 0,
      reviewedBaselinePromotionAllowed: !semanticDrift && !rawDataChanged,
    },
    requiredActions,
    claimBoundary: "Exact source fingerprints may propose reuse of an existing atom, but never authorize it. A source without an explicit atom mapping is not automatically unexecutable because core or generic strict execution may own it; new or changed semantics still remain fail-closed until execution classification, source binding where applicable, strict positive and negative scenes, graph regeneration, replay gates and skill recalibration all pass under a newly reviewed baseline.",
  };
  return { ...core, impactHash: stableGraphHash(core) };
}
