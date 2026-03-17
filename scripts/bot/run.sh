#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$SCRIPT_DIR/lib.sh"

TASK_FILE="${1:-$SCRIPT_DIR/task.md}"
DRY_RUN="${DRY_RUN:-false}"
AUTO_PUSH="${AUTO_PUSH:-true}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-600}"

LOCK_DIR="$ROOT_DIR/.bot.lock"

require_cmd git
require_cmd python3

if [[ ! -f "$TASK_FILE" ]]; then
  echo "Task file not found: $TASK_FILE" >&2
  exit 1
fi

mkdir -p "$ROOT_DIR/artifacts/runs"

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "Bot lock exists at $LOCK_DIR. Another run may already be active." >&2
  exit 1
fi
cleanup() { rm -rf "$LOCK_DIR"; }
trap cleanup EXIT

extract_section() {
  local header="$1"
  awk -v header="$header" '
    $0 == "## " header { in_section=1; next }
    /^## / && in_section { exit }
    in_section { print }
  ' "$TASK_FILE"
}

TASK_ID="$(extract_section "ID" | head -n 1 | trim)"
GOAL="$(extract_section "Goal" | trim)"
NOTES="$(extract_section "Notes" | trim)"

mapfile -t ALLOWED_PATHS < <(extract_section "Allowed Paths" | sed '/^\s*$/d')
mapfile -t VALIDATION_CMDS < <(extract_section "Validation" | sed '/^\s*$/d')
mapfile -t ABORT_CONDITIONS < <(extract_section "Abort Conditions" | sed '/^\s*$/d')

if [[ -z "$TASK_ID" || -z "$GOAL" ]]; then
  echo "Task file must include at least ID and Goal." >&2
  exit 1
fi

TASK_SLUG="$(slugify "$TASK_ID")"
RUN_TS="$(date -u +"%Y%m%dT%H%M%SZ")"
RUN_ID="${TASK_SLUG}-${RUN_TS}"
BRANCH_NAME="bot/${TASK_SLUG}-${RUN_TS}"
RUN_DIR="$ROOT_DIR/artifacts/runs/$RUN_ID"

LOG_FILE="$RUN_DIR/run.log"
JSON_FILE="$RUN_DIR/run.json"
CHANGED_FILES_FILE="$RUN_DIR/changed_files.txt"
VALIDATION_RESULTS_FILE="$RUN_DIR/validation_results.txt"
COMMANDS_FILE="$RUN_DIR/commands.txt"

mkdir -p "$RUN_DIR"

START_TIME="$(timestamp_utc)"
ORIGINAL_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
ORIGINAL_COMMIT="$(git rev-parse HEAD)"
FALLBACK_USED="false"
STATUS="running"
COMMIT_HASH=""
VALIDATION_STATUS="not_run"

exec > >(tee -a "$LOG_FILE") 2>&1

echo "== Bot Run Started =="
echo "Run ID: $RUN_ID"
echo "Task ID: $TASK_ID"
echo "Goal: $GOAL"
echo "Original branch: $ORIGINAL_BRANCH"
echo "Original commit: $ORIGINAL_COMMIT"

record_command() { echo "$*" >> "$COMMANDS_FILE"; }

write_json() {
  python3 - <<'PY' \
    "$RUN_ID" "$TASK_ID" "$GOAL" "$NOTES" "$BRANCH_NAME" "$ORIGINAL_BRANCH" "$ORIGINAL_COMMIT" \
    "$STATUS" "$VALIDATION_STATUS" "$COMMIT_HASH" "$DRY_RUN" "$AUTO_PUSH" "$FALLBACK_USED" \
    "$START_TIME" "$(timestamp_utc)" \
    "$CHANGED_FILES_FILE" "$VALIDATION_RESULTS_FILE" "$COMMANDS_FILE" \
    "${ALLOWED_PATHS[@]}" -- \
    "${ABORT_CONDITIONS[@]}"
import json, os, sys
(
  run_id, task_id, goal, notes, branch_name, original_branch, original_commit,
  status, validation_status, commit_hash, dry_run, auto_push, fallback_used,
  started_at, ended_at, changed_files_path, validation_results_path, commands_path,
  *rest
) = sys.argv[1:]
# split rest at '--'
if '--' in rest:
  i = rest.index('--')
  allowed_paths = [x for x in rest[:i] if x.strip()]
  abort_conditions = [x for x in rest[i+1:] if x.strip()]
else:
  allowed_paths = [x for x in rest if x.strip()]
  abort_conditions = []

def read_lines(p):
  if not os.path.exists(p):
    return []
  with open(p) as f:
    return [ln.strip() for ln in f if ln.strip()]

out = {
  'run_id': run_id,
  'task_id': task_id,
  'goal': goal,
  'notes': notes,
  'branch_name': branch_name,
  'original_branch': original_branch,
  'original_commit': original_commit,
  'status': status,
  'validation_status': validation_status,
  'commit_hash': commit_hash,
  'dry_run': dry_run.lower() == 'true',
  'auto_push': auto_push.lower() == 'true',
  'fallback_used': fallback_used.lower() == 'true',
  'allowed_paths': allowed_paths,
  'abort_conditions': abort_conditions,
  'changed_files': read_lines(changed_files_path),
  'validation_results': read_lines(validation_results_path),
  'commands_run': read_lines(commands_path),
  'started_at': started_at,
  'ended_at': ended_at,
}
print(json.dumps(out, indent=2))
PY
}

fail_infra() {
  local reason="$1"
  echo "INFRA FAILURE: $reason" >&2
  STATUS="infra_failed"
  write_json > "$JSON_FILE"
  exit 2
}

fail_task() {
  local reason="$1"
  echo "TASK FAILURE: $reason" >&2
  STATUS="failed"
  VALIDATION_STATUS="failed"
  git reset --hard "$ORIGINAL_COMMIT" || true
  git checkout "$ORIGINAL_BRANCH" >/dev/null 2>&1 || true
  if git show-ref --verify --quiet "refs/heads/$BRANCH_NAME"; then
    git branch -D "$BRANCH_NAME" >/dev/null 2>&1 || true
  fi
  write_json > "$JSON_FILE"
  exit 1
}

ensure_clean_git() {
  if [[ -n "$(git status --porcelain)" ]]; then
    echo "Working tree must be clean before bot run." >&2
    exit 1
  fi
}

validate_changed_files() {
  git diff --name-only > "$CHANGED_FILES_FILE" || true
  local file_count
  file_count="$(grep -c . "$CHANGED_FILES_FILE" || true)"
  echo "Changed files count: $file_count"
  if [[ "$file_count" -eq 0 ]]; then
    fail_task "No files changed."
  fi

  # Abort on lockfile changes always
  if grep -Eq '^(pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$' "$CHANGED_FILES_FILE"; then
    fail_task "Abort: lockfile changed."
  fi

  while IFS= read -r changed_file; do
    [[ -z "$changed_file" ]] && continue
    local allowed="false"
    for allowed_path in "${ALLOWED_PATHS[@]}"; do
      [[ -z "$allowed_path" ]] && continue
      if [[ "$allowed_path" == */ ]]; then
        if [[ "$changed_file" == "$allowed_path"* ]]; then
          allowed="true"; break
        fi
      else
        if [[ "$changed_file" == "$allowed_path" ]]; then
          allowed="true"; break
        fi
      fi
    done
    if [[ "$allowed" != "true" ]]; then
      fail_task "Abort: changed file outside allowed paths: $changed_file"
    fi
  done < "$CHANGED_FILES_FILE"
}

run_validation() {
  if [[ "${#VALIDATION_CMDS[@]}" -eq 0 ]]; then
    VALIDATION_STATUS="skipped"
    return
  fi
  VALIDATION_STATUS="running"
  for cmd in "${VALIDATION_CMDS[@]}"; do
    [[ -z "$cmd" ]] && continue
    echo "Running validation: $cmd"
    record_command "$cmd"
    if with_timeout "$TIMEOUT_SECONDS" bash -lc "$cmd"; then
      echo "PASS: $cmd" >> "$VALIDATION_RESULTS_FILE"
    else
      echo "FAIL: $cmd" >> "$VALIDATION_RESULTS_FILE"
      fail_task "Validation failed: $cmd"
    fi
  done
  VALIDATION_STATUS="passed"
}

main() {
  cd "$ROOT_DIR"
  ensure_clean_git

  record_command "git fetch --all --prune"
  git fetch --all --prune

  record_command "git pull --ff-only"
  if ! git pull --ff-only; then
    fail_infra "git pull failed (non-ff or auth/network)."
  fi

  record_command "git checkout -b $BRANCH_NAME"
  git checkout -b "$BRANCH_NAME"

  if [[ -z "${BOT_CHANGE_CMD:-}" ]]; then
    fail_task "No BOT_CHANGE_CMD provided. This runner orchestrates; you must supply the change step."
  fi

  echo "Running BOT_CHANGE_CMD..."
  record_command "$BOT_CHANGE_CMD"
  if ! with_timeout "$TIMEOUT_SECONDS" bash -lc "$BOT_CHANGE_CMD"; then
    fail_task "Change command failed."
  fi

  validate_changed_files
  run_validation

  record_command "git status --short"
  git status --short

  if [[ "$DRY_RUN" == "true" ]]; then
    STATUS="dry_run_success"
    write_json > "$JSON_FILE"
    echo "Dry run complete. No commit/push performed."
    exit 0
  fi

  record_command "git add -A"
  git add -A

  local commit_msg
  commit_msg="bot(${TASK_ID}): ${GOAL}"

  record_command "git commit -m <msg>"
  git commit -m "$commit_msg"
  COMMIT_HASH="$(git rev-parse HEAD)"
  STATUS="success"

  if [[ "$AUTO_PUSH" == "true" ]]; then
    record_command "git push -u origin $BRANCH_NAME"
    git push -u origin "$BRANCH_NAME"
  fi

  write_json > "$JSON_FILE"
  echo "== Bot Run Complete =="
  echo "Branch: $BRANCH_NAME"
  echo "Commit: $COMMIT_HASH"
  echo "Run JSON: $JSON_FILE"
}

main "$@"
