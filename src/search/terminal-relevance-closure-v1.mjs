import { createHash } from "node:crypto";
import fs from "node:fs";
import { recognizedWarmachineRuleAtoms, resolveWarmachineHostPath } from "../warmachine-host-runtime.mjs";

export const WARMACHINE_TERMINAL_RELEVANCE_CLOSURE_SCHEMA = "warmachine_terminal_relevance_closure_v1";

const CORE_GRAPH_PATH = resolveWarmachineHostPath("data/warmachine-rule-interaction-graph-v20260701.json");
let registryCache = null;

function stableHash(value, length = 24) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, length);
}

function arrayValues(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function uniqueKeys(values = []) {
  return Array.from(new Set(values.map(normalizeKey).filter(Boolean))).sort();
}

function registrySnapshot() {
  if (registryCache) return registryCache;
  const atoms = recognizedWarmachineRuleAtoms();
  const coreGraph = JSON.parse(fs.readFileSync(CORE_GRAPH_PATH, "utf8"));
  registryCache = { atoms, coreGraph };
  return registryCache;
}

function terminalSeedKeys(template = {}, resourceBranch = null) {
  const seeds = [
    "strict_forward_witness",
    "opponent_interference",
    "reaction",
    "activation_timing",
    "rule_grants",
  ];
  if (template.goalType === "scenario_score") {
    seeds.push(
      "scenario_score",
      "turn_end",
      "control",
      "contesting",
      "normal_movement",
      "placement",
      "model_destroyed",
      "removed_from_play",
    );
  } else {
    const mode = normalizeKey(template.attackMode || template.attackProfile?.mode || "melee");
    seeds.push(
      mode.includes("spell") ? "offensive_spell" : mode.includes("range") ? "ranged_attack" : "melee_attack",
      "target_declaration",
      "targeting",
      "line_of_sight",
      "attack_roll",
      "attack_resolution",
      "damage_roll_resolution",
      "damage_application",
      "model_disabled",
      "model_boxed",
      "model_destroyed",
      "removed_from_play",
      "tough",
    );
    if (template.boostedAttack === true) seeds.push("boost_attack_roll", "boost_legality");
    if (template.boostedDamage === true) seeds.push("boost_damage_roll", "boost_legality");
    if (Number(template.additionalAttackCount) > 0) seeds.push("purchased_additional_melee_attack", "combat_purchase_window");
  }
  if (resourceBranch) {
    seeds.push(
      resourceBranch.resourceDemand?.resourceKind,
      resourceBranch.resourceDemand?.paymentModel,
      resourceBranch.resourceSource?.sourceKind,
      "resource_payment",
    );
    if (resourceBranch.approachKind === "charge_then_attack") seeds.push("charge", "charge_targeting");
    if (resourceBranch.approachKind === "advance_then_attack") seeds.push("advance_then_attack", "normal_movement");
  }
  for (const rule of template.initialEffectiveRuleClosure?.rules || []) {
    seeds.push(rule.key, rule.ruleKey, rule.ruleName, rule.name, rule.atomKey, rule.ruleAtomKey);
  }
  return uniqueKeys(seeds);
}

function sourceKeysFromPiece(piece = {}) {
  const values = [];
  const visit = (value, depth = 0) => {
    if (!value || depth > 5) return;
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry, depth + 1);
      return;
    }
    if (typeof value !== "object") return;
    for (const [key, entry] of Object.entries(value)) {
      if (["atomKey", "ruleAtomKey", "ruleKey", "ruleName", "name", "effectType", "statusKey"].includes(key)) {
        if (typeof entry === "string") values.push(entry);
      } else if (["atomKeys", "ruleAtomKeys", "ruleKeys"].includes(key)) {
        values.push(...arrayValues(entry));
      }
      if (depth < 5 && entry && typeof entry === "object") visit(entry, depth + 1);
    }
  };
  visit({
    specialRules: piece.specialRules,
    statusEffects: piece.statusEffects,
    activeSupportEffects: piece.activeSupportEffects,
    activeUpkeeps: piece.activeUpkeeps,
    ruleAtomState: piece.ruleAtomState,
    attackProfiles: piece.attackProfiles,
    cardSnapshot: piece.cardSnapshot,
  });
  return uniqueKeys(values);
}

function rosterRuleSourceInventory(state = {}) {
  const entries = new Map();
  const explicitAtomKeys = new Set();
  const addEntry = (entry, sourceKind, pieceKey) => {
    if (!entry || typeof entry !== "object") return;
    const sourceId = String(entry.id || entry.ruleId || entry.sourceRuleId || "");
    const name = String(entry.name || entry.ruleName || entry.spellName || "");
    if (!sourceId && !name) return;
    const key = sourceId || `${sourceKind}:${normalizeKey(name)}`;
    if (!entries.has(key)) entries.set(key, {
      sourceId,
      name,
      sourceKind,
      pieceKeys: new Set(),
    });
    entries.get(key).pieceKeys.add(pieceKey);
  };
  const visitRuntimeAtoms = (value, depth = 0) => {
    if (!value || depth > 6) return;
    if (Array.isArray(value)) {
      for (const entry of value) visitRuntimeAtoms(entry, depth + 1);
      return;
    }
    if (typeof value !== "object") return;
    for (const [key, entry] of Object.entries(value)) {
      if (["atomKey", "ruleAtomKey"].includes(key) && typeof entry === "string") explicitAtomKeys.add(entry);
      if (["atomKeys", "ruleAtomKeys"].includes(key)) {
        for (const atomKey of arrayValues(entry)) explicitAtomKeys.add(String(atomKey));
      }
      if (entry && typeof entry === "object") visitRuntimeAtoms(entry, depth + 1);
    }
  };
  for (const piece of state.pieces || []) {
    const card = piece.cardSnapshot || {};
    for (const ability of arrayValues(card.cardAbilities)) addEntry(ability, "card_ability", piece.pieceKey);
    for (const model of arrayValues(card.models)) {
      for (const ability of arrayValues(model.abilities)) addEntry(ability, "model_ability", piece.pieceKey);
      for (const weapon of arrayValues(model.weapons)) {
        for (const ability of arrayValues(weapon.abilities)) addEntry(ability, "weapon_ability", piece.pieceKey);
      }
    }
    for (const spell of arrayValues(card.spells)) addEntry(spell, "spell", piece.pieceKey);
    for (const rule of arrayValues(piece.specialRules)) addEntry(rule, rule.ruleSourceKind || "runtime_special_rule", piece.pieceKey);
    visitRuntimeAtoms({
      specialRules: piece.specialRules,
      statusEffects: piece.statusEffects,
      activeSupportEffects: piece.activeSupportEffects,
      activeUpkeeps: piece.activeUpkeeps,
      ruleAtomState: piece.ruleAtomState,
      attackProfiles: piece.attackProfiles,
    });
  }
  return {
    entries: Array.from(entries.values()).map((entry) => ({ ...entry, pieceKeys: Array.from(entry.pieceKeys).sort() })),
    sourceIds: new Set(Array.from(entries.values()).map((entry) => entry.sourceId).filter(Boolean)),
    names: new Set(Array.from(entries.values()).map((entry) => normalizeKey(entry.name)).filter(Boolean)),
    explicitAtomKeys,
  };
}

function rosterAtomCandidates(state = {}, atoms = []) {
  const inventory = rosterRuleSourceInventory(state);
  const candidates = atoms.filter((atom) =>
    inventory.explicitAtomKeys.has(atom.atomKey) ||
    arrayValues(atom.sourceContract?.acceptedSourceIds).some((sourceId) => inventory.sourceIds.has(String(sourceId))));
  const mappedSourceIds = new Set(candidates.flatMap((atom) => arrayValues(atom.sourceContract?.acceptedSourceIds))
    .map(String).filter((sourceId) => inventory.sourceIds.has(sourceId)));
  const fallbackToGlobalRegistry = inventory.entries.length === 0;
  return {
    inventory,
    candidates: fallbackToGlobalRegistry ? atoms : candidates,
    mappedSourceIds,
    fallbackToGlobalRegistry,
  };
}

function atomKeys(atom = {}) {
  return uniqueKeys([
    atom.atomKey,
    atom.ruleName,
    ...arrayValues(atom.ruleKeys),
    ...arrayValues(atom.hooks).flatMap((hook) => [hook.hookKey, hook.hostIntegrationKey, hook.primitiveKey, hook.effectType]),
  ]);
}

function atomExpansionKeys(atom = {}) {
  return uniqueKeys([
    ...atomKeys(atom),
    ...arrayValues(atom.interactions).flatMap((interaction) => arrayValues(interaction.relatedRuleKeys)),
  ]);
}

function coreNodeKeys(node = {}) {
  return uniqueKeys([node.ruleKey, node.ruleName, ...arrayValues(node.executionSurfaces)]);
}

function coreNodeExpansionKeys(node = {}) {
  return uniqueKeys([
    ...coreNodeKeys(node),
    ...arrayValues(node.interactions).flatMap((interaction) => arrayValues(interaction.relatedRuleKeys)),
  ]);
}

function bestIntersection(left = [], depthByRuleKey = new Map()) {
  return left.filter((key) => depthByRuleKey.has(key)).sort((leftKey, rightKey) =>
    depthByRuleKey.get(leftKey) - depthByRuleKey.get(rightKey) || leftKey.localeCompare(rightKey))[0] || "";
}

export function buildWarmachineTerminalRelevanceClosure(inputState = {}, template = {}, resourceBranch = null) {
  const { atoms, coreGraph } = registrySnapshot();
  const rosterScope = rosterAtomCandidates(inputState, atoms);
  const candidateAtoms = rosterScope.candidates;
  const seeds = terminalSeedKeys(template, resourceBranch);
  const actorKeys = sourceKeysFromPiece((inputState.pieces || []).find((piece) =>
    piece.pieceKey === template.attackerPieceKey) || {});
  const targetKeys = sourceKeysFromPiece((inputState.pieces || []).find((piece) =>
    piece.pieceKey === template.targetPieceKey) || {});
  const controllerKeys = uniqueKeys((resourceBranch?.resourceSource?.controllerPieceKeys || []).flatMap((pieceKey) =>
    sourceKeysFromPiece((inputState.pieces || []).find((piece) => piece.pieceKey === pieceKey) || {})));
  const initialKeys = uniqueKeys([...seeds, ...actorKeys, ...targetKeys, ...controllerKeys]);
  const reachedKeys = new Set(initialKeys);
  const depthByRuleKey = new Map(initialKeys.map((key) => [key, 0]));
  const selectedAtomKeys = new Set();
  const selectedCoreRuleKeys = new Set();
  const depthByAtomKey = new Map();
  const depthByCoreRuleKey = new Map();
  const proofEdges = [];
  const addKeys = (keys, sourceType, sourceKey, depth) => {
    let changed = false;
    for (const key of keys) {
      const priorDepth = depthByRuleKey.get(key);
      if (priorDepth === undefined || depth < priorDepth) {
        reachedKeys.add(key);
        depthByRuleKey.set(key, depth);
        proofEdges.push({ sourceType, sourceKey, introducedRuleKey: key, depth });
        changed = true;
      }
    }
    return changed;
  };
  let changed = true;
  let iterations = 0;
  while (changed && iterations < candidateAtoms.length + (coreGraph.nodes || []).length + 1) {
    changed = false;
    iterations += 1;
    for (const atom of candidateAtoms) {
      const matchedKey = bestIntersection(atomKeys(atom), depthByRuleKey);
      if (!matchedKey) continue;
      const atomDepth = depthByRuleKey.get(matchedKey) + 1;
      if ((depthByAtomKey.get(atom.atomKey) ?? Number.POSITIVE_INFINITY) <= atomDepth) continue;
      selectedAtomKeys.add(atom.atomKey);
      depthByAtomKey.set(atom.atomKey, atomDepth);
      proofEdges.push({ sourceType: "rule_key", sourceKey: matchedKey, introducedAtomKey: atom.atomKey, depth: atomDepth });
      if (addKeys(atomExpansionKeys(atom), "rule_atom", atom.atomKey, atomDepth + 1)) changed = true;
      changed = true;
    }
    for (const node of coreGraph.nodes || []) {
      const matchedKey = bestIntersection(coreNodeKeys(node), depthByRuleKey);
      if (!matchedKey) continue;
      const coreDepth = depthByRuleKey.get(matchedKey) + 1;
      if ((depthByCoreRuleKey.get(node.ruleKey) ?? Number.POSITIVE_INFINITY) <= coreDepth) continue;
      selectedCoreRuleKeys.add(node.ruleKey);
      depthByCoreRuleKey.set(node.ruleKey, coreDepth);
      proofEdges.push({ sourceType: "rule_key", sourceKey: matchedKey, introducedCoreRuleKey: node.ruleKey, depth: coreDepth });
      if (addKeys(coreNodeExpansionKeys(node), "core_rule", node.ruleKey, coreDepth + 1)) changed = true;
      changed = true;
    }
  }
  const relevantAtoms = candidateAtoms.filter((atom) => selectedAtomKeys.has(atom.atomKey));
  const relevantCoreNodes = (coreGraph.nodes || []).filter((node) => selectedCoreRuleKeys.has(node.ruleKey));
  const atomInteractionCount = atoms.reduce((sum, atom) => sum + arrayValues(atom.interactions).length, 0);
  const unstructuredAtomInteractions = atoms.flatMap((atom) => arrayValues(atom.interactions)
    .filter((interaction) => !arrayValues(interaction.relatedRuleKeys).length)
    .map((interaction) => ({
      atomKey: atom.atomKey,
      interactionKey: interaction.interactionKey || "",
      relation: interaction.relation || "",
    })));
  const coreEvidenceGaps = (coreGraph.nodes || []).flatMap((node) => arrayValues(node.interactions)
    .filter((interaction) => !arrayValues(interaction.sourceEvidence).length ||
      !arrayValues(interaction.codeEvidence).length || !arrayValues(interaction.testEvidence).length)
    .map((interaction) => ({ ruleKey: node.ruleKey, interactionKey: interaction.interactionKey || "" })));
  const unmappedRosterRuleSources = rosterScope.inventory.entries.filter((entry) =>
    entry.sourceId && !rosterScope.mappedSourceIds.has(entry.sourceId));
  const relevantMappedSourceIds = new Set(relevantAtoms.flatMap((atom) => arrayValues(atom.sourceContract?.acceptedSourceIds))
    .map(String).filter((sourceId) => rosterScope.inventory.sourceIds.has(sourceId)));
  const relevantMappedPieceKeys = Array.from(new Set(rosterScope.inventory.entries
    .filter((entry) => relevantMappedSourceIds.has(entry.sourceId))
    .flatMap((entry) => entry.pieceKeys).map(String).filter(Boolean))).sort();
  const unmappedWildcardPieceKeys = Array.from(new Set(unmappedRosterRuleSources
    .flatMap((entry) => entry.pieceKeys).map(String).filter(Boolean))).sort();
  const relevantAtomBySourceId = new Map();
  for (const atom of relevantAtoms) {
    for (const sourceId of arrayValues(atom.sourceContract?.acceptedSourceIds).map(String)) {
      if (!rosterScope.inventory.sourceIds.has(sourceId)) continue;
      if (!relevantAtomBySourceId.has(sourceId)) relevantAtomBySourceId.set(sourceId, []);
      relevantAtomBySourceId.get(sourceId).push(atom.atomKey);
    }
  }
  const actorPriorityByPieceKey = new Map();
  for (const entry of rosterScope.inventory.entries) {
    const atomKeysForSource = relevantAtomBySourceId.get(entry.sourceId) || [];
    if (!atomKeysForSource.length) continue;
    const minimumDepth = Math.min(...atomKeysForSource.map((atomKey) => depthByAtomKey.get(atomKey) ?? Number.MAX_SAFE_INTEGER));
    for (const pieceKey of entry.pieceKeys) {
      const prior = actorPriorityByPieceKey.get(pieceKey) || {
        pieceKey,
        minimumClosureDepth: Number.MAX_SAFE_INTEGER,
        relevantAtomKeys: new Set(),
      };
      prior.minimumClosureDepth = Math.min(prior.minimumClosureDepth, minimumDepth);
      for (const atomKey of atomKeysForSource) prior.relevantAtomKeys.add(atomKey);
      actorPriorityByPieceKey.set(pieceKey, prior);
    }
  }
  const actorPriorityRows = Array.from(actorPriorityByPieceKey.values()).map((row) => ({
    pieceKey: row.pieceKey,
    minimumClosureDepth: row.minimumClosureDepth,
    relevantAtomKeys: Array.from(row.relevantAtomKeys).sort(),
  })).sort((left, right) =>
    left.minimumClosureDepth - right.minimumClosureDepth || left.pieceKey.localeCompare(right.pieceKey));
  const reasonsHardPruningDisabled = [
    ...(unstructuredAtomInteractions.length ? ["unstructured_rule_atom_interactions"] : []),
    ...(coreEvidenceGaps.length ? ["core_interaction_source_code_test_gap"] : []),
    "state_rule_source_to_atom_mapping_not_proven_complete",
    "opponent_action_dependency_closure_not_proven_complete",
    "relevance_closure_has_not_passed_terminal_reachability_preservation_gate",
  ];
  return {
    schemaVersion: WARMACHINE_TERMINAL_RELEVANCE_CLOSURE_SCHEMA,
    closureKey: `terminal-relevance-${stableHash({ templateKey: template.templateKey, terminalBranchKey: resourceBranch?.terminalBranchKey, initialKeys, reachedKeys: Array.from(reachedKeys).sort() })}`,
    templateKey: template.templateKey || "",
    terminalBranchKey: resourceBranch?.terminalBranchKey || "",
    goalType: template.goalType || "",
    seeds,
    stateSourceKeys: { actorKeys, targetKeys, controllerKeys },
    rosterRuleScope: {
      scopeMode: rosterScope.fallbackToGlobalRegistry ? "global_registry_fallback_no_roster_sources" : "exact_roster_source_id_candidates",
      sourceEntryCount: rosterScope.inventory.entries.length,
      sourceIdCount: rosterScope.inventory.sourceIds.size,
      explicitAtomKeyCount: rosterScope.inventory.explicitAtomKeys.size,
      candidateAtomCount: candidateAtoms.length,
      mappedSourceIdCount: rosterScope.mappedSourceIds.size,
      unmappedSourceEntryCount: unmappedRosterRuleSources.length,
      unmappedRosterRuleSources,
      relevantMappedSourceIdCount: relevantMappedSourceIds.size,
      relevantMappedPieceKeys,
      unmappedWildcardPieceKeys,
      claimBoundary: "Unmapped roster sources remain wildcard relevant. Source-ID scoping may order work but cannot prove an action irrelevant.",
    },
    reachedRuleKeys: Array.from(reachedKeys).sort(),
    ruleKeyDepths: Object.fromEntries(Array.from(depthByRuleKey).sort((left, right) =>
      left[1] - right[1] || left[0].localeCompare(right[0]))),
    selectedAtomKeys: Array.from(selectedAtomKeys).sort(),
    atomDepths: Object.fromEntries(Array.from(depthByAtomKey).sort((left, right) =>
      left[1] - right[1] || left[0].localeCompare(right[0]))),
    selectedCoreRuleKeys: Array.from(selectedCoreRuleKeys).sort(),
    coreRuleDepths: Object.fromEntries(Array.from(depthByCoreRuleKey).sort((left, right) =>
      left[1] - right[1] || left[0].localeCompare(right[0]))),
    proofEdges,
    iterations,
    coverage: {
      atomRegistryCount: atoms.length,
      rosterCandidateAtomCount: candidateAtoms.length,
      selectedAtomCount: relevantAtoms.length,
      atomInteractionCount,
      structuredAtomInteractionCount: atomInteractionCount - unstructuredAtomInteractions.length,
      unstructuredAtomInteractions,
      coreRuleNodeCount: (coreGraph.nodes || []).length,
      selectedCoreRuleCount: relevantCoreNodes.length,
      coreInteractionCount: (coreGraph.nodes || []).reduce((sum, node) => sum + arrayValues(node.interactions).length, 0),
      coreEvidenceGaps,
    },
    orderingOnly: true,
    actorPriorityRows,
    actorPriorityPieceKeys: actorPriorityRows.map((row) => row.pieceKey),
    wildcardActorPieceKeys: unmappedWildcardPieceKeys,
    hardPruningEnabled: false,
    reasonsHardPruningDisabled,
    claimBoundary: "This transitive key closure orders actor/action expansion and audits omissions. It cannot delete actions until source mapping, opponent dependencies, and reachability preservation are proven complete.",
  };
}
