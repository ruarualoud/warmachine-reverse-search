#!/usr/bin/env node

import fs from "node:fs";

import {
  buildWarmachineRulesetSemanticIndexV1,
  REVIEWED_RULESET_SEMANTIC_INDEX_V1_URL,
} from "../src/contracts/ruleset-change-impact-v1.mjs";

if (fs.existsSync(REVIEWED_RULESET_SEMANTIC_INDEX_V1_URL)) {
  throw new Error("reviewed_ruleset_semantic_index_already_exists");
}
const index = buildWarmachineRulesetSemanticIndexV1();
fs.writeFileSync(
  REVIEWED_RULESET_SEMANTIC_INDEX_V1_URL,
  `${JSON.stringify(index, null, 2)}\n`,
  { flag: "wx" },
);
console.log(JSON.stringify({
  ok: true,
  semanticIndexHash: index.semanticIndexHash,
  counts: index.counts,
}, null, 2));
