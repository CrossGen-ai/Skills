#!/bin/bash
# TDD test runner for hello-world skill
set -euo pipefail

SKILL_ROOT="${SKILLS_ROOT:-$HOME/.claude/skills}/hello-world"
TESTS_DIR="$SKILL_ROOT/tests"
RESULTS_DIR="$TESTS_DIR/results"
TIMESTAMP=$(date -u +%Y-%m-%dT%H%M%SZ)
RUN_DIR="$RESULTS_DIR/$TIMESTAMP"

mkdir -p "$RUN_DIR"

echo "=== Running TDD Tests for hello-world ==="
echo "Results will be saved to: $RUN_DIR"
echo ""

# Read test manifest
TEST_MANIFEST="$TESTS_DIR/test-manifest.json"
PASS_COUNT=0
FAIL_COUNT=0

# Process each test case
for TEST_ID in $(jq -r '.test_cases[].id' "$TEST_MANIFEST"); do
  TEST_NAME=$(jq -r ".test_cases[] | select(.id == \"$TEST_ID\") | .name" "$TEST_MANIFEST")
  INPUT_FILE=$(jq -r ".test_cases[] | select(.id == \"$TEST_ID\") | .input_file" "$TEST_MANIFEST")
  EXPECTED_FILE=$(jq -r ".test_cases[] | select(.id == \"$TEST_ID\") | .expected_file" "$TEST_MANIFEST")

  echo "Test: $TEST_ID - $TEST_NAME"

  # Read expected patterns
  EXPECTED="$TESTS_DIR/$EXPECTED_FILE"

  # For this minimal test, we just verify files exist and are valid
  if [[ -f "$TESTS_DIR/$INPUT_FILE" ]] && [[ -f "$EXPECTED" ]]; then
    # Validate JSON
    if jq . "$TESTS_DIR/$INPUT_FILE" > /dev/null 2>&1 && jq . "$EXPECTED" > /dev/null 2>&1; then
      echo "  ✓ PASS - Input and expected files valid"
      PASS_COUNT=$((PASS_COUNT + 1))
      echo "{\"test_id\": \"$TEST_ID\", \"status\": \"pass\", \"timestamp\": \"$TIMESTAMP\"}" > "$RUN_DIR/$TEST_ID.json"
    else
      echo "  ✗ FAIL - Invalid JSON"
      FAIL_COUNT=$((FAIL_COUNT + 1))
      echo "{\"test_id\": \"$TEST_ID\", \"status\": \"fail\", \"reason\": \"Invalid JSON\", \"timestamp\": \"$TIMESTAMP\"}" > "$RUN_DIR/$TEST_ID.json"
    fi
  else
    echo "  ✗ FAIL - Missing files"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    echo "{\"test_id\": \"$TEST_ID\", \"status\": \"fail\", \"reason\": \"Missing files\", \"timestamp\": \"$TIMESTAMP\"}" > "$RUN_DIR/$TEST_ID.json"
  fi
done

TOTAL=$((PASS_COUNT + FAIL_COUNT))
echo ""
echo "=== Test Summary ==="
echo "Passed: $PASS_COUNT/$TOTAL"
echo "Failed: $FAIL_COUNT/$TOTAL"

# Write summary
cat > "$RUN_DIR/summary.json" << EOF
{
  "timestamp": "$TIMESTAMP",
  "skill": "hello-world",
  "total": $TOTAL,
  "passed": $PASS_COUNT,
  "failed": $FAIL_COUNT,
  "pass_rate": $(echo "scale=2; $PASS_COUNT / $TOTAL" | bc)
}
EOF

if [[ $FAIL_COUNT -eq 0 ]]; then
  echo ""
  echo "✓ All tests passed!"
  exit 0
else
  echo ""
  echo "✗ Some tests failed"
  exit 1
fi
