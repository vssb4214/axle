#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "Axle dev status"
echo "============="

echo "Time: $(date)"
echo "Repo: $ROOT"
echo

echo "Git:"
# branch + dirty
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "(no git)")
DIRTY=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
LAST=$(git log -1 --oneline 2>/dev/null || true)
echo "  branch: $BRANCH"
echo "  dirty files: $DIRTY"
if [[ -n "$LAST" ]]; then
  echo "  last commit: $LAST"
fi
if [[ "$DIRTY" != "0" ]]; then
  echo "  diff (stat):"
  git diff --stat | sed 's/^/    /' | head -n 30
fi

echo

echo "Services:"
if pgrep -f "next dev" >/dev/null 2>&1; then
  echo "  next dev: RUNNING"
else
  echo "  next dev: stopped"
fi

if command -v ollama >/dev/null 2>&1; then
  if curl -sS -m 1 http://localhost:11434/api/tags >/dev/null 2>&1; then
    echo "  ollama: OK"
  else
    echo "  ollama: not reachable (http://localhost:11434)"
  fi
else
  echo "  ollama: not installed"
fi

echo

echo "App health (if dev server running):"
if curl -sS -m 1 http://localhost:3000/health >/dev/null 2>&1; then
  # Show a small summary line extracted from HTML.
  # (Avoid heavy parsing; just show whether the page responds.)
  echo "  http://localhost:3000/health: OK"
else
  echo "  http://localhost:3000/health: not reachable"
fi

echo

echo "Tips:"
echo "  - Watch changes:  while true; do clear; date; git status -sb; git diff --stat | head; sleep 1; done"
echo "  - If Cursor says 'done' but git is dirty, it made changes that still need review/commit."
