#!/bin/bash
# Start a local Pages dev server for API integration tests.
# This script is wired to `npm run test:api` and reused by CI.

set -euo pipefail

PORT="${PORT:-${TEST_API_PORT:-8788}}"
PERSIST_DIR="${WRANGLER_PERSIST_DIR:-.wrangler/state}"
TEST_ADMIN_API_KEY="${TEST_ADMIN_API_KEY:-test-key-for-local-dev-123}"
ADMIN_API_KEY_VALUE="${ADMIN_API_KEY:-$TEST_ADMIN_API_KEY}"
export ADMIN_API_KEY="${ADMIN_API_KEY_VALUE}"
GENERATED_SEED_PATH="${GENERATED_SEED_PATH:-tmp/seed.sql}"
WRANGLER_PID=""
DEV_VARS_FILE="$(mktemp -t my-website-dev-vars.XXXXXX)"

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

cleanup() {
  rm -f "${DEV_VARS_FILE}"

  if [ -n "${WRANGLER_PID}" ]; then
    echo "Stopping server..."
    kill "${WRANGLER_PID}" 2>/dev/null || true
    wait "${WRANGLER_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# Build frontend first
# TODO: if this gets too slow, split out a lighter-weight server path for API-only tests.
echo "Building frontend..."
npm run build

# Apply migrations to the same persisted local state that wrangler pages dev will use.
echo "Setting up test database..."
npm run db:migrate:local

echo "Seeding test database..."
mkdir -p "$(dirname "${GENERATED_SEED_PATH}")"
npx tsx scripts/generate-seed.ts > "${GENERATED_SEED_PATH}"
npx wrangler d1 execute my-website-db --local --persist-to "${PERSIST_DIR}" --file="${GENERATED_SEED_PATH}"

cat > "${DEV_VARS_FILE}" <<EOF
ADMIN_API_KEY=${ADMIN_API_KEY:-$TEST_ADMIN_API_KEY}
EOF

# Start wrangler dev in background
echo "Starting Wrangler dev server on port ${PORT} with test ADMIN_API_KEY..."
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

# Wait for server to be ready
echo "Waiting for server to start..."
for i in {1..30}; do
  if curl -s "http://localhost:${PORT}/api/health" > /dev/null 2>&1; then
    sync_local_d1_state
    echo "Server is ready!"
    break
  fi

  if [ "$i" -eq 30 ]; then
    echo "Server failed to start in time"
    exit 1
  fi

  sleep 1
done

# Run tests
TEST_COMMAND="${TEST_COMMAND:-npm run test:api:only}"
echo "Running tests: ${TEST_COMMAND}"
TEST_API_URL="http://localhost:${PORT}" TEST_ADMIN_API_KEY="${TEST_ADMIN_API_KEY}" bash -lc "${TEST_COMMAND}"

echo "Done!"
