import assert from "node:assert/strict";

import {
  buildWarmachineRulesV1StateFromLayer3Room,
  enumerateRulesV1Actions,
} from "../src/warmachine-host-runtime.mjs";
import {
  advanceWarmachineCurrentDecisionWindowV1,
} from "../src/search/current-decision-window-domain-v1.mjs";

const DRAG_SOURCE_ID = "a474e3c0-83d0-4ab8-928f-5bb5917c3ee6";
const DRAG_SOURCE_TEXT = "If this model hits an enemy model with an equal or smaller base with a basic attack with this weapon, immediately after the attack is resolved the hit model can be pushed directly toward this model until it contacts a model, an obstacle, or an obstruction.";

const room = {
  id: "free-strike-forced-push-layer3-v1",
  game: {
    width: 48,
    height: 48,
    phase: "activation",
    clockActivePlayer: 1,
    turnNumber: 1,
    strictMode: true,
    strictRun: true,
    enforceStrictExecutor: true,
  },
  tokens: {
    mover: {
      id: "mover",
      pieceKey: "mover",
      label: "Mover",
      sourceListOwner: "player1",
      x: 8,
      y: 8,
      width: 1.18,
      speedIn: 6,
      maxMeleeRange: 1,
      meleePower: 12,
      mat: 6,
      defense: 12,
      armor: 12,
      damage: { maxBoxes: 40, boxesRemaining: 40 },
    },
    reactor: {
      id: "reactor",
      pieceKey: "reactor",
      label: "Drag Reactor",
      sourceListOwner: "player2",
      x: 9.4,
      y: 8,
      width: 1.18,
      speedIn: 6,
      maxMeleeRange: 1,
      meleePower: 10,
      mat: 8,
      defense: 12,
      armor: 12,
      attackProfiles: [{
        profileKey: "drag-claw",
        sourceWeaponId: "drag-claw-source",
        name: "Drag Claw",
        mode: "melee",
        rangeIn: 1,
        power: 10,
        attackStatKind: "MAT",
        attackStat: 8,
        specialRules: [{
          id: DRAG_SOURCE_ID,
          sourceIds: [DRAG_SOURCE_ID],
          sourceTexts: [DRAG_SOURCE_TEXT],
          ruleKey: "unmapped_drag",
          name: "Drag",
          description: DRAG_SOURCE_TEXT,
        }],
      }],
    },
  },
  logs: {},
  widgets: {},
  shapes: {},
  deployments: {},
};

const state = buildWarmachineRulesV1StateFromLayer3Room(room);
state.disengagementRuleMode = "legacy_free_strike";
const movement = enumerateRulesV1Actions(state).actions.find((candidate) =>
  candidate.actorPieceKey === "mover" &&
  candidate.metadata?.freeStrikeResolutionRequirements?.length === 1);
assert.ok(movement, "fixture needs one legacy Free Strike movement");

const freeStrikeWindow = advanceWarmachineCurrentDecisionWindowV1(
  state,
  movement.actionKey,
);
assert.equal(freeStrikeWindow.transitionAccepted, true);
assert.equal(freeStrikeWindow.nextDecisionOwnerSideKey, "player2");
const useDrag = freeStrikeWindow.nextDecisionWindowDomain.optionRows.find((row) =>
  row.disposition === "host_accepted" && /:use:/.test(row.actionKey));
assert.ok(useDrag, "reacting player needs an executable Free Strike choice");

const pushed = advanceWarmachineCurrentDecisionWindowV1(
  freeStrikeWindow.successorState,
  useDrag.actionKey,
  {
    actionPatch: {
      metadata: {
        strictRollOutcome: {
          freeStrikeOutcomesByEnemy: {
            reactor: {
              attackDice: [6, 5],
              damageDice: [1, 1, 1],
              dragAccepted: true,
            },
          },
        },
      },
    },
  },
);
assert.equal(pushed.transitionAccepted, true);
assert.equal(pushed.nextDecisionOwnerSideKey, "player1");
assert.ok(pushed.nextStrictContinuationWindowFlags.includes(
  "strictFreeStrikeMovementContinuationWindowOnly",
));
const pushedPosition = structuredClone(
  pushed.successorState.pieces.find((piece) => piece.pieceKey === "mover").position,
);

const stop = pushed.nextDecisionWindowDomain.optionRows.find((row) =>
  row.disposition === "host_accepted" &&
  row.actionEvidence?.actionType === "resolve_free_strike_movement_continuation_window");
assert.ok(stop, "moving player needs an executable stop choice after the push");
const stopped = advanceWarmachineCurrentDecisionWindowV1(
  pushed.successorState,
  stop.actionKey,
);
assert.equal(stopped.transitionAccepted, true);
assert.deepEqual(
  stopped.successorState.pieces.find((piece) => piece.pieceKey === "mover").position,
  pushedPosition,
);
assert.ok(!stopped.nextStrictContinuationWindowFlags.includes(
  "strictFreeStrikeMovementContinuationWindowOnly",
));

console.log(JSON.stringify({
  schemaVersion: "free_strike_forced_push_layer3_verifier_v1",
  targetScope: "shared_engine_layer3_search_interface_only",
  freeStrikeDecisionOwner: "player2",
  postPushDecisionOwner: "player1",
  pushedPositionPreservedAfterStop: true,
  otherFactionRulesChecked: false,
}, null, 2));
