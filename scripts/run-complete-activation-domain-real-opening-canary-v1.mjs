import crypto from "node:crypto";
import fs from "node:fs";

import {
  buildWarmachineRulesV1StateFromLayer3Room,
  resolveWarmachineHostPath,
} from "../src/warmachine-host-runtime.mjs";
import {
  buildWarmachineCompleteActivationDomainPlanV2,
  exhaustWarmachineCompleteActivationDomainV2,
} from "../src/search/complete-activation-domain-v2.mjs";

const DEFAULT_ROOM_STORE = resolveWarmachineHostPath(
  "build/warmachine-ai/sepsira-swarm-vs-fane-v20260805/strict-construction-search-v2/deep/cryx-recursion-screen-fane-ashmael-scenario-blender-balanced-collision-player1-e4937ca7b578/input-room-store.tmp.json",
);

function argumentValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || fallback) : fallback;
}

const roomStorePath = argumentValue("--room-store", DEFAULT_ROOM_STORE);
const pageLimit = Number(argumentValue("--page-limit", "6"));
const verifyFullHostParity = process.argv.includes("--full-host-parity");
const bytes = fs.readFileSync(roomStorePath);
const store = JSON.parse(bytes);
const [roomKey, room] = Object.entries(store.roomsById || {})[0] || [];
if (!room) throw new Error("complete_activation_domain_canary_room_missing");

const state = buildWarmachineRulesV1StateFromLayer3Room(room, {
  strictMode: true,
  enforceStrictExecutor: true,
});
const plan = buildWarmachineCompleteActivationDomainPlanV2(state);
const startedAt = Date.now();
const result = exhaustWarmachineCompleteActivationDomainV2(state, {
  pageLimit,
  verifyFullHostParity,
  onPage(page) {
    process.stderr.write(`${JSON.stringify({
      event: "complete_activation_domain_canary_page",
      pageEndSlotIndexExclusive: page.pageEndSlotIndexExclusive,
      slotCount: plan.slotCount,
      elapsedMs: Date.now() - startedAt,
      pageReceiptHash: page.pageReceiptHash,
    })}\n`);
  },
});

console.log(JSON.stringify({
  schemaVersion: "warmachine_complete_activation_domain_real_opening_canary_v1",
  sourceRoomStoreSha256: crypto.createHash("sha256").update(bytes).digest("hex"),
  roomKey,
  elapsedMs: Date.now() - startedAt,
  modelCount: state.pieces.length,
  activationGroupCount: plan.activationGroupCount,
  actionFamilyCount: plan.actionFamilyCount,
  slotCount: plan.slotCount,
  pageCount: result.pageCount,
  slotReceiptCount: result.slotReceiptCount,
  acceptedActionCount: result.acceptedActionCount,
  rejectedActionCount: result.rejectedActionCount,
  actionAssignmentUnique: result.actionAssignmentUnique,
  actorFamilySlotDenominatorComplete: result.actorFamilySlotDenominatorComplete,
  fullHostParityRequested: result.fullHostParityRequested,
  acceptedActionKeyParity: result.acceptedActionKeyParity,
  rejectedActionIdentityParity: result.rejectedActionIdentityParity,
  discreteSlotDenominatorComplete: result.discreteSlotDenominatorComplete,
  continuousDomainDebtCount: result.continuousDomainDebtCount,
  continuousDomainComplete: result.continuousDomainComplete,
  activationDomainComplete: result.activationDomainComplete,
  chanceMassAssigned: result.chanceMassAssigned,
  activationDomainPlanHash: plan.activationDomainPlanHash,
  completeActivationDomainReceiptHash: result.completeActivationDomainReceiptHash,
}, null, 2));
