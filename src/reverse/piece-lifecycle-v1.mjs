export const WARMACHINE_PIECE_LIFECYCLE_V1_SCHEMA =
  "warmachine_piece_lifecycle_v1";

function statusTags(piece = {}) {
  return new Set([
    ...(piece.statusTags || []),
    ...(piece.statuses || []),
  ].map((tag) => String(tag).toLowerCase()));
}

export function warmachinePieceLifecycleStageV1(piece = {}) {
  const tags = statusTags(piece);
  if (piece.removedFromPlay === true || piece.removed_from_play === true ||
      tags.has("removed_from_play")) return "removed_from_play";
  if (piece.destroyed === true || tags.has("destroyed")) return "destroyed";
  if (piece.boxed === true || tags.has("boxed")) return "boxed";
  if (piece.disabled === true || tags.has("disabled")) return "disabled";
  if (piece.offTable === true || tags.has("off_table")) return "off_table";
  if (piece.notDeployed === true || tags.has("not_deployed")) return "not_deployed";
  if (piece.dormantReplacement === true || piece.replacementStartsDormant === true ||
      tags.has("dormant") || tags.has("dormant_replacement")) return "dormant";
  const boxesRemaining = Number(piece.damage?.boxesRemaining ?? piece.boxesRemaining ?? 1);
  if (!Number.isFinite(boxesRemaining) || boxesRemaining <= 0) return "disabled";
  return "in_play";
}

export function warmachinePieceInPlayV1(piece = {}) {
  return warmachinePieceLifecycleStageV1(piece) === "in_play";
}
