import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";

export const WARMACHINE_ROSTER_RULE_EVIDENCE_V1_SCHEMA =
  "warmachine_roster_rule_evidence_v1";

const DEFAULT_TARGET = Object.freeze({
  targetKey: "mechanithrall_grunt",
  label: "Mechanithrall Swarm Grunt",
  defense: 12,
  armor: 13,
  boxes: 1,
  tough: true,
  living: false,
  undead: true,
  baseMillimeters: 30,
});

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, digits = 6) {
  const scale = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * scale) / scale;
}

function baseEntryName(value = "") {
  return String(value).replace(/\s+#\d+$/i, "").trim();
}

function diceProbability(diceCount, predicate) {
  let success = 0;
  let total = 0;
  const visit = (depth, sum, allOnes, allSixes) => {
    if (depth === diceCount) {
      total += 1;
      if (predicate({ sum, allOnes, allSixes })) success += 1;
      return;
    }
    for (let die = 1; die <= 6; die += 1) {
      visit(depth + 1, sum + die, allOnes && die === 1, allSixes && die === 6);
    }
  };
  visit(0, 0, true, true);
  return total ? success / total : 0;
}

function attackProbability(attackStat, defense, diceCount = 2) {
  if (!Number.isFinite(attackStat)) return 0;
  return diceProbability(diceCount, ({ sum, allOnes, allSixes }) =>
    !allOnes && (allSixes || sum + attackStat >= defense));
}

function damageProbability(power, armor, diceCount = 2) {
  if (!Number.isFinite(power)) return 0;
  return diceProbability(diceCount, ({ sum }) => sum + power > armor);
}

function parseOptionSummary(value = "") {
  const selected = new Map();
  for (const part of String(value).split(";")) {
    const separator = part.indexOf(":");
    if (separator < 0) continue;
    const slotName = part.slice(0, separator).trim();
    const choiceName = part.slice(separator + 1).trim();
    if (slotName && choiceName) selected.set(slotName, choiceName);
  }
  return selected;
}

function selectedOptionChoices(card = {}, entry = {}) {
  const selected = parseOptionSummary(entry.options || "");
  return (card.optionSlots || []).flatMap((slot) => {
    const selectedName = selected.get(String(slot.name || ""));
    if (!selectedName) return [];
    const choice = (slot.choices || []).find((candidate) =>
      String(candidate.name || "") === selectedName);
    return choice ? [{ ...choice, sourceSlotName: slot.name }] : [];
  });
}

function profileMultiplicity(card = {}, entry = {}) {
  const physicalModels = Math.max(0, Math.floor(numeric(entry.physicalModels, 1)));
  const models = card.models || [];
  if (models.length <= 1) return models.map(() => physicalModels || 1);
  const guessed = models.map((model) => Math.max(1,
    String(model.name || "").split(/,|\s+&\s+/).filter(Boolean).length));
  const guessedTotal = guessed.reduce((sum, value) => sum + value, 0);
  if (guessedTotal === physicalModels) return guessed;
  return models.map((_, index) => index < physicalModels ? 1 : 0);
}

function textOf(rows = []) {
  return rows.map((row) => `${row.name || ""} ${row.description || ""}`).join(" ");
}

function antiToughMode(weapon = {}, modelAbilities = [], target = DEFAULT_TARGET) {
  const weaponText = textOf(weapon.abilities || []);
  if (/grievous wounds|decapitation|cannot make a tough roll/i.test(weaponText)) {
    return "weapon_disables_tough";
  }
  if (/anatomical precision/i.test(textOf(modelAbilities)) && target.living) {
    return "living_target_anatomical_precision";
  }
  return "none";
}

function attackPacket(raw = {}) {
  const target = raw.target || DEFAULT_TARGET;
  const weapon = raw.weapon || {};
  const type = /ranged/i.test(weapon.type || "") ? "ranged" : "melee";
  const attackStat = numeric(type === "ranged" ? raw.model.stats?.rat : raw.model.stats?.mat, NaN);
  const power = numeric(weapon.stats?.pow || weapon.stats?.pPlusS, NaN);
  const qualities = (weapon.qualities || []).map(String);
  const modelAbilities = raw.modelAbilities || [];
  const weaponText = textOf(weapon.abilities || []);
  const antiTough = antiToughMode(weapon, modelAbilities, target);
  const anatomicalPrecision = /anatomical precision/i.test(textOf(modelAbilities)) && target.living;
  const damageDice = qualities.some((quality) => /weapon master/i.test(quality)) ||
    /brutal damage/i.test(weaponText) ? 3 : 2;
  const hit = attackProbability(attackStat, target.defense, 2);
  const boostedHit = attackProbability(attackStat, target.defense, 3);
  const damage = anatomicalPrecision
    ? 1
    : damageProbability(power, target.armor, damageDice);
  const boostedDamage = anatomicalPrecision
    ? 1
    : damageProbability(power, target.armor, damageDice + 1);
  const toughFailure = target.tough && antiTough === "none" ? 2 / 3 : 1;
  const expectedRemoval = hit * damage * toughFailure;
  const packet = {
    sourceCardId: raw.card.id,
    sourceCardName: raw.card.name,
    sourceEntryName: raw.entry.name,
    sourceModelName: raw.model.name,
    weaponName: weapon.name,
    attackType: type,
    attackCount: Math.max(1, Math.floor(numeric(weapon.count, 1))),
    attackStat,
    power,
    range: String(weapon.stats?.rng || ""),
    rateOfFire: Math.max(1, Math.floor(numeric(weapon.stats?.rof, 1))),
    aoe: String(weapon.stats?.aoe || ""),
    spray: /sp\s*\d+/i.test(String(weapon.stats?.rng || "")),
    damageDice,
    antiToughMode: antiTough,
    attackHitProbability: round(hit),
    damageOnHitProbability: round(damage),
    removalPerAttack: round(expectedRemoval),
    boostedAttackHitProbability: round(boostedHit),
    boostedDamageOnHitProbability: round(boostedDamage),
    boostedAttackRemoval: round(boostedHit * damage * toughFailure),
    boostedDamageRemoval: round(hit * boostedDamage * toughFailure),
    fullyBoostedRemoval: round(boostedHit * boostedDamage * toughFailure),
    qualities,
    ruleNames: (weapon.abilities || []).map((ability) => String(ability.name || "")),
  };
  return packet;
}

function bestResourceCombatValue(packets = [], resourceMax = 0) {
  const expanded = packets.flatMap((packet) =>
    Array.from({ length: packet.attackCount }, () => packet));
  if (!expanded.length || resourceMax <= 0) {
    return expanded.reduce((sum, packet) => sum + packet.removalPerAttack, 0);
  }
  let values = Array(resourceMax + 1).fill(Number.NEGATIVE_INFINITY);
  values[0] = 0;
  for (const packet of expanded) {
    const choices = [
      [0, packet.removalPerAttack],
      [1, packet.boostedAttackRemoval],
      [1, packet.boostedDamageRemoval],
      [2, packet.fullyBoostedRemoval],
    ];
    const next = Array(resourceMax + 1).fill(Number.NEGATIVE_INFINITY);
    for (let spent = 0; spent <= resourceMax; spent += 1) {
      if (!Number.isFinite(values[spent])) continue;
      for (const [cost, value] of choices) {
        if (spent + cost <= resourceMax) {
          next[spent + cost] = Math.max(next[spent + cost], values[spent] + value);
        }
      }
    }
    values = next;
  }
  for (let attackIndex = 0; attackIndex < resourceMax; attackIndex += 1) {
    const next = [...values];
    for (let spent = 0; spent <= resourceMax; spent += 1) {
      if (!Number.isFinite(values[spent])) continue;
      for (const packet of packets) {
        const choices = [
          [1, packet.removalPerAttack],
          [2, packet.boostedAttackRemoval],
          [2, packet.boostedDamageRemoval],
          [3, packet.fullyBoostedRemoval],
        ];
        for (const [cost, value] of choices) {
          if (spent + cost <= resourceMax) {
            next[spent + cost] = Math.max(next[spent + cost], values[spent] + value);
          }
        }
      }
    }
    values = next;
  }
  return Math.max(...values.filter(Number.isFinite));
}

function classifyRule(name = "", description = "") {
  const text = `${name} ${description}`;
  const classes = [];
  if (/tough|grievous wounds|decapitation|remove.+from play|feast/i.test(text)) {
    classes.push("removal_timing_or_tough");
  }
  if (/cleave|killing spree|additional.+attack|ricochet|vengeance|retaliatory strike/i.test(text)) {
    classes.push("attack_chain_or_reaction");
  }
  if (/cannot|stationary|knocked down|push|place enemy|inconsequential|suffers.+def|humble|blind/i.test(text)) {
    classes.push("control_or_denial");
  }
  if (/advance|reposition|flight|pathfinder|ambush|apparition|advance deployment|sprint|dash/i.test(text)) {
    classes.push("mobility_or_position");
  }
  if (/return.+destroyed|return.+play|put.+into play|revive|replace/i.test(text)) {
    classes.push("recursion");
  }
  if (/focus|fury|hunger|corpse|soul|essence/i.test(text)) classes.push("resource");
  if (/scenario|score|contest|secure|victory point/i.test(text)) classes.push("scenario");
  if (/arm|def|concealment|stealth|resistance|shield guard|tough|no damage/i.test(text)) {
    classes.push("defense");
  }
  return [...new Set(classes)].sort();
}

function ruleRowsForEntry(card = {}, entry = {}, optionChoices = []) {
  const rows = [];
  const add = (sourceKind, sourceName, rule) => {
    if (!rule?.name) return;
    rows.push({
      sourceCardId: card.id,
      sourceCardName: card.name,
      sourceEntryName: entry.name,
      sourceKind,
      sourceName,
      ruleName: String(rule.name || ""),
      description: String(rule.description || ""),
      classes: classifyRule(rule.name, rule.description),
    });
  };
  for (const ability of card.cardAbilities || []) add("card_ability", card.name, ability);
  for (const model of card.models || []) {
    for (const advantage of model.advantages || []) {
      add("model_advantage", model.name, { name: advantage, description: "" });
    }
    for (const ability of model.abilities || []) add("model_ability", model.name, ability);
    for (const weapon of model.weapons || []) {
      for (const ability of weapon.abilities || []) add("weapon_ability", weapon.name, ability);
    }
  }
  for (const choice of optionChoices) {
    for (const ability of choice.grantedCardAbilities || []) {
      add("option_card_ability", choice.name, ability);
    }
    for (const ability of choice.grantedModelAbilities || []) {
      add("option_model_ability", choice.name, ability);
    }
    for (const weapon of choice.grantedWeapons || []) {
      for (const ability of weapon.abilities || []) add("option_weapon_ability", weapon.name, ability);
    }
  }
  for (const spell of card.spells || []) {
    add("spell", spell.name, { name: spell.name, description: spell.description });
  }
  if (card.featName) add("feat", card.featName, {
    name: card.featName,
    description: card.featDescription,
  });
  return rows;
}

function countClasses(ruleRows = []) {
  return Object.fromEntries([
    "removal_timing_or_tough",
    "attack_chain_or_reaction",
    "control_or_denial",
    "mobility_or_position",
    "recursion",
    "resource",
    "scenario",
    "defense",
  ].map((classKey) => [
    classKey,
    new Set(ruleRows.filter((row) => row.classes.includes(classKey))
      .map((row) => `${row.sourceEntryName}:${row.ruleName}`)).size,
  ]));
}

export function buildWarmachineRosterRuleEvidenceV1(raw = {}) {
  const data = raw.data || {};
  const roster = raw.roster || {};
  const target = { ...DEFAULT_TARGET, ...(raw.targetProfile || {}) };
  const cardsById = new Map((data.cards || []).map((card) => [card.id, card]));
  const allRuleRows = [];
  const allAttackPackets = [];
  const entryCombatRows = [];
  const missingCardRows = [];
  for (const entry of roster.entries || []) {
    const card = cardsById.get(entry.cardId);
    if (!card) {
      missingCardRows.push({ entryName: entry.name, cardId: entry.cardId });
      continue;
    }
    const optionChoices = selectedOptionChoices(card, entry);
    allRuleRows.push(...ruleRowsForEntry(card, entry, optionChoices));
    const optionModelAbilities = optionChoices.flatMap((choice) =>
      choice.grantedModelAbilities || []);
    const optionWeapons = optionChoices.flatMap((choice) => choice.grantedWeapons || []);
    const multiplicities = profileMultiplicity(card, entry);
    let entryResourceFree = 0;
    let entryResourceOptimized = 0;
    for (const [modelIndex, model] of (card.models || []).entries()) {
      const multiplicity = multiplicities[modelIndex] || 0;
      if (!multiplicity) continue;
      const modelAbilities = [...(card.cardAbilities || []), ...(model.abilities || []),
        ...optionModelAbilities];
      const packets = [...(model.weapons || []), ...optionWeapons].map((weapon) =>
        attackPacket({ card, entry, model, modelAbilities, weapon, target }));
      const resourceMax = Math.max(0, Math.floor(numeric(
        model.stats?.fury || (/warjack/i.test(card.cardTypeName || "") ? 3 : 0),
        0,
      )));
      const resourceFree = packets.reduce((sum, packet) =>
        sum + packet.removalPerAttack * packet.attackCount, 0);
      const resourceOptimized = bestResourceCombatValue(packets, resourceMax);
      entryResourceFree += multiplicity * resourceFree;
      entryResourceOptimized += multiplicity * resourceOptimized;
      for (const packet of packets) {
        allAttackPackets.push({ ...packet, sourceModelMultiplicity: multiplicity, resourceMax });
      }
    }
    entryCombatRows.push({
      sourceEntryName: entry.name,
      sourceCardId: entry.cardId,
      physicalModels: numeric(entry.physicalModels),
      resourceFreeExpectedRemovals: round(entryResourceFree),
      resourceOptimizedExpectedRemovals: round(entryResourceOptimized),
    });
  }
  const weightedPackets = allAttackPackets.map((packet) => ({
    ...packet,
    attackCountAcrossModels: packet.attackCount * packet.sourceModelMultiplicity,
    expectedRemovalsAcrossModels: round(
      packet.removalPerAttack * packet.attackCount * packet.sourceModelMultiplicity,
    ),
  }));
  const resourceFreeExpectedRemovals = entryCombatRows.reduce((sum, row) =>
    sum + row.resourceFreeExpectedRemovals, 0);
  const resourceOptimizedExpectedRemovals = entryCombatRows.reduce((sum, row) =>
    sum + row.resourceOptimizedExpectedRemovals, 0);
  const physicalModelCount = (roster.entries || []).reduce((sum, entry) =>
    sum + numeric(entry.physicalModels), 0);
  const ruleClassCounts = countClasses(allRuleRows);
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_ROSTER_RULE_EVIDENCE_V1_SCHEMA,
    sourceRemoteVersion: String(data.source?.remoteVersion || ""),
    rosterKey: String(roster.rosterKey || roster.key || ""),
    leaderName: String(roster.leaderName || roster.leader || ""),
    armyName: String(roster.armyName || roster.army || ""),
    target,
    rosterFacts: {
      pointTotal: numeric(roster.totalPoints),
      physicalModelCount,
      unitEntryCount: (roster.entries || []).filter((entry) =>
        /unit/i.test(entry.cardTypeName || "") && !/attachment/i.test(entry.cardTypeName || ""))
        .length,
      cohortEntryCount: (roster.entries || []).filter((entry) =>
        /warjack|warbeast|monstrosity|colossal|gargantuan/i.test(entry.cardTypeName || ""))
        .length,
      ruleClassCounts,
    },
    combatEnvelope: {
      resourceFreeExpectedRemovals: round(resourceFreeExpectedRemovals),
      resourceOptimizedExpectedRemovals: round(resourceOptimizedExpectedRemovals),
      resourceOptimizationGain: round(
        resourceOptimizedExpectedRemovals - resourceFreeExpectedRemovals,
      ),
      rangedResourceFreeExpectedRemovals: round(weightedPackets.filter((packet) =>
        packet.attackType === "ranged").reduce((sum, packet) =>
        sum + packet.expectedRemovalsAcrossModels, 0)),
      meleeResourceFreeExpectedRemovals: round(weightedPackets.filter((packet) =>
        packet.attackType === "melee").reduce((sum, packet) =>
        sum + packet.expectedRemovalsAcrossModels, 0)),
      antiToughExpectedRemovals: round(weightedPackets.filter((packet) =>
        packet.antiToughMode !== "none").reduce((sum, packet) =>
        sum + packet.expectedRemovalsAcrossModels, 0)),
      sprayAttackCount: weightedPackets.filter((packet) => packet.spray)
        .reduce((sum, packet) => sum + packet.attackCountAcrossModels, 0),
      aoeAttackCount: weightedPackets.filter((packet) =>
        packet.aoe && packet.aoe !== "-").reduce((sum, packet) =>
        sum + packet.attackCountAcrossModels, 0),
      attackPacketCount: weightedPackets.length,
      geometryResolved: false,
      activationOrderingResolved: false,
      chargeBonusesIncluded: false,
      conditionalAttackChainsIncludedNumerically: false,
    },
    entryCombatRows,
    attackPackets: weightedPackets,
    ruleEvidence: allRuleRows,
    missingCardRows,
    quality: {
      sourceBound: missingCardRows.length === 0,
      exactDiceEnumeration: true,
      currentCardTextBound: true,
      strictTransitionEvaluated: false,
      policyEstimate: false,
      naturalWinRate: false,
      trainingTruth: false,
    },
    claimBoundary: "The combat envelope exactly enumerates independent attack and damage dice against the declared target profile. It is an optimistic contact envelope: movement paths, LOS, base occupancy, activation order, target allocation, conditional attack chains, scenario timing and opponent responses require strict state search before they can support a game result.",
  });
  return { ...core, evidenceHash: stableGraphHash(core) };
}

export function buildWarmachineRosterEvidenceSetV1(raw = {}) {
  const rows = (raw.rosters || []).map((roster) => buildWarmachineRosterRuleEvidenceV1({
    data: raw.data,
    roster,
    targetProfile: raw.targetProfile,
  }));
  const core = {
    schemaVersion: "warmachine_roster_rule_evidence_set_v1",
    target: rows[0]?.target || { ...DEFAULT_TARGET, ...(raw.targetProfile || {}) },
    evidenceCount: rows.length,
    rows,
    naturalWinRateClaimed: false,
    globalOptimalityProven: false,
  };
  return { ...stableGraphValue(core), evidenceSetHash: stableGraphHash(core) };
}
