#!/usr/bin/env bash
set -euo pipefail

batch_count="${1:-8}"
workdir="$(cd "$(dirname "$0")/.." && pwd)"
cd "$workdir"
batch_root=".scratch/custom-matchup-reports/sepsira-six-swarms-vs-fane-v1/terminal-root-batch-v1"
log_dir="$batch_root/microbatch-logs"
current_path="$batch_root/CURRENT.json"
mkdir -p "$log_dir"

if [[ ! -f "$current_path" ]]; then
  echo "[ticket05-microbatch] missing-current-plan path=$current_path" >&2
  exit 2
fi

for index in $(seq 1 "$batch_count"); do
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  plan_hash="$(sed -n 's/.*"planHash": "\([^"]*\)".*/\1/p' "$current_path" | head -n 1)"
  checkpoint_path="$batch_root/plans/$plan_hash/checkpoint.json"
  log_path="$log_dir/${timestamp}-chunk-${index}.log"
  progress_path="${log_path%.log}.progress.ndjson"
  observation_path="${log_path%.log}.observation.json"
  if [[ -z "$plan_hash" || ! -f "$checkpoint_path" ]]; then
    echo "[ticket05-microbatch] missing-sealed-checkpoint planHash=$plan_hash" >&2
    exit 2
  fi
  echo "[ticket05-microbatch] start index=$index planHash=$plan_hash log=$log_path"
  set +e
  node scripts/execute-custom-matchup-terminal-root-batch-v1.mjs \
    --maximum-tasks=1 --progress-log="$progress_path" >"$log_path" 2>&1
  exit_code=$?
  set -e
  node scripts/observe-ticket05-progress-v1.mjs \
    --progress-log="$progress_path" \
    --checkpoint="$checkpoint_path" \
    --stale-after-ms=300000 >"$observation_path"
  tail -n 20 "$log_path"
  cat "$observation_path"
  if [[ "$exit_code" -ne 0 ]]; then
    echo "[ticket05-microbatch] failed index=$index exit_code=$exit_code; the last atomically written checkpoint remains recoverable." >&2
    exit "$exit_code"
  fi
done

echo "[ticket05-microbatch] completed count=$batch_count"
