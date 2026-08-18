import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, "..");
const batchRoot = path.join(root, ".scratch/custom-matchup-reports/sepsira-six-swarms-vs-fane-v1/terminal-root-batch-v1");
const current = JSON.parse(fs.readFileSync(path.join(batchRoot, "CURRENT.json"), "utf8"));
const planDirectory = path.join(batchRoot, current.relativePlanDirectory);
const plan = JSON.parse(fs.readFileSync(path.join(planDirectory, "plan.json"), "utf8"));
const openingRuntime = JSON.parse(fs.readFileSync(path.join(planDirectory, "opening-batch-runtime.json"), "utf8"));
const taskKey = process.argv.find((argument) => argument.startsWith("--task-key="))?.slice("--task-key=".length) || "matchup-terminal-task-a0ab6c2382a68b56851473cd08fbbbaa";
const task = plan.selectedTasks.find((row) => row.taskKey === taskKey);
if (!task) throw new Error(`ticket05_candidate_audit_task_missing:${taskKey}`);
const opening = (openingRuntime.openings || []).find((row) =>
  row.openingKey === task.openingKey || row.openingKey === task.strictOpeningKey) ||
  (openingRuntime.openings || []).find((row) => row.scenarioKey === task.representative?.scenarioKey);
if (!opening?.state) throw new Error(`ticket05_candidate_audit_opening_missing:${taskKey}`);
const winnerSideKey = task.representative?.canonicalTerminal?.winnerSideKey || task.executionEnvelope?.winnerSideKey || "player2";
const allowed = new Set((task.executionEnvelope?.actorAxis?.candidates || []).map((row) => String(row.cardId || "")).filter(Boolean));
const cardId = (piece) => String(piece.cardId || piece.cardSnapshot?.id || piece.metadata?.cardId || "");
const melee = (piece) => [...(piece.attackProfiles || []), ...(piece.weaponProfiles || [])]
  .filter((profile) => String(profile.mode || "").toLowerCase() === "melee")
  .map((profile) => ({
    key: String(profile.profileKey || profile.weaponKey || ""),
    rangeIn: Number(profile.rangeIn ?? profile.range ?? 0),
    power: Number(profile.power ?? profile.pow ?? profile.pPlusS ?? 0),
    count: Number(profile.count ?? 1),
  })).filter((profile) => profile.key);
const inPlay = (piece) => !(piece.destroyed || piece.removedFromPlay || piece.offTable || piece.notDeployed);
const controllerKey = (piece) => String(piece.battlegroupControllerPieceKey || piece.controllerPieceKey || piece.metadata?.battlegroupControllerPieceKey || piece.metadata?.controllerPieceKey || "");
const rows = (opening.state.pieces || []).filter((piece) =>
  piece.sideKey === winnerSideKey && inPlay(piece) && melee(piece).length &&
  (!allowed.size || allowed.has(cardId(piece))))
  .map((piece) => {
    const semantic = {
      cardId: cardId(piece),
      label: String(piece.label || piece.name || ""),
      modelRole: String(piece.modelRole || ""),
      modelType: String(piece.modelType || ""),
      baseRadiusIn: Number(piece.baseRadiusIn ?? piece.baseDiameterIn ?? piece.baseSizeIn ?? 0),
      resource: Number(piece.resourcePoints ?? piece.focusPoints ?? piece.furyPoints ?? piece.focus ?? piece.fury ?? 0),
      resourceMax: Number(piece.resourceMax ?? piece.focusMax ?? piece.furyMax ?? piece.focusMax ?? piece.furyMax ?? 0),
      controllerKey: controllerKey(piece),
      melee: melee(piece),
      unitGroupId: String(piece.unitGroupId || piece.unitId || ""),
      activated: piece.activated === true,
      knockedDown: piece.knockedDown === true,
      stationary: piece.stationary === true,
      disrupted: piece.disrupted === true,
    };
    return { pieceKey: piece.pieceKey, semantic, semanticKey: JSON.stringify(semantic) };
  }).sort((a, b) => a.pieceKey.localeCompare(b.pieceKey));
const groups = new Map();
for (const row of rows) groups.set(row.semanticKey, [...(groups.get(row.semanticKey) || []), row.pieceKey]);
const result = {
  schemaVersion: "ticket05_assassination_candidate_class_audit_v1",
  taskKey,
  winnerSideKey,
  actorCandidateCount: rows.length,
  exactStaticSemanticClassCount: groups.size,
  classSizes: [...groups.values()].map((keys) => keys.length).sort((a, b) => b - a),
  classes: [...groups.entries()].map(([semanticKey, pieceKeys]) => ({
    semantic: JSON.parse(semanticKey),
    pieceKeys: pieceKeys.sort(),
    count: pieceKeys.length,
  })).sort((a, b) => b.count - a.count || a.pieceKeys[0].localeCompare(b.pieceKeys[0])),
};
console.log(JSON.stringify(result, null, 2));
