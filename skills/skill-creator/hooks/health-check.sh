#!/bin/bash
# Processes health check results and updates memory
set -euo pipefail

SKILL_ROOT="${SKILLS_ROOT:-$HOME/.claude/skills}/skill-creator"
HEALTH_LOG="$SKILL_ROOT/memory/health-checks.jsonl"
INPUT=$(cat)

# Ensure directory exists
mkdir -p "$(dirname "$HEALTH_LOG")"

# Append health check result
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo "{\"timestamp\": \"$TIMESTAMP\", \"result\": $INPUT}" >> "$HEALTH_LOG"

# Extract severity for daemon to process
SEVERITY=$(echo "$INPUT" | jq -r '.severity // "none"')
if [[ "$SEVERITY" == "high" ]]; then
  echo "HEALTH_CHECK_CRITICAL" >&2
fi
