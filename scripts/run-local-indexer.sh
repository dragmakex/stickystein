#!/usr/bin/env bash
set -euo pipefail

cd /home/sticky/git/stickystein
export PATH="/home/sticky/.bun/bin:$PATH"

for dataset in 9 10; do
  export PDF_DATA_DIR="data/DataSet $dataset"
  echo "[index] Starting DataSet $dataset from $PDF_DATA_DIR"
  /home/sticky/.bun/bin/bun run scripts/index-corpus.ts
  echo "[index] Finished DataSet $dataset"
done
