#!/usr/bin/env bash
# Stop the local development stack:
#   * the Vite dev server for this frontend (found by its path, so dev servers
#     belonging to other projects are left alone)
#   * whatever is serving the backend on port 8000
#
#   ./scripts/stop.sh
#
# Works no matter who started them — this script, dev.sh, or a terminal you
# have since closed.

set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

# Backend first: killing the frontend makes a running dev.sh run its own
# cleanup, which would stop the backend and report "not running" here.
stop_backend
stop_frontend

echo "Done. Frontend and backend are stopped."
