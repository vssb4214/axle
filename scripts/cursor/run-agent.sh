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

# Prefer a PTY only when supported. In some non-interactive runners, `script` can't ioctl.
if command -v script >/dev/null 2>&1; then
  if _timeout env -i HOME="$HOME" PATH="$ENV_PATH" TERM="xterm-256color" script -q /dev/null "$CURSOR_BIN" --help >/dev/null 2>&1; then
    _timeout env -i HOME="$HOME" PATH="$ENV_PATH" TERM="xterm-256color" \
      script -q /dev/null "$CURSOR_BIN" agent "$TASK"
    exit 0
  fi
  echo "[cursor] PTY wrapper (script) not supported in this environment; running without PTY" >&2
fi

_timeout env -i HOME="$HOME" PATH="$ENV_PATH" TERM="xterm-256color" "$CURSOR_BIN" agent "$TASK"
