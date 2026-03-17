#!/usr/bin/env bash
set -euo pipefail

# Axle autonomous loop: pull -> sanity checks -> commit (if needed) -> push.
# Designed to run non-interactively (cron). No Cursor UI required.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

TS="$(date '+%Y-%m-%d %H:%M:%S %Z')"

echo "[agent-loop] $TS"

echo "[agent-loop] git status (pre)"
git status -sb || true

# Make sure we're on main
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$BRANCH" != "main" ]]; then
  echo "[agent-loop] ERROR: not on main (on $BRANCH)" >&2
  exit 2
fi

# Pull latest (best-effort)
echo "[agent-loop] git pull --rebase"
GIT_SSH_COMMAND="ssh -o BatchMode=yes" git pull --rebase origin main || true

# Run checks
if command -v pnpm >/dev/null 2>&1; then
  echo "[agent-loop] pnpm lint"
  pnpm -s lint
  echo "[agent-loop] pnpm build"
  pnpm -s build
else
  echo "[agent-loop] ERROR: pnpm not found" >&2
  exit 3
fi

# If there are changes, commit them with a generic message.
if [[ -n "$(git status --porcelain)" ]]; then
  echo "[agent-loop] changes detected; committing"
  git add -A
  git commit -m "chore: autonomous maintenance" || true
else
  echo "[agent-loop] no changes to commit"
fi

# Push (best-effort)
echo "[agent-loop] git push"
GIT_SSH_COMMAND="ssh -o BatchMode=yes" git push origin main || true

echo "[agent-loop] done"
