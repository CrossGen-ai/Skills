---
name: hello-world
description: A simple greeting skill that responds with friendly messages. Trigger with "/hello" or when the user wants a greeting.
---

# Hello World

A minimal test skill that demonstrates the self-evolving skill architecture. This skill responds to greetings with friendly messages.

## Quick Start

```bash
claude -p "/hello"
```

## Workflow

1. **Receive Greeting** - User triggers the skill with a hello/greeting
2. **Generate Response** - Create a friendly, contextual greeting
3. **Log Execution** - Record the interaction in memory

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

To manually trigger healing: `/skill heal hello-world`

## Example Responses

- "Hello! How can I help you today?"
- "Hi there! Great to see you!"
- "Hey! What would you like to work on?"

## Notes

This is a test skill created during the skill-creator bootstrap process to verify the system works correctly.
