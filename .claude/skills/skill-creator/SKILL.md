---
name: skill-creator
description: Creates self-evolving skills with TDD bootstrap, self-healing, memory systems, and human-in-the-loop approval workflows. Trigger with "/skill create <description>" or when asked to create a new skill.
---

# Skill Creator

A meta-skill that creates fully self-managing agentic skills. Each skill created includes hooks for health monitoring, memory for learning, TDD bootstrap for verification, and Slack integration for approvals.

## Quick Start

```bash
claude -p "/skill create a skill that processes PDF invoices"
```

## Workflow

1. **Parse Request** - Understand what skill is needed and ask clarifying questions
2. **Design Skill** - Define purpose, triggers, test cases, and complexity
3. **Generate Structure** - Create all files: SKILL.md, config, hooks, memory, tests
4. **Bootstrap TDD Loop** - Run tests, evaluate, fix, repeat until passing
5. **Await Approval** - Send Slack notification, wait for human approval
6. **Deploy** - Set skill to ACTIVE state, hand off to daemon for monitoring

## Creating a New Skill

When creating a skill, generate ALL of these components:

### Required Files

```
{skill-name}/
├── SKILL.md                    # Primary skill instructions
├── skill-config.json           # Configuration and metadata
├── hooks/
│   ├── hooks.json              # Hook definitions
│   ├── log-mutation.sh         # PostToolUse hook
│   └── health-check.sh         # Stop hook runner
├── memory/
│   ├── execution-log.jsonl     # Run log (append-only)
│   ├── lessons.md              # Accumulated learnings
│   ├── recent-context.json     # Last 10 runs
│   ├── user-feedback.jsonl     # Human eval scores
│   ├── health-checks.jsonl     # Health check results
│   ├── aggregate-scores.json   # Rolling averages
│   └── proposed-updates/       # Staged changes
├── tests/
│   ├── test-manifest.json      # Test definitions
│   ├── inputs/                 # Test inputs
│   ├── expected/               # Expected outputs
│   └── results/                # Test results
└── scripts/                    # Optional helper scripts
```

### SKILL.md Template

Use this frontmatter format:

```yaml
---
name: {skill-name}
description: {What it does AND when to trigger - this enables activation}
---
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
    "confidence_auto_approve": 0.9
  },
  "approval": {
    "channel": "slack",
    "timeout_hours": 24
  }
}
```

## Lifecycle States

| State | Description |
|-------|-------------|
| DRAFT | Spec written, not generated |
| BOOTSTRAPPING | Generating initial code |
| TDD_LOOP | Running tests, iterating |
| PENDING_APPROVAL | Awaiting human approval |
| ACTIVE | Running in production |
| HEALING | Automated fix in progress |
| DEGRADED | Healing failed |
| ARCHIVED | Retired |

## Self-Healing

This skill has self-healing DISABLED to prevent infinite loops. To update skill-creator:

```bash
claude -p "/skill-creator heal-self"
```

Then manually review and approve changes.

## Daemon

The skill-creator daemon monitors all created skills:
- Watches health-checks.jsonl for issues
- Triggers healing when thresholds exceeded
- Handles Slack approval callbacks
- Runs nightly audits

Start daemon:
```bash
cd .claude/skills/skill-creator/daemon
npm install
pm2 start index.js --name skill-daemon
```

## Templates

Templates for common skill types are in `templates/`:
- `base-skill/` - Default template with all components

## Configuration

See `skill-config.json` for:
- Healing thresholds and behavior
- Approval workflow settings
- Memory retention policies
