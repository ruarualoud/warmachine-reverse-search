import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const contracts = [
  {
    file: "src/reverse/terminal-event-predecessor-v1.mjs",
    markers: ["terminal_inverse_successor", "terminal_inverse_predecessor"],
  },
  {
    file: "src/reverse/movement-activation-predecessor-v1.mjs",
    markers: [
      "movement_inverse_successor",
      "movement_inverse_predecessor",
      "unit_deployment_formation_predecessor",
    ],
  },
  {
    file: "src/reverse/pass-activation-predecessor-v1.mjs",
    markers: [
      "pass_inverse_successor",
      "pass_inverse_predecessor",
      "pass_sequence_root",
    ],
  },
  {
    file: "src/reverse/control-phase-predecessor-v1.mjs",
    markers: ["control_inverse_successor", "control_inverse_predecessor"],
  },
  {
    file: "src/reverse/previous-turn-end-predecessor-v1.mjs",
    markers: [
      "previous_turn_inverse_successor",
      "previous_turn_inverse_predecessor",
    ],
  },
  {
    file: "src/reverse/activation-sequence-predecessor-v2.mjs",
    markers: ["activation_reverse_frontier"],
  },
  {
    file: "src/reverse/replay-terminal-reverse-route-v1.mjs",
    markers: [
      "full_route_replay_opening",
      "full_route_replay_edge_successor",
    ],
  },
  {
    file: "src/reverse/materialized-terminal-root-to-deployment-v1.mjs",
    markers: [
      "materialized_terminal_replay_predecessor",
      "materialized_terminal_replay_step_successor",
    ],
  },
  {
    file: "src/reverse/strict-route-witness-v2.mjs",
    markers: [
      "strict_terminal_route_initial",
      "strict_terminal_route_step_successor",
      "executed_terminal_route_initial",
      "executed_terminal_route_final",
    ],
  },
  {
    file: "src/reverse/terminal-rooted-to-deployment-v1.mjs",
    markers: ["terminal_rooted_frontier"],
  },
  {
    file: "src/reverse/terminal-rooted-worklist-v1.mjs",
    markers: ["terminal_rooted_worklist_root"],
  },
];

const coverage = [];
for (const contract of contracts) {
  const source = await readFile(new URL(`../${contract.file}`, import.meta.url),
    "utf8");
  assert.match(source, /auditWarmachineReverseStateBoundaryV1/,
    `${contract.file} must call the shared reverse-state invariant audit`);
  for (const marker of contract.markers) {
    assert.equal(source.includes(marker), true,
      `${contract.file} is missing invariant boundary ${marker}`);
  }
  coverage.push({
    file: contract.file,
    boundaryCount: contract.markers.length,
    boundaries: contract.markers,
  });
}

const formationSource = await readFile(new URL(
  "../src/reverse/unit-deployment-formation-predecessor-v1.mjs",
  import.meta.url,
), "utf8");
assert.match(formationSource, /validateCandidate/);
assert.match(formationSource, /candidateValidationRejectedCount/);

console.log(JSON.stringify({
  schemaVersion: "verify_reverse_state_invariant_coverage_v1",
  coveredModuleCount: coverage.length,
  coveredBoundaryCount: coverage.reduce((sum, row) =>
    sum + row.boundaryCount, 0),
  formationAcceptedCandidateValidationRequired: true,
  coverage,
}, null, 2));
