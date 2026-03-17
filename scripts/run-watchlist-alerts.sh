#!/usr/bin/env bash
set -euo pipefail

WATCHLIST_ID="${1:-}"
BASE_URL="${AXLE_BASE_URL:-http://localhost:3000}"

if [[ -n "$WATCHLIST_ID" ]]; then
  QS="?watchlistId=${WATCHLIST_ID}"
else
  QS=""
fi

URL="${BASE_URL%/}/api/watchlists/run-alerts${QS}"

echo "[axle] GET ${URL}"
curl -fsSL "$URL" | node -e 'process.stdin.setEncoding("utf8"); let s=""; process.stdin.on("data",d=>s+=d); process.stdin.on("end",()=>{ try{ console.log(JSON.stringify(JSON.parse(s), null, 2)); } catch(e){ console.log(s); process.exitCode=1; } });'
