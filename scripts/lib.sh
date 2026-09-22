#!/usr/bin/env bash
# Shared helpers for the local dev scripts (dev.sh, restart-backend.sh).
# This file is meant to be sourced, not executed directly.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
LOG_DIR="$ROOT_DIR/logs"

# Both ports are fixed elsewhere (app/api.py binds 8000, the Vite dev proxy
# targets 127.0.0.1:8000), so the scripts follow them rather than configure them.
BACKEND_PORT=8000
BACKEND_LOG="$LOG_DIR/backend.log"
BACKEND_PID_FILE="$LOG_DIR/backend.pid"

# Path of the interpreter that started the backend, empty until start_backend runs.
BACKEND_PID="${BACKEND_PID:-}"

# Prefer the repo-root venv, fall back to backend/.venv (the layout the README
# documents). Prints the interpreter on success.
find_python() {
  local candidate
  for candidate in "$ROOT_DIR/.venv/bin/python" "$BACKEND_DIR/.venv/bin/python"; do
    [[ -x "$candidate" ]] || continue
    if "$candidate" -c "import fastapi, uvicorn" >/dev/null 2>&1; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  {
    echo "No virtualenv with the backend dependencies was found."
    echo "Checked: $ROOT_DIR/.venv and $BACKEND_DIR/.venv"
    echo "Create one with:"
    echo "  cd '$ROOT_DIR'"
    echo "  python3 -m venv .venv"
    echo "  .venv/bin/pip install -r backend/requirements.txt"
  } >&2
  return 1
}

# PIDs currently listening on the backend port (empty if the port is free).
backend_pids() {
  lsof -ti tcp:"$BACKEND_PORT" -sTCP:LISTEN 2>/dev/null || true
}

# Kill a process and its descendants (vite runs as a child of npm, so signalling
# npm alone would leave the server behind).
kill_tree() {
  local pid="$1" child
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    kill_tree "$child"
  done
  kill "$pid" 2>/dev/null || true
}

# PIDs of *this* project's Vite dev server, matched on the binary path rather
# than the port: Vite moves to the next free port when 5173 is taken, and other
# projects on this machine may well be sitting on 5174. Matching the absolute
# path keeps this to our own frontend.
frontend_pids() {
  pgrep -f "$FRONTEND_DIR/node_modules/.bin/vite" 2>/dev/null || true
}

stop_frontend() {
  local pids
  pids="$(frontend_pids)"
  if [[ -z "$pids" ]]; then
    echo "Frontend is not running."
    return 0
  fi

  echo "Stopping frontend (pid ${pids//$'\n'/ }) ..."
  local pid
  for pid in $pids; do
    kill_tree "$pid"
  done

  # npm run dev exits once its vite child is gone; give it a moment.
  local waited=0
  while [[ -n "$(frontend_pids)" && $waited -lt 20 ]]; do
    sleep 0.25
    waited=$((waited + 1))
  done

  if [[ -n "$(frontend_pids)" ]]; then
    echo "Still alive after SIGTERM, sending SIGKILL."
    for pid in $(frontend_pids); do
      kill -9 "$pid" 2>/dev/null || true
    done
    sleep 0.5
  fi
}

stop_backend() {
  local pids
  pids="$(backend_pids)"
  if [[ -z "$pids" ]]; then
    echo "Backend is not running (port $BACKEND_PORT is free)."
    rm -f "$BACKEND_PID_FILE"
    return 0
  fi

  echo "Stopping backend on port $BACKEND_PORT (pid ${pids//$'\n'/ }) ..."
  # shellcheck disable=SC2086  # word splitting is how we pass several pids
  kill $pids 2>/dev/null || true

  local _ waited=0
  while [[ -n "$(backend_pids)" && $waited -lt 20 ]]; do
    sleep 0.25
    waited=$((waited + 1))
  done

  if [[ -n "$(backend_pids)" ]]; then
    echo "Still alive after SIGTERM, sending SIGKILL."
    # shellcheck disable=SC2046
    kill -9 $(backend_pids) 2>/dev/null || true
    sleep 0.5
  fi
  rm -f "$BACKEND_PID_FILE"
}

# Starts uvicorn in the background and records its PID in BACKEND_PID.
start_backend() {
  local py
  py="$(find_python)" || return 1

  if [[ -n "$(backend_pids)" ]]; then
    echo "Port $BACKEND_PORT is already in use; not starting a second backend." >&2
    return 1
  fi

  mkdir -p "$LOG_DIR"
  (
    cd "$BACKEND_DIR"
    nohup "$py" -m app.api >>"$BACKEND_LOG" 2>&1 &
    echo $! >"$BACKEND_PID_FILE"
  )
  BACKEND_PID="$(cat "$BACKEND_PID_FILE")"
  echo "Starting backend (pid $BACKEND_PID) ..."
}

# Blocks until the API answers, or fails if it died on the way up.
wait_for_backend() {
  local waited=0
  while [[ $waited -lt 40 ]]; do
    if curl -fsS --max-time 2 "http://127.0.0.1:$BACKEND_PORT/" >/dev/null 2>&1; then
      echo "Backend ready: http://127.0.0.1:$BACKEND_PORT  (docs: http://127.0.0.1:$BACKEND_PORT/docs)"
      return 0
    fi
    if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
      {
        echo "Backend exited during startup. Last lines of $BACKEND_LOG:"
        tail -n 25 "$BACKEND_LOG" 2>/dev/null || true
      } >&2
      return 1
    fi
    sleep 0.5
    waited=$((waited + 1))
  done

  echo "Backend did not answer within 20s. Check $BACKEND_LOG." >&2
  return 1
}
