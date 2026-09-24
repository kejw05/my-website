#!/bin/bash
set -euo pipefail

PERSIST_DIR="${WRANGLER_PERSIST_DIR:-.wrangler/state}"
GENERATED_SEED_PATH="${GENERATED_SEED_PATH:-tmp/seed.sql}"

mkdir -p "$(dirname "${GENERATED_SEED_PATH}")"

if [ -f migrations/seed.sql ]; then
  mv migrations/seed.sql "${GENERATED_SEED_PATH}"
fi

npx tsx scripts/generate-seed.ts > "${GENERATED_SEED_PATH}"
npx wrangler d1 execute my-website-db --local --persist-to "${PERSIST_DIR}" --file="${GENERATED_SEED_PATH}"
