#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SEARCH_ROOT = path.resolve(SCRIPT_DIR, "..");
const ENGINE_ROOT = path.resolve(
  process.env.WARMACHINE_ENGINE_ROOT || path.join(SEARCH_ROOT, "..", "warmachine-strict-engine"),
);
const OUTPUT_PATH = path.join(SEARCH_ROOT, "build/audits/warmachine-end-to-end-rule-chain-v1/report.json");
const DATA_PATH = path.join(ENGINE_ROOT, "prototype/data/warmachine-lite-data.json");
const INVENTORY_PATH = path.join(ENGINE_ROOT, "data/function3-rules/warmachine-official-rule-inventory-v1.json");
const INTERACTION_GRAPH_PATH = path.join(ENGINE_ROOT, "data/warmachine-rule-interaction-graph-v20260701.json");

function compareText(left, right) {
  return String(left).localeCompare(String(right));
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values = []) {
  return [...new Set(values.map(String).filter(Boolean))].sort(compareText);
}

function countBy(rows = [], keyForRow) {
  const counts = {};
  for (const row of rows) {
    const key = String(keyForRow(row) || "");
    if (key) counts[key] = (counts[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => compareText(left, right)));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function importEngineModule(relativePath) {
  const absolutePath = path.join(ENGINE_ROOT, relativePath);
  const url = pathToFileURL(absolutePath);
  url.searchParams.set("audit", sha256(await readFile(absolutePath)).slice(0, 16));
  return import(url.href);
}

function sourceOwnershipSummary(sourceRows, ownershipRows) {
  const declaredBySourceRef = new Map();
  for (const row of ownershipRows.filter((entry) => entry.disposition === "declared_ownership")) {
    if (!declaredBySourceRef.has(row.sourceRef)) declaredBySourceRef.set(row.sourceRef, []);
    declaredBySourceRef.get(row.sourceRef).push(row);
  }
  const rows = sourceRows.map((source) => {
    const ownership = declaredBySourceRef.get(source.sourceRef) || [];
    const legacy = ownership.some((entry) => entry.legacyMode === true);
    return {
      sourceRef: source.sourceRef,
      sourceKind: source.sourceKind,
      sourceId: source.sourceId,
      sourceNames: source.sourceNames,
      atomKeys: unique(ownership.map((entry) => entry.atomKey)),
      ownershipStatus: ownership.length ? (legacy ? "owned_legacy_contract" : "owned_nonlegacy_contract") : "unowned",
    };
  });
  const actualContractDrift = ownershipRows.filter((row) =>
    row.disposition === "source_contract_mismatch" && row.idMatched === true && row.textMatched !== true);
  const byKind = Object.entries(countBy(rows, (row) => row.sourceKind)).map(([sourceKind, total]) => {
    const kindRows = rows.filter((row) => row.sourceKind === sourceKind);
    const owned = kindRows.filter((row) => row.atomKeys.length).length;
    return { sourceKind, total, owned, unowned: total - owned, ownedPercent: Number((owned * 100 / total).toFixed(3)) };
  });
  return {
    sourceCount: rows.length,
    ownedSourceCount: rows.filter((row) => row.atomKeys.length).length,
    unownedSourceCount: rows.filter((row) => !row.atomKeys.length).length,
    legacyOwnedSourceCount: rows.filter((row) => row.ownershipStatus === "owned_legacy_contract").length,
    actualSourceIdTextDriftCount: actualContractDrift.length,
    actualSourceIdTextDriftRows: actualContractDrift.map((row) => ({
      sourceRef: row.sourceRef,
      sourceId: row.sourceId,
      sourceKind: row.sourceKind,
      atomKey: row.atomKey,
    })),
    byKind,
    rows,
  };
}

function consumerContracts(module) {
  const byIdentity = new Map();
  for (const [exportName, value] of Object.entries(module)) {
    if (!exportName.includes("CONSUMERS") || !Array.isArray(value)) continue;
    for (const row of value) {
      if (!row?.atomKey || !row?.hookKey) continue;
      const identity = `${row.atomKey}|${row.hookKey}|${row.hookMarker || ""}`;
      const prior = byIdentity.get(identity);
      if (!prior || (row.proofRolesComplete === true && prior.proofRolesComplete !== true)) {
        byIdentity.set(identity, row);
      }
    }
  }
  return byIdentity;
}

function atomProofSummary(atoms, consumerModule) {
  const contracts = consumerContracts(consumerModule);
  const hookRows = atoms.flatMap((atom) => array(atom.hooks).map((hook) => {
    const exactIdentity = `${atom.atomKey}|${hook.hookKey}|${hook.marker || ""}`;
    const fallbackIdentity = `${atom.atomKey}|${hook.hookKey}|`;
    const contract = contracts.get(exactIdentity) || contracts.get(fallbackIdentity) || null;
    return {
      atomKey: atom.atomKey,
      hookKey: hook.hookKey,
      hookMarker: hook.marker || "",
      primitiveKey: hook.primitiveKey,
      consumerContractPresent: Boolean(contract),
      proofRolesComplete: contract?.proofRolesComplete === true,
      knownProofGaps: array(contract?.knownProofGaps),
    };
  }));
  return {
    atomCount: atoms.length,
    hookCount: hookRows.length,
    hooksByType: countBy(hookRows, (row) => row.hookKey),
    atomInteractionDeclarationCount: atoms.reduce((sum, atom) => sum + array(atom.interactions).length, 0),
    consumerContractHookCount: hookRows.filter((row) => row.consumerContractPresent).length,
    missingConsumerContractHookCount: hookRows.filter((row) => !row.consumerContractPresent).length,
    proofRolesCompleteHookCount: hookRows.filter((row) => row.proofRolesComplete).length,
    incompleteProofRoleHookCount: hookRows.filter((row) => !row.proofRolesComplete).length,
    incompleteProofRoleHookRows: hookRows.filter((row) => !row.proofRolesComplete),
    strictConsumerProofReady: hookRows.every((row) => row.consumerContractPresent && row.proofRolesComplete),
  };
}

function interactionSummary(atoms, graph) {
  const graphKeys = new Set(array(graph.nodes).map((node) => String(node.ruleKey || "")));
  const representedAtoms = atoms.filter((atom) =>
    graphKeys.has(atom.atomKey) || array(atom.ruleKeys).some((ruleKey) => graphKeys.has(ruleKey)));
  const knownKeys = new Set([
    ...atoms.map((atom) => atom.atomKey),
    ...atoms.flatMap((atom) => array(atom.ruleKeys)),
    ...graphKeys,
  ]);
  const dependencyKeys = atoms.flatMap((atom) =>
    array(atom.interactions).flatMap((interaction) => array(interaction.relatedRuleKeys)));
  const distinctDependencyKeys = unique(dependencyKeys);
  return {
    manualGraphNodeCount: graphKeys.size,
    manualGraphInteractionCount: array(graph.nodes).reduce((sum, node) => sum + array(node.interactions).length, 0),
    atomsRepresentedInManualGraphCount: representedAtoms.length,
    atomsAbsentFromManualGraphCount: atoms.length - representedAtoms.length,
    atomDeclaredInteractionCount: atoms.reduce((sum, atom) => sum + array(atom.interactions).length, 0),
    atomInteractionDependencyReferenceCount: dependencyKeys.length,
    distinctAtomInteractionDependencyKeyCount: distinctDependencyKeys.length,
    boundAtomInteractionDependencyKeyCount: distinctDependencyKeys.filter((key) => knownKeys.has(key)).length,
    freeTextAtomInteractionDependencyKeyCount: distinctDependencyKeys.filter((key) => !knownKeys.has(key)).length,
    interactionGraphClosureReady: representedAtoms.length === atoms.length &&
      distinctDependencyKeys.every((key) => knownKeys.has(key)),
    boundary: "Atom-local relatedRuleKeys are descriptive strings, not validated executable graph edges. The separate manual graph covers selected high-risk core interactions only.",
  };
}

function collectSpellSources(data) {
  const rows = [];
  function visit(value, collection = "") {
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry, collection);
      return;
    }
    if (!value || typeof value !== "object") return;
    if (["spells", "grantedSpells"].includes(collection) && value.id && value.description) {
      rows.push(value);
    }
    for (const [key, entry] of Object.entries(value)) visit(entry, key);
  }
  visit(data);
  const byIdentity = new Map();
  for (const row of rows) byIdentity.set(`${row.id}|${row.description}`, row);
  return [...byIdentity.values()];
}

function simpleNumericSupportExact(spell = {}) {
  const text = String(spell.description || "")
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  if (!/[+-]\s*\d+/.test(text)) return false;
  if (/\b(?:cannot|can't|may|choose|place|remove|return|heal|becomes?|knocked down|stationary|incorporeal|stealth|pathfinder|tough|additional die|additional attack)\b/i.test(text)) return false;
  const target = "(?:target [a-z0-9 /'_-]+|the spellcaster|this model)";
  const stat = "(?:arm|armor|def|defense|spd|speed|mat|rat|melee attack and melee damage rolls?|melee attack damage rolls?|melee attack rolls?|melee damage rolls?|ranged attack rolls?|ranged damage rolls?|attack rolls?|damage rolls?|attack|damage|pow|p\\+s|power|str|strength)";
  const modifier = `[+-]\\s*\\d+ (?:to )?(?:its |their |the )?${stat}`;
  const duration = "(?: (?:for|this) (?:one )?(?:round|turn|activation))?";
  return new RegExp(`^${target} (?:gains?|suffers?) ${modifier}(?:,? and ${modifier})*${duration}\\.?$`, "i").test(text);
}

function supportSpellSummary(data, sourceSummary, createSourceRow) {
  const sourceByRef = new Map(sourceSummary.rows.map((row) => [row.sourceRef, row]));
  const spells = collectSpellSources(data).filter((spell) => /^(?:no|false|n)$/i.test(String(spell.off || "")));
  const rows = spells.map((spell) => {
    const source = createSourceRow({
      sourceKind: "spell",
      sourceId: String(spell.id),
      ruleText: String(spell.description),
      sourceNames: [String(spell.name || "")].filter(Boolean),
      sourceClasses: ["spell"],
      provenancePaths: ["/cards/*/spells/*"],
      extractionDispositions: ["same_object_id_description_pair"],
      atomKeys: [],
    });
    const ownership = sourceByRef.get(source.sourceRef);
    const owned = Boolean(ownership?.atomKeys?.length);
    const numeric = /[+\-\u2013\u2014\u2212]\s*\d+/.test(String(spell.description || ""));
    return {
      sourceRef: source.sourceRef,
      sourceId: spell.id,
      spellName: spell.name,
      owned,
      numeric,
      simpleNumericGrammarExact: !owned && simpleNumericSupportExact(spell),
      status: owned
        ? "source_atom_owned"
        : simpleNumericSupportExact(spell)
          ? "strict_generic_simple_numeric_exact"
          : numeric
            ? "strict_fail_closed_partial_numeric_semantics"
            : "strict_fail_closed_unmapped_semantics",
    };
  });
  return {
    nonOffensiveSpellCount: rows.length,
    statusCounts: countBy(rows, (row) => row.status),
    partialNumericFailClosedCount: rows.filter((row) => row.status === "strict_fail_closed_partial_numeric_semantics").length,
    partialNumericSamples: rows
      .filter((row) => row.status === "strict_fail_closed_partial_numeric_semantics")
      .slice(0, 30),
  };
}

function setStringLiterals(source, constantName) {
  const match = source.match(new RegExp(`const ${constantName} = new Set\\(\\[([\\s\\S]*?)\\]\\);`));
  return match ? unique([...match[1].matchAll(/["']([^"']+)["']/g)].map((entry) => entry[1])) : [];
}

async function searchCoverageSummary(atomSummary) {
  const chanceSource = await readFile(path.join(SEARCH_ROOT, "src/search/chance-outcomes-v1.mjs"), "utf8");
  const activationSource = await readFile(path.join(SEARCH_ROOT, "src/search/complete-activation-domain-v2.mjs"), "utf8");
  const responseSource = await readFile(path.join(SEARCH_ROOT, "src/search/opponent-response-domain-v2.mjs"), "utf8");
  const unitSequencePath = path.join(SEARCH_ROOT, "src/search/unit-combat-action-sequence-domain-v1.mjs");
  const unitSequenceSource = existsSync(unitSequencePath) ? await readFile(unitSequencePath, "utf8") : "";
  const postChanceHooks = new Set([
    "attack_hit", "damage_applied", "model_disabled", "model_boxed", "model_destroyed",
    "source_leave_play", "attack_resolved", "model_exploded",
  ]);
  const postChanceHookCount = Object.entries(atomSummary.hooksByType)
    .filter(([hookKey]) => postChanceHooks.has(hookKey))
    .reduce((sum, [, count]) => sum + count, 0);
  return {
    exactDeterministicSuccessorEffectTypes: setStringLiterals(chanceSource, "EXACT_DETERMINISTIC_SUCCESSOR_EFFECT_TYPES"),
    exactDeterministicSuccessorAtomKeys: setStringLiterals(chanceSource, "EXACT_DETERMINISTIC_SUCCESSOR_ATOM_KEYS"),
    enginePostChanceHookCount: postChanceHookCount,
    completeActivationDomainHardFalsePresent: /activationDomainComplete:\s*false/.test(activationSource),
    completeActivationChanceMassHardFalsePresent: /chanceMassAssigned:\s*false/.test(activationSource),
    opponentResponseChanceMassHardFalsePresent: /chanceMassAssigned:\s*false/.test(responseSource),
    opponentResponseContinuousDestinationDebtPresent: /opponent_reaction_continuous_destination_domain_pending/.test(responseSource),
    opponentResponsePriorityDebtPresent: /opponent_reaction_priority_order_domain_pending/.test(responseSource),
    opponentResponseChanceDebtPresent: /opponent_reaction_chance_distribution_pending/.test(responseSource),
    unitSequenceModulePresent: Boolean(unitSequenceSource),
    unitSequenceFullRulesDenominatorHardFalsePresent: /fullRulesActionDenominatorComplete:\s*false/.test(unitSequenceSource),
    unitSequenceTransitionQuotientHardFalsePresent: /transitionStableRuleQuotientComplete:\s*false/.test(unitSequenceSource),
    strictSearchReady: false,
    boundary: "Search consumes Engine legal actions and strict transitions, but complete activation geometry, full Unit sequencing, post-chance special effects, opponent response ordering/destinations/chance, and transition-stable quotient closure remain explicit debts.",
  };
}

async function coreInventorySummary(inventory) {
  const sourceTextPath = path.resolve(ENGINE_ROOT, "..", inventory.sourceSnapshot?.sourceTextPath || "");
  const sourceMetaPath = path.resolve(ENGINE_ROOT, "..", inventory.sourceSnapshot?.sourceMetaPath || "");
  const sourceTextCurrent = existsSync(sourceTextPath) &&
    sha256(await readFile(sourceTextPath)) === inventory.sourceSnapshot?.sourceTextSha256;
  const sourceMetaCurrent = existsSync(sourceMetaPath) &&
    sha256(await readFile(sourceMetaPath)) === inventory.sourceSnapshot?.sourceMetaSha256;
  return {
    inventoryVersion: inventory.inventoryVersion,
    createdAt: inventory.createdAt,
    sourceSnapshot: inventory.sourceSnapshot,
    sourceTextCurrent,
    sourceMetaCurrent,
    ruleFamilyCount: array(inventory.ruleFamilies).length,
    officialKeywordCount: array(inventory.officialKeywords).length,
    familyStatusCounts: countBy(array(inventory.ruleFamilies), (row) => row.coverageStatus),
    keywordStatusCounts: countBy(array(inventory.officialKeywords), (row) => row.coverageStatus),
    familyMissingCheckCount: array(inventory.ruleFamilies).reduce((sum, row) => sum + array(row.missingChecks).length, 0),
    keywordMissingCheckCount: array(inventory.officialKeywords).reduce((sum, row) => sum + array(row.missingChecks).length, 0),
    currentImplementationReconciled: false,
    boundary: "The official inventory is a valid source snapshot but its historical coverage statuses have not been regenerated against the current Engine and cannot prove current strict execution.",
  };
}

async function main() {
  const [data, inventory, graph, proofIndexModule, proofModule, atomsModule, consumerModule] = await Promise.all([
    readJson(DATA_PATH),
    readJson(INVENTORY_PATH),
    readJson(INTERACTION_GRAPH_PATH),
    importEngineModule("scripts/build-warmachine-rule-proof-index-v1.mjs"),
    importEngineModule("scripts/warmachine-rule-proof-v1.mjs"),
    importEngineModule("scripts/warmachine-rule-atoms-v1.mjs"),
    importEngineModule("scripts/warmachine-rule-atom-consumer-contracts-v1.mjs"),
  ]);
  const atoms = atomsModule.recognizedWarmachineRuleAtoms();
  const extraction = proofIndexModule.extractWarmachineRuleSourceRows(data);
  const ownershipRows = proofIndexModule.createWarmachineRuleSourceOwnershipRows(extraction.sourceRows, atoms);
  const sources = sourceOwnershipSummary(extraction.sourceRows, ownershipRows);
  const atomProof = atomProofSummary(atoms, consumerModule);
  const interactions = interactionSummary(atoms, graph);
  const report = {
    schemaVersion: "warmachine_end_to_end_rule_chain_audit_v1",
    generatedAt: new Date().toISOString(),
    inputs: {
      engineRoot: ENGINE_ROOT,
      searchRoot: SEARCH_ROOT,
      dataRemoteVersion: String(data.source?.remoteVersion || ""),
      dataSha256: sha256(await readFile(DATA_PATH)),
      atomRegistryDefinitionCount: atoms.length,
    },
    coreRulebook: await coreInventorySummary(inventory),
    cardRuleSources: {
      ...sources,
      rows: undefined,
      extractionSummary: extraction.extractionSummary,
    },
    supportSpellStrictBoundary: supportSpellSummary(data, sources, proofModule.createSourceRow),
    atomProof,
    interactions,
    search: await searchCoverageSummary(atomProof),
  };
  report.verdict = {
    sourceOwnershipReady: sources.unownedSourceCount === 0 && sources.actualSourceIdTextDriftCount === 0,
    atomConsumerProofReady: atomProof.strictConsumerProofReady,
    interactionClosureReady: interactions.interactionGraphClosureReady,
    coreRulebookReverseAuditReady: report.coreRulebook.currentImplementationReconciled,
    strictSearchReady: report.search.strictSearchReady,
  };
  report.verdict.endToEndStrictReady = Object.values(report.verdict).every(Boolean);
  report.verdict.highRiskFindings = [
    ...(sources.unownedSourceCount ? [`${sources.unownedSourceCount}_current_card_rule_sources_unowned`] : []),
    ...(sources.actualSourceIdTextDriftCount ? [`${sources.actualSourceIdTextDriftCount}_source_id_text_contract_drifts`] : []),
    ...(atomProof.incompleteProofRoleHookCount ? [`${atomProof.incompleteProofRoleHookCount}_atom_hook_proof_roles_incomplete`] : []),
    ...(!interactions.interactionGraphClosureReady ? ["interaction_graph_not_closed_over_atom_registry"] : []),
    ...(!report.coreRulebook.currentImplementationReconciled ? ["official_rule_inventory_not_reconciled_to_current_engine"] : []),
    ...(!report.search.strictSearchReady ? ["search_action_chance_response_denominator_incomplete"] : []),
  ];
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    ok: true,
    output: path.relative(SEARCH_ROOT, OUTPUT_PATH),
    remoteVersion: report.inputs.dataRemoteVersion,
    coreRulebook: report.coreRulebook,
    cardRuleSources: {
      sourceCount: report.cardRuleSources.sourceCount,
      ownedSourceCount: report.cardRuleSources.ownedSourceCount,
      unownedSourceCount: report.cardRuleSources.unownedSourceCount,
      byKind: report.cardRuleSources.byKind,
      actualSourceIdTextDriftCount: report.cardRuleSources.actualSourceIdTextDriftCount,
    },
    supportSpellStrictBoundary: report.supportSpellStrictBoundary,
    atomProof: {
      atomCount: report.atomProof.atomCount,
      hookCount: report.atomProof.hookCount,
      incompleteProofRoleHookCount: report.atomProof.incompleteProofRoleHookCount,
    },
    interactions: report.interactions,
    search: report.search,
    verdict: report.verdict,
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
