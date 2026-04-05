---
name: schedule-manager
description: Create, list, and delete scheduled tasks that persist across restarts. Use instead of CronCreate (which has a durable bug).
when-to-use: When the user asks to set up recurring tasks, schedules, reminders, or cron jobs.
user-invocable: true
---

# Schedule Manager

NEVER use the CronCreate tool — it has a bug where `durable: true` is ignored, so tasks vanish on restart.

Instead, read and write `.claude/scheduled_tasks.json` directly.

## File Format

```json
{
  "tasks": [
    {
      "id": "a1b2c3d4",
      "cron": "0 9 * * *",
      "prompt": "Check for new emails and summarize",
      "createdAt": 1712188800000,
      "recurring": true,
      "permanent": true
    }
  ]
}
```

## Creating a Schedule

1. Read `.claude/scheduled_tasks.json` (create it if missing with `{ "tasks": [] }`)
2. Generate an 8-character hex ID: use the first 8 characters of a UUID (e.g., `crypto.randomUUID().slice(0, 8)` or generate manually)
3. Add the new task object with:
   - `id`: 8-char hex
   - `cron`: cron expression
   - `prompt`: the task prompt
   - `createdAt`: `Date.now()`
   - `recurring`: `true`
   - `permanent`: `true`
4. Write the updated JSON back using the Edit tool

## Listing Schedules

Read `.claude/scheduled_tasks.json` and display each task with its ID, cron expression (with human-readable description), and prompt.

## Deleting a Schedule

Read the file, remove the task with the matching ID, write back.

## Common Cron Expressions

| Schedule | Cron |
|----------|------|
| Every 5 minutes | `*/5 * * * *` |
| Every 15 minutes | `*/15 * * * *` |
| Every hour | `0 * * * *` |
| Every 2 hours | `0 */2 * * *` |
| Daily at 9am | `0 9 * * *` |
| Daily at midnight | `0 0 * * *` |
| Weekdays at 9am | `0 9 * * 1-5` |
| Monday at 9am | `0 9 * * 1` |
| First of month at 9am | `0 9 1 * *` |
| Every 30 seconds | Not supported — minimum is 1 minute |

## Important

- ALWAYS set `permanent: true` and `recurring: true`
- NEVER use the CronCreate, CronDelete, or CronList tools
- Always use the Edit tool to modify the file (not Write) so changes are atomic
- The file is at `.claude/scheduled_tasks.json` relative to the space's CLAUDE_CONFIG_DIR
