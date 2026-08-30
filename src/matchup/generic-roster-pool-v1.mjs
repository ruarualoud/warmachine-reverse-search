import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";

export const WARMACHINE_GENERIC_ROSTER_POOL_V1_SCHEMA =
  "warmachine_generic_roster_pool_v1";

export const WARMACHINE_GENERIC_ROSTER_POOL_V1_SOURCE_HASH = createHash("sha256")
  .update(readFileSync(new URL(import.meta.url)))
  .digest("hex");

export const WARMACHINE_ROSTER_CONSTRUCTION_GOAL_PROFILES_V1 = Object.freeze([
  Object.freeze({
    goalProfileKey: "assassination",
    label: "Assassination route",
    weights: Object.freeze({
      threatReach: 0.22,
      attackPotential: 0.12,
      highPower: 0.18,
      antiTough: 0.08,
      control: 0.1,
      mobility: 0.12,
      resourceCapacity: 0.1,
      ranged: 0.08,
    }),
  }),
  Object.freeze({
    goalProfileKey: "scenario_score",
    label: "Steamroller score route",
    weights: Object.freeze({
      models: 0.2,
      units: 0.14,
      scenario: 0.18,
      control: 0.14,
      mobility: 0.14,
      defense: 0.12,
      recursion: 0.08,
    }),
  }),
  Object.freeze({
    goalProfileKey: "swarm_attrition_exchange",
    label: "Swarm attrition and exchange",
    weights: Object.freeze({
      attackPotential: 0.18,
      spray: 0.16,
      aoe: 0.06,
      antiTough: 0.18,
      chainAttack: 0.16,
      ranged: 0.08,
      recursion: 0.08,
      defense: 0.1,
    }),
  }),
  Object.freeze({
    goalProfileKey: "position_control",
    label: "Position control and denial",
    weights: Object.freeze({
      control: 0.24,
      scenario: 0.14,
      mobility: 0.18,
      threatReach: 0.12,
      models: 0.1,
      defense: 0.12,
      ranged: 0.1,
    }),
  }),
]);

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function slug(value = "roster") {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 80) || "roster";
}

function allowance(card = {}, pointLimit = 100) {
  const raw = String(card.fieldAllowance || "").trim().toUpperCase();
  if (raw === "C" || raw === "L") return 1;
  if (!raw || raw === "U") return Math.max(1, pointLimit);
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Math.max(1, pointLimit);
}

function slotCount(slot = {}) {
  return Math.max(1, Number.parseInt(slot.count || slot.selectionCount || 1, 10) || 1);
}

function optionVariants(card = {}) {
  const slots = card.optionSlots || [];
  if (!slots.length) {
    return [{
      variantKey: "base",
      selections: {},
      choices: [],
      optionPoints: 0,
      optionSummary: "",
    }];
  }
  let variants = [{ selections: {}, choices: [], optionPoints: 0, summary: [] }];
  for (const slot of slots) {
    for (let index = 0; index < slotCount(slot); index += 1) {
      variants = variants.flatMap((variant) => (slot.choices || []).map((choice) => ({
        selections: {
          ...variant.selections,
          [slot.slotKey]: [...(variant.selections[slot.slotKey] || []), choice.id],
        },
        choices: [...variant.choices, choice],
        optionPoints: variant.optionPoints + numeric(choice.pointCostNumber),
        summary: [...variant.summary, `${slot.name}: ${choice.name}`],
      })));
    }
  }
  return variants.map((variant) => ({
    ...variant,
    variantKey: slug(variant.summary.join("__")),
    optionSummary: variant.summary.join("; "),
  }));
}

export function enumerateWarmachineCardLoadoutVariantsV1(card = {}) {
  return stableGraphValue(optionVariants(card));
}

function cardMatchesConstraint(card = {}, constraint = {}) {
  if (constraint.cardId && String(card.id || "") === String(constraint.cardId)) return true;
  return Boolean(constraint.cardName && String(card.name || "") === String(constraint.cardName));
}

function optionSelectionsEqual(left = {}, right = {}) {
  return stableGraphHash(left || {}) === stableGraphHash(right || {});
}

function loadoutVariantAllowed(variant = {}, constraint = null) {
  if (!constraint) return true;
  if ((constraint.allowedLoadouts || []).length &&
      !(constraint.allowedLoadouts || []).some((loadout) =>
        optionSelectionsEqual(variant.selections, loadout.optionSelections))) {
    return false;
  }
  for (const [slotKey, choiceIds] of Object.entries(
    constraint.allowedChoiceIdsBySlot || {},
  )) {
    if (choiceIds.length && !(variant.selections?.[slotKey] || []).every((choiceId) =>
      choiceIds.includes(choiceId))) return false;
  }
  for (const [slotKey, choiceIds] of Object.entries(
    constraint.excludedChoiceIdsBySlot || {},
  )) {
    if ((variant.selections?.[slotKey] || []).some((choiceId) =>
      choiceIds.includes(choiceId))) return false;
  }
  return true;
}

function structuralFeatures(card = {}, choices = [], Builder = {}) {
  const model = (card.models || [])[0] || {};
  const type = String(card.cardTypeName || "").toLowerCase();
  const abilities = [
    ...(card.cardAbilities || []),
    ...(card.models || []).flatMap((row) => row.abilities || []),
    ...choices.flatMap((choice) => [
      ...(choice.grantedCardAbilities || []),
      ...(choice.grantedModelAbilities || []),
    ]),
  ];
  const weapons = [
    ...(card.models || []).flatMap((row) => row.weapons || []),
    ...choices.flatMap((choice) => choice.grantedWeapons || []),
  ];
  const weaponAbilities = weapons.flatMap((weapon) => weapon.abilities || []);
  const advantages = (card.models || []).flatMap((row) => row.advantages || []);
  const text = [...abilities, ...weaponAbilities, ...(card.spells || [])].map((ability) =>
    `${ability.name || ""} ${ability.description || ""}`).join(" ");
  const interactionText = `${text} ${advantages.join(" ")}`;
  const speed = numeric(model.stats?.spd, 5);
  const weaponCount = weapons.reduce((sum, weapon) =>
    sum + Math.max(1, numeric(weapon.count, 1)), 0);
  const maximumPower = weapons.reduce((best, weapon) =>
    Math.max(best, numeric(weapon.stats?.pow || weapon.stats?.pPlusS, 0)), 0);
  const maximumRange = weapons.reduce((best, weapon) => {
    const rawRange = String(weapon.stats?.rng || "");
    const parsed = numeric(rawRange.match(/\d+(?:\.\d+)?/)?.[0], 0);
    return Math.max(best, parsed);
  }, 0);
  const resourceCapacity = numeric(model.stats?.fury, 0) ||
    (/warjack/i.test(type) ? 3 : 0);
  return {
    models: /weapon attachment/.test(type)
      ? 0
      : Builder.cardPhysicalModelSpecs(card).length,
    units: /unit/.test(type) && !/attachment/.test(type) ? 1 : 0,
    cohorts: /warjack|warbeast|monstrosity|colossal|gargantuan/.test(type) ? 1 : 0,
    solos: /solo/.test(type) ? 1 : 0,
    attachments: /attachment/.test(type) ? 1 : 0,
    ranged: weapons.filter((weapon) => /ranged/i.test(weapon.type || "")).length,
    recursion: /return one|return d3|put.+into play|revive|replace/i.test(interactionText) ? 1 : 0,
    control: /cannot|stationary|knocked down|push|place enemy|inconsequential/i.test(interactionText) ? 1 : 0,
    mobility: speed >= 7 || /flight|pathfinder|reposition|advance.+after|apparition/i.test(interactionText)
      ? 1
      : 0,
    attackPotential: weaponCount,
    spray: weapons.filter((weapon) => /sp\s*\d+/i.test(weapon.stats?.rng || "")).length,
    aoe: weapons.filter((weapon) => {
      const aoe = String(weapon.stats?.aoe || "");
      return aoe && aoe !== "-";
    }).length + (card.spells || []).filter((spell) => {
      const aoe = String(spell.aoe || "");
      return aoe && !/^[-c]/i.test(aoe);
    }).length,
    antiTough: /grievous wounds|decapitation|cannot make a tough roll|when.+boxes.+remove.+from play|feast/i.test(interactionText)
      ? 1
      : 0,
    chainAttack: /cleave|killing spree|additional.+attack|ricochet|vengeance|retaliatory strike/i.test(interactionText)
      ? 1
      : 0,
    scenario: /scenario|score|contest|secure|victory point|inconsequential/i.test(interactionText) ? 1 : 0,
    defense: /arm|def|concealment|stealth|resistance|shield guard|tough|no damage/i.test(interactionText)
      ? 1
      : 0,
    highPower: maximumPower >= 15 ? 1 : maximumPower >= 12 ? 0.5 : 0,
    threatReach: speed + maximumRange,
    resourceCapacity,
    stealthBypass: /true sight|eyeless sight|ignore stealth/i.test(interactionText) ? 1 : 0,
    screenBypass: /arcing fire|spray|ignore intervening models|place enemy|push/i.test(interactionText)
      ? 1
      : 0,
    pathing: /flight|pathfinder|incorporeal|ghostly/i.test(interactionText) ? 1 : 0,
  };
}

function addFeatures(left = {}, right = {}) {
  return Object.fromEntries(Object.keys({ ...left, ...right }).sort().map((key) => [
    key,
    key === "threatReach"
      ? Math.max(numeric(left[key]), numeric(right[key]))
      : numeric(left[key]) + numeric(right[key]),
  ]));
}

function featureBucket(features = {}) {
  const bin = (value, low, high) => value >= high ? "h" : value >= low ? "m" : "l";
  return [
    `u${bin(features.units, 2, 5)}`,
    `c${bin(features.cohorts, 2, 4)}`,
    `m${bin(features.models, 12, 28)}`,
    `r${bin(features.ranged, 2, 5)}`,
    `x${bin(features.recursion, 1, 3)}`,
    `d${bin(features.control, 1, 3)}`,
    `v${bin(features.mobility, 2, 5)}`,
  ].join("|");
}

function featureDiversityPriority(features = {}) {
  return numeric(features.models) * 0.01 + numeric(features.units) * 0.11 +
    numeric(features.cohorts) * 0.13 + numeric(features.ranged) * 0.07 +
    numeric(features.recursion) * 0.17 + numeric(features.control) * 0.19 +
    numeric(features.mobility) * 0.09;
}

function goalProfileScore(features = {}, profile = {}) {
  return Object.entries(profile.weights || {}).reduce((sum, [key, weight]) =>
    sum + numeric(features[key]) * numeric(weight), 0);
}

function goalCapabilityBucket(features = {}, profile = {}) {
  const keys = Object.keys(profile.weights || {}).sort();
  const band = (value) => value >= 8 ? "h" : value >= 3 ? "m" : value > 0 ? "l" : "z";
  return keys.map((key) => `${key}:${band(numeric(features[key]))}`).join("|");
}

function roundRobinUnique(rowSets = [], maximumRows = 1) {
  const selected = [];
  const identities = new Set();
  for (let cursor = 0; selected.length < maximumRows; cursor += 1) {
    let added = false;
    for (const rows of rowSets) {
      const row = rows[cursor];
      if (!row) continue;
      const identity = String(row.key || row.rosterKey || stateSignature(row));
      if (identities.has(identity)) continue;
      identities.add(identity);
      selected.push(row);
      added = true;
      if (selected.length >= maximumRows) break;
    }
    if (!added) break;
  }
  return selected;
}

function retainGoalBucketState(bucketRows = [], state = {}, score = 0, maximumRows = 1) {
  const signature = stateSignature(state);
  const existing = bucketRows.findIndex((row) => row.signature === signature);
  if (existing >= 0) return;
  bucketRows.push({ state, score, signature });
  bucketRows.sort((left, right) => right.score - left.score ||
    left.signature.localeCompare(right.signature));
  if (bucketRows.length > maximumRows) bucketRows.length = maximumRows;
}

function packagePool(data = {}, army = {}, pointLimit = 100, rawOptions = {}) {
  const Builder = rawOptions.Builder;
  if (!Builder?.cardPhysicalModelSpecs ||
      !Builder?.effectivePhysicalModelsByEntry ||
      !Builder?.validateForceForEncounter) {
    throw new Error("warmachine_force_builder_strict_construction_contract_missing");
  }
  const cardsById = new Map((data.cards || []).map((card) => [card.id, card]));
  const excludedCardIds = new Set((rawOptions.excludedCardIds || []).map(String));
  const excludedCardNames = new Set((rawOptions.excludedCardNames || []).map(String));
  const excludedCardTypeNames = new Set(
    (rawOptions.excludedCardTypeNames || []).map(String),
  );
  const fixedRowsByCardId = new Map();
  for (const row of (rawOptions.fixedCards || []).filter((entry) => entry.card?.id)) {
    const cardId = String(row.card.id);
    const current = fixedRowsByCardId.get(cardId) || {
      count: 0,
      maximumCount: 0,
      hasUnboundedMaximum: false,
    };
    current.count += numeric(row.count);
    if (row.maximumCount == null) current.hasUnboundedMaximum = true;
    else current.maximumCount += numeric(row.maximumCount);
    fixedRowsByCardId.set(cardId, current);
  }
  const loadoutConstraints = rawOptions.loadoutConstraints || [];
  const packages = [];
  const audit = {
    armyCardCount: (army.cardIds || []).length,
    primaryLeaderExcludedCount: 0,
    nonRosterCardTypeExcludedCount: 0,
    taskExcludedCardCount: 0,
    fixedCompleteExcludedCardCount: 0,
    fixedMaximumReachedCardCount: 0,
    rawLoadoutVariantCount: 0,
    loadoutConstraintRejectedVariantCount: 0,
    nonPositiveOrOverLimitVariantCount: 0,
    enumeratedPackageVariantCount: 0,
  };
  for (const cardId of army.cardIds || []) {
    const card = cardsById.get(cardId);
    if (!card) continue;
    if (/warcaster|warlock/i.test(card.cardTypeName || "")) {
      audit.primaryLeaderExcludedCount += 1;
      continue;
    }
    if (["Army", "Defense"].includes(String(card.cardTypeName || ""))) {
      audit.nonRosterCardTypeExcludedCount += 1;
      continue;
    }
    if (excludedCardIds.has(String(card.id)) || excludedCardNames.has(String(card.name)) ||
        excludedCardTypeNames.has(String(card.cardTypeName || ""))) {
      audit.taskExcludedCardCount += 1;
      continue;
    }
    if (rawOptions.fixedComplete === true) {
      audit.fixedCompleteExcludedCardCount += 1;
      continue;
    }
    const fixedRow = fixedRowsByCardId.get(String(card.id));
    const fixedCount = numeric(fixedRow?.count);
    const maximumByTask = !fixedRow || fixedRow.hasUnboundedMaximum
      ? Number.POSITIVE_INFINITY
      : numeric(fixedRow.maximumCount);
    const remainingAllowance = Math.max(0, Math.min(
      allowance(card, pointLimit),
      maximumByTask,
    ) - fixedCount);
    if (remainingAllowance <= 0) {
      audit.fixedMaximumReachedCardCount += 1;
      continue;
    }
    const loadoutConstraint = loadoutConstraints.find((constraint) =>
      cardMatchesConstraint(card, constraint));
    const variants = optionVariants(card);
    audit.rawLoadoutVariantCount += variants.length;
    for (const variant of variants) {
      if (!loadoutVariantAllowed(variant, loadoutConstraint)) {
        audit.loadoutConstraintRejectedVariantCount += 1;
        continue;
      }
      const cost = numeric(card.pointCostNumber) + variant.optionPoints;
      if (cost <= 0 || cost > pointLimit) {
        audit.nonPositiveOrOverLimitVariantCount += 1;
        continue;
      }
      packages.push({
        packageKey: `${card.id}:${variant.variantKey}`,
        cardId: card.id,
        cardName: card.name,
        cardTypeName: card.cardTypeName,
        cost,
        maximumCopies: Math.min(remainingAllowance, Math.floor(pointLimit / cost)),
        optionSelections: variant.selections,
        optionSummary: variant.optionSummary,
        features: structuralFeatures(card, variant.choices, Builder),
      });
    }
  }
  const sorted = packages.sort((left, right) => left.cost - right.cost ||
    left.cardName.localeCompare(right.cardName) || left.packageKey.localeCompare(right.packageKey));
  audit.enumeratedPackageVariantCount = sorted.length;
  return { packages: sorted, audit: stableGraphValue(audit) };
}

function stateSignature(state = {}) {
  return (state.picks || []).map((pick) => pick.packageKey).sort().join("|");
}

function retainPointSearchStates(states = [], raw = {}) {
  const {
    goalProfiles = [],
    maximumStatesPerCost = 1,
    maximumPerBucket = 1,
  } = raw;
  const unique = [...new Map(states.map((state) => [stateSignature(state), state])).values()];
  const structuralBuckets = new Map();
  unique.sort((left, right) =>
    featureDiversityPriority(right.features) - featureDiversityPriority(left.features) ||
    stateSignature(left).localeCompare(stateSignature(right)));
  for (const state of unique) {
    const key = featureBucket(state.features);
    if (!structuralBuckets.has(key)) structuralBuckets.set(key, []);
    if (structuralBuckets.get(key).length < maximumPerBucket) {
      structuralBuckets.get(key).push(state);
    }
  }
  const goalBucketSets = goalProfiles.map(() => new Map());
  for (const state of unique) {
    for (const [profileIndex, profile] of goalProfiles.entries()) {
      const goalBuckets = goalBucketSets[profileIndex];
      const bucketKey = goalCapabilityBucket(state.features, profile);
      if (!goalBuckets.has(bucketKey)) goalBuckets.set(bucketKey, []);
      retainGoalBucketState(
        goalBuckets.get(bucketKey),
        state,
        goalProfileScore(state.features, profile),
        maximumPerBucket,
      );
    }
  }
  const goalRows = goalBucketSets.map((goalBuckets) =>
    [...goalBuckets.values()].flat().map((row) => row.state));
  const retained = roundRobinUnique(
    [[...structuralBuckets.values()].flat(), ...goalRows],
    maximumStatesPerCost,
  );
  return {
    retained,
    prunedCount: Math.max(0, states.length - retained.length),
  };
}

function searchExactPointPackages(packages = [], pointTarget = 0, rawOptions = {}) {
  const maximumStatesPerCost = Math.max(16, Math.floor(numeric(
    rawOptions.maximumStatesPerCost,
    480,
  )));
  const maximumPerBucket = Math.max(1, Math.floor(numeric(rawOptions.maximumPerBucket, 2)));
  const goalProfiles = rawOptions.goalProfiles?.length
    ? rawOptions.goalProfiles
    : WARMACHINE_ROSTER_CONSTRUCTION_GOAL_PROFILES_V1;
  const maximumPendingStatesPerCost = Math.max(
    maximumStatesPerCost,
    Math.floor(numeric(
      rawOptions.maximumPendingStatesPerCost,
      maximumStatesPerCost * Math.max(8, goalProfiles.length * 2),
    )),
  );
  const byCost = Array.from({ length: pointTarget + 1 }, () => []);
  byCost[0].push({ picks: [], countsByCardId: {}, features: {}, lastPackageIndex: 0 });
  let generatedStateCount = 0;
  let budgetPrunedStateCount = 0;
  for (let cost = 0; cost <= pointTarget; cost += 1) {
    const costRetention = retainPointSearchStates(byCost[cost], {
      goalProfiles,
      maximumStatesPerCost,
      maximumPerBucket,
    });
    const retained = costRetention.retained;
    budgetPrunedStateCount += costRetention.prunedCount;
    byCost[cost] = retained;
    if (cost === pointTarget) continue;
    for (const state of retained) {
      for (let packageIndex = state.lastPackageIndex;
        packageIndex < packages.length;
        packageIndex += 1) {
        const item = packages[packageIndex];
        const nextCost = cost + item.cost;
        if (nextCost > pointTarget) continue;
        const currentCount = numeric(state.countsByCardId[item.cardId]);
        if (currentCount >= item.maximumCopies) continue;
        generatedStateCount += 1;
        byCost[nextCost].push({
          picks: [...state.picks, item],
          countsByCardId: { ...state.countsByCardId, [item.cardId]: currentCount + 1 },
          features: addFeatures(state.features, item.features),
          lastPackageIndex: packageIndex,
        });
        if (byCost[nextCost].length >= maximumPendingStatesPerCost) {
          const pendingRetention = retainPointSearchStates(byCost[nextCost], {
            goalProfiles,
            maximumStatesPerCost,
            maximumPerBucket,
          });
          byCost[nextCost] = pendingRetention.retained;
          budgetPrunedStateCount += pendingRetention.prunedCount;
        }
      }
    }
  }
  return {
    exactStates: byCost[pointTarget].map((state) => ({
      ...state,
      constructionGoalScores: Object.fromEntries(goalProfiles.map((profile) => [
        profile.goalProfileKey,
        goalProfileScore(state.features, profile),
      ])),
    })),
    generatedStateCount,
    budgetPrunedStateCount,
    goalProfiles,
    maximumPendingStatesPerCost,
  };
}

function addCard(force, data, Builder, cardId, optionSelections = {}) {
  const priorIds = new Set(force.entries.map((entry) => entry.id));
  let next = Builder.addCardToForce(force, data, cardId);
  const entry = next.entries.find((candidate) =>
    candidate.cardId === cardId && !priorIds.has(candidate.id) && !candidate.autoAddedCompanion);
  if (!entry) throw new Error(`new_force_entry_missing:${cardId}`);
  for (const [slotKey, selections] of Object.entries(optionSelections)) {
    for (const [selectionIndex, choiceId] of selections.entries()) {
      next = Builder.setEntryOptionSelection(
        next,
        data,
        entry.id,
        slotKey,
        selectionIndex,
        choiceId,
      );
    }
  }
  return { force: next, entryId: entry.id };
}

function attachUnboundCommandAttachments(force, data, Builder) {
  let next = force;
  let summary = Builder.computeForceSummary(next, data);
  for (const attachment of summary.entries.filter((entry) =>
    entry.isCommandAttachment && !entry.attachedToEntryId)) {
    const hosts = summary.entries.filter((host) =>
      Builder.attachmentCanBeAddedToHost(attachment.card, host.card) &&
      !summary.entries.some((candidate) =>
        candidate.isCommandAttachment && candidate.attachedToEntryId === host.id));
    if (!hosts.length) continue;
    next = Builder.setEntryAttachment(next, data, attachment.id, hosts[0].id);
    summary = Builder.computeForceSummary(next, data);
  }
  return next;
}

function fixedCardRows(raw = []) {
  return raw.map((constraint) => ({
    cardId: String(constraint.cardId || ""),
    cardName: String(constraint.cardName || ""),
    count: Math.max(0, Math.floor(numeric(
      constraint.count ?? constraint.minimumCount,
      0,
    ))),
    maximumCount: constraint.maximumCount == null
      ? null
      : Math.max(0, Math.floor(numeric(constraint.maximumCount))),
    attachmentTargetCardId: String(constraint.attachmentTargetCardId || ""),
    attachmentTargetCardName: String(constraint.attachmentTargetCardName || ""),
    attachmentTargetCopyNumbers: (constraint.attachmentTargetCopyNumbers || [])
      .map((value) => Math.max(1, Math.floor(numeric(value, 1)))),
    battlegroupControllerCardId: String(constraint.battlegroupControllerCardId || ""),
    battlegroupControllerCardName: String(constraint.battlegroupControllerCardName || ""),
    battlegroupControllerCopyNumbers: (constraint.battlegroupControllerCopyNumbers || [])
      .map((value) => Math.max(1, Math.floor(numeric(value, 1)))),
    loadouts: (constraint.loadouts || []).map((loadout) => ({
      loadoutKey: String(loadout.loadoutKey || ""),
      optionSelections: stableGraphValue(loadout.optionSelections || {}),
      optionSummary: String(loadout.optionSummary || ""),
    })),
    optionSelections: stableGraphValue(constraint.optionSelections || {}),
    optionSummary: String(constraint.optionSummary || ""),
  })).filter((row) =>
    (row.count > 0 || row.maximumCount != null) && (row.cardId || row.cardName));
}

function fixedLoadout(row = {}, copy = 0) {
  return row.loadouts[copy] || row.loadouts[0] || {
    optionSelections: row.optionSelections || {},
    optionSummary: row.optionSummary || "",
  };
}

function selectedLoadoutChoices(card = {}, optionSelections = {}) {
  return (card.optionSlots || []).flatMap((slot) =>
    (optionSelections[slot.slotKey] || []).map((choiceId) =>
      (slot.choices || []).find((choice) => choice.id === choiceId)).filter(Boolean));
}

function completeRosterBaseFeatures(data = {}, leader = {}, fixedCards = [], Builder = {}) {
  const cardsById = new Map((data.cards || []).map((card) => [card.id, card]));
  let features = structuralFeatures(leader, [], Builder);
  for (const companionId of leader.companionIds || []) {
    const companion = cardsById.get(companionId);
    if (companion) features = addFeatures(features, structuralFeatures(companion, [], Builder));
  }
  for (const row of fixedCards) {
    for (let copy = 0; copy < row.count; copy += 1) {
      const loadout = fixedLoadout(row, copy);
      features = addFeatures(features, structuralFeatures(
        row.card,
        selectedLoadoutChoices(row.card, loadout.optionSelections),
        Builder,
      ));
    }
  }
  return features;
}

function withCompleteRosterFeatures(state = {}, baseFeatures = {}, goalProfiles = []) {
  const features = addFeatures(baseFeatures, state.features || {});
  return {
    ...state,
    features,
    constructionGoalScores: Object.fromEntries(goalProfiles.map((profile) => [
      profile.goalProfileKey,
      goalProfileScore(features, profile),
    ])),
  };
}

function relationshipTargetRows(entryRows = [], row = {}, relationship = "attachment") {
  const targetCardId = relationship === "attachment"
    ? row.attachmentTargetCardId
    : row.battlegroupControllerCardId;
  const targetCardName = relationship === "attachment"
    ? row.attachmentTargetCardName
    : row.battlegroupControllerCardName;
  return entryRows.filter((entry) =>
    entry.card && entry.entryId &&
    ((targetCardId && String(entry.card.id || "") === targetCardId) ||
      (targetCardName && String(entry.card.name || "") === targetCardName)));
}

function applyFixedRelationships(force, data, Builder, entryRows = [], fixedCards = []) {
  let next = force;
  let explicitAttachmentCount = 0;
  let explicitBattlegroupCount = 0;
  for (const row of fixedCards) {
    const instances = entryRows.filter((entry) => entry.fixedRow === row);
    if (row.attachmentTargetCardId || row.attachmentTargetCardName) {
      const targets = relationshipTargetRows(entryRows, row, "attachment");
      if (!targets.length ||
          (!row.attachmentTargetCopyNumbers.length && targets.length > 1 &&
            targets.length < instances.length)) {
        throw new Error(`fixed_attachment_targets_insufficient:${
          row.attachmentTargetCardId || row.attachmentTargetCardName}`);
      }
      for (const [index, instance] of instances.entries()) {
        const targetIndex = row.attachmentTargetCopyNumbers.length
          ? row.attachmentTargetCopyNumbers[index] - 1
          : targets.length === 1 ? 0 : index;
        const target = targets[targetIndex];
        if (!target) {
          throw new Error(`fixed_attachment_target_copy_missing:${
            row.attachmentTargetCardId || row.attachmentTargetCardName}:${targetIndex + 1}`);
        }
        next = Builder.setEntryAttachment(
          next,
          data,
          instance.entryId,
          target.entryId,
        );
        explicitAttachmentCount += 1;
      }
    }
    if (row.battlegroupControllerCardId || row.battlegroupControllerCardName) {
      const controllers = relationshipTargetRows(entryRows, row, "battlegroup");
      if (!controllers.length) {
        throw new Error(`fixed_battlegroup_controller_missing:${
          row.battlegroupControllerCardId || row.battlegroupControllerCardName}`);
      }
      for (const [index, instance] of instances.entries()) {
        const controllerIndex = row.battlegroupControllerCopyNumbers.length
          ? row.battlegroupControllerCopyNumbers[index] - 1
          : controllers.length === instances.length ? index : 0;
        const controller = controllers[controllerIndex];
        if (!controller) {
          throw new Error(`fixed_battlegroup_controller_copy_missing:${
            row.battlegroupControllerCardId || row.battlegroupControllerCardName}:${
            controllerIndex + 1}`);
        }
        next = Builder.setEntryBattlegroupController(
          next,
          data,
          instance.entryId,
          controller.entryId,
        );
        explicitBattlegroupCount += 1;
      }
    }
  }
  return { force: next, explicitAttachmentCount, explicitBattlegroupCount };
}

function assignUnboundBattlegroupMembersToLeader(force, data, Builder) {
  let next = force;
  let summary = Builder.computeForceSummary(next, data);
  const primaryLeader = summary.entries.find((entry) => entry.isPrimaryLeader);
  let assignedCount = 0;
  let alternativeControllerAssignmentCount = 0;
  if (!primaryLeader) return { force: next, assignedCount, alternativeControllerAssignmentCount };
  for (const entry of summary.entries.filter((candidate) =>
    candidate.isBattlegroupMember && !candidate.attachedToEntryId &&
    !candidate.battlegroupControllerId)) {
    const eligible = summary.entries.filter((controller) =>
      controller.id !== entry.id && controller.isBattlegroupController &&
      Builder.controllerCanControlBattlegroupMember(controller.card, entry.card));
    if (!eligible.some((controller) => controller.id === primaryLeader.id)) continue;
    alternativeControllerAssignmentCount += Math.max(0, eligible.length - 1);
    next = Builder.setEntryBattlegroupController(
      next,
      data,
      entry.id,
      primaryLeader.id,
    );
    assignedCount += 1;
    summary = Builder.computeForceSummary(next, data);
  }
  return { force: next, assignedCount, alternativeControllerAssignmentCount };
}

function materializeCandidate(raw = {}) {
  const { data, Builder, army, leader, fixedCards, state, candidateIndex, pointLimit } = raw;
  const cardsById = new Map(data.cards.map((card) => [card.id, card]));
  const cardsByName = new Map(data.cards.map((card) => [card.name, card]));
  let force = Builder.createForce(data, {
    armyId: army.id,
    name: `${slug(army.name)}-${slug(leader.name)}-${candidateIndex + 1}`,
  });
  const leaderAdded = addCard(force, data, Builder, leader.id);
  force = leaderAdded.force;
  const allEntryRows = [{ card: leader, entryId: leaderAdded.entryId, source: "leader" }];
  for (const row of fixedCards.filter((entry) =>
    !entry.attachmentTargetCardId && !entry.attachmentTargetCardName)) {
    const card = cardsById.get(row.cardId) || cardsByName.get(row.cardName);
    if (!card) throw new Error(`fixed_card_missing:${row.cardId || row.cardName}`);
    for (let copy = 0; copy < row.count; copy += 1) {
      const loadout = fixedLoadout(row, copy);
      const added = addCard(force, data, Builder, card.id, loadout.optionSelections);
      force = added.force;
      allEntryRows.push({
        card,
        entryId: added.entryId,
        copy,
        loadout,
        fixedRow: row,
        source: "fixed",
      });
    }
  }
  for (const row of fixedCards.filter((entry) =>
    entry.attachmentTargetCardId || entry.attachmentTargetCardName)) {
    const card = cardsById.get(row.cardId) || cardsByName.get(row.cardName);
    if (!card) throw new Error(`fixed_attachment_missing:${row.cardId || row.cardName}`);
    for (let copy = 0; copy < row.count; copy += 1) {
      const loadout = fixedLoadout(row, copy);
      const added = addCard(force, data, Builder, card.id, loadout.optionSelections);
      force = added.force;
      allEntryRows.push({
        card,
        entryId: added.entryId,
        copy,
        loadout,
        fixedRow: row,
        source: "fixed",
      });
    }
  }
  for (const item of state.picks || []) {
    const card = cardsById.get(item.cardId);
    const added = addCard(force, data, Builder, item.cardId, item.optionSelections);
    force = added.force;
    allEntryRows.push({
      card,
      entryId: added.entryId,
      loadout: {
        optionSelections: item.optionSelections,
        optionSummary: item.optionSummary,
      },
      source: "generated",
    });
  }
  const relationshipResult = applyFixedRelationships(
    force,
    data,
    Builder,
    allEntryRows,
    fixedCards,
  );
  force = relationshipResult.force;
  force = attachUnboundCommandAttachments(force, data, Builder);
  const battlegroupResult = assignUnboundBattlegroupMembersToLeader(
    force,
    data,
    Builder,
  );
  force = battlegroupResult.force;
  const validation = Builder.validateForceForEncounter(force, data, { pointLimit });
  if (!validation.ok) {
    throw new Error(validation.checks
      .filter((check) => check.status !== "passed")
      .map((check) => `${check.code}:${(check.warnings || []).join(";")}`)
      .join(" | "));
  }
  const summary = validation.summary;
  const physicalModelsByEntryId = Builder.effectivePhysicalModelsByEntry(summary);
  const exportText = Builder.exportForceToWarTableText(summary.force, data);
  const rosterIdentity = stableGraphHash({
    armyId: army.id,
    leaderId: leader.id,
    exportText,
  });
  return {
    key: `${slug(army.name)}_${slug(leader.name)}_${rosterIdentity.slice(0, 12)}`,
    side: slug(army.factionName || army.name),
    armyId: String(army.id || ""),
    army: army.name,
    factionId: String(army.factionId || ""),
    faction: army.factionName || "",
    leaderId: String(leader.id || ""),
    leader: leader.name,
    purpose: "Task-generated exact legal finite roster candidate.",
    source: "generic_task_point_dp_diversity_archive_v1",
    totalPoints: summary.totalPoints,
    physicalModels: summary.entries.reduce((sum, entry) =>
      sum + numeric(physicalModelsByEntryId.get(entry.id)), 0),
    warnings: [],
    screeningScore: 0,
    featureBucket: featureBucket(state.features),
    features: stableGraphValue(state.features),
    constructionGoalScores: stableGraphValue(state.constructionGoalScores || {}),
    constructionAudit: {
      explicitAttachmentCount: relationshipResult.explicitAttachmentCount,
      explicitBattlegroupCount: relationshipResult.explicitBattlegroupCount,
      defaultLeaderBattlegroupAssignmentCount: battlegroupResult.assignedCount,
      deferredAlternativeBattlegroupAssignmentCount:
        battlegroupResult.alternativeControllerAssignmentCount,
    },
    exportText,
    entries: summary.entries.map((entry, index) => ({
      entryId: `entry-${String(index + 1).padStart(3, "0")}-${String(entry.card.id).slice(0, 8)}`,
      name: entry.displayName,
      cardId: entry.card.id,
      cardTypeName: entry.card.cardTypeName,
      linePoints: entry.linePoints,
      physicalModels: numeric(physicalModelsByEntryId.get(entry.id)),
      options: entry.optionSummary || "",
      optionSelections: stableGraphValue(entry.optionSelections || {}),
      attachedTo: entry.attachedToEntry?.displayName || "",
      attachedToCardId: entry.attachedToEntry?.card?.id || "",
      battlegroupController: entry.battlegroupController?.displayName || "",
      battlegroupControllerCardId: entry.battlegroupController?.card?.id || "",
      autoAddedCompanion: entry.autoAddedCompanion === true,
    })),
  };
}

function archiveDiverse(rosters = [], maximumRosters = 48, maximumPerBucket = 3) {
  const unique = [...new Map(rosters.map((roster) => [roster.exportText, roster])).values()];
  const buckets = new Map();
  for (const roster of unique.sort((left, right) =>
    left.key.localeCompare(right.key))) {
    if (!buckets.has(roster.featureBucket)) buckets.set(roster.featureBucket, []);
    if (buckets.get(roster.featureBucket).length < maximumPerBucket) {
      buckets.get(roster.featureBucket).push(roster);
    }
  }
  const selected = [...buckets.values()].flat().slice(0, maximumRosters);
  if (selected.length < maximumRosters) {
    const selectedKeys = new Set(selected.map((roster) => roster.key));
    for (const roster of unique) {
      if (selectedKeys.has(roster.key)) continue;
      selected.push(roster);
      if (selected.length >= maximumRosters) break;
    }
  }
  return selected;
}

function archiveGoalConditioned(
  rosters = [],
  maximumRosters = 48,
  maximumPerBucket = 3,
  goalProfiles = WARMACHINE_ROSTER_CONSTRUCTION_GOAL_PROFILES_V1,
) {
  const goalRanked = goalProfiles.map((profile) => [...rosters].sort((left, right) =>
    numeric(right.constructionGoalScores?.[profile.goalProfileKey]) -
      numeric(left.constructionGoalScores?.[profile.goalProfileKey]) ||
    left.key.localeCompare(right.key)));
  const goalSelected = roundRobinUnique(goalRanked, maximumRosters);
  const structural = archiveDiverse(rosters, maximumRosters, maximumPerBucket);
  return [...new Map([...goalSelected, ...structural].map((roster) =>
    [roster.key, roster])).values()].slice(0, maximumRosters);
}

function exactLegalStatesByGoal(raw = {}) {
  const {
    data,
    Builder,
    army,
    leader,
    fixedCards,
    exactStates,
    goalProfiles,
    maximumAttempts,
    minimumLegalPerGoal,
  } = raw;
  const queues = new Map(goalProfiles.map((profile) => [
    profile.goalProfileKey,
    [...exactStates].sort((left, right) =>
      numeric(right.constructionGoalScores?.[profile.goalProfileKey]) -
        numeric(left.constructionGoalScores?.[profile.goalProfileKey]) ||
      stateSignature(left).localeCompare(stateSignature(right))),
  ]));
  const cursors = new Map(goalProfiles.map((profile) => [profile.goalProfileKey, 0]));
  const acceptedByGoal = new Map(goalProfiles.map((profile) => [
    profile.goalProfileKey,
    new Set(),
  ]));
  const outcomesByState = new Map();
  const rosterByState = new Map();
  const rejectionRows = [];
  let exactAttemptCount = 0;
  let progress = true;
  while (progress && exactAttemptCount < maximumAttempts &&
    goalProfiles.some((profile) =>
      acceptedByGoal.get(profile.goalProfileKey).size < minimumLegalPerGoal)) {
    progress = false;
    for (const profile of goalProfiles) {
      const profileKey = profile.goalProfileKey;
      const accepted = acceptedByGoal.get(profileKey);
      if (accepted.size >= minimumLegalPerGoal) continue;
      const queue = queues.get(profileKey);
      let cursor = cursors.get(profileKey);
      while (cursor < queue.length) {
        const state = queue[cursor];
        cursor += 1;
        cursors.set(profileKey, cursor);
        const signature = stateSignature(state);
        const knownOutcome = outcomesByState.get(signature);
        if (knownOutcome === "legal") {
          accepted.add(signature);
          progress = true;
          break;
        }
        if (knownOutcome === "rejected") continue;
        if (exactAttemptCount >= maximumAttempts) break;
        exactAttemptCount += 1;
        progress = true;
        try {
          const roster = materializeCandidate({
            data,
            Builder,
            army,
            leader,
            fixedCards,
            state,
            candidateIndex: exactAttemptCount - 1,
            pointLimit: raw.pointLimit,
          });
          if (roster.totalPoints !== raw.pointLimit) {
            outcomesByState.set(signature, "rejected");
            rejectionRows.push({ leaderName: leader.name, reason: "point_limit_mismatch" });
            continue;
          }
          outcomesByState.set(signature, "legal");
          rosterByState.set(signature, roster);
          accepted.add(signature);
        } catch (error) {
          outcomesByState.set(signature, "rejected");
          rejectionRows.push({
            leaderName: leader.name,
            reason: String(error?.message || error).split(" | ")[0].slice(0, 240),
          });
        }
        break;
      }
    }
  }
  const goalCoverageByState = new Map();
  for (const [profileKey, signatures] of acceptedByGoal) {
    for (const signature of signatures) {
      if (!goalCoverageByState.has(signature)) goalCoverageByState.set(signature, []);
      goalCoverageByState.get(signature).push(profileKey);
    }
  }
  return {
    rosters: [...rosterByState.entries()].map(([signature, roster]) => ({
      ...roster,
      constructionGoalProfileCoverageKeys:
        (goalCoverageByState.get(signature) || []).sort(),
    })),
    rejections: rejectionRows,
    exactAttemptCount,
    goalCoverage: goalProfiles.map((profile) => ({
      goalProfileKey: profile.goalProfileKey,
      requestedLegalRosterCount: minimumLegalPerGoal,
      acceptedLegalRosterCount: acceptedByGoal.get(profile.goalProfileKey).size,
      exhausted: cursors.get(profile.goalProfileKey) >= queues.get(profile.goalProfileKey).length,
      complete: acceptedByGoal.get(profile.goalProfileKey).size >= minimumLegalPerGoal,
    })),
  };
}

export function buildWarmachineCurrentArmyCatalogV1(data = {}) {
  const cardsById = new Map((data.cards || []).map((card) => [card.id, card]));
  const rows = (data.armies || []).map((army) => {
    const cards = (army.cardIds || []).map((cardId) => cardsById.get(cardId)).filter(Boolean);
    const leaders = cards.filter((card) => /warcaster|warlock/i.test(card.cardTypeName || ""));
    return {
      armyId: String(army.id || ""),
      armyName: String(army.name || ""),
      factionId: String(army.factionId || ""),
      factionName: String(army.factionName || ""),
      leaderCount: leaders.length,
      leaders: leaders.map((leader) => ({
        cardId: leader.id,
        cardName: leader.name,
        cardTypeName: leader.cardTypeName,
      })).sort((left, right) => left.cardName.localeCompare(right.cardName)),
      selectableCardCount: cards.filter((card) =>
        !["Army", "Defense"].includes(String(card.cardTypeName || ""))).length,
    };
  }).filter((row) => row.leaderCount > 0)
    .sort((left, right) => left.factionName.localeCompare(right.factionName) ||
      left.armyName.localeCompare(right.armyName));
  const core = {
    schemaVersion: "warmachine_current_army_catalog_v1",
    remoteVersion: String(data.source?.remoteVersion || ""),
    armyCount: rows.length,
    leaderCount: rows.reduce((sum, row) => sum + row.leaderCount, 0),
    armies: rows,
  };
  return { ...core, catalogHash: stableGraphHash(core) };
}

export function generateWarmachineGenericRosterPoolV1(raw = {}) {
  const data = raw.data || {};
  const Builder = raw.forceBuilder;
  if (!Builder) throw new Error("warmachine_force_builder_required");
  const army = (data.armies || []).find((candidate) =>
    String(candidate.id || "") === String(raw.armyId || "") ||
    String(candidate.name || "") === String(raw.armyName || ""));
  if (!army) throw new Error(`warmachine_army_missing:${raw.armyId || raw.armyName || ""}`);
  const cardsById = new Map((data.cards || []).map((card) => [card.id, card]));
  const cardsByName = new Map((data.cards || []).map((card) => [card.name, card]));
  const allLeaders = (army.cardIds || []).map((cardId) => cardsById.get(cardId)).filter((card) =>
    /warcaster|warlock/i.test(card?.cardTypeName || ""));
  const declaredLeaderNames = new Set((raw.leaderNames || []).map(String));
  const declaredLeaderIds = new Set((raw.leaderIds || []).map(String));
  const leaders = declaredLeaderNames.size || declaredLeaderIds.size
    ? allLeaders.filter((leader) =>
      declaredLeaderNames.has(leader.name) || declaredLeaderIds.has(String(leader.id)))
    : allLeaders;
  if (!leaders.length) throw new Error("warmachine_task_leader_set_empty");
  const pointLimit = Math.max(1, Math.floor(numeric(raw.pointLimit, 100)));
  const fixedCards = fixedCardRows(raw.fixedCards || []);
  const fixedCardObjects = fixedCards.map((row) => ({
    ...row,
    card: cardsById.get(row.cardId) || cardsByName.get(row.cardName),
  }));
  const missingFixed = fixedCardObjects.filter((row) => !row.card);
  if (missingFixed.length) {
    throw new Error(`warmachine_fixed_cards_missing:${missingFixed.map((row) =>
      row.cardId || row.cardName).join(",")}`);
  }
  for (const row of fixedCardObjects) {
    if (!(row.card.optionSlots || []).length) continue;
    for (let copy = 0; copy < row.count; copy += 1) {
      const selections = fixedLoadout(row, copy).optionSelections || {};
      const incompleteSlotKeys = (row.card.optionSlots || []).filter((slot) =>
        (selections[slot.slotKey] || []).length < slotCount(slot)).map((slot) => slot.slotKey);
      if (incompleteSlotKeys.length) {
        throw new Error(`fixed_modular_loadout_required:${row.card.name}:${copy + 1}:` +
          incompleteSlotKeys.join(","));
      }
    }
  }
  const optionChoicePoints = (card, selections = {}) => (card.optionSlots || []).reduce(
    (sum, slot) => sum + (selections[slot.slotKey] || []).reduce((slotSum, choiceId) => {
      const choice = (slot.choices || []).find((candidate) => candidate.id === choiceId);
      if (!choice) throw new Error(`fixed_modular_choice_invalid:${card.name}:${slot.slotKey}:${choiceId}`);
      return slotSum + numeric(choice.pointCostNumber);
    }, 0),
    0,
  );
  const fixedPointCost = fixedCardObjects.reduce((sum, row) => {
    let rowCost = 0;
    for (let copy = 0; copy < row.count; copy += 1) {
      rowCost += numeric(row.card.pointCostNumber) + optionChoicePoints(
        row.card,
        fixedLoadout(row, copy).optionSelections,
      );
    }
    return sum + rowCost;
  }, 0);
  const flexPointTarget = pointLimit - fixedPointCost;
  if (flexPointTarget < 0) throw new Error("warmachine_fixed_core_exceeds_point_limit");
  const packageResult = packagePool(
    data,
    army,
    pointLimit,
    {
      fixedCards: fixedCardObjects,
      fixedComplete: raw.fixedComplete === true,
      excludedCardIds: raw.excludedCardIds || [],
      excludedCardNames: raw.excludedCardNames || [],
      excludedCardTypeNames: raw.excludedCardTypeNames || [],
      loadoutConstraints: raw.loadoutConstraints || [],
      Builder,
    },
  );
  const pointSearch = searchExactPointPackages(
    packageResult.packages,
    flexPointTarget,
    raw.searchBudget || {},
  );
  const maximumExactAttemptsPerLeader = Math.max(1, Math.floor(numeric(
    raw.searchBudget?.maximumExactAttemptsPerLeader,
    160,
  )));
  const minimumLegalRostersPerGoalPerLeader = Math.max(1, Math.floor(numeric(
    raw.searchBudget?.minimumLegalRostersPerGoalPerLeader,
    4,
  )));
  const exactLegal = [];
  const rejections = [];
  const goalCoverageByLeader = [];
  const completeRosterBaseFeaturesByLeader = [];
  let exactLegalityAttemptCount = 0;
  for (const leader of leaders) {
    const baseFeatures = completeRosterBaseFeatures(
      data,
      leader,
      fixedCardObjects,
      Builder,
    );
    const leaderExactStates = pointSearch.exactStates.map((state) =>
      withCompleteRosterFeatures(state, baseFeatures, pointSearch.goalProfiles));
    const result = exactLegalStatesByGoal({
      data,
      Builder,
      army,
      leader,
      fixedCards,
      exactStates: leaderExactStates,
      goalProfiles: pointSearch.goalProfiles,
      maximumAttempts: maximumExactAttemptsPerLeader,
      minimumLegalPerGoal: minimumLegalRostersPerGoalPerLeader,
      pointLimit,
    });
    exactLegal.push(...result.rosters);
    rejections.push(...result.rejections);
    exactLegalityAttemptCount += result.exactAttemptCount;
    goalCoverageByLeader.push({
      leaderName: leader.name,
      exactAttemptCount: result.exactAttemptCount,
      goalCoverage: result.goalCoverage,
    });
    completeRosterBaseFeaturesByLeader.push({
      leaderId: leader.id,
      leaderName: leader.name,
      baseFeatures,
    });
  }
  const maximumRosters = Math.max(leaders.length, Math.floor(numeric(
    raw.searchBudget?.maximumArchivedRosters,
    48,
  )));
  const rosters = leaders.flatMap((leader) => archiveGoalConditioned(
    exactLegal.filter((roster) => roster.leader === leader.name),
    Math.max(1, Math.ceil(maximumRosters / leaders.length)),
    Math.max(1, Math.floor(numeric(raw.searchBudget?.maximumPerArchiveBucket, 3))),
    pointSearch.goalProfiles,
  )).slice(0, maximumRosters);
  const uniqueExactLegalRosterCount = new Set(exactLegal.map((roster) =>
    roster.exportText)).size;
  const totalLeaderExactPointStateCount = pointSearch.exactStates.length * leaders.length;
  const exactStateBudgetDeferredCount = Math.max(
    0,
    totalLeaderExactPointStateCount - exactLegalityAttemptCount,
  );
  const archiveBudgetDeferredCount = Math.max(
    0,
    uniqueExactLegalRosterCount - rosters.length,
  );
  const deferredAlternativeBattlegroupAssignmentCount = exactLegal.reduce((sum, roster) =>
    sum + numeric(roster.constructionAudit?.deferredAlternativeBattlegroupAssignmentCount), 0);
  const rejectionCounts = Object.entries(rejections.reduce((counts, row) => {
    counts[row.reason] = (counts[row.reason] || 0) + 1;
    return counts;
  }, {})).map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason));
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_GENERIC_ROSTER_POOL_V1_SCHEMA,
    source: {
      remoteVersion: String(data.source?.remoteVersion || ""),
      sourceLabel: String(data.source?.sourceLabel || ""),
    },
    army: {
      armyId: army.id,
      armyName: army.name,
      factionId: army.factionId || "",
      factionName: army.factionName || "",
    },
    leaderNames: leaders.map((leader) => leader.name).sort(),
    leaderIds: leaders.map((leader) => leader.id).sort(),
    pointLimit,
    fixedCore: {
      fixedComplete: raw.fixedComplete === true,
      fixedPointCost,
      flexiblePointTarget: flexPointTarget,
      cards: fixedCards,
    },
    algorithm: {
      pointSearch: "exact point dynamic programming with bounded pending-state and finite diversity-beam retention",
      maximumPendingStatesPerCost: pointSearch.maximumPendingStatesPerCost,
      goalConditioning: "caller-supplied terminal-demand macro profiles or the default four strategic capability archives over complete card-plus-loadout packages",
      completeRosterFeatureScope: "Leader, auto-added companions, fixed core, exact fixed loadouts and flexible packages are included before per-Leader goal ordering; pre-legality DP beam omissions remain budget-deferred",
      legalGoalQuota: "continue exact Force Builder checks per leader and goal profile until the requested legal quota, queue exhaustion, or the explicit attempt budget",
      finalLegality: "current WarmachineForceBuilder warnings empty and exact point total",
      archive: "deterministic structural MAP-Elites-style finite archive",
      exhaustiveAllLegalRosters: false,
      battlegroupAssignment: "declared fixed relationships use Force Builder setters; otherwise unbound members are assigned to the primary Leader and alternative legal controller assignments remain budget-deferred",
    },
    counts: {
      packageVariantCount: packageResult.packages.length,
      generatedPartialStateCount: pointSearch.generatedStateCount,
      budgetPrunedPartialStateCount: pointSearch.budgetPrunedStateCount,
      exactPointStateCount: pointSearch.exactStates.length,
      totalLeaderExactPointStateCount,
      exactLegalityAttemptCount,
      exactStateBudgetDeferredCount,
      exactLegalBeforeArchiveCount: exactLegal.length,
      exactLegalUniqueBeforeArchiveCount: uniqueExactLegalRosterCount,
      duplicateExactLegalRosterCount: Math.max(
        0,
        exactLegal.length - uniqueExactLegalRosterCount,
      ),
      archivedRosterCount: rosters.length,
      archiveBudgetDeferredCount,
      deferredAlternativeBattlegroupAssignmentCount,
      rejectedCount: rejections.length,
      incompleteLeaderGoalCount: goalCoverageByLeader.reduce((sum, row) =>
        sum + row.goalCoverage.filter((coverage) => !coverage.complete).length, 0),
    },
    rejectionCounts,
    enumerationAudit: {
      packageVariants: packageResult.audit,
      partialStateBudgetDeferredCount: pointSearch.budgetPrunedStateCount,
      exactStateBudgetDeferredCount,
      rejectedExactCandidateCount: rejections.length,
      duplicateExactLegalRosterCount: Math.max(
        0,
        exactLegal.length - uniqueExactLegalRosterCount,
      ),
      archiveBudgetDeferredCount,
      deferredAlternativeBattlegroupAssignmentCount,
      allReturnedRostersForceBuilderLegal: true,
      omissionClassesComplete: true,
    },
    constructionGoalProfiles: pointSearch.goalProfiles,
    completeRosterBaseFeaturesByLeader,
    constructionGoalCoverageByLeader: goalCoverageByLeader,
    rosters,
    quality: {
      exactListLegality: true,
      legalGoalQuotaComplete: goalCoverageByLeader.every((row) =>
        row.goalCoverage.every((coverage) => coverage.complete)),
      screeningOnly: true,
      strictTransitionEvaluated: false,
      trainingTruth: false,
      naturalRosterDistribution: false,
      globalOptimalityProven: false,
      fixedCompleteRosterSearchSkipped: raw.fixedComplete === true,
    },
    claimBoundary: "Every returned roster is an exact current Force Builder legal member of a finite diversity archive. Beam-pruned point search is not exhaustive over every legal roster and the archive is not a natural metagame distribution.",
  });
  return { ...core, poolHash: stableGraphHash(core) };
}
