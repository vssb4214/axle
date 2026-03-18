#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CURSOR_BIN="${CURSOR_BIN:-$HOME/.local/bin/cursor}"
TASK="${1:-}"

if [[ -z "$TASK" ]]; then
  echo "Usage: $0 \"<task prompt>\"" >&2
  exit 2
fi

if [[ ! -x "$CURSOR_BIN" ]]; then
  echo "Cursor CLI not found/executable at: $CURSOR_BIN" >&2
  exit 3
fi

TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-600}"

_timeout() {
  if command -v timeout >/dev/null 2>&1; then
    timeout "$TIMEOUT_SECONDS" "$@"
  elif command -v gtimeout >/dev/null 2>&1; then
    gtimeout "$TIMEOUT_SECONDS" "$@"
  else
    "$@"
  fi
}

ENV_PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
cd "$ROOT_DIR"

echo "[cursor] running agent in $ROOT_DIR"

# Cursor agent CLI is unstable headless in some environments.
# Always run with a hard timeout; run without PTY here (PTY not supported in this runner).
_timeout env -i HOME="$HOME" PATH="$ENV_PATH" TERM="xterm-256color" "$CURSOR_BIN" agent "$TASK"
