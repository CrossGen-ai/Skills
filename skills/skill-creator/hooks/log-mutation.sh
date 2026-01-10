#!/bin/bash
# Logs when the skill modifies its own files
set -euo pipefail

SKILL_ROOT="${SKILLS_ROOT:-$HOME/.claude/skills}/skill-creator"
LOG_FILE="$SKILL_ROOT/memory/execution-log.jsonl"
INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // "unknown"')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // "unknown"')

# Only log if modifying files within the skill itself
if [[ "$FILE_PATH" == *"skill-creator"* ]] || [[ "$FILE_PATH" == *"skills/"* ]]; then
  mkdir -p "$(dirname "$LOG_FILE")"
  echo "{\"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\", \"event\": \"self_mutation\", \"tool\": \"$TOOL_NAME\", \"file\": \"$FILE_PATH\"}" >> "$LOG_FILE"
fi
