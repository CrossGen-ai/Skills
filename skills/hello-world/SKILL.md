---
name: hello-world
description: A simple test skill that responds with 'Hello, World!' when invoked. Use this skill for testing the skill infrastructure and as a template for creating new skills. Triggers on '/hello', 'say hello', or 'test skill'.
hooks:
  PostToolUse:
    - matcher: "Write|Edit"
      hooks:
        - type: command
          command: "echo '{\"event\": \"self_mutation\", \"timestamp\": \"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'\"}' >> ~/.claude/skills/hello-world/memory/execution-log.jsonl"
  Stop:
    - hooks:
        - type: prompt
          prompt: "Analyze this session for the skill 'hello-world'. Evaluate: 1) Did it complete the requested task? 2) Were there errors? 3) Was it efficient? Respond with JSON: {\"healthy\": true, \"score\": 5}"
---

# Hello World

A minimal skill to verify the skill-creator infrastructure is working correctly. This skill demonstrates the complete lifecycle including hooks, memory, and self-healing capabilities.

## Quick Start

```bash
claude -p "Say hello to the world"
```

## Workflow

1. **Receive Request** - Parse the incoming greeting request
2. **Generate Response** - Produce a friendly "Hello, World!" response
3. **Log Execution** - Record the run in the execution log
4. **Health Check** - Verify successful completion via Stop hook

## Example Output

```
Hello, World! 👋

Greetings from the skill-creator infrastructure. This message confirms that:
- The skill was loaded correctly
- Hooks are functioning
- Memory system is operational
```

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

To manually trigger healing: `/skill heal hello-world`
