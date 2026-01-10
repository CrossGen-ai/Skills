---
name: {{SKILL_NAME}}
description: {{SKILL_DESCRIPTION}}
---

# {{SKILL_NAME}}

{{SKILL_OVERVIEW}}

## Quick Start

```bash
claude -p "/{{SKILL_NAME}} {{EXAMPLE_COMMAND}}"
```

## Workflow

1. {{STEP_1}}
2. {{STEP_2}}
3. {{STEP_3}}

## Configuration

This skill uses `skill-config.json` for:
- Healing thresholds and behavior
- Approval workflow settings
- Memory retention policies

## Memory System

This skill maintains local memory in `memory/`:
- `lessons.md` - Accumulated learnings (always loaded)
- `recent-context.json` - Last 10 runs (loaded for healing)
- `user-feedback.jsonl` - Your eval scores

## Self-Healing

This skill automatically:
- Monitors its own health via Stop hooks
- Proposes fixes when issues are detected
- Requests approval before applying changes

To manually trigger healing: `/skill heal {{SKILL_NAME}}`

## References

{{REFERENCES}}

## Scripts

{{SCRIPTS}}
