#!/bin/bash
# Logs when the skill modifies its own files
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_ROOT="${CLAUDE_SKILL_ROOT:-$(dirname "$SCRIPT_DIR")}"
LOG_FILE="$SKILL_ROOT/memory/execution-log.jsonl"
INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // "unknown"')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // "unknown"')

# Only log if modifying files within the skill itself
if [[ "$FILE_PATH" == *"$SKILL_ROOT"* ]] || [[ "$FILE_PATH" == *".claude/skills"* ]]; then
  echo "{\"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\", \"event\": \"self_mutation\", \"tool\": \"$TOOL_NAME\", \"file\": \"$FILE_PATH\"}" >> "$LOG_FILE"
fi
