import fs from "node:fs";
import path from "node:path";

import { buildWarmachineRealMatchOneSideCorpusV1 } from
  "../src/benchmark/real-match-one-side-corpus-v1.mjs";

const outputArgument = process.argv.find((argument) => argument.startsWith("--output="));
const outputPath = outputArgument
  ? path.resolve(outputArgument.slice("--output=".length))
  : "";
const corpus = buildWarmachineRealMatchOneSideCorpusV1();

if (!corpus.quality.readyForOneSideConstraintMaterialization) {
  throw new Error(`real_match_one_side_corpus_invalid:${corpus.quality.issues.join(",")}`);
}

const serialized = `${JSON.stringify(corpus, null, 2)}\n`;
if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, serialized);
}

console.log(JSON.stringify({
  schemaVersion: corpus.schemaVersion,
  corpusHash: corpus.corpusHash,
  counts: corpus.counts,
  quality: corpus.quality,
  outputPath,
}, null, 2));
