#!/usr/bin/env bash
set -euo pipefail

# Headless Cursor Agent runner (print mode) for automation.
# Requires: `agent login` done once.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

PROMPT="${1:-}"
if [[ -z "$PROMPT" ]]; then
  echo "Usage: $0 \"<prompt>\"" >&2
  exit 2
fi

TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-900}"

_timeout() {
  if command -v timeout >/dev/null 2>&1; then
    timeout "$TIMEOUT_SECONDS" "$@"
  elif command -v gtimeout >/dev/null 2>&1; then
    gtimeout "$TIMEOUT_SECONDS" "$@"
  else
    "$@"
  fi
}

# Force trust for this repo; run in print mode.
_timeout agent --trust -p "$PROMPT" --output-format text
