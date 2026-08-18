#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  advanceWarmachineMatchupTerminalCandidateProgressV1,
  auditWarmachineMatchupTerminalCandidateProgressV1,
  buildWarmachineMatchupTerminalCandidateChunkPlanV1,
  buildWarmachineMatchupTerminalCandidateProgressV1,
} from "../src/matchup/matchup-terminal-candidate-chunk-v1.mjs";

const slots = [];
for (const actorPieceKey of ["actor-a", "actor-b"]) {
  for (let anchorIndex = 0; anchorIndex < 2; anchorIndex += 1) {
    for (let angleIndex = 0; angleIndex < 4; angleIndex += 1) {
      slots.push({
        actorPieceKey,
        anchorIndex,
        angleIndex,
        attackProfileKey: "melee-weapon-a",
        actionRange: "outside_direct_action_range_requires_prior_movement",
      });
    }
  }
}

const candidatePlan = buildWarmachineMatchupTerminalCandidateChunkPlanV1({
  taskKey: "task-example",
  behaviorSignatureHash: "behavior-example",
  terminalTaskExecutionContractVersion: "contract-example",
  candidateEnumerationVersion: "geometry-slots-v1",
  hostReceiptHash: "host-example",
  constructionHostReceiptHash: "construction-example",
  slots,
});
assert.equal(candidatePlan.totalSlotCount, 16);

const initial = buildWarmachineMatchupTerminalCandidateProgressV1({
  candidatePlan,
  updatedAtMs: 1,
});
assert.equal(auditWarmachineMatchupTerminalCandidateProgressV1(initial, candidatePlan).ok,
  true);
assert.equal(initial.examinedSlotCount, 0);
assert.equal(initial.remainingSlotCount, 16);

const first = advanceWarmachineMatchupTerminalCandidateProgressV1({
  candidatePlan,
  progress: initial,
  maximumSlotCount: 5,
  candidateEvidenceHash: "chunk-one-evidence",
  updatedAtMs: 2,
});
assert.equal(first.nextSlotIndex, 5);
assert.equal(first.examinedSlotCount, 5);
assert.equal(first.remainingSlotCount, 11);
assert.equal(first.completedChunks.length, 1);
assert.equal(auditWarmachineMatchupTerminalCandidateProgressV1(first, candidatePlan).ok,
  true);

const complete = advanceWarmachineMatchupTerminalCandidateProgressV1({
  candidatePlan,
  progress: first,
  maximumSlotCount: 99,
  candidateEvidenceHash: "chunk-two-evidence",
  acceptedCandidateSemanticHash: "strict-candidate-semantic-hash",
  updatedAtMs: 3,
});
assert.equal(complete.nextSlotIndex, 16);
assert.equal(complete.examinedSlotCount + complete.remainingSlotCount, 16);
assert.equal(complete.completedChunks.length, 2);
assert.equal(complete.acceptedCandidateSemanticHash,
  "strict-candidate-semantic-hash");
assert.equal(auditWarmachineMatchupTerminalCandidateProgressV1(complete, candidatePlan).ok,
  true);

const tampered = {
  ...complete,
  nextSlotIndex: 15,
};
const tamperAudit = auditWarmachineMatchupTerminalCandidateProgressV1(
  tampered,
  candidatePlan,
);
assert.equal(tamperAudit.ok, false);
assert.ok(tamperAudit.issues.includes(
  "matchup_terminal_candidate_progress_hash_invalid",
));

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_matchup_terminal_candidate_chunk_v1",
  candidatePlanHash: candidatePlan.candidatePlanHash,
  initialProgressHash: initial.progressHash,
  firstProgressHash: first.progressHash,
  completeProgressHash: complete.progressHash,
  totalSlotCount: candidatePlan.totalSlotCount,
  claimBoundary: "This verifier proves only chunk cursor integrity, candidate-set binding and mass conservation. It does not prove a Warmachine route, action legality, terminal reachability, strategy value or win rate.",
}, null, 2));
