---
name: space-cli
description: "Space orchestrator management: message master, manage workers, crons, knowledge, status reporting."
---

# Space CLI Skill

## Messaging Master Orchestrator

To send a message to the master orchestrator:
```bash
# Write to master's inbox
# Path: ~/superbot3/orchestrator/.claude/teams/superbot3/inboxes/team-lead.json
# Format: JSON array of messages, append with read: false
```

To message another space (via master relay):
- Send a message to master with routing info: "Route to <space-name>: <message>"

## Worker Management

Use the built-in team tools:
- **TeamCreate** — Create a new team (done automatically on first run)
- **Agent tool** — Spawn workers using agent definitions from .claude/agents/
- **SendMessage** — Send messages to workers
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
