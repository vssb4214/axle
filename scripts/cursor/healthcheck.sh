#!/usr/bin/env bash
set -euo pipefail

# Healthcheck: prove Cursor agent can start + exit under our wrapper.
# We avoid repo modifications; this should be safe.

TASK=${1:-"Say 'CURSOR_AGENT_OK' and exit."}
TIMEOUT_SECONDS=${TIMEOUT_SECONDS:-45}

TIMEOUT_SECONDS="$TIMEOUT_SECONDS" ./scripts/cursor/run-agent.sh "$TASK" | tail -n 50
