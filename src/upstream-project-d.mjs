import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const WARMACHINE_HOST_CONTRACT_SCHEMA = "warmachine_host_contract_v1";

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REVIEWED_FOCUSED_ENGINE_RECEIPT_PATH = path.join(
  REPOSITORY_ROOT,
  "config/warmachine-focused-engine-receipt-v1.json",
);
const FOCUSED_ENGINE_CLOSURE_MODULE =
  "scripts/warmachine-focused-execution-source-closure-v1.mjs";

const HOST_MODULES = Object.freeze({
  rules: "scripts/warmachine-rules-v1.mjs",
  adapter: "scripts/layer3-function3-adapter.mjs",
  atoms: "scripts/warmachine-rule-atoms-v1.mjs",
  probability: "scripts/warmachine-exact-dice-probability-v1.mjs",
  steamroller: "scripts/warmachine-steamroller-2026-v1.mjs",
  semanticsAuthority: "scripts/warmachine-rule-semantics-authority-v1.mjs",
});

const CONSTRUCTION_HOST_MODULES = Object.freeze({
  deployment: "scripts/run-warmachine-ai-one-round-live-experiments-v20260609.mjs",
  formation: "scripts/warmachine-formation-library-v1.mjs",
});

const CONSTRUCTION_HOST_SOURCE_PATHS = Object.freeze([
  ...Object.values(CONSTRUCTION_HOST_MODULES),
  "android-shell/assets/companion/force-builder.js",
]);

const LEGACY_REVERSE_MODULES = Object.freeze({
  cegar: "scripts/warmachine-search-cegar-v1.mjs",
  chanceOutcomes: "scripts/warmachine-search-chance-outcomes-v1.mjs",
  formation: "scripts/warmachine-formation-candidate-generator-v1.mjs",
  formationLibrary: "scripts/warmachine-formation-library-v1.mjs",
  goalConditioned: "scripts/warmachine-goal-conditioned-search-v1.mjs",
  lazyAction: "scripts/warmachine-lazy-action-cursor-v1.mjs",
  matchupSearch: "scripts/warmachine-matchup-search-v1.mjs",
  openingTerminal: "scripts/warmachine-opening-terminal-search-v1.mjs",
  playableAI: "scripts/warmachine-playable-ai-v0.mjs",
  primitiveContracts: "scripts/warmachine-reverse-primitive-contracts-v1.mjs",
  rejectionReplay: "scripts/warmachine-search-rejection-replay-v1.mjs",
  relevanceClosure: "scripts/warmachine-terminal-relevance-closure-v1.mjs",
  rosterInvestment: "scripts/warmachine-roster-investment-v1.mjs",
  ruleRegression: "scripts/warmachine-reverse-rule-regression-v1.mjs",
  searchDependency: "scripts/warmachine-search-dependency-v1.mjs",
  spatialQuotient: "scripts/warmachine-reverse-spatial-quotient-v1.mjs",
  symbolicWorklist: "scripts/warmachine-symbolic-reverse-worklist-v1.mjs",
  terminalObligation: "scripts/warmachine-terminal-obligation-graph-v1.mjs",
});

const DEFAULT_LEGACY_REVERSE_MODULE_KEYS = Object.freeze([
  "formation",
  "goalConditioned",
  "openingTerminal",
  "primitiveContracts",
  "ruleRegression",
  "spatialQuotient",
  "symbolicWorklist",
]);

function command(root, args, fallback = "") {
  try {
    return execFileSync("git", ["-C", root, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return fallback;
  }
}

async function sha256(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

function stableHash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assertFocusedReceipt(condition, reason) {
  if (!condition) throw new Error(reason);
}

async function loadReviewedFocusedEngineReceipt(projectDRoot) {
  const reviewed = JSON.parse(await readFile(REVIEWED_FOCUSED_ENGINE_RECEIPT_PATH, "utf8"));
  assertFocusedReceipt(
    reviewed.schemaVersion === "warmachine_reviewed_focused_engine_receipt_v1",
    "Warmachine reviewed focused Engine receipt schema mismatch",
  );
  assertFocusedReceipt(
    reviewed.gatePassed === true &&
      Number(reviewed.passedVerifierCount) === Number(reviewed.verifierCount) &&
      Number(reviewed.failedVerifierCount) === 0,
    "Warmachine reviewed focused Engine receipt is not green",
  );
  for (const key of [
    "sourceReceiptHash",
    "manifestHash",
    "aggregateHash",
    "executionSourceReceiptHash",
  ]) {
    assertFocusedReceipt(
      /^[0-9a-f]{64}$/.test(String(reviewed[key] || "")),
      `Warmachine reviewed focused Engine receipt has invalid ${key}`,
    );
  }

  const closureModulePath = path.join(projectDRoot, FOCUSED_ENGINE_CLOSURE_MODULE);
  await access(closureModulePath);
  const closureModuleUrl = pathToFileURL(closureModulePath);
  closureModuleUrl.searchParams.set("source", (await sha256(closureModulePath)).slice(0, 16));
  const closureModule = await import(closureModuleUrl.href);
  assertFocusedReceipt(
    typeof closureModule.buildWarmachineFocusedExecutionSourceClosureV1 === "function",
    "Warmachine focused Engine closure builder missing",
  );
  const observedClosure = closureModule.buildWarmachineFocusedExecutionSourceClosureV1(
    projectDRoot,
  );
  const failClosedReasons = [
    ...(observedClosure.sourceReceiptHash === reviewed.executionSourceReceiptHash
      ? []
      : ["focused_engine_execution_source_receipt_mismatch"]),
    ...(Number(observedClosure.sourceFileCount) === Number(reviewed.sourceFileCount)
      ? []
      : ["focused_engine_source_file_count_mismatch"]),
  ];

  const sourceReceiptPath = path.join(
    projectDRoot,
    String(reviewed.sourceReceiptRelativePath || ""),
  );
  let localArtifactVerified = false;
  if (existsSync(sourceReceiptPath)) {
    const sourceReceipt = JSON.parse(await readFile(sourceReceiptPath, "utf8"));
    const { sourceReceiptHash, ...receiptCore } = sourceReceipt;
    assertFocusedReceipt(
      stableHash(JSON.stringify(receiptCore)) === sourceReceiptHash &&
        sourceReceiptHash === reviewed.sourceReceiptHash,
      "Warmachine focused Engine source receipt hash mismatch",
    );
    assertFocusedReceipt(
      sourceReceipt.gatePassed === true &&
        sourceReceipt.manifestHash === reviewed.manifestHash &&
        sourceReceipt.aggregateHash === reviewed.aggregateHash &&
        sourceReceipt.executionSourceClosure?.sourceReceiptHash ===
          reviewed.executionSourceReceiptHash,
      "Warmachine focused Engine source receipt evidence mismatch",
    );
    localArtifactVerified = true;
  }

  return {
    schemaVersion: "warmachine_focused_engine_receipt_binding_v1",
    reviewedReceipt: reviewed,
    observedExecutionSourceReceiptHash: observedClosure.sourceReceiptHash,
    observedSourceFileCount: observedClosure.sourceFileCount,
    current: failClosedReasons.length === 0,
    failClosedReasons,
    localArtifactVerified,
  };
}

function localModuleSpecifiers(source = "") {
  const values = [];
  const patterns = [
    /(?:^|\n)\s*import\s+(?:[^;"']*?\s+from\s+)?["']([^"']+)["']/g,
    /(?:^|\n)\s*export\s+(?:\*|\{[^}]*\})\s+from\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of String(source).matchAll(pattern)) values.push(match[1]);
  }
  return [...new Set(values.filter((value) => String(value).startsWith(".")))].sort();
}

async function resolveLocalModuleDependency(root, importerRelativePath, specifier) {
  const cleanedSpecifier = String(specifier).split(/[?#]/, 1)[0];
  const base = path.resolve(root, path.dirname(importerRelativePath), cleanedSpecifier);
  const candidates = [
    base,
    `${base}.mjs`,
    `${base}.js`,
    `${base}.json`,
    path.join(base, "index.mjs"),
    path.join(base, "index.js"),
  ];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      const relativePath = path.relative(root, candidate);
      if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
        throw new Error(`Warmachine Host dependency escapes Project D: ${specifier}`);
      }
      return relativePath.split(path.sep).join("/");
    } catch (error) {
      if (error?.message?.startsWith("Warmachine Host dependency escapes")) throw error;
    }
  }
  throw new Error(
    `Warmachine Host local dependency not found: ${importerRelativePath} -> ${specifier}`,
  );
}

export async function discoverWarmachineHostDependencyPaths(
  projectDRoot,
  entryRelativePaths = Object.values(HOST_MODULES),
) {
  const root = path.resolve(projectDRoot);
  const pending = [...new Set(entryRelativePaths.map(String))].sort();
  const discovered = new Set();
  while (pending.length) {
    const relativePath = pending.shift();
    if (discovered.has(relativePath)) continue;
    const absolutePath = path.join(root, relativePath);
    await access(absolutePath);
    discovered.add(relativePath);
    if (!/\.(?:mjs|js|cjs)$/i.test(relativePath)) continue;
    const source = await readFile(absolutePath, "utf8");
    for (const specifier of localModuleSpecifiers(source)) {
      const dependency = await resolveLocalModuleDependency(root, relativePath, specifier);
      if (!discovered.has(dependency) && !pending.includes(dependency)) pending.push(dependency);
    }
    pending.sort();
  }
  return [...discovered].sort();
}

async function sourceHashesForDependencyClosure(root, entryRelativePaths) {
  const relativePaths = await discoverWarmachineHostDependencyPaths(root, entryRelativePaths);
  return Object.fromEntries(await Promise.all(relativePaths.map(async (relativePath) => [
    relativePath,
    await sha256(path.join(root, relativePath)),
  ])));
}

export function resolveWarmachineEngineRoot(
  rawRoot = process.env.WARMACHINE_ENGINE_ROOT || process.env.WARMACHINE_PROJECT_D_ROOT,
) {
  if (rawRoot) return path.resolve(rawRoot);
  return path.resolve(REPOSITORY_ROOT, "..", "warmachine-strict-engine");
}

// Legacy public name retained so existing evidence and downstream callers keep loading.
export const resolveProjectDRoot = resolveWarmachineEngineRoot;

async function assertFiles(root, moduleMap) {
  for (const relativePath of Object.values(moduleMap)) {
    await access(path.join(root, relativePath));
  }
}

async function importModules(root, moduleMap, sourceHashes) {
  const previousWorkingDirectory = process.cwd();
  try {
    // Some legacy Warmachine modules capture process.cwd() at module evaluation.
    process.chdir(root);
    return Object.fromEntries(await Promise.all(Object.entries(moduleMap).map(async ([key, relativePath]) => {
      const moduleUrl = pathToFileURL(path.join(root, relativePath));
      moduleUrl.searchParams.set("source", sourceHashes[relativePath].slice(0, 16));
      return [key, await import(moduleUrl.href)];
    })));
  } finally {
    process.chdir(previousWorkingDirectory);
  }
}

function requireFunctions(moduleValue, moduleName, names) {
  for (const name of names) {
    if (typeof moduleValue?.[name] !== "function") {
      throw new Error(`Warmachine Host ${moduleName} is missing required function ${name}`);
    }
  }
}

export async function buildWarmachineHostDependencyReceipt(rawOptions = {}) {
  const projectDRoot = resolveWarmachineEngineRoot(
    rawOptions.engineRoot || rawOptions.projectDRoot,
  );
  await assertFiles(projectDRoot, HOST_MODULES);
  const sourceHashes = await sourceHashesForDependencyClosure(
    projectDRoot,
    Object.values(HOST_MODULES),
  );
  const gitRevision = command(projectDRoot, ["rev-parse", "HEAD"], "unavailable");
  const trackedStatus = command(projectDRoot, ["status", "--porcelain=v1", "--untracked-files=no"], "");
  const receiptCore = {
    schemaVersion: "warmachine_host_dependency_receipt_v2",
    projectDRoot,
    gitRevision,
    trackedWorktreeDirty: Boolean(trackedStatus),
    trackedDirtyPathCount: trackedStatus ? trackedStatus.split("\n").filter(Boolean).length : 0,
    sourceHashes,
  };
  return {
    ...receiptCore,
    receiptHash: createHash("sha256").update(JSON.stringify(receiptCore)).digest("hex"),
  };
}

export async function loadWarmachineHost(rawOptions = {}) {
  const receipt = await buildWarmachineHostDependencyReceipt(rawOptions);
  const focusedEngineReceipt = await loadReviewedFocusedEngineReceipt(
    receipt.projectDRoot,
  );
  const modules = await importModules(receipt.projectDRoot, HOST_MODULES, receipt.sourceHashes);
  requireFunctions(modules.rules, "rules", [
    "normalizeRulesV1State",
    "enumerateRulesV1Actions",
    "applyRulesV1Action",
    "auditRulesV1StaticPlacement",
    "auditRulesV1StaticUnitFormation",
    "auditRulesV1SteamrollerScenarioTerrainSetup",
    "buildRulesV1UnitCombatActionAttackSlotPlan",
    "buildRulesV1MovementPathProposalPlan",
    "buildRulesV1MovementGeometryPredicatePlan",
    "evaluateRulesV1MovementGeometryEndpoint",
    "evaluateRulesV1MovementGeometryPath",
    "materializeRulesV1ParameterizedLifecycleReplacementAction",
    "materializeRulesV1ParameterizedUnitMovementAction",
    "scoreScenarioElements",
    "validateRulesV1State",
  ]);
  requireFunctions(modules.adapter, "adapter", [
    "buildWarmachineRulesV1StateFromLayer3Room",
    "buildWarmachineRulesV1ActionWithStrictRngOutcome",
    "strictOpponentReactionRequirementsForAction",
  ]);
  requireFunctions(modules.atoms, "atoms", [
    "recognizedWarmachineRuleAtoms",
    "recognizedWarmachineRuleAtomHookContracts",
    "buildWarmachineRuleAtomInteractionGraph",
    "validateWarmachineRuleAtomRegistry",
  ]);
  requireFunctions(modules.probability, "probability", [
    "warmachineExactPrimaryAttackTerminalProbability",
  ]);
  requireFunctions(modules.steamroller, "steamroller", [
    "steamroller2026ScenarioKey",
    "steamroller2026ScenarioProfile",
    "steamroller2026ScenarioProfiles",
  ]);
  requireFunctions(modules.semanticsAuthority, "semanticsAuthority", [
    "buildWarmachineRuleSemanticsAuthorityV1",
  ]);
  const ruleSemanticsAuthority =
    modules.semanticsAuthority.buildWarmachineRuleSemanticsAuthorityV1({
      engineRoot: receipt.projectDRoot,
      projectRoot: path.resolve(receipt.projectDRoot, ".."),
    });
  const focusedSourceReceipt = {
    ...focusedEngineReceipt,
    ruleSemanticsAuthority,
  };
  return {
    schemaVersion: WARMACHINE_HOST_CONTRACT_SCHEMA,
    receipt,
    focusedSourceReceipt,
    ruleSemanticsAuthority,
    rules: modules.rules,
    adapter: modules.adapter,
    atoms: modules.atoms,
    probability: modules.probability,
    steamroller: modules.steamroller,
    searchMayAffectRules: false,
    strictForwardExecutionIsAuthority: true,
  };
}

export async function loadWarmachineConstructionHost(rawOptions = {}) {
  const core = await loadWarmachineHost(rawOptions);
  await assertFiles(core.receipt.projectDRoot, CONSTRUCTION_HOST_MODULES);
  const constructionSourceHashes = await sourceHashesForDependencyClosure(
    core.receipt.projectDRoot,
    CONSTRUCTION_HOST_SOURCE_PATHS,
  );
  const modules = await importModules(
    core.receipt.projectDRoot,
    CONSTRUCTION_HOST_MODULES,
    constructionSourceHashes,
  );
  requireFunctions(modules.deployment, "deployment", [
    "auditDeploymentTokens",
    "buildHeuristicDeploymentPlan",
    "buildRosterTokens",
  ]);
  requireFunctions(modules.formation, "formation", [
    "buildWarmachineFormationRuleInteractionProfile",
    "evaluateWarmachineFormationEffectiveness",
  ]);
  const receiptCore = {
    ...core.receipt,
    schemaVersion: "warmachine_construction_host_dependency_receipt_v1",
    sourceHashes: {
      ...core.receipt.sourceHashes,
      ...constructionSourceHashes,
    },
  };
  delete receiptCore.receiptHash;
  return {
    schemaVersion: "warmachine_construction_host_contract_v1",
    receipt: {
      ...receiptCore,
      receiptHash: createHash("sha256").update(JSON.stringify(receiptCore)).digest("hex"),
    },
    core,
    focusedSourceReceipt: core.focusedSourceReceipt,
    deployment: modules.deployment,
    formation: modules.formation,
    strictForwardExecutionIsAuthority: true,
    searchMayAffectRules: false,
  };
}

export async function loadLegacyReverseSearchModules(rawOptions = {}) {
  const receipt = await buildWarmachineHostDependencyReceipt(rawOptions);
  const moduleKeys = rawOptions.moduleKeys || DEFAULT_LEGACY_REVERSE_MODULE_KEYS;
  const unknownModuleKeys = moduleKeys.filter((key) => !LEGACY_REVERSE_MODULES[key]);
  if (unknownModuleKeys.length) {
    throw new Error(`Unknown legacy reverse module keys: ${unknownModuleKeys.join(", ")}`);
  }
  const selectedModules = Object.fromEntries(moduleKeys.map((key) => [key, LEGACY_REVERSE_MODULES[key]]));
  await assertFiles(receipt.projectDRoot, selectedModules);
  const sourceHashes = await sourceHashesForDependencyClosure(
    receipt.projectDRoot,
    Object.values(selectedModules),
  );
  return {
    schemaVersion: "warmachine_legacy_reverse_search_bridge_v1",
    migrationOnly: true,
    receipt: {
      ...receipt,
      legacyReverseSourceHashes: sourceHashes,
    },
    modules: await importModules(receipt.projectDRoot, selectedModules, sourceHashes),
  };
}
