#!/usr/bin/env bash
set -euo pipefail

batch_count="${1:-8}"
workdir="$(cd "$(dirname "$0")/.." && pwd)"
cd "$workdir"
log_dir=".scratch/custom-matchup-reports/sepsira-six-swarms-vs-fane-v1/terminal-root-batch-v1/microbatch-logs"
mkdir -p "$log_dir"

for index in $(seq 1 "$batch_count"); do
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  log_path="$log_dir/${timestamp}-task-${index}.log"
  echo "[ticket05-microbatch] start index=${index} log=${log_path}"
  set +e
  (
    timeout --signal=TERM --kill-after=15s 180s npm run execute:custom-matchup-terminal-root-batch -- --maximum-tasks=1
  ) >"$log_path" 2>&1
  exit_code=$?
  set -e
  tail -n 28 "$log_path"
  if [[ "$exit_code" -ne 0 ]]; then
    echo "[ticket05-microbatch] stopped index=${index} exit_code=${exit_code}; checkpoint remains the last atomically written state." >&2
    exit "$exit_code"
  fi
done

echo "[ticket05-microbatch] completed count=${batch_count}"
