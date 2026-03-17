#!/usr/bin/env bash
set -euo pipefail

# Local/dev helper for the watchlists runner endpoint.
# Does NOT send notifications. Endpoint itself refuses to run unless AXLE_ENV is local/dev.

BASE_URL="${AXLE_BASE_URL:-http://localhost:3000}"
WATCHLIST_ID="${1:-}"

URL="$BASE_URL/api/watchlists/run-alerts"
if [[ -n "$WATCHLIST_ID" ]]; then
  URL="$URL?watchlistId=$WATCHLIST_ID"
fi

echo "Running watchlists runner: $URL"

# Print status code + body.
# shellcheck disable=SC2086
curl -sS -w "\nHTTP_STATUS=%{http_code}\n" "$URL"
