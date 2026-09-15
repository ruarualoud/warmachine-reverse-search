import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";

export const WARMACHINE_TASK_LOCAL_ACTION_RULE_GUARD_V1_SCHEMA =
  "warmachine_task_local_action_rule_guard_v1";

function actionAtomKeys(action = {}) {
  const values = new Set();
  const visited = new WeakSet();
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (visited.has(value)) return;
    visited.add(value);
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (/atomkey$/i.test(key) && typeof child === "string" && child) {
        values.add(child);
      } else if (/atomkeys$/i.test(key) && Array.isArray(child)) {
        child.filter((entry) => typeof entry === "string" && entry)
          .forEach((entry) => values.add(entry));
      }
      visit(child);
    }
  };
  visit(action);
  return [...values].sort();
}

export function guardWarmachineActionWithTaskLocalRuleClosureV1(
  action = {},
  closure = null,
) {
  if (!closure) {
    const core = stableGraphValue({
      schemaVersion: WARMACHINE_TASK_LOCAL_ACTION_RULE_GUARD_V1_SCHEMA,
      taskLocalRuleClosureHash: "",
      actionAtomKeys: actionAtomKeys(action),
      unknownActionAtomKeys: [],
      unresolvedInteractionObligationKeys: [],
      unresolvedHookOrderingObligationKeys: [],
      disposition: "task_local_rule_closure_not_supplied",
      atomDependencyGuardPassed: false,
    });
    return { ...core, actionRuleGuardHash: stableGraphHash(core) };
  }
  if (closure.schemaVersion !== "warmachine_task_local_rule_closure_v1" ||
      !closure.taskLocalRuleClosureHash) {
    throw new Error("task_local_action_rule_guard_closure_invalid");
  }
  const {
    taskLocalRuleClosureHash,
    ...closureCore
  } = closure;
  if (stableGraphHash(closureCore) !== taskLocalRuleClosureHash) {
    throw new Error("task_local_action_rule_guard_closure_hash_mismatch");
  }
  const referencedAtomKeys = actionAtomKeys(action);
  const candidateAtomKeys = new Set(
    closure.rosterDependencyInventory?.candidateAtomKeys || [],
  );
  const unresolvedByAtom = new Map();
  for (const row of closure.taskAtomInteractions?.unresolvedInteractions || []) {
    if (!unresolvedByAtom.has(row.atomKey)) unresolvedByAtom.set(row.atomKey, []);
    unresolvedByAtom.get(row.atomKey).push(row.obligationKey);
  }
  const unknownActionAtomKeys = referencedAtomKeys
    .filter((atomKey) => !candidateAtomKeys.has(atomKey));
  const unresolvedInteractionObligationKeys = [...new Set(
    referencedAtomKeys.flatMap((atomKey) => unresolvedByAtom.get(atomKey) || []),
  )].sort();
  const hooksByAtom = new Map(
    (closure.taskAtomHooks?.candidateAtomHookBindings || []).map((row) => [
      String(row.atomKey || ""),
      new Set(row.hookKeys || []),
    ]),
  );
  const globallyUnresolvedHookKeys = new Set(
    (closure.taskHookConcurrency?.relevantGlobalUnresolvedGroups || [])
      .map((row) => String(row.hookKey || ""))
      .filter(Boolean),
  );
  const referencedAtomsByHook = new Map();
  for (const atomKey of referencedAtomKeys) {
    for (const hookKey of hooksByAtom.get(atomKey) || []) {
      if (!referencedAtomsByHook.has(hookKey)) {
        referencedAtomsByHook.set(hookKey, new Set());
      }
      referencedAtomsByHook.get(hookKey).add(atomKey);
    }
  }
  const unresolvedHookOrderingObligationKeys = [...referencedAtomsByHook]
    .filter(([hookKey, atomKeys]) =>
      globallyUnresolvedHookKeys.has(hookKey) && atomKeys.size > 1)
    .map(([hookKey]) => `hook:${hookKey}:multi_rule_ordering`)
    .sort();
  const atomDependencyGuardPassed =
    unknownActionAtomKeys.length === 0 &&
    unresolvedInteractionObligationKeys.length === 0 &&
    unresolvedHookOrderingObligationKeys.length === 0;
  const disposition = atomDependencyGuardPassed
    ? referencedAtomKeys.length
      ? "task_local_atom_dependencies_bound"
      : "no_atom_reference_core_only"
    : "rules_unknown";
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_TASK_LOCAL_ACTION_RULE_GUARD_V1_SCHEMA,
    taskLocalRuleClosureHash,
    actionAtomKeys: referencedAtomKeys,
    unknownActionAtomKeys,
    unresolvedInteractionObligationKeys,
    unresolvedHookOrderingObligationKeys,
    disposition,
    atomDependencyGuardPassed,
  });
  return { ...core, actionRuleGuardHash: stableGraphHash(core) };
}
