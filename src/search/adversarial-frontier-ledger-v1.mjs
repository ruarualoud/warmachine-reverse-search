import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";

export const WARMACHINE_ADVERSARIAL_FRONTIER_LEDGER_V1_SCHEMA =
  "warmachine_adversarial_frontier_ledger_v1";

function absolute(value) {
  return value < 0n ? -value : value;
}

function greatestCommonDivisor(left, right) {
  let a = absolute(left);
  let b = absolute(right);
  while (b !== 0n) [a, b] = [b, a % b];
  return a || 1n;
}

function rational(numerator = 0n, denominator = 1n) {
  let top = typeof numerator === "bigint" ? numerator : BigInt(numerator);
  let bottom = typeof denominator === "bigint" ? denominator : BigInt(denominator);
  if (bottom === 0n) throw new Error("frontier_probability_denominator_must_be_nonzero");
  if (bottom < 0n) {
    top = -top;
    bottom = -bottom;
  }
  if (top < 0n) throw new Error("frontier_probability_must_be_nonnegative");
  const divisor = greatestCommonDivisor(top, bottom);
  return { numerator: top / divisor, denominator: bottom / divisor };
}

function add(left, right) {
  return rational(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function compare(left, right) {
  const delta = left.numerator * right.denominator - right.numerator * left.denominator;
  return delta < 0n ? -1 : delta > 0n ? 1 : 0;
}

function parseThreshold(value = "0") {
  const text = String(value ?? "0").trim();
  if (!/^\d+(?:\.\d+)?$/.test(text)) {
    throw new Error("invalid_adversarial_frontier_probability_threshold");
  }
  const [whole, fractional = ""] = text.split(".");
  const parsed = rational(BigInt(`${whole}${fractional}`), 10n ** BigInt(fractional.length));
  if (compare(parsed, rational(1n)) > 0) {
    throw new Error("adversarial_frontier_probability_threshold_above_one");
  }
  return parsed;
}

function probabilityRecord(value) {
  const normalized = rational(value.numerator, value.denominator);
  return {
    numerator: String(normalized.numerator),
    denominator: String(normalized.denominator),
  };
}

function entryContribution(entry = {}) {
  const source = entry.contribution || entry.cumulativeProbability || {};
  return rational(source.numerator ?? 0, source.denominator ?? 1);
}

function frontierIdentity(entry = {}) {
  const depth = Number(entry.depth);
  if (!Number.isInteger(depth) || depth < 0) {
    throw new Error("adversarial_frontier_depth_must_be_nonnegative_integer");
  }
  const stateHash = String(entry.stateHash || "");
  const cursor = String(entry.cursor ?? "");
  const adversarialContextKey = String(entry.adversarialContextKey || "");
  const continuationKey = String(entry.continuationKey || "continue");
  if (!stateHash) throw new Error("adversarial_frontier_state_hash_required");
  if (!cursor) throw new Error("adversarial_frontier_cursor_required");
  if (!adversarialContextKey) {
    throw new Error("adversarial_frontier_context_key_required");
  }
  if (!continuationKey) throw new Error("adversarial_frontier_continuation_key_required");
  return { depth, stateHash, cursor, adversarialContextKey, continuationKey };
}

export function deriveWarmachineAdversarialContextKeyV1(
  parentContextKeyInput,
  decision = {},
) {
  const parentContextKey = String(parentContextKeyInput || "");
  if (!parentContextKey) throw new Error("parent_adversarial_context_key_required");
  const quantifier = String(decision.quantifier || "deterministic_singleton");
  if (quantifier === "deterministic_singleton") return parentContextKey;
  if (!["owner_max", "opponent_and_min"].includes(quantifier)) {
    throw new Error("unsupported_adversarial_context_quantifier");
  }
  const responseNodeKey = String(decision.responseNodeKey || "");
  const responseKey = String(decision.responseKey || "");
  if (!responseNodeKey || !responseKey) {
    throw new Error("adversarial_context_response_identity_required");
  }
  const identity = {
    parentContextKey,
    quantifier,
    ownerSideKey: String(decision.ownerSideKey || ""),
    decisionKind: String(decision.decisionKind || "none"),
    responseNodeKey,
    responseKey,
  };
  return `adversarial-context-${stableGraphHash(identity, 32)}`;
}

export function mergeWarmachineAdversarialProbabilityFrontierV1(
  frontierEntries = [],
  rawOptions = {},
) {
  const entries = Array.isArray(frontierEntries) ? frontierEntries : [];
  const threshold = parseThreshold(rawOptions.lowProbabilityThreshold ?? "0");
  const grouped = new Map();
  let inputMass = rational(0n);

  for (const [entryIndex, entry] of entries.entries()) {
    const identity = frontierIdentity(entry);
    const contribution = entryContribution(entry);
    const thresholdEligible = entry.thresholdEligible !== false;
    inputMass = add(inputMass, contribution);
    const frontierKey = `frontier-${stableGraphHash(identity, 32)}`;
    const evidence = {
      entryIndex,
      incomingEdgeKey: String(entry.incomingEdgeKey || ""),
      routeKey: String(entry.routeKey || ""),
      contribution: probabilityRecord(contribution),
      evidence: stableGraphValue(entry.evidence ?? null),
    };
    const existing = grouped.get(frontierKey);
    if (existing) {
      if (existing.thresholdEligible !== thresholdEligible) {
        throw new Error("merged_frontier_threshold_eligibility_mismatch");
      }
      existing.mass = add(existing.mass, contribution);
      existing.incoming.push(evidence);
    } else {
      grouped.set(frontierKey, {
        frontierKey,
        ...identity,
        mass: contribution,
        thresholdEligible,
        incoming: [evidence],
      });
    }
  }

  let groupedMass = rational(0n);
  const frontier = Array.from(grouped.values()).map((row) => {
    groupedMass = add(groupedMass, row.mass);
    const status = !row.thresholdEligible
      ? "bypass_threshold"
      : compare(row.mass, threshold) < 0
        ? "pruned_low_probability"
        : "expand";
    return {
      frontierKey: row.frontierKey,
      depth: row.depth,
      stateHash: row.stateHash,
      cursor: row.cursor,
      adversarialContextKey: row.adversarialContextKey,
      continuationKey: row.continuationKey,
      thresholdEligible: row.thresholdEligible,
      cumulativeProbability: probabilityRecord(row.mass),
      status,
      reason: status === "pruned_low_probability"
        ? "merged_cumulative_probability_below_declared_threshold"
        : status === "bypass_threshold"
          ? "known_terminal_or_unresolved_suffix_bypasses_threshold"
          : "merged_cumulative_probability_meets_declared_threshold",
      incomingContributionCount: row.incoming.length,
      incoming: row.incoming.sort((left, right) =>
        left.incomingEdgeKey.localeCompare(right.incomingEdgeKey) ||
        left.entryIndex - right.entryIndex),
    };
  }).sort((left, right) =>
    left.depth - right.depth || left.frontierKey.localeCompare(right.frontierKey));

  const contextAudits = Array.from(new Set(frontier.map((row) =>
    row.adversarialContextKey))).sort().map((adversarialContextKey) => {
    const contextRows = frontier.filter((row) =>
      row.adversarialContextKey === adversarialContextKey);
    const contextMass = contextRows.reduce((sum, row) => add(sum, rational(
      row.cumulativeProbability.numerator,
      row.cumulativeProbability.denominator,
    )), rational(0n));
    return {
      adversarialContextKey,
      frontierCount: contextRows.length,
      mass: probabilityRecord(contextMass),
    };
  });
  const core = {
    schemaVersion: WARMACHINE_ADVERSARIAL_FRONTIER_LEDGER_V1_SCHEMA,
    lowProbabilityThreshold: probabilityRecord(threshold),
    inputEntryCount: entries.length,
    mergedFrontierCount: frontier.length,
    mergedEntryCount: entries.length - frontier.length,
    inputMass: probabilityRecord(inputMass),
    groupedMass: probabilityRecord(groupedMass),
    massConserved: compare(inputMass, groupedMass) === 0,
    expandedFrontierCount: frontier.filter((row) => row.status === "expand").length,
    bypassedThresholdFrontierCount: frontier.filter((row) =>
      row.status === "bypass_threshold").length,
    prunedFrontierCount: frontier.filter((row) =>
      row.status === "pruned_low_probability").length,
    contextAudits,
    frontier,
    claimBoundary: "Probability contributions merge only at the same depth, canonical state, policy cursor, terminal/continuation suffix and adversarial decision context. Distinct owner-response alternatives never contribute mass to one another. Thresholding occurs after this exact merge; every incoming edge and pruned contribution remains in the ledger. Context totals are route ledgers, not probabilities to sum across adversarial alternatives.",
  };
  return {
    ...core,
    ledgerHash: stableGraphHash(stableGraphValue(core)),
    ok: core.massConserved,
  };
}
