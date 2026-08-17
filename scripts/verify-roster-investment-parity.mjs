import assert from "node:assert/strict";

import {
  assessWarmachineLowPointDominance,
  buildWarmachineRosterPointLedger,
} from "../src/construction/roster-investment-v1.mjs";
import { loadLegacyReverseSearchModules } from "../src/upstream-project-d.mjs";

const { modules: legacyModules } = await loadLegacyReverseSearchModules({
  moduleKeys: ["rosterInvestment"],
});
const legacy = legacyModules.rosterInvestment;

const state = {
  pieces: [
    {
      pieceKey: "unit-a-1",
      unitGroupId: "unit-a",
      sideKey: "player1",
      label: "Synthetic Unit",
      boxesRemaining: 1,
      cardSnapshot: {
        id: "unit-card",
        name: "Synthetic Unit",
        cardTypeName: "Unit",
        pointCostNumber: 8,
        selectedOptionChoices: [],
      },
    },
    {
      pieceKey: "unit-a-2",
      unitGroupId: "unit-a",
      sideKey: "player1",
      label: "Synthetic Unit",
      boxesRemaining: 1,
      cardSnapshot: {
        id: "unit-card",
        name: "Synthetic Unit",
        cardTypeName: "Unit",
        pointCostNumber: 8,
        selectedOptionChoices: [],
      },
    },
    {
      pieceKey: "solo-b",
      sideKey: "player2",
      label: "Synthetic Solo",
      boxesRemaining: 5,
      cardSnapshot: {
        id: "solo-card",
        name: "Synthetic Solo",
        cardTypeName: "Solo",
        pointCostNumber: 4,
        selectedOptionChoices: [],
      },
    },
  ],
};
const localLedger = buildWarmachineRosterPointLedger(state);
assert.deepEqual(localLedger, legacy.buildWarmachineRosterPointLedger(state));

const opening = {
  openingKey: "synthetic-opening",
  rosterPointLedger: localLedger,
  perspectiveSideKey: "player1",
};
const search = {
  terminalWinnerSideKey: "player1",
  searchedPointInvestment: 8,
  opposingPointInvestment: 20,
  exact: false,
};
assert.deepEqual(
  assessWarmachineLowPointDominance(opening, search),
  legacy.assessWarmachineLowPointDominance(opening, search),
);

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_roster_investment_parity_v1",
  ledgerEntryCount: Object.values(localLedger.sides).reduce((sum, side) => sum + side.entryCount, 0),
  parityCaseCount: 2,
}, null, 2));
