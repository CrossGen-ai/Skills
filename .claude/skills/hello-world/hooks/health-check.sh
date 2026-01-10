#!/bin/bash
# Processes health check results and updates memory
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_ROOT="${CLAUDE_SKILL_ROOT:-$(dirname "$SCRIPT_DIR")}"
HEALTH_LOG="$SKILL_ROOT/memory/health-checks.jsonl"

# Read input from stdin (health check result JSON)
INPUT=$(cat)

# Append health check result with timestamp
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo "{\"timestamp\": \"$TIMESTAMP\", \"result\": $INPUT}" >> "$HEALTH_LOG"

# Extract severity for daemon to process
SEVERITY=$(echo "$INPUT" | jq -r '.severity // "none"')
if [[ "$SEVERITY" == "high" ]]; then
  echo "HEALTH_CHECK_CRITICAL" >&2
  exit 1
fi

exit 0
