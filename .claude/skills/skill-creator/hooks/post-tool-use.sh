#!/bin/bash
# PostToolUse hook - logs self-mutations to skill memory
set -euo pipefail

INPUT=$(cat)
SKILL_ROOT=".claude/skills"

# Extract file path from tool input
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // empty')

# Check if file is within a skill directory
if [[ "$FILE_PATH" == *"$SKILL_ROOT"* ]]; then
  # Extract skill name from path
  SKILL_NAME=$(echo "$FILE_PATH" | sed -n "s|.*$SKILL_ROOT/\([^/]*\)/.*|\1|p")

  if [[ -n "$SKILL_NAME" && -d "$SKILL_ROOT/$SKILL_NAME/memory" ]]; then
    TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')
    TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

    echo "{\"timestamp\": \"$TIMESTAMP\", \"event\": \"self_mutation\", \"tool\": \"$TOOL_NAME\", \"file\": \"$FILE_PATH\"}" >> "$SKILL_ROOT/$SKILL_NAME/memory/execution-log.jsonl"
  fi
fi
