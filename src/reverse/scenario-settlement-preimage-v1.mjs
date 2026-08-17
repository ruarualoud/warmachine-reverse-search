import { stableGraphValue } from "../graph/typed-facts-v2.mjs";

export const WARMACHINE_SCENARIO_SETTLEMENT_PREIMAGE_V1_SCHEMA =
  "warmachine_scenario_settlement_preimage_v1";

function scenarioElementByKey(state = {}, elementKey = "") {
  const objective = (state.scenario?.objectives || []).find((item) =>
    item.objectiveKey === elementKey);
  if (objective) return { kind: "objective", element: objective };
  const terrain = (state.terrain || []).find((item) => item.terrainKey === elementKey);
  return terrain ? { kind: "terrain", element: terrain } : null;
}

function exactValueEqual(left, right) {
  return JSON.stringify(stableGraphValue(left)) === JSON.stringify(stableGraphValue(right));
}

function boundedDifferences(expected, observed, path = "value", rows = []) {
  if (rows.length >= 24 || Object.is(expected, observed)) return rows;
  if (expected && observed && typeof expected === "object" && typeof observed === "object") {
    const keys = [...new Set([...Object.keys(expected), ...Object.keys(observed)])].sort();
    for (const key of keys) {
      boundedDifferences(expected[key], observed[key], `${path}.${key}`, rows);
      if (rows.length >= 24) break;
    }
    return rows;
  }
  rows.push(stableGraphValue({
    path,
    expected: expected === undefined ? null : expected,
    observed: observed === undefined ? null : observed,
  }));
  return rows;
}

function restoreIdentityCollectionPreimage(state = {}, collectionKey = "", identityField = "",
  changes = []) {
  const rows = Array.isArray(state[collectionKey]) ? state[collectionKey] : [];
  for (const change of changes) {
    const index = rows.findIndex((row) =>
      String(row?.[identityField] || "") === String(change.identityKey || ""));
    if (change.afterPresent === true) {
      if (index < 0 || !exactValueEqual(rows[index], change.after)) return false;
    } else if (index >= 0) {
      return false;
    }
  }
  const removals = changes.filter((change) =>
    change.beforePresent !== true && change.afterPresent === true)
    .sort((left, right) => Number(right.afterIndex) - Number(left.afterIndex));
  for (const change of removals) {
    const index = rows.findIndex((row) =>
      String(row?.[identityField] || "") === String(change.identityKey || ""));
    rows.splice(index, 1);
  }
  for (const change of changes.filter((entry) =>
    entry.beforePresent === true && entry.afterPresent === true)) {
    const index = rows.findIndex((row) =>
      String(row?.[identityField] || "") === String(change.identityKey || ""));
    rows[index] = structuredClone(change.before);
  }
  const insertions = changes.filter((change) =>
    change.beforePresent === true && change.afterPresent !== true)
    .sort((left, right) => Number(left.beforeIndex) - Number(right.beforeIndex));
  for (const change of insertions) {
    rows.splice(Math.max(0, Number(change.beforeIndex || 0)), 0,
      structuredClone(change.before));
  }
  state[collectionKey] = rows;
  return true;
}

function identityCollectionDifferences(state = {}, collectionKey = "", identityField = "",
  changes = []) {
  const rows = Array.isArray(state[collectionKey]) ? state[collectionKey] : [];
  const differences = [];
  for (const change of changes) {
    const current = rows.find((row) =>
      String(row?.[identityField] || "") === String(change.identityKey || ""));
    if (change.afterPresent === true && !exactValueEqual(current, change.after)) {
      boundedDifferences(
        change.after,
        current,
        `${collectionKey}.${change.identityKey}`,
        differences,
      );
    } else if (change.afterPresent !== true && current) {
      differences.push({
        path: `${collectionKey}.${change.identityKey}`,
        expected: null,
        observed: current,
      });
    }
    if (differences.length >= 24) break;
  }
  return differences;
}

function restoreHighStakesExternalStatePreimage(state = {}, preimage = null, options = {}) {
  if (preimage?.schemaVersion !==
      "steamroller_2026_high_stakes_external_state_preimage_v1" ||
      preimage.exactWithinStrictTransition !== true) {
    return { ok: false, reason: "high_stakes_external_preimage_contract_missing" };
  }
  const restoredPostSettlementRuntimePieceKeys = [];
  if (options.postSettlementActivationResetApplied === true) {
    for (const change of preimage.changedPieces || []) {
      if (change.afterPresent !== true || !change.after) continue;
      const piece = (state.pieces || []).find((candidate) =>
        candidate.pieceKey === change.identityKey);
      if (!piece) continue;
      let restored = false;
      for (const key of ["activated", "activationKey"]) {
        if (!Object.hasOwn(change.after, key)) continue;
        piece[key] = structuredClone(change.after[key]);
        restored = true;
      }
      if (restored) restoredPostSettlementRuntimePieceKeys.push(change.identityKey);
    }
  }
  for (const change of preimage.changedTopLevel || []) {
    const present = Object.hasOwn(state, change.key);
    if (change.afterPresent === true) {
      if (!present || !exactValueEqual(state[change.key], change.after)) {
        return {
          ok: false,
          reason: "high_stakes_external_preimage_state_mismatch",
          differences: boundedDifferences(
            change.after,
            state[change.key],
            `state.${change.key}`,
          ),
        };
      }
    } else if (present) {
      return {
        ok: false,
        reason: "high_stakes_external_preimage_state_mismatch",
        differences: [{ path: `state.${change.key}`, expected: null, observed: state[change.key] }],
      };
    }
  }
  const collectionDifferences = [
    ...identityCollectionDifferences(
      state,
      "pieces",
      "pieceKey",
      preimage.changedPieces || [],
    ),
    ...identityCollectionDifferences(
      state,
      "terrain",
      "terrainKey",
      preimage.changedTerrain || [],
    ),
  ].slice(0, 24);
  if (collectionDifferences.length) {
    return {
      ok: false,
      reason: "high_stakes_external_preimage_state_mismatch",
      differences: collectionDifferences,
    };
  }
  if (!restoreIdentityCollectionPreimage(
    state,
    "pieces",
    "pieceKey",
    preimage.changedPieces || [],
  ) || !restoreIdentityCollectionPreimage(
    state,
    "terrain",
    "terrainKey",
    preimage.changedTerrain || [],
  )) {
    return { ok: false, reason: "high_stakes_external_preimage_state_mismatch" };
  }
  for (const change of preimage.changedTopLevel || []) {
    if (change.beforePresent === true) state[change.key] = structuredClone(change.before);
    else delete state[change.key];
  }
  return {
    ok: true,
    changedPieceCount: (preimage.changedPieces || []).length,
    changedTerrainCount: (preimage.changedTerrain || []).length,
    changedTopLevelCount: (preimage.changedTopLevel || []).length,
    restoredPostSettlementRuntimePieceKeys:
      restoredPostSettlementRuntimePieceKeys.sort(),
  };
}

function gcd(left, right) {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b) [a, b] = [b, a % b];
  return a || 1n;
}

function probabilityRecord(numerator, denominator) {
  const divisor = gcd(numerator, denominator);
  const reducedNumerator = numerator / divisor;
  const reducedDenominator = denominator / divisor;
  return {
    numerator: String(reducedNumerator),
    denominator: String(reducedDenominator),
    decimal: Number(reducedNumerator) / Number(reducedDenominator),
  };
}

export function restoreWarmachineScenarioSettlementPreimageV1(state = {}, witness = null) {
  const events = witness?.scenarioMutationEvents || [];
  const restored = [];
  const unresolvedReasons = [];
  const unresolvedEvidence = [];
  let chanceNumerator = 1n;
  let chanceDenominator = 1n;
  const highStakesDetonationsByTargetKey = new Map(events
    .filter((event) => event.eventType === "high_stakes_element_detonated")
    .map((event) => [String(event.targetKey || ""), event]));
  const restoredHighStakesDamageKeys = new Set();
  if (!witness) return { restored, unresolvedReasons };
  if (witness.exactWithinMaterializedRoot !== true || !witness.sourceReceiptHash) {
    return {
      restored,
      unresolvedReasons: ["scenario_settlement_inverse_witness_not_receipt_bound"],
    };
  }
  const damageRestorations = new Map();
  const damageEvents = events.filter((event) =>
    event.eventType === "high_stakes_magical_blast_damage");
  for (const event of [...damageEvents].reverse()) {
    const targetIndex = (state.pieces || []).findIndex((piece) =>
      piece.pieceKey === event.targetPieceKey);
    const target = state.pieces?.[targetIndex];
    const supportedScope = [
      "damage_only_exact_v1",
      "target_state_exact_v1",
      "target_and_external_state_exact_v1",
    ].includes(event.inverseMutationScope);
    if (!supportedScope) {
      unresolvedReasons.push("high_stakes_blast_damage_lifecycle_inverse_not_implemented");
      unresolvedEvidence.push({
        reason: "high_stakes_blast_damage_lifecycle_inverse_not_implemented",
        targetPieceKey: event.targetPieceKey || "",
        inverseMutationScope: event.inverseMutationScope || "",
      });
      continue;
    }
    const damageOnly = event.inverseMutationScope === "damage_only_exact_v1";
    const restoredPostSettlementRuntimeFields = [];
    if (!damageOnly && witness.postSettlementActivationResetApplied === true && target &&
        event.targetStateAfter) {
      for (const key of ["activated", "activationKey"]) {
        if (!Object.hasOwn(event.targetStateAfter, key)) continue;
        target[key] = structuredClone(event.targetStateAfter[key]);
        restoredPostSettlementRuntimeFields.push(key);
      }
    }
    const targetMatches = damageOnly
      ? target && event.damageStateBefore && event.damageStateAfter &&
        exactValueEqual(target.damage || {}, event.damageStateAfter)
      : target && event.targetStateBefore && event.targetStateAfter &&
        exactValueEqual(target, event.targetStateAfter);
    if (!targetMatches) {
      unresolvedReasons.push("high_stakes_blast_damage_inverse_state_mismatch");
      unresolvedEvidence.push({
        reason: "high_stakes_blast_damage_inverse_state_mismatch",
        targetPieceKey: event.targetPieceKey || "",
        inverseMutationScope: event.inverseMutationScope || "",
        differences: boundedDifferences(
          damageOnly ? event.damageStateAfter : event.targetStateAfter,
          damageOnly ? target?.damage : target,
          "target",
        ),
      });
      continue;
    }
    const externalRestoration = event.inverseMutationScope ===
        "target_and_external_state_exact_v1"
      ? restoreHighStakesExternalStatePreimage(state, event.externalStatePreimage, {
        postSettlementActivationResetApplied:
          witness.postSettlementActivationResetApplied === true,
      })
      : { ok: true, changedPieceCount: 0, changedTerrainCount: 0, changedTopLevelCount: 0 };
    if (!externalRestoration.ok) {
      unresolvedReasons.push(externalRestoration.reason);
      unresolvedEvidence.push({
        reason: externalRestoration.reason,
        targetPieceKey: event.targetPieceKey || "",
        inverseMutationScope: event.inverseMutationScope || "",
        differences: externalRestoration.differences || [],
      });
      continue;
    }
    if (damageOnly) {
      target.damage = structuredClone(event.damageStateBefore);
    } else {
      const restoredTargetIndex = (state.pieces || []).findIndex((piece) =>
        piece.pieceKey === event.targetPieceKey);
      if (restoredTargetIndex < 0) {
        unresolvedReasons.push("high_stakes_blast_damage_inverse_target_missing_after_external_restore");
        unresolvedEvidence.push({
          reason: "high_stakes_blast_damage_inverse_target_missing_after_external_restore",
          targetPieceKey: event.targetPieceKey || "",
          inverseMutationScope: event.inverseMutationScope || "",
        });
        continue;
      }
      state.pieces[restoredTargetIndex] = structuredClone(event.targetStateBefore);
    }
    const restorationKey = `${String(event.targetKey || "")}:${String(event.targetPieceKey || "")}`;
    restoredHighStakesDamageKeys.add(restorationKey);
    chanceDenominator *= 6n ** BigInt(Math.max(0, Number(event.damageDiceCount || 0)));
    damageRestorations.set(event, {
      eventType: event.eventType,
      targetKey: event.targetKey,
      targetPieceKey: event.targetPieceKey,
      damage: event.damage,
      boxesRemainingBefore: event.boxesRemainingBefore,
      boxesRemainingAfter: event.boxesRemainingAfter,
      inverseMutationScope: event.inverseMutationScope,
      externalRestoration,
      restoredPostSettlementRuntimeFields,
    });
  }
  for (const event of events) {
    if (event.eventType === "high_stakes_countdown_removed") {
      const target = scenarioElementByKey(state, event.targetKey);
      if (!target || Number(target.element.countdownTokens) !== Number(event.countdownAfter)) {
        unresolvedReasons.push("high_stakes_countdown_inverse_state_mismatch");
        continue;
      }
      target.element.countdownTokens = Number(event.countdownBefore);
      if (Number(event.fuseRoll) >= 1 && Number(event.fuseRoll) <= 3) {
        chanceDenominator *= 3n;
      }
      if (Number(event.countdownBefore) > 0 && Number(event.countdownAfter) === 0 &&
          !highStakesDetonationsByTargetKey.has(String(event.targetKey || ""))) {
        target.element.countdownDetonated = false;
      }
      restored.push({
        eventType: event.eventType,
        targetKey: event.targetKey,
        countdownBefore: event.countdownBefore,
        countdownAfter: event.countdownAfter,
      });
      continue;
    }
    if (event.eventType === "wolves_objective_progressed") {
      const target = scenarioElementByKey(state, event.objectiveKey);
      if (!target || Number(target.element.progressTokens || 0) !==
          Number(event.progressAfter || 0)) {
        unresolvedReasons.push("wolves_progress_inverse_state_mismatch");
        continue;
      }
      target.element.progressTokens = Number(event.progressBefore || 0);
      if (event.moved && event.positionBefore) {
        target.element.xIn = Number(event.positionBefore.xIn);
        target.element.yIn = Number(event.positionBefore.yIn);
      }
      restored.push({
        eventType: event.eventType,
        objectiveKey: event.objectiveKey,
        progressBefore: event.progressBefore,
        progressAfter: event.progressAfter,
        moved: event.moved === true,
      });
      continue;
    }
    if (event.eventType === "wolves_third_token_goal_checked") {
      state.scenario.scenarioState ||= {};
      state.scenario.scenarioState.wolvesProgressGoalChecked = false;
      restored.push({ eventType: event.eventType, restoredChecked: false });
      continue;
    }
    if (event.eventType === "payload_objective_moved") {
      const target = scenarioElementByKey(state, event.objectiveKey);
      if (!target || !event.positionBefore) {
        unresolvedReasons.push("payload_objective_inverse_state_mismatch");
        continue;
      }
      target.element.xIn = Number(event.positionBefore.xIn);
      target.element.yIn = Number(event.positionBefore.yIn);
      if (event.delivered) target.element.active = true;
      if (event.hauledPieceKey && event.hauledFrom) {
        const hauled = (state.pieces || []).find((piece) =>
          piece.pieceKey === event.hauledPieceKey);
        if (!hauled) {
          unresolvedReasons.push("payload_hauled_piece_inverse_missing");
        } else {
          hauled.position = {
            xIn: Number(event.hauledFrom.xIn),
            yIn: Number(event.hauledFrom.yIn),
          };
        }
      }
      restored.push({
        eventType: event.eventType,
        objectiveKey: event.objectiveKey,
        delivered: event.delivered === true,
        hauledPieceKey: event.hauledPieceKey || "",
      });
      continue;
    }
    if (event.eventType === "high_stakes_magical_blast_damage") {
      const restoration = damageRestorations.get(event);
      if (restoration) restored.push(restoration);
      continue;
    }
    if (event.eventType === "high_stakes_element_detonated") {
      const damageRows = Array.isArray(event.damageRows) ? event.damageRows : null;
      const damageEvents = events.filter((candidate) =>
        candidate.eventType === "high_stakes_magical_blast_damage" &&
        String(candidate.targetKey || "") === String(event.targetKey || ""));
      if (!damageRows) {
        unresolvedReasons.push("high_stakes_blast_damage_lifecycle_inverse_not_implemented");
        continue;
      }
      if (damageRows.length !== damageEvents.length || damageRows.some((row) =>
        !restoredHighStakesDamageKeys.has(
          `${String(event.targetKey || "")}:${String(row.targetPieceKey || "")}`,
        ))) {
        unresolvedReasons.push("high_stakes_blast_damage_lifecycle_inverse_not_implemented");
        continue;
      }
      const target = scenarioElementByKey(state, event.targetKey);
      if (!target || target.element.countdownDetonated !== true) {
        unresolvedReasons.push("high_stakes_empty_detonation_inverse_state_mismatch");
        continue;
      }
      const countdownEvent = events.find((candidate) =>
        candidate.eventType === "high_stakes_countdown_removed" &&
        String(candidate.targetKey || "") === String(event.targetKey || ""));
      if (!countdownEvent || Number(countdownEvent.countdownAfter) !== 0 ||
          Number(countdownEvent.countdownBefore) <= 0 ||
          highStakesDetonationsByTargetKey.get(String(event.targetKey || "")) !== event) {
        unresolvedReasons.push("high_stakes_empty_detonation_inverse_witness_incomplete");
        continue;
      }
      target.element.countdownDetonated = false;
      restored.push({
        eventType: event.eventType,
        targetKey: event.targetKey,
        damageTargetCount: damageRows.length,
        restoredCountdownDetonated: false,
      });
      continue;
    }
    unresolvedReasons.push(`scenario_settlement_inverse_event_not_implemented:${event.eventType}`);
  }
  return {
    schemaVersion: WARMACHINE_SCENARIO_SETTLEMENT_PREIMAGE_V1_SCHEMA,
    restored: stableGraphValue(restored),
    unresolvedReasons: [...new Set(unresolvedReasons)].sort(),
    chanceProbability: probabilityRecord(chanceNumerator, chanceDenominator),
    unresolvedEvidence: stableGraphValue(unresolvedEvidence),
  };
}
