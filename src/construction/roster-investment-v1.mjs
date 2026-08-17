import { createHash } from "node:crypto";

export const WARMACHINE_ROSTER_POINT_LEDGER_SCHEMA = "warmachine_roster_point_ledger_v1";
export const WARMACHINE_LOW_POINT_DOMINANCE_SCHEMA = "warmachine_low_point_dominance_v1";

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, digits = 6) {
  const scale = 10 ** digits;
  return Math.round((numeric(value, 0) + Number.EPSILON) * scale) / scale;
}

function stableHash(value, length = 24) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, length);
}

function selectedOptionPointCost(piece = {}) {
  const card = piece.cardSnapshot || {};
  const selections = Array.isArray(card.selectedOptionChoices) ? card.selectedOptionChoices : [];
  let points = 0;
  const unresolvedSelections = [];
  for (const selection of selections) {
    const slot = (card.optionSlots || []).find((entry) =>
      String(entry.name || entry.slotName || entry.slotKey || "") ===
      String(selection.slotName || selection.name || selection.slotKey || ""));
    const choice = (slot?.choices || []).find((entry) =>
      String(entry.id || "") === String(selection.choiceId || selection.id || "") ||
      String(entry.name || "") === String(selection.choiceName || selection.value || ""));
    if (!choice || !Number.isFinite(Number(choice.pointCostNumber ?? choice.pointCost))) {
      unresolvedSelections.push({
        slotName: String(selection.slotName || selection.name || selection.slotKey || ""),
        choiceName: String(selection.choiceName || selection.value || selection.choiceId || selection.id || ""),
      });
      continue;
    }
    points += numeric(choice.pointCostNumber ?? choice.pointCost, 0);
  }
  return { points: round(points), unresolvedSelections };
}

function rosterEntryIdentity(piece = {}) {
  const card = piece.cardSnapshot || {};
  const cardId = String(card.id || piece.cardId || piece.cardKey || piece.sourceCardId || "");
  const instanceKey = String(
    piece.unitGroupId || piece.unitId || piece.cardInstanceId || piece.entryId || piece.metadata?.entryId || piece.pieceKey || "",
  );
  return {
    entryKey: `${instanceKey}|${cardId || piece.pieceKey || "unknown-card"}`,
    instanceKey,
    cardId,
    cardName: String(card.name || piece.cardName || piece.label || piece.name || ""),
    cardTypeName: String(card.cardTypeName || piece.cardTypeName || piece.cardType || piece.modelRole || ""),
  };
}

function declaredCompletePoints(completeArmyPointsBySide, sideKey, currentRosterPoints) {
  const raw = completeArmyPointsBySide && typeof completeArmyPointsBySide === "object"
    ? completeArmyPointsBySide[sideKey]
    : completeArmyPointsBySide;
  return Number.isFinite(Number(raw)) ? Math.max(0, numeric(raw, 0)) : currentRosterPoints;
}

export function buildWarmachineRosterPointLedger(state = {}, options = {}) {
  const sideKeys = Array.from(new Set((state.pieces || []).map((piece) => String(piece.sideKey || "")).filter(Boolean))).sort();
  const entriesBySide = new Map(sideKeys.map((sideKey) => [sideKey, new Map()]));
  for (const piece of state.pieces || []) {
    const sideKey = String(piece.sideKey || "");
    if (!sideKey) continue;
    if (!entriesBySide.has(sideKey)) entriesBySide.set(sideKey, new Map());
    const identity = rosterEntryIdentity(piece);
    const entries = entriesBySide.get(sideKey);
    if (!entries.has(identity.entryKey)) {
      const card = piece.cardSnapshot || {};
      const basePointRaw = card.pointCostNumber ?? card.pointCost ?? piece.pointCostNumber ?? piece.cardPoints ?? piece.pointCost;
      const optionPoints = selectedOptionPointCost(piece);
      entries.set(identity.entryKey, {
        ...identity,
        pointCost: Number.isFinite(Number(basePointRaw))
          ? round(numeric(basePointRaw, 0) + optionPoints.points)
          : null,
        basePointCost: Number.isFinite(Number(basePointRaw)) ? round(basePointRaw) : null,
        selectedOptionPointCost: optionPoints.points,
        unresolvedSelections: optionPoints.unresolvedSelections,
        pieceKeys: [],
      });
    }
    entries.get(identity.entryKey).pieceKeys.push(String(piece.pieceKey || ""));
  }

  const sides = {};
  for (const [sideKey, entryMap] of entriesBySide) {
    const entries = Array.from(entryMap.values()).map((entry) => ({
      ...entry,
      pieceKeys: entry.pieceKeys.sort(),
    })).sort((left, right) => left.entryKey.localeCompare(right.entryKey));
    const unresolvedEntries = entries.filter((entry) =>
      entry.pointCost == null || entry.unresolvedSelections.length > 0);
    const rosterPoints = round(entries.reduce((sum, entry) => sum + numeric(entry.pointCost, 0), 0));
    const referenceCompleteArmyPoints = round(declaredCompletePoints(
      options.completeArmyPointsBySide ?? options.armyPointsBySide,
      sideKey,
      rosterPoints,
    ));
    sides[sideKey] = {
      sideKey,
      rosterPoints,
      referenceCompleteArmyPoints,
      pointSlackToCompleteArmy: round(Math.max(0, referenceCompleteArmyPoints - rosterPoints)),
      isBelowCompleteArmyPoints: rosterPoints + 1e-9 < referenceCompleteArmyPoints,
      pointAccountingComplete: unresolvedEntries.length === 0,
      entryCount: entries.length,
      entries,
      unresolvedEntries,
    };
  }
  const identity = Object.fromEntries(Object.entries(sides).map(([sideKey, side]) => [sideKey, {
    rosterPoints: side.rosterPoints,
    referenceCompleteArmyPoints: side.referenceCompleteArmyPoints,
    entries: side.entries.map((entry) => ({
      entryKey: entry.entryKey,
      pointCost: entry.pointCost,
      pieceKeys: entry.pieceKeys,
    })),
  }]));
  return {
    schemaVersion: WARMACHINE_ROSTER_POINT_LEDGER_SCHEMA,
    ledgerKey: stableHash(identity),
    sides,
    pointAccountingComplete: Object.values(sides).every((side) => side.pointAccountingComplete),
    claimBoundary: "Points are counted once per roster entry, including selected modular-option costs. A low-point win is not an absolute matchup proof until all opponent responses and chance outcomes are exhausted.",
  };
}

export function assessWarmachineLowPointDominance(opening = {}, search = {}) {
  const winnerSideKey = String(search.terminalWitness?.winnerSideKey || "");
  const sideKeys = Object.keys(opening.rosters || {}).filter((sideKey) => opening.rosters?.[sideKey]?.sideKey);
  const loserSideKey = sideKeys.find((sideKey) => sideKey !== winnerSideKey) || "";
  const winner = opening.rosters?.[winnerSideKey] || null;
  const loser = opening.rosters?.[loserSideKey] || null;
  const winnerPoints = numeric(winner?.rosterPoints, Number.NaN);
  const loserPoints = numeric(loser?.rosterPoints, Number.NaN);
  const pointAccountingComplete = winner?.pointAccountingComplete === true && loser?.pointAccountingComplete === true;
  const winnerHasLowerRosterPoints = pointAccountingComplete && winnerPoints + 1e-9 < loserPoints;
  const opponentAtCompleteArmyPoints = pointAccountingComplete &&
    loserPoints + 1e-9 >= numeric(loser?.referenceCompleteArmyPoints, loserPoints);
  const winnerBelowCompleteArmyPoints = pointAccountingComplete &&
    winnerPoints + 1e-9 < numeric(winner?.referenceCompleteArmyPoints, winnerPoints);
  const lowPointVictoryCandidate = Boolean(winnerSideKey && loserSideKey && winnerHasLowerRosterPoints &&
    (opponentAtCompleteArmyPoints || winnerBelowCompleteArmyPoints));
  const interval = search.finiteSampleAdversarialInterval || {};
  const boundedResponseTreeComplete = interval.complete === true && numeric(interval.lowerBound, 0) >= 1 &&
    search.probabilityClaimBoundary?.boundedSelectedTreeForcedWinProven === true;
  const globalResponseAndChanceProofComplete = boundedResponseTreeComplete &&
    search.globalOptimalityProven === true &&
    search.probabilityClaimBoundary?.rulesChanceOutcomeExhaustive === true &&
    search.probabilityClaimBoundary?.fullLegalActionTreeExhaustive === true;
  const boundedTreeLowPointDominanceProven = lowPointVictoryCandidate && boundedResponseTreeComplete;
  const globalLowPointDominanceProven = lowPointVictoryCandidate && globalResponseAndChanceProofComplete;
  return {
    schemaVersion: WARMACHINE_LOW_POINT_DOMINANCE_SCHEMA,
    winnerSideKey,
    loserSideKey,
    winnerRosterPoints: Number.isFinite(winnerPoints) ? round(winnerPoints) : null,
    loserRosterPoints: Number.isFinite(loserPoints) ? round(loserPoints) : null,
    pointAdvantage: winnerHasLowerRosterPoints ? round(loserPoints - winnerPoints) : 0,
    winnerReferenceCompleteArmyPoints: winner ? numeric(winner.referenceCompleteArmyPoints, winnerPoints) : null,
    loserReferenceCompleteArmyPoints: loser ? numeric(loser.referenceCompleteArmyPoints, loserPoints) : null,
    winnerBelowCompleteArmyPoints,
    opponentAtCompleteArmyPoints,
    winnerHasLowerRosterPoints,
    pointAccountingComplete,
    lowPointVictoryCandidate,
    boundedTreeLowPointDominanceProven,
    globalLowPointDominanceProven,
    opponentUnanswerableInAnalyzedTree: boundedTreeLowPointDominanceProven,
    opponentGloballyUnanswerableProven: globalLowPointDominanceProven,
    status: globalLowPointDominanceProven
      ? "global_low_point_dominance_proven"
      : boundedTreeLowPointDominanceProven
        ? "bounded_tree_low_point_dominance_proven"
        : lowPointVictoryCandidate
          ? "low_point_victory_candidate"
          : "no_low_point_victory_evidence",
    claimBoundary: globalLowPointDominanceProven
      ? "The lower-point winner is proven over the declared exhaustive legal action and chance tree."
      : "A lower-point terminal witness is prioritized as dominance evidence, but omitted responses, chance mass, or search budgets keep global unanswerability unproven.",
  };
}
