import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const WARMACHINE_SEARCH_EXECUTION_RECEIPT_V1_SCHEMA =
  "warmachine_search_execution_receipt_v1";

const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const DEFAULT_EXECUTION_ENTRY_PATHS = Object.freeze([
  "config/warmachine-focused-engine-receipt-v1.json",
  "scripts/execute-custom-matchup-terminal-root-batch-v1.mjs",
  "src/matchup/matchup-assassination-terminal-task-materializer-v1.mjs",
  "src/matchup/matchup-fixed-round-terminal-task-materializer-v1.mjs",
  "src/matchup/matchup-score-terminal-task-materializer-v1.mjs",
  "src/matchup/matchup-simultaneous-terminal-task-materializer-v1.mjs",
  "src/matchup/matchup-terminal-root-batch-v1.mjs",
  "src/matchup/matchup-terminal-root-opening-batch-v1.mjs",
  "src/matchup/matchup-terminal-task-execution-batch-v1.mjs",
  "src/search/complete-activation-domain-v2.mjs",
  "src/geometry/cell-connectivity-v1.mjs",
  "src/geometry/movement-event-word-language-v1.mjs",
  "src/geometry/path-topology-v1.mjs",
  "src/reverse/terminal-geometry-reduction-v1.mjs",
  "src/reverse/terminal-rooted-to-deployment-v1.mjs",
]);

function stableHash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function gitCommand(repositoryRoot, argumentsList, fallback = "") {
  try {
    return execFileSync("git", ["-C", repositoryRoot, ...argumentsList], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return fallback;
  }
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
  return [...new Set(values.filter((value) => value.startsWith(".")))].sort();
}

function resolveLocalDependency(repositoryRoot, importerRelativePath, specifier) {
  const cleanedSpecifier = String(specifier).split(/[?#]/, 1)[0];
  const base = path.resolve(
    repositoryRoot,
    path.dirname(importerRelativePath),
    cleanedSpecifier,
  );
  const candidates = [
    base,
    `${base}.mjs`,
    `${base}.js`,
    `${base}.json`,
    path.join(base, "index.mjs"),
    path.join(base, "index.js"),
  ];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) continue;
    const relativePath = path.relative(repositoryRoot, candidate);
    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      throw new Error(`search_execution_dependency_escapes_repository:${specifier}`);
    }
    return relativePath.split(path.sep).join("/");
  }
  throw new Error(
    `search_execution_local_dependency_missing:${importerRelativePath}:${specifier}`,
  );
}

export function discoverWarmachineSearchExecutionSourcePathsV1(
  repositoryRoot = REPOSITORY_ROOT,
  entryRelativePaths = DEFAULT_EXECUTION_ENTRY_PATHS,
) {
  const root = path.resolve(repositoryRoot);
  const pending = [...new Set(entryRelativePaths.map(String))].sort();
  const discovered = new Set();
  while (pending.length) {
    const relativePath = pending.shift();
    if (discovered.has(relativePath)) continue;
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`search_execution_entry_missing:${relativePath}`);
    }
    discovered.add(relativePath);
    if (!/\.(?:mjs|js|cjs)$/i.test(relativePath)) continue;
    const source = fs.readFileSync(absolutePath, "utf8");
    for (const specifier of localModuleSpecifiers(source)) {
      const dependency = resolveLocalDependency(root, relativePath, specifier);
      if (!discovered.has(dependency) && !pending.includes(dependency)) {
        pending.push(dependency);
      }
    }
    pending.sort();
  }
  return [...discovered].sort();
}

export function buildWarmachineSearchSourceReceiptV1(rawOptions = {}) {
  const repositoryRoot = path.resolve(rawOptions.repositoryRoot || REPOSITORY_ROOT);
  const sourcePaths = discoverWarmachineSearchExecutionSourcePathsV1(
    repositoryRoot,
    rawOptions.entryRelativePaths || DEFAULT_EXECUTION_ENTRY_PATHS,
  );
  const sourceRecords = sourcePaths.map((relativePath) => {
    const bytes = fs.readFileSync(path.join(repositoryRoot, relativePath));
    return {
      relativePath,
      byteCount: bytes.byteLength,
      contentHash: stableHash(bytes),
    };
  });
  const sourceCore = {
    sourceFileCount: sourceRecords.length,
    sourceRecords,
  };
  const sourceClosureHash = stableHash(JSON.stringify(sourceCore));
  const gitRevision = gitCommand(repositoryRoot, ["rev-parse", "HEAD"], "unavailable");
  const sourceStatus = gitCommand(repositoryRoot, [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
    "--",
    ...sourcePaths,
  ]);
  const core = {
    schemaVersion: "warmachine_search_source_receipt_v1",
    gitRevision,
    sourceWorktreeDirty: Boolean(sourceStatus),
    sourceDirtyPathCount: sourceStatus
      ? sourceStatus.split("\n").filter(Boolean).length
      : 0,
    ...sourceCore,
    sourceClosureHash,
  };
  return { ...core, sourceReceiptHash: stableHash(JSON.stringify(core)) };
}

function normalizedEngineReceipt(receipt = {}) {
  return {
    schemaVersion: String(receipt.schemaVersion || ""),
    gitRevision: String(receipt.gitRevision || ""),
    trackedWorktreeDirty: receipt.trackedWorktreeDirty === true,
    trackedDirtyPathCount: Number(receipt.trackedDirtyPathCount || 0),
    sourceHashes: Object.fromEntries(Object.entries(receipt.sourceHashes || {})
      .sort(([left], [right]) => left.localeCompare(right))),
    receiptHash: String(receipt.receiptHash || ""),
  };
}

function normalizedFocusedEngineReceipt(binding = {}) {
  const reviewed = binding.reviewedReceipt || {};
  return {
    schemaVersion: String(binding.schemaVersion || ""),
    reviewedReceiptSchemaVersion: String(reviewed.schemaVersion || ""),
    sourceReceiptHash: String(reviewed.sourceReceiptHash || ""),
    manifestHash: String(reviewed.manifestHash || ""),
    aggregateHash: String(reviewed.aggregateHash || ""),
    executionSourceReceiptHash: String(reviewed.executionSourceReceiptHash || ""),
    observedExecutionSourceReceiptHash: String(
      binding.observedExecutionSourceReceiptHash || "",
    ),
    sourceFileCount: Number(reviewed.sourceFileCount || 0),
    verifierCount: Number(reviewed.verifierCount || 0),
    passedVerifierCount: Number(reviewed.passedVerifierCount || 0),
    failedVerifierCount: Number(reviewed.failedVerifierCount || 0),
    shardCount: Number(reviewed.shardCount || 0),
    gatePassed: reviewed.gatePassed === true,
    current: binding.current === true,
    failClosedReasons: [...(binding.failClosedReasons || [])].map(String).sort(),
  };
}

function normalizedRuleSemanticsAuthority(authority = {}) {
  const verdict = authority.verdict || {};
  return {
    schemaVersion: String(authority.schemaVersion || ""),
    authorityReceiptHash: String(authority.authorityReceiptHash || ""),
    disposition: String(authority.disposition ||
      (verdict.globalStrictReady === true && verdict.strictExecutorReady === true
        ? "strict_certified"
        : "rules_semantics_unreviewed")),
    sourceAuthorityCurrent: authority.sourceAuthority?.current === true,
    globalStrictReady: verdict.globalStrictReady === true,
    strictExecutorReady: verdict.strictExecutorReady === true,
    strictSearchReady: verdict.strictSearchReady === true,
    trainingTruthAllowed: verdict.trainingTruthAllowed === true,
    quarantineActive: authority.quarantine?.active !== false,
    failClosedReasons: [...(authority.failClosedReasons || [])].map(String).sort(),
  };
}

export function buildWarmachineCompositeExecutionReceiptV1(rawOptions = {}) {
  const search = buildWarmachineSearchSourceReceiptV1(rawOptions);
  const engine = normalizedEngineReceipt(rawOptions.hostReceipt);
  const constructionEngine = normalizedEngineReceipt(rawOptions.constructionHostReceipt);
  const focusedEngine = normalizedFocusedEngineReceipt(
    rawOptions.focusedEngineReceipt,
  );
  const ruleSemanticsAuthority = normalizedRuleSemanticsAuthority(
    rawOptions.ruleSemanticsAuthority ||
      rawOptions.focusedEngineReceipt?.ruleSemanticsAuthority,
  );
  const core = {
    schemaVersion: WARMACHINE_SEARCH_EXECUTION_RECEIPT_V1_SCHEMA,
    engine,
    constructionEngine,
    focusedEngine,
    ruleSemanticsAuthority,
    search,
    current: focusedEngine.gatePassed === true &&
      focusedEngine.current === true &&
      ruleSemanticsAuthority.sourceAuthorityCurrent === true &&
      ruleSemanticsAuthority.globalStrictReady === true &&
      ruleSemanticsAuthority.strictExecutorReady === true &&
      ruleSemanticsAuthority.disposition === "strict_certified" &&
      ruleSemanticsAuthority.quarantineActive === false,
    claimBoundary: "This receipt binds the current Engine rules and construction dependency closures, the source-bound rule-semantics authority, and the Search terminal materializer, planner and recovery dependency closure. Any mismatch or semantic quarantine invalidates checkpoint resume and current report claims until independently replayed under a newly sealed receipt.",
  };
  return { ...core, executionReceiptHash: stableHash(JSON.stringify(core)) };
}
