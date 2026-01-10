# Self-Evolving Skill Creator: Front-Matter Prompt

> **Usage:** Prepend this entire document to any skill creation request. After this front-matter, append your specific skill requirements (e.g., "Create a skill that processes invoices and extracts line items").

---

## BOOTSTRAP INSTRUCTIONS

You are creating a **self-evolving skill**—not just a static SKILL.md, but a living agentic system that runs, heals, evaluates, and improves itself with minimal human intervention.

### First-Time Bootstrap

If this is the first invocation and the skill-creator infrastructure does not yet exist:

1. **Read foundational resources:**
   - `/mnt/skills/examples/skill-creator/SKILL.md` — Anthropic's base skill creator patterns
   - Search and fetch: `https://docs.claude.com/en/docs/claude-code/skills` — Current skill documentation
   - Search and fetch: `https://docs.claude.com/en/docs/claude-code/hooks` — Hook system reference
   - Search and fetch: `https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md` — Latest features
   - Search and fetch: `https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk` — Agent SDK docs

2. **Generate the complete skill-creator infrastructure** (see Architecture section below)

3. **Self-test** by creating a simple test skill and verifying the full lifecycle works

4. **Report status** with Slack notification when ready

### Subsequent Invocations

If skill-creator infrastructure exists, use it to create the requested skill following the full lifecycle.

---

## ARCHITECTURE SPECIFICATION

Every skill you create MUST include the following components. This is non-negotiable.

### Directory Structure

```
{skill-name}/
├── SKILL.md                          # Primary skill instructions (required)
├── skill-config.json                 # Skill configuration and metadata
├── hooks/
│   ├── hooks.json                    # Hook definitions for Claude Code
│   ├── log-mutation.sh               # PostToolUse hook for self-modifications
│   ├── health-check.sh               # Stop hook runner
│   └── health-check-prompt.md        # Prompt for Haiku health assessment
├── memory/
│   ├── execution-log.jsonl           # Append-only run log
│   ├── lessons.md                    # Claude-maintained learnings
│   ├── recent-context.json           # Last 10 runs (loaded for healing)
│   ├── user-feedback.jsonl           # Eval scores from human
│   ├── health-checks.jsonl           # Output from Stop hooks
│   ├── aggregate-scores.json         # Rolling averages
│   └── proposed-updates/             # Staged changes awaiting approval
├── tests/
│   ├── test-manifest.json            # Test case definitions
│   ├── inputs/                       # Test input files
│   ├── expected/                     # Expected output patterns
│   └── results/                      # Test run results
├── scripts/                          # Deterministic scripts (as needed)
├── references/                       # Reference documentation (as needed)
└── assets/                           # Templates and resources (as needed)
```

### skill-config.json Schema

```json
{
  "name": "{skill-name}",
  "version": "1.0.0",
  "created": "{ISO timestamp}",
  "state": "DRAFT",
  
  "healing": {
    "enabled": true,
    "auto_heal_threshold": 3,
    "max_heal_attempts_per_day": 5,
    "confidence_auto_approve": 0.9,
    "confidence_require_approval": 0.7
  },
  
  "approval": {
    "channel": "slack",
    "timeout_hours": 24,
    "timeout_action": "auto_approve_if_confident",
    "webhook_url": "${SKILL_SLACK_WEBHOOK}",
    "escalation": {
      "after_hours": 48,
      "method": "repeat_notification"
    }
  },
  
  "eval": {
    "auto_score_dimensions": ["reliability", "efficiency"],
    "human_score_dimensions": ["completion", "quality"],
    "request_feedback_threshold": "significant_runs",
    "trend_window_days": 14
  },
  
  "memory": {
    "execution_log_retention_days": 30,
    "consolidation_threshold_runs": 100,
    "drift_detection_enabled": true
  },
  
  "bootstrap": {
    "max_tdd_iterations": 5,
    "test_evaluator_model": "sonnet",
    "require_human_approval_to_deploy": true
  }
}
```

### Lifecycle States

Skills progress through these states:

| State | Description | Transitions |
|-------|-------------|-------------|
| `DRAFT` | Spec written, not yet generated | → BOOTSTRAPPING |
| `BOOTSTRAPPING` | Generating initial skill code | → TDD_LOOP |
| `TDD_LOOP` | Running test cases, iterating | → PENDING_APPROVAL, FAILED_BOOTSTRAP |
| `PENDING_APPROVAL` | Awaiting human approval | → ACTIVE |
| `ACTIVE` | Running in production | → HEALING |
| `HEALING` | Automated fix in progress | → PENDING_APPROVAL, DEGRADED |
| `DEGRADED` | Healing failed, flagged | → HEALING (manual trigger) |
| `FAILED_BOOTSTRAP` | Couldn't converge | → BOOTSTRAPPING (with hints) |
| `ARCHIVED` | Retired | (terminal) |

---

## HOOK SYSTEM SPECIFICATION

Every skill MUST include these hooks in `hooks/hooks.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_SKILL_ROOT/hooks/log-mutation.sh\""
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "prompt",
            "prompt": "Analyze this session for the skill '{skill-name}'. Evaluate: 1) Did it complete the requested task? 2) Were there errors, retries, or timeouts? 3) Was token usage reasonable? 4) Any unexpected patterns? Respond ONLY with JSON: {\"healthy\": bool, \"completion_score\": 1-5, \"efficiency_score\": 1-5, \"reliability_score\": 1-5, \"issues\": [...], \"suggested_fixes\": [...], \"severity\": \"none|low|medium|high\"}"
          }
        ]
      }
    ]
  }
}
```

### log-mutation.sh

```bash
#!/bin/bash
# Logs when the skill modifies its own files
set -euo pipefail

SKILL_ROOT="${CLAUDE_SKILL_ROOT:-$(dirname "$0")/..}"
LOG_FILE="$SKILL_ROOT/memory/execution-log.jsonl"
INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // "unknown"')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // "unknown"')

# Only log if modifying files within the skill itself
if [[ "$FILE_PATH" == *"$SKILL_ROOT"* ]]; then
  echo "{\"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\", \"event\": \"self_mutation\", \"tool\": \"$TOOL_NAME\", \"file\": \"$FILE_PATH\"}" >> "$LOG_FILE"
fi
```

### health-check.sh

```bash
#!/bin/bash
# Processes health check results and updates memory
set -euo pipefail

SKILL_ROOT="${CLAUDE_SKILL_ROOT:-$(dirname "$0")/..}"
HEALTH_LOG="$SKILL_ROOT/memory/health-checks.jsonl"
INPUT=$(cat)

# Append health check result
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo "{\"timestamp\": \"$TIMESTAMP\", \"result\": $INPUT}" >> "$HEALTH_LOG"

# Extract severity for daemon to process
SEVERITY=$(echo "$INPUT" | jq -r '.severity // "none"')
if [[ "$SEVERITY" == "high" ]]; then
  echo "HEALTH_CHECK_CRITICAL" >&2
fi
```

---

## MEMORY SYSTEM SPECIFICATION

### execution-log.jsonl Format

```jsonl
{"timestamp": "...", "event": "run_start", "task_summary": "...", "session_id": "..."}
{"timestamp": "...", "event": "tool_use", "tool": "Write", "target": "..."}
{"timestamp": "...", "event": "run_end", "duration_ms": 12345, "tokens": {"input": 1000, "output": 500}}
{"timestamp": "...", "event": "self_mutation", "tool": "Edit", "file": "..."}
{"timestamp": "...", "event": "health_check", "healthy": true, "scores": {...}}
```

### lessons.md Template

```markdown
# Lessons Learned: {skill-name}

> Auto-maintained by skill self-analysis. Last updated: {timestamp}

## What Works Well

- {Pattern that consistently succeeds}
- {Approach that users rate highly}

## Known Pitfalls

- {Situation that causes failures}
- {Edge case to handle carefully}

## User Preferences

- {Observed preference from feedback}
- {Style or format users prefer}

## Healing History

| Date | Issue | Fix Applied | Outcome |
|------|-------|-------------|---------|
| {date} | {issue} | {fix} | {outcome} |
```

### recent-context.json Schema

```json
{
  "last_updated": "{ISO timestamp}",
  "runs": [
    {
      "session_id": "...",
      "timestamp": "...",
      "task_summary": "...",
      "duration_ms": 12345,
      "health_check": {
        "healthy": true,
        "scores": {"completion": 5, "efficiency": 4, "reliability": 5}
      },
      "user_feedback": null
    }
  ],
  "aggregate": {
    "total_runs": 47,
    "success_rate": 0.94,
    "avg_scores": {"completion": 4.2, "efficiency": 4.5, "reliability": 4.8},
    "trend": "stable"
  }
}
```

---

## EVAL SYSTEM SPECIFICATION

### Dimensions

| Dimension | Auto-Scored | Description |
|-----------|-------------|-------------|
| **Completion** | No | Did the skill finish what was asked? |
| **Quality** | No | Is the output artifact correct/good? |
| **Efficiency** | Yes | Reasonable token usage, no loops? |
| **Reliability** | Yes | Errors, retries, timeouts? |

### Auto-Scoring Logic (in Stop hook)

- **Efficiency**: 5 if tokens < expected * 1.2, 4 if < 1.5x, 3 if < 2x, 2 if < 3x, 1 if >= 3x
- **Reliability**: 5 if no errors, 4 if 1 retry, 3 if 2-3 retries, 2 if >3 retries, 1 if failed

### Human Feedback Request (Slack Message)

```
┌─────────────────────────────────────────────────────────┐
│  📊 Eval Request: {skill-name}                         │
├─────────────────────────────────────────────────────────┤
│  Task: {task_summary}                                  │
│  Duration: {duration} | Tokens: {tokens}               │
│  Auto-scores: Reliability {r}/5, Efficiency {e}/5      │
│                                                         │
│  Rate the output:                                       │
│  [1️⃣] [2️⃣] [3️⃣] [4️⃣] [5️⃣]                              │
│                                                         │
│  [💬 Add Feedback]  [⏭️ Skip]                           │
└─────────────────────────────────────────────────────────┘
```

### user-feedback.jsonl Format

```jsonl
{"timestamp": "...", "session_id": "...", "task": "...", "scores": {"completion": 4, "quality": 3}, "comment": "Missed edge case X", "source": "slack"}
```

---

## HEALING SYSTEM SPECIFICATION

### Trigger Conditions

Healing is triggered when ANY of:

1. `severity: "high"` in a health check
2. 3+ consecutive runs with `healthy: false`
3. Rolling average score drops below 3.5 over 7 days
4. Explicit `/skill heal {name}` command

### Healing Session Prompt Template

```markdown
# Healing Session: {skill-name}

## Context

You are healing a skill that has encountered issues. Your goal is to analyze the problems and propose fixes.

## Current Skill State

{contents of SKILL.md}

## Recent Execution Context

{contents of memory/recent-context.json}

## Lessons Learned

{contents of memory/lessons.md}

## Health Check Failures

{last 5 entries from memory/health-checks.jsonl where healthy=false}

## User Feedback

{last 10 entries from memory/user-feedback.jsonl}

## Instructions

1. Analyze the failure patterns
2. Identify root causes
3. Propose specific fixes to SKILL.md, hooks, or scripts
4. Write proposed changes to memory/proposed-updates/{uuid}/
5. Create a manifest.json explaining each change
6. Estimate confidence (0-1) that these fixes will resolve the issues

Write ALL proposed changes as complete files, not diffs. Include a manifest.json with:

```json
{
  "uuid": "{generated-uuid}",
  "timestamp": "{ISO timestamp}",
  "trigger": "{what triggered this healing}",
  "analysis": "{brief analysis of root cause}",
  "changes": [
    {"file": "SKILL.md", "reason": "..."},
    {"file": "hooks/hooks.json", "reason": "..."}
  ],
  "confidence": 0.85,
  "rollback_safe": true
}
```
```

### Approval Flow

1. Healing session writes to `memory/proposed-updates/{uuid}/`
2. Daemon detects new proposal
3. Daemon sends Slack notification:

```
┌─────────────────────────────────────────────────────────┐
│  🔧 Skill Update Proposed: {skill-name}                │
├─────────────────────────────────────────────────────────┤
│  Changes:                                               │
│  - SKILL.md: {reason}                                  │
│  - hooks/hooks.json: {reason}                          │
│                                                         │
│  Triggered by: {trigger}                               │
│  Confidence: {confidence}                              │
│                                                         │
│  [✅ Approve]  [❌ Reject]  [👁️ View Diff]             │
└─────────────────────────────────────────────────────────┘
```

4. On approval: Move files from proposed-updates to live locations, update state
5. On rejection: Archive proposal, log reason, increment rejection counter

---

## TDD BOOTSTRAP SPECIFICATION

### test-manifest.json Schema

```json
{
  "skill_name": "{skill-name}",
  "created": "{ISO timestamp}",
  "test_cases": [
    {
      "id": "case-001",
      "name": "Basic functionality",
      "description": "Tests the core use case",
      "input_file": "inputs/case-001.json",
      "expected_file": "expected/case-001.json",
      "evaluation_criteria": [
        "Output contains expected structure",
        "No errors in execution",
        "Completes within 60 seconds"
      ]
    }
  ],
  "pass_threshold": 1.0,
  "evaluator_model": "sonnet"
}
```

### Test Input Format (inputs/case-001.json)

```json
{
  "prompt": "The exact prompt to send to the skill",
  "context_files": ["optional/files/to/include.txt"],
  "environment": {
    "SOME_VAR": "value"
  },
  "timeout_seconds": 60
}
```

### Expected Output Format (expected/case-001.json)

```json
{
  "type": "pattern",
  "patterns": [
    {"type": "contains", "value": "expected string"},
    {"type": "regex", "value": "\\d{4}-\\d{2}-\\d{2}"},
    {"type": "json_path", "path": "$.status", "value": "success"},
    {"type": "file_exists", "path": "output/result.txt"}
  ],
  "anti_patterns": [
    {"type": "contains", "value": "error"},
    {"type": "contains", "value": "failed"}
  ]
}
```

### Bootstrap TDD Loop

```
┌──────────────────────────────────────────────────────────────┐
│                     TDD BOOTSTRAP LOOP                       │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  1. GENERATE SKILL                                           │
│     └─→ Write SKILL.md, hooks, config based on spec         │
│                                                              │
│  2. GENERATE TEST CASES                                      │
│     └─→ Create 3-5 test cases covering core functionality   │
│     └─→ User can provide additional test cases              │
│                                                              │
│  3. RUN TESTS                                                │
│     └─→ Execute each test case against the skill            │
│     └─→ Capture outputs in tests/results/                   │
│                                                              │
│  4. EVALUATE                                                 │
│     └─→ Sonnet compares outputs to expected patterns        │
│     └─→ Generate pass/fail + reasoning for each case        │
│                                                              │
│  5. CHECK CONVERGENCE                                        │
│     ├─→ All tests pass? → DONE, proceed to approval         │
│     ├─→ Tests fail, iterations < max? → Go to step 6        │
│     └─→ Tests fail, iterations >= max? → FAILED_BOOTSTRAP   │
│                                                              │
│  6. ITERATE                                                  │
│     └─→ Claude sees failures and fixes the skill            │
│     └─→ Return to step 3                                    │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Bootstrap Completion Notification

```
┌─────────────────────────────────────────────────────────────┐
│  🎉 Skill Ready: {skill-name}                              │
├─────────────────────────────────────────────────────────────┤
│  Bootstrap complete in {n} iterations                      │
│                                                             │
│  Test Results:                                              │
│  ✅ case-001: {name}                                       │
│  ✅ case-002: {name}                                       │
│  ✅ case-003: {name}                                       │
│                                                             │
│  [🚀 Deploy]  [🔄 Add Test & Retry]  [👁️ View Skill]       │
└─────────────────────────────────────────────────────────────┘
```

---

## DAEMON SPECIFICATION

The skill-creator includes a daemon that orchestrates all automation. This is TypeScript using the Claude Agent SDK.

### daemon/index.ts Structure

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";
import { watch } from "chokidar";
import express from "express";
import Database from "better-sqlite3";

// Core daemon responsibilities:
// 1. Watch skill memory folders for health check results
// 2. Trigger healing sessions when thresholds exceeded  
// 3. Handle Slack webhook callbacks for approvals
// 4. Run nightly audits (log pruning, lesson consolidation, drift detection)
// 5. Manage skill state transitions

interface DaemonConfig {
  skills_root: string;
  db_path: string;
  slack_webhook_url: string;
  slack_signing_secret: string;
  port: number;
}

class SkillDaemon {
  private db: Database.Database;
  private watcher: FSWatcher;
  private app: express.Application;
  
  async start(config: DaemonConfig): Promise<void> {
    // Initialize SQLite for state management
    this.db = new Database(config.db_path);
    this.initializeDatabase();
    
    // Start file watcher for health-checks.jsonl files
    this.watcher = watch(`${config.skills_root}/*/memory/health-checks.jsonl`);
    this.watcher.on("change", (path) => this.onHealthCheckUpdate(path));
    
    // Start Express server for Slack callbacks
    this.app = express();
    this.app.post("/slack/approve", this.handleApproval.bind(this));
    this.app.post("/slack/reject", this.handleRejection.bind(this));
    this.app.post("/slack/feedback", this.handleFeedback.bind(this));
    this.app.listen(config.port);
    
    // Schedule nightly audit
    this.scheduleNightlyAudit();
    
    console.log(`Skill daemon running on port ${config.port}`);
  }
  
  private async onHealthCheckUpdate(path: string): Promise<void> {
    const skillName = this.extractSkillName(path);
    const shouldHeal = await this.evaluateHealingNeed(skillName);
    
    if (shouldHeal) {
      await this.triggerHealing(skillName);
    }
  }
  
  private async triggerHealing(skillName: string): Promise<void> {
    // Check guards
    if (await this.isHealingInProgress(skillName)) return;
    if (await this.healingAttemptsToday(skillName) >= 5) {
      await this.escalateToHuman(skillName, "Healing rate limit exceeded");
      return;
    }
    
    await this.markHealingStarted(skillName);
    
    const context = await this.buildHealingContext(skillName);
    
    const result = await query({
      prompt: this.buildHealingPrompt(skillName, context),
      options: {
        cwd: this.getSkillPath(skillName),
        maxTurns: 20,
      }
    });
    
    await this.processHealingResult(skillName, result);
  }
  
  // ... additional methods
}
```

### Daemon Installation

The daemon runs via pm2 for persistence:

```bash
# Install daemon dependencies
cd {skill-creator}/daemon
npm install

# Start with pm2
pm2 start index.js --name skill-daemon

# View logs
pm2 logs skill-daemon

# Auto-restart on reboot
pm2 save
pm2 startup
```

---

## SLACK INTEGRATION SPECIFICATION

### Required Environment Variables

```bash
export SKILL_SLACK_WEBHOOK="https://hooks.slack.com/services/..."
export SKILL_SLACK_SIGNING_SECRET="..."
export SKILL_DAEMON_URL="http://localhost:3847"
```

### Slack App Configuration

The skill-creator sets up a Slack app with:

1. **Incoming Webhook** — For sending notifications
2. **Interactive Components** — For button callbacks (approve/reject/feedback)
3. **Slash Commands** (optional):
   - `/skill status {name}` — Check skill health
   - `/skill heal {name}` — Force healing run
   - `/skill list` — List all skills and states

### Message Templates

See examples in Approval Flow and Eval System sections above.

---

## SELF-REFERENCE SAFETY

The skill-creator skill itself has special handling to prevent infinite loops:

```json
// skill-creator/skill-config.json
{
  "name": "skill-creator",
  "healing": {
    "enabled": false,
    "reason": "Self-referential healing disabled for safety"
  },
  "manual_heal_command": "/skill-creator heal-self"
}
```

To update the skill-creator itself:
1. Manually invoke `/skill-creator heal-self`
2. Review proposed changes
3. Explicitly approve

The daemon ignores the skill-creator's memory folder.

---

## EXECUTION INSTRUCTIONS

When you receive a skill creation request after this front-matter:

### Phase 1: Understanding (5 min)

1. Parse the user's skill requirements
2. Ask clarifying questions if ambiguous (max 3 questions)
3. Confirm understanding before proceeding

### Phase 2: Design (10 min)

1. Define the skill's purpose and triggers
2. Identify required scripts, references, assets
3. Design 3-5 test cases
4. Estimate complexity (simple/medium/complex)

### Phase 3: Generate (15-30 min)

1. Create full directory structure
2. Write SKILL.md with proper frontmatter and body
3. Write skill-config.json
4. Write hooks/hooks.json and hook scripts
5. Initialize memory/ with empty files and templates
6. Write test-manifest.json and test cases
7. Create any required scripts/, references/, assets/

### Phase 4: Bootstrap TDD Loop

1. Run each test case
2. Evaluate results
3. Fix failures
4. Repeat until convergence or max iterations

### Phase 5: Notify & Await Approval

1. Send Slack notification with test results
2. Await human approval
3. On approval: Set state to ACTIVE, confirm deployment
4. On rejection: Log feedback, return to Phase 3 with hints

### Phase 6: Handoff

1. Confirm skill is operational
2. Verify daemon is watching the skill's memory folder
3. Provide usage instructions
4. Skill is now self-managing

---

## CRITICAL REQUIREMENTS

1. **NO HALLUCINATION ABOUT RUNNING** — Do not claim tests passed unless you actually ran them and verified output. Do not claim the skill is working unless you actually tested it.

2. **ACTUALLY CREATE ALL FILES** — Every file in the directory structure must be created. Do not describe what files would contain—write them.

3. **ACTUALLY RUN TESTS** — Execute the test cases. Do not simulate or imagine results.

4. **HOOKS MUST BE FUNCTIONAL** — Test that hooks execute properly. A skill without working hooks cannot self-heal.

5. **MEMORY MUST BE INITIALIZED** — Create the memory/ files with proper initial content, not empty placeholders.

6. **DAEMON INTEGRATION** — If the daemon is not running, start it. If this is the first skill, set up the daemon infrastructure.

7. **SLACK MUST BE CONFIGURED** — If Slack credentials exist, verify webhook works. If not, prompt user for configuration.

---

## APPENDIX: SKILL.md TEMPLATE

```markdown
---
name: {skill-name}
description: {Comprehensive description including what it does AND when to trigger it. This is the primary mechanism for skill activation.}
---

# {Skill Name}

{Brief overview of what this skill does—2-3 sentences max.}

## Quick Start

{Minimal example showing the skill in action.}

## Workflow

{Step-by-step process the skill follows. Use imperative form.}

1. {First step}
2. {Second step}
3. {Third step}

## Configuration

This skill uses `skill-config.json` for:
- Healing thresholds and behavior
- Approval workflow settings
- Memory retention policies

## Memory System

This skill maintains local memory in `memory/`:
- `lessons.md` — Accumulated learnings (always loaded)
- `recent-context.json` — Last 10 runs (loaded for healing)
- `user-feedback.jsonl` — Your eval scores

## Self-Healing

This skill automatically:
- Monitors its own health via Stop hooks
- Proposes fixes when issues are detected
- Requests approval before applying changes

To manually trigger healing: `/skill heal {skill-name}`

## References

{If applicable, list reference files and when to consult them.}

## Scripts

{If applicable, list scripts and their purposes.}
```

---

**END OF FRONT-MATTER**

---

**YOUR SKILL REQUEST GOES BELOW THIS LINE:**