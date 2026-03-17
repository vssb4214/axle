#!/usr/bin/env bash
set -euo pipefail

# Preflight: ensure local Ollama is reachable before running any LLM-dependent steps.
OLLAMA_HEALTH_URL="${OLLAMA_HEALTH_URL:-http://127.0.0.1:11434/api/tags}"

if ! curl -fsS --max-time 2 "$OLLAMA_HEALTH_URL" >/dev/null; then
  echo "PRECHECK_FAIL: Ollama not reachable at $OLLAMA_HEALTH_URL" >&2
  exit 1
fi

echo "PRECHECK_OK: Ollama reachable"
