#!/bin/bash
# Verify skill-creator installation
set -euo pipefail

SKILLS_ROOT="${SKILLS_ROOT:-$HOME/.claude/skills}"
DAEMON_URL="${SKILL_DAEMON_URL:-http://localhost:3847}"
SLACK_WEBHOOK="${SKILL_SLACK_WEBHOOK:-}"

echo "========================================"
echo "  Skill Creator Installation Verification"
echo "========================================"
echo ""

PASS_COUNT=0
FAIL_COUNT=0

check() {
  local name="$1"
  local result="$2"
  if [[ "$result" == "true" ]]; then
    echo "✓ $name"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "✗ $name"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
}

echo "1. Prerequisites"
echo "----------------"
check "Claude Code installed" "$(command -v claude > /dev/null && echo true || echo false)"
check "Node.js 18+" "$(node --version 2>/dev/null | grep -q 'v[12][0-9]\|v[2-9][0-9]' && echo true || echo false)"
check "pm2 installed" "$(command -v pm2 > /dev/null && echo true || echo false)"
check "jq installed" "$(command -v jq > /dev/null && echo true || echo false)"

echo ""
echo "2. Daemon Status"
echo "----------------"
check "Daemon process running" "$(pm2 list | grep -q 'skill-daemon.*online' && echo true || echo false)"
check "Daemon health endpoint" "$(curl -s "$DAEMON_URL/health" 2>/dev/null | jq -e '.status == "ok"' > /dev/null && echo true || echo false)"

echo ""
echo "3. Skill Creator Structure"
echo "--------------------------"
check "SKILL.md exists" "$(test -f "$SKILLS_ROOT/skill-creator/SKILL.md" && echo true || echo false)"
check "skill-config.json valid" "$(jq . "$SKILLS_ROOT/skill-creator/skill-config.json" > /dev/null 2>&1 && echo true || echo false)"
check "hooks.json valid" "$(jq . "$SKILLS_ROOT/skill-creator/hooks/hooks.json" > /dev/null 2>&1 && echo true || echo false)"
check "Daemon built" "$(test -f "$SKILLS_ROOT/skill-creator/daemon/dist/index.js" && echo true || echo false)"
check "Templates exist" "$(test -d "$SKILLS_ROOT/skill-creator/templates/base-skill" && echo true || echo false)"
check "Memory initialized" "$(test -f "$SKILLS_ROOT/skill-creator/memory/lessons.md" && echo true || echo false)"

echo ""
echo "4. Hello World Skill"
echo "--------------------"
check "SKILL.md exists" "$(test -f "$SKILLS_ROOT/hello-world/SKILL.md" && echo true || echo false)"
check "Hooks executable" "$(test -x "$SKILLS_ROOT/hello-world/hooks/health-check.sh" && echo true || echo false)"
check "Tests defined" "$(jq -e '.test_cases | length > 0' "$SKILLS_ROOT/hello-world/tests/test-manifest.json" > /dev/null 2>&1 && echo true || echo false)"
check "Memory initialized" "$(test -f "$SKILLS_ROOT/hello-world/memory/lessons.md" && echo true || echo false)"

echo ""
echo "5. Database & Registration"
echo "--------------------------"
check "Skills database exists" "$(test -f "$SKILLS_ROOT/skill-daemon.db" && echo true || echo false)"
SKILLS_REGISTERED=$(curl -s "$DAEMON_URL/skills" 2>/dev/null | jq -r 'length')
check "Skills registered (>=2)" "$(test "$SKILLS_REGISTERED" -ge 2 && echo true || echo false)"

echo ""
echo "6. Slack Integration (Optional)"
echo "--------------------------------"
if [[ -n "$SLACK_WEBHOOK" ]]; then
  # Test webhook (dry run - don't actually send in verification)
  echo "✓ Slack webhook configured"
  PASS_COUNT=$((PASS_COUNT + 1))
  echo "  Webhook URL: ${SLACK_WEBHOOK:0:50}..."
else
  echo "○ Slack webhook not configured (optional)"
  echo "  Set SKILL_SLACK_WEBHOOK to enable notifications"
  # Don't count as failure - this is optional
fi

echo ""
echo "========================================"
TOTAL=$((PASS_COUNT + FAIL_COUNT))
echo "Results: $PASS_COUNT/$TOTAL checks passed"
echo "========================================"

if [[ $FAIL_COUNT -eq 0 ]]; then
  echo ""
  echo "🎉 Installation verified successfully!"
  echo ""
  echo "Next steps:"
  echo "  1. Set up Slack integration (optional):"
  echo "     export SKILL_SLACK_WEBHOOK=\"https://hooks.slack.com/...\""
  echo ""
  echo "  2. Create a new skill:"
  echo "     claude -p \"Create a skill that...\""
  echo ""
  echo "  3. List registered skills:"
  echo "     curl $DAEMON_URL/skills"
  exit 0
else
  echo ""
  echo "⚠️  Some checks failed. Review the issues above."
  exit 1
fi
