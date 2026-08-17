import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";

export const WARMACHINE_ADVERSARIAL_CHANCE_EQUIVALENCE_V1_SCHEMA =
  "warmachine_adversarial_chance_equivalence_v1";

function integerString(value, fieldName) {
  const text = String(value ?? "");
  if (!/^\d+$/.test(text)) throw new Error(`${fieldName}_must_be_nonnegative_integer`);
  return String(BigInt(text));
}

function responseSemanticRow(response = {}) {
  return {
    responseKey: String(response.responseKey || ""),
    actionKey: String(response.actionKey || ""),
    choice: String(response.choice || ""),
    recipientPieceKey: String(response.recipientPieceKey || ""),
    transitionAccepted: response.transitionAccepted === true,
    reason: response.transitionAccepted === true ? "" : String(response.reason || ""),
    resultStateHash: response.transitionAccepted === true
      ? String(response.resultStateHash || "")
      : "",
    outcome: String(response.outcome || "continue"),
    outcomeReason: String(response.outcomeReason || ""),
    terminalEvents: stableGraphValue(response.terminalEvents || []),
  };
}

function responseVectorSignature(row = {}, rawOptions = {}) {
  return stableGraphValue({
    ownerSideKey: String(rawOptions.ownerSideKey || ""),
    decisionKind: String(rawOptions.decisionKind || "none"),
    responseSetComplete: rawOptions.responseSetComplete === true,
    responses: (row.responses || []).map(responseSemanticRow).sort((left, right) =>
      left.responseKey.localeCompare(right.responseKey) || left.actionKey.localeCompare(right.actionKey)),
  });
}

export function groupWarmachineAdversarialChanceClassesV1(
  preparedChanceClasses = [],
  rawOptions = {},
) {
  const prepared = Array.isArray(preparedChanceClasses) ? preparedChanceClasses : [];
  if (!prepared.length) throw new Error("adversarial_chance_equivalence_requires_classes");
  const denominators = new Set(prepared.map((row) =>
    integerString(row.chanceClass?.denominator, "chance_denominator")));
  if (denominators.size !== 1) {
    throw new Error("adversarial_chance_equivalence_requires_common_denominator");
  }
  const denominator = [...denominators][0];
  const grouped = new Map();
  let inputMassNumerator = 0n;
  for (const row of prepared) {
    const numerator = BigInt(integerString(row.chanceClass?.numerator, "chance_numerator"));
    inputMassNumerator += numerator;
    const signature = responseVectorSignature(row, rawOptions);
    const signatureHash = stableGraphHash(signature);
    const existing = grouped.get(signatureHash);
    const classEvidence = {
      chanceClassKey: String(row.chanceClass?.classKey || ""),
      numerator: String(numerator),
      denominator,
      strictRollOutcome: stableGraphValue(row.chanceClass?.strictRollOutcome || null),
      responseEvidence: stableGraphValue((row.responses || []).map((response) => ({
        responseKey: String(response.responseKey || ""),
        actionKey: String(response.actionKey || ""),
        receiptHash: String(response.receiptHash || ""),
        transitionAccepted: response.transitionAccepted === true,
        resultStateHash: String(response.resultStateHash || ""),
        reason: String(response.reason || ""),
      }))),
    };
    if (existing) {
      existing.numerator += numerator;
      existing.classes.push(row);
      existing.classEvidence.push(classEvidence);
    } else {
      grouped.set(signatureHash, {
        groupKey: `adversarial-chance-group-${signatureHash.slice(0, 24)}`,
        signatureHash,
        signature,
        numerator,
        denominator,
        representative: row,
        classes: [row],
        classEvidence: [classEvidence],
      });
    }
  }
  const groups = Array.from(grouped.values()).map((group) => ({
    ...group,
    numerator: String(group.numerator),
    classCount: group.classes.length,
    chanceClassKeys: group.classes.map((row) => String(row.chanceClass?.classKey || "")).sort(),
    classEvidence: group.classEvidence.sort((left, right) =>
      left.chanceClassKey.localeCompare(right.chanceClassKey)),
  })).sort((left, right) => left.groupKey.localeCompare(right.groupKey));
  const groupedMassNumerator = groups.reduce((sum, group) =>
    sum + BigInt(group.numerator), 0n);
  const core = {
    schemaVersion: WARMACHINE_ADVERSARIAL_CHANCE_EQUIVALENCE_V1_SCHEMA,
    ownerSideKey: String(rawOptions.ownerSideKey || ""),
    decisionKind: String(rawOptions.decisionKind || "none"),
    responseSetComplete: rawOptions.responseSetComplete === true,
    inputClassCount: prepared.length,
    equivalenceGroupCount: groups.length,
    mergedClassCount: prepared.length - groups.length,
    denominator,
    inputMassNumerator: String(inputMassNumerator),
    groupedMassNumerator: String(groupedMassNumerator),
    massConserved: inputMassNumerator === groupedMassNumerator,
    groups,
    claimBoundary: "Chance classes merge only when their complete owner-aware response vectors have identical strict acceptance, successor state hashes, terminal classifications and terminal events. Receipt evidence and original class identities remain attached but do not prevent reuse of an identical continuation.",
  };
  return {
    ...core,
    equivalenceHash: stableGraphHash(stableGraphValue({
      ...core,
      groups: groups.map(({ representative: _representative, classes: _classes, ...group }) => group),
    })),
    ok: core.massConserved,
  };
}
