#!/usr/bin/env bash
# Restart only the FastAPI backend: whatever holds port 8000 is stopped, then
# uvicorn is started again in the background. The frontend keeps running.
#
#   ./scripts/restart-backend.sh
#
# Logs: logs/backend.log

set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

stop_backend
start_backend
wait_for_backend

echo "Backend log: $BACKEND_LOG"
echo "Follow it with: tail -f $BACKEND_LOG"
