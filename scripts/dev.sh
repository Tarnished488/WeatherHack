#!/usr/bin/env bash
# Start the whole stack for local development:
#   * FastAPI backend on http://127.0.0.1:8000  (background, logs/backend.log)
#   * Vite dev server on http://localhost:5173  (foreground, proxies /api)
#
#   ./scripts/dev.sh
#
# Ctrl-C stops the frontend and the backend this script started. A backend that
# was already running before the script is left alone (use restart-backend.sh).

set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

started_backend=false
FRONTEND_PID=""
cleanup() {
  trap - EXIT INT TERM
  echo
  if [[ -n "$FRONTEND_PID" ]]; then
    echo "Stopping frontend (pid $FRONTEND_PID) ..."
    kill_tree "$FRONTEND_PID"
  fi
  # Only stop the backend this script started; one that was already running
  # before belongs to whoever started it.
  if [[ "$started_backend" == true && -n "$BACKEND_PID" ]]; then
    echo "Stopping backend (pid $BACKEND_PID) ..."
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
  exit 0
}
trap cleanup EXIT INT TERM

# --- backend -----------------------------------------------------------------
if [[ -n "$(backend_pids)" ]]; then
  echo "Backend already running on port $BACKEND_PORT, reusing it."
  echo "  (restart it with ./scripts/restart-backend.sh)"
else
  start_backend
  started_backend=true
  wait_for_backend
fi

# --- frontend ----------------------------------------------------------------
if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
  echo "node_modules is missing, running npm install first ..."
  ( cd "$FRONTEND_DIR" && npm install )
fi

echo
echo "  Backend  : http://127.0.0.1:$BACKEND_PORT     docs: /docs   log: logs/backend.log"
echo "  Frontend : http://localhost:5173 (Vite picks the next free port if 5173 is taken)"
echo

# Run the dev server in the background and wait on it, so that a signal is
# handled straight away instead of after the frontend exits.
cd "$FRONTEND_DIR"
npm run dev &
FRONTEND_PID=$!
wait "$FRONTEND_PID"
