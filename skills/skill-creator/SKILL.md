---
name: skill-creator
description: Creates self-evolving skills that run, heal, evaluate, and improve themselves with minimal human intervention. Use when creating new skills with TDD bootstrap, hooks, memory systems, and self-healing capabilities. Triggers on '/skill create', 'create a skill that...', or 'bootstrap a new skill'.
hooks:
  PostToolUse:
    - matcher: "Write|Edit"
      hooks:
        - type: command
          command: "echo '{\"event\": \"skill_created\", \"timestamp\": \"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'\"}' >> ~/.claude/skills/skill-creator/memory/execution-log.jsonl"
  Stop:
    - hooks:
        - type: prompt
          prompt: "Evaluate skill creation session. Did the skill get created with all required components (SKILL.md, hooks in frontmatter, memory, tests)? Respond with JSON: {\"complete\": bool, \"components_created\": [...]}"
---

# Skill Creator

A meta-skill that creates fully self-managing agentic skills. Each skill created includes hooks for health monitoring, memory systems for learning, TDD bootstrap for validation, and self-healing capabilities.

## Quick Start

```bash
claude -p "Create a skill that processes PDF invoices and extracts line items"
```

## Workflow

1. **Parse Requirements** - Understand what the skill should do
2. **Ask Clarifications** - If ambiguous, ask up to 3 clarifying questions
3. **Design Test Cases** - Create 3-5 test cases covering core functionality
4. **Generate Skill** - Create full directory structure with all components
5. **Run TDD Loop** - Execute tests, iterate until all pass
6. **Request Approval** - Send Slack notification for deployment approval
7. **Activate** - On approval, set state to ACTIVE and enable self-healing

## Creating a New Skill

When creating a skill, generate the complete directory structure:

```
{skill-name}/
├── SKILL.md                    # Primary skill instructions (hooks defined in frontmatter!)
├── skill-config.json           # Configuration and metadata
├── scripts/
│   ├── log-mutation.sh         # Optional: external script for PostToolUse
│   └── health-check.sh         # Optional: external script for health processing
├── memory/
│   ├── execution-log.jsonl     # Run history
│   ├── lessons.md              # Learnings
│   ├── recent-context.json     # Last 10 runs
│   ├── user-feedback.jsonl     # Eval scores
│   ├── health-checks.jsonl     # Health data
│   └── proposed-updates/       # Staged changes
├── tests/
│   ├── test-manifest.json      # Test definitions
│   ├── inputs/                 # Test inputs
│   └── expected/               # Expected outputs
└── scripts/                    # Utility scripts
```

## Lifecycle States

| State | Description |
|-------|-------------|
| DRAFT | Spec written, not generated |
| BOOTSTRAPPING | Generating skill code |
| TDD_LOOP | Running tests, iterating |
| PENDING_APPROVAL | Awaiting human approval |
| ACTIVE | Running in production |
| HEALING | Fix in progress |
| DEGRADED | Healing failed |
| ARCHIVED | Retired |

## Commands

- `/skill create {description}` - Create a new skill
- `/skill list` - List all skills and states
- `/skill status {name}` - Check skill health
- `/skill heal {name}` - Force healing run
- `/skill deploy {name}` - Deploy pending skill
- `/skill archive {name}` - Retire a skill

## Self-Reference Safety

This skill has self-healing disabled to prevent infinite loops. To update the skill-creator:

1. Run `/skill-creator heal-self`
2. Review proposed changes
3. Explicitly approve

## Configuration

See `skill-config.json` for:
- Healing thresholds
- Approval workflow
- Memory retention
- Bootstrap settings

## Memory System

- `lessons.md` - Accumulated learnings (always loaded)
- `recent-context.json` - Last 10 runs (for healing context)
- `user-feedback.jsonl` - Human eval scores

## Templates

Templates in `templates/` provide starting points:
- `base-skill/` - Default template for new skills
