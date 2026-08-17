import { buildWarmachineFixedSteamrollerFixtureV2 } from
  "../benchmark/fixed-steamroller-fixture-v2.mjs";
import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { warmachineHost } from "../warmachine-host-runtime.mjs";

export const WARMACHINE_STEAMROLLER_TERMINAL_EXECUTION_ROSTER_WITNESS_V1_SCHEMA =
  "warmachine_steamroller_terminal_execution_roster_witness_v1";

function sideRosterWitness(fixture = {}, sideKey = "") {
  const roster = fixture.rosters?.[sideKey] || {};
  const ledger = fixture.opening?.rosterPointLedger?.sides?.[sideKey] ||
    fixture.opening?.state?.rosterPointLedger?.sides?.[sideKey] || {};
  return stableGraphValue({
    sideKey,
    listKey: String(roster.listKey || ""),
    leader: String(roster.leader || ""),
    rosterPoints: Number(roster.rosterPoints ?? ledger.rosterPoints ?? 0),
    pieceCount: (fixture.stateTemplate?.pieces || []).filter((piece) =>
      piece.sideKey === sideKey).length,
  });
}

export function buildWarmachineSteamrollerTerminalExecutionRosterWitnessV1(
  rawOptions = {},
) {
  const fixture = rawOptions.fixture || buildWarmachineFixedSteamrollerFixtureV2({
    seed: String(rawOptions.seed || "steamroller-terminal-execution-roster-witness-v1"),
    faneListIndex: Number(rawOptions.faneListIndex || 0),
  });
  const sides = [
    sideRosterWitness(fixture, "player1"),
    sideRosterWitness(fixture, "player2"),
  ];
  const issues = [];
  if (fixture.opening?.strictDeploymentLegal !== true) {
    issues.push({ reason: "execution_roster_strict_deployment_not_proven" });
  }
  if (fixture.opening?.rosterProvenance?.completeForHardPruning !== true) {
    issues.push({ reason: "execution_roster_provenance_incomplete" });
  }
  for (const side of sides) {
    if (side.rosterPoints !== 100) {
      issues.push({
        reason: "execution_roster_points_not_100",
        sideKey: side.sideKey,
        rosterPoints: side.rosterPoints,
      });
    }
    if (!side.listKey || !side.leader || side.pieceCount <= 0) {
      issues.push({
        reason: "execution_roster_identity_incomplete",
        sideKey: side.sideKey,
      });
    }
  }
  const core = {
    schemaVersion: WARMACHINE_STEAMROLLER_TERMINAL_EXECUTION_ROSTER_WITNESS_V1_SCHEMA,
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    fixtureHash: fixture.fixtureHash,
    openingKey: fixture.opening?.openingKey || "",
    openingStateHash: fixture.bound?.stateHash || "",
    modelCount: fixture.bound?.modelCount || fixture.stateTemplate?.pieces?.length || 0,
    sides,
    source: fixture.source,
    strictDeploymentLegal: fixture.opening?.strictDeploymentLegal === true,
    rosterProvenanceComplete:
      fixture.opening?.rosterProvenance?.completeForHardPruning === true,
    complete: issues.length === 0,
    issues,
    claimBoundary: "This witness binds execution to two concrete legal 100-point rosters and their complete card-backed model set. It does not make a rule conclusion for a terminal state and does not claim that later authored positions are reachable from the witnessed deployment.",
    trainingTruth: false,
  };
  return {
    fixture,
    witness: stableGraphValue({
      ...core,
      witnessHash: stableGraphHash(core),
    }),
  };
}
