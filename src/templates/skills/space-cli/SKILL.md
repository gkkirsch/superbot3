---
name: space-cli
description: "Space orchestrator management: message master, manage workers, crons, knowledge, status reporting."
---

# Space CLI Skill

## Messaging

All messaging uses `superbot3 message` CLI via Bash, which delivers messages via tmux send-keys.

```bash
# Message master orchestrator
superbot3 message master "your message"

# Message another space
superbot3 message <space-slug> "your message"

# Message a specific worker
superbot3 message-worker <space-slug> <worker-name> "instructions"
```

## Worker Management

Use these tools:
- **Agent tool** — Spawn inline subagents for quick tasks
- **`superbot3 spawn-worker`** — Spawn tmux-based workers for long-running tasks (via Bash)
- **`superbot3 message-worker`** — Send messages to workers (via Bash)
- **`superbot3 workers`** — List workers and their status
- **`superbot3 kill-worker`** — Kill a worker
- **TaskCreate/TaskUpdate** — Assign and track tasks

Worker types available in .claude/agents/:
- planner — Planning only, no code changes
- coder — Full implementation worker
- researcher — Web research and knowledge gathering
- reviewer — Code review, read-only

## Schedule Management

Use built-in cron tools:
- **CronCreate** — Create a scheduled task (always use permanent: true)
- **CronList** — List all scheduled tasks
- **CronDelete** — Remove a scheduled task

Example:
```
CronCreate: cron="0 9 * * *", prompt="Daily standup: review state, prioritize work", permanent=true
```

## Knowledge Management

Knowledge files live in knowledge/*.md with optional YAML frontmatter.

On startup, scan knowledge files:
```bash
ls knowledge/*.md 2>/dev/null
```

Read first 10 lines of each to build context.

Daily logs: knowledge/logs/YYYY/MM/YYYY-MM-DD.md
- Append timestamped bullets throughout the day
- Format: `- HH:MM — Description of what happened`

## Status Reporting

When asked for status, report:
- Current workers and their tasks
- Recent activity from daily log
- Pending escalations
- Scheduled tasks (via CronList)
