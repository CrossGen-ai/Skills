# Self-Evolving Skill Creator: Quick Start Guide

## What Is This?

This is a **front-matter prompt** that you prepend to any skill creation request. It transforms simple skill requests into fully self-managing agentic systems that:

- ✅ Run TDD loops until verified working
- ✅ Monitor their own health via hooks
- ✅ Propose fixes when issues arise
- ✅ Request your approval via Slack before changes
- ✅ Learn from your feedback over time
- ✅ Maintain their own memory and context

## First-Time Setup

### 1. Prerequisites

```bash
# Claude Code installed and authenticated
claude --version

# Node.js 18+ for the daemon
node --version

# Slack workspace with ability to create apps (for approvals)
```

### 2. Environment Variables

Create `~/.skill-creator-env`:

```bash
# Slack Integration (get these from your Slack app)
export SKILL_SLACK_WEBHOOK="https://hooks.slack.com/services/T.../B.../..."
export SKILL_SLACK_SIGNING_SECRET="your-signing-secret"

# Daemon Configuration
export SKILL_DAEMON_PORT=3847
export SKILL_DAEMON_URL="http://localhost:3847"

# Skills Location
export SKILLS_ROOT="$HOME/.claude/skills"
```

Source it in your shell:
```bash
echo 'source ~/.skill-creator-env' >> ~/.zshrc
source ~/.zshrc
```

### 3. Bootstrap the Skill Creator

First invocation creates the infrastructure:

```bash
# Copy the front-matter prompt to your clipboard or a file
# Then run Claude Code with it:

claude -p "$(cat skill-creator-frontmatter-prompt.md)

---

Bootstrap the skill-creator infrastructure. This is the first run.
Create all daemon files, templates, and verify the system works by 
creating a simple 'hello-world' test skill."
```

This will:
1. Read Anthropic's skill documentation
2. Create the skill-creator skill with daemon
3. Set up Slack integration
4. Create and test a hello-world skill
5. Verify the full lifecycle works

### 4. Verify Installation

```bash
# Check daemon is running
pm2 status skill-daemon

# Check skill-creator exists
ls -la ~/.claude/skills/skill-creator/

# Test Slack webhook
curl -X POST $SKILL_SLACK_WEBHOOK \
  -H 'Content-Type: application/json' \
  -d '{"text": "Skill Creator installed successfully! 🎉"}'
```

## Usage

### Creating a New Skill

```bash
claude -p "$(cat skill-creator-frontmatter-prompt.md)

---

Create a skill that processes PDF invoices and extracts:
- Vendor name
- Invoice number  
- Line items with quantities and prices
- Total amount

It should output structured JSON and handle multi-page invoices."
```

### What Happens Next

1. **Claude asks clarifying questions** (if needed)
2. **Claude generates the full skill** with hooks, memory, tests
3. **Claude runs TDD loop** until all tests pass
4. **You get a Slack notification** asking to approve deployment
5. **On approval**, skill goes ACTIVE and starts self-managing

### Monitoring Skills

```bash
# Check skill health
cat ~/.claude/skills/invoice-processor/memory/recent-context.json | jq '.aggregate'

# View lessons learned
cat ~/.claude/skills/invoice-processor/memory/lessons.md

# Check pending updates
ls ~/.claude/skills/invoice-processor/memory/proposed-updates/
```

### Manual Commands

```bash
# Force healing on a skill
claude -p "/skill heal invoice-processor"

# Check all skill states
claude -p "/skill list"

# Archive a skill
claude -p "/skill archive invoice-processor"
```

## Architecture Overview

```
~/.claude/skills/
├── skill-creator/              # The meta-skill (creates other skills)
│   ├── SKILL.md
│   ├── daemon/                 # TypeScript daemon process
│   │   ├── index.ts
│   │   ├── watcher.ts
│   │   ├── healer.ts
│   │   └── slack.ts
│   └── templates/              # Templates for new skills
│
├── invoice-processor/          # Example created skill
│   ├── SKILL.md
│   ├── skill-config.json
│   ├── hooks/
│   │   ├── hooks.json
│   │   └── health-check.sh
│   ├── memory/
│   │   ├── execution-log.jsonl
│   │   ├── lessons.md
│   │   ├── health-checks.jsonl
│   │   └── proposed-updates/
│   ├── tests/
│   │   ├── test-manifest.json
│   │   ├── inputs/
│   │   └── expected/
│   └── scripts/
│
└── another-skill/              # Another created skill
    └── ...
```

## Slack Notifications You'll Receive

### Skill Ready for Deployment
When bootstrap completes successfully.

### Update Proposed  
When a skill wants to modify itself.

### Eval Request
When a significant run completes and needs your quality score.

### Health Alert
When a skill enters DEGRADED state.

## Configuration Options

Each skill's `skill-config.json` can be customized:

```json
{
  "healing": {
    "enabled": true,                    // Toggle self-healing
    "auto_heal_threshold": 3,           // Failures before healing triggers
    "confidence_auto_approve": 0.9      // Auto-approve if confidence above this
  },
  "approval": {
    "timeout_hours": 24,                // How long to wait for approval
    "timeout_action": "auto_approve_if_confident"  // Or "reject", "escalate"
  },
  "eval": {
    "request_feedback_threshold": "all" // Or "significant_runs", "failures_only"
  }
}
```

## Troubleshooting

### Daemon not starting
```bash
cd ~/.claude/skills/skill-creator/daemon
npm install
pm2 start index.js --name skill-daemon
pm2 logs skill-daemon
```

### Slack not receiving messages
```bash
# Test webhook directly
curl -X POST $SKILL_SLACK_WEBHOOK \
  -H 'Content-Type: application/json' \
  -d '{"text": "Test message"}'

# Check webhook URL is set
echo $SKILL_SLACK_WEBHOOK
```

### Skill stuck in TDD_LOOP
```bash
# Check test results
cat ~/.claude/skills/{name}/tests/results/latest/*.json | jq

# Manually approve with failures
claude -p "/skill deploy {name} --force"
```

### Health checks not running
```bash
# Verify hooks are registered
cat ~/.claude/skills/{name}/hooks/hooks.json

# Test hook manually
echo '{"test": true}' | ~/.claude/skills/{name}/hooks/health-check.sh
```

## Customization

### Adding Custom Eval Dimensions

Edit `skill-config.json`:
```json
{
  "eval": {
    "custom_dimensions": [
      {"name": "accuracy", "auto_score": false, "weight": 2.0},
      {"name": "speed", "auto_score": true, "weight": 1.0}
    ]
  }
}
```

### Custom Approval Channels

Currently supports Slack. Future: email, Discord, custom webhook.

### Skill Templates

Create custom templates in `skill-creator/templates/`:
```
templates/
├── base-skill/          # Default template
├── data-processor/      # For ETL-style skills
├── api-integration/     # For external API skills
└── document-generator/  # For content creation skills
```

## Advanced: The Daemon API

The daemon exposes REST endpoints:

```bash
# Get skill status
curl http://localhost:3847/skills/invoice-processor

# Trigger healing
curl -X POST http://localhost:3847/skills/invoice-processor/heal

# Approve pending update
curl -X POST http://localhost:3847/skills/invoice-processor/approve/{uuid}

# List all skills
curl http://localhost:3847/skills
```

## Philosophy

This system embodies a key insight: **Skills aren't static documents—they're living agents.**

Traditional skills are SKILL.md files that Claude reads. Self-evolving skills are agentic systems that:
- Execute deterministic workflows via scripts
- Adapt via Claude's reasoning in healing sessions
- Learn via accumulated memory and feedback
- Improve via the TDD bootstrap loop

The human stays in the loop for judgment calls (approvals, quality scores) while the system handles the tedious work of monitoring, proposing fixes, and testing.

**You become a reviewer, not an operator.**