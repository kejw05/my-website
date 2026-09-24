#!/bin/bash
# Start the full Pages app locally for Playwright E2E tests

set -euo pipefail

PORT="${PORT:-4173}"
PERSIST_DIR="${WRANGLER_PERSIST_DIR:-.wrangler/state}"
TEST_ADMIN_API_KEY="${TEST_ADMIN_API_KEY:-test-key-for-local-dev-123}"
ADMIN_API_KEY_VALUE="${ADMIN_API_KEY:-${TEST_ADMIN_API_KEY:-test-key-for-local-dev-123}}"
export ADMIN_API_KEY="${ADMIN_API_KEY_VALUE}"
GENERATED_SEED_PATH="${GENERATED_SEED_PATH:-tmp/seed.sql}"
WRANGLER_PID=""
DEV_VARS_FILE="$(mktemp -t my-website-e2e-dev-vars.XXXXXX)"

sync_local_d1_state() {
  local db_dir="${PERSIST_DIR}/v3/d1/miniflare-D1DatabaseObject"
  [ -d "${db_dir}" ] || return 0

  local source_db=""
  local db_file=""
  for db_file in "${db_dir}"/*.sqlite; do
    [ -f "${db_file}" ] || continue
    if sqlite3 "${db_file}" ".tables" | grep -q '\bdestinations\b'; then
      source_db="${db_file}"
      break
    fi
  done

  [ -n "${source_db}" ] || return 0

  for db_file in "${db_dir}"/*.sqlite; do
    [ -f "${db_file}" ] || continue
    if ! sqlite3 "${db_file}" ".tables" | grep -q '\bdestinations\b'; then
      echo "Syncing local D1 state into $(basename "${db_file}")..."
      sqlite3 "${db_file}" ".restore ${source_db}"
    fi
  done
}

all_local_d1_dbs_ready() {
  local db_dir="${PERSIST_DIR}/v3/d1/miniflare-D1DatabaseObject"
  [ -d "${db_dir}" ] || return 1

  local saw_db=1
  local db_file=""
  for db_file in "${db_dir}"/*.sqlite; do
    [ -f "${db_file}" ] || continue
    saw_db=0
    if ! sqlite3 "${db_file}" ".tables" | grep -q '\bdestinations\b'; then
      return 1
    fi
  done

  return ${saw_db}
}


cleanup() {
  rm -f "${DEV_VARS_FILE}"

  if [ -n "${WRANGLER_PID}" ]; then
    kill "${WRANGLER_PID}" 2>/dev/null || true
    wait "${WRANGLER_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "Building frontend..."
npm run build

echo "Preparing local D1 database..."
if [ -f "migrations/seed.sql" ]; then
  echo "Temporarily moving generated migrations/seed.sql out of the migrations directory to avoid Wrangler replaying it as a schema migration..."
  mkdir -p tmp
  mv migrations/seed.sql "${GENERATED_SEED_PATH}"
fi
npm run db:migrate:local
mkdir -p "$(dirname "${GENERATED_SEED_PATH}")"
npx tsx scripts/generate-seed.ts > "${GENERATED_SEED_PATH}"
npx wrangler d1 execute my-website-db --local --persist-to "${PERSIST_DIR}" --file="${GENERATED_SEED_PATH}"

cat > "${DEV_VARS_FILE}" <<EOF
ADMIN_API_KEY=${ADMIN_API_KEY:-$TEST_ADMIN_API_KEY}
EOF

echo "Starting Wrangler Pages dev server on port ${PORT}..."
ADMIN_API_KEY="${ADMIN_API_KEY_VALUE}" npx wrangler pages dev dist \
  --d1 DB=my-website-db \
  --r2 PHOTOS=my-website-photos \
  --binding "ADMIN_API_KEY=${ADMIN_API_KEY:-$TEST_ADMIN_API_KEY}" \
  --port "${PORT}" \
  --persist-to "${PERSIST_DIR}" \
  --local \
  --env-file "${DEV_VARS_FILE}" \
  &

WRANGLER_PID=$!

echo "Waiting for server to start..."
ready_checks=0
for i in {1..30}; do
  sync_local_d1_state || true

  if curl -s "http://localhost:${PORT}/api/health" > /dev/null 2>&1 && all_local_d1_dbs_ready; then
    ready_checks=$((ready_checks + 1))
    if [ "${ready_checks}" -ge 2 ]; then
      echo "Server is ready!"
      wait "${WRANGLER_PID}"
      exit $?
    fi
  else
    ready_checks=0
  fi

  if [ "$i" -eq 30 ]; then
    echo "Server failed to start in time"
    exit 1
  fi

  sleep 1
done
