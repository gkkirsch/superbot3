---
name: master-cli
description: "Space lifecycle management: start, stop, health check, message routing. Use for all space management operations."
---

# Master CLI Skill

## Space Discovery

Scan for spaces:
```bash
ls ~/.superbot3/spaces/*/space.json 2>/dev/null
```

Read each space.json to get: name, slug, codeDir, active status, sessionId.

## Starting a Space

To start a space, create a new tmux window and launch Claude with the space's CLAUDE_CONFIG_DIR:

```bash
# Read space config
cat ~/.superbot3/spaces/<slug>/space.json

# Create tmux window for the space
tmux new-window -t superbot3 -n <slug>

# Launch Claude in the space's window
tmux send-keys -t superbot3:<slug> "cd <codeDir> && env CLAUDECODE=1 CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 CLAUDE_CONFIG_DIR=$HOME/.superbot3/spaces/<slug>/.claude claude --dangerously-skip-permissions --model claude-opus-4-6" Enter
```

After starting, update space.json with the session ID (you'll need to check the Claude process for this).

## Stopping a Space

1. Write a shutdown message to the space's inbox:
   ```bash
   # The space inbox is at:
   # ~/.superbot3/spaces/<slug>/.claude/teams/<slug>/inboxes/team-lead.json
   ```
2. Wait up to 30 seconds for graceful shutdown
3. If no response, kill the tmux window:
   ```bash
   tmux kill-window -t superbot3:<slug>
   ```
4. Update space.json status

## Health Check (Heartbeat)

When triggered by the heartbeat cron:

1. List all tmux windows: `tmux list-windows -t superbot3 -F "#{window_name}"`
2. Compare against active spaces from space.json files
3. For any active space missing a tmux window:
   - Read its sessionId from space.json
   - Restart with: `claude --resume <sessionId>` (same spawn command as starting)
4. Report status

## Message Routing

When you receive a message intended for a space:
1. Identify the target space from the message
2. Write to the space's inbox using the inbox protocol:
   - Inbox path: `~/.superbot3/spaces/<slug>/.claude/teams/<slug>/inboxes/team-lead.json`
   - Read current messages, append new one, write back
   - Use proper-lockfile if available, or atomic write

When a space sends you a message for another space:
1. Read the routing info (target space name)
2. Write to the target space's inbox
3. Confirm routing to the sender

## Creating a Space

To create a new space, use the superbot3 CLI:

```bash
superbot3 space create "<name>"
# Or with a code directory:
superbot3 space create "<name>" --code-dir /path/to/project
```

After creating, start the space:
```bash
# Create tmux window
tmux new-window -t superbot3 -n <slug>

# Launch Claude in the space (read space.json for claudeConfigDir and codeDir)
cat ~/.superbot3/spaces/<slug>/space.json
tmux send-keys -t superbot3:<slug> "cd <codeDir> && env CLAUDECODE=1 CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 CLAUDE_CONFIG_DIR=$HOME/.superbot3/spaces/<slug>/.claude claude --dangerously-skip-permissions --model claude-opus-4-6 --agent-id 'team-lead@<slug>' --agent-name 'team-lead' --team-name '<slug>'" Enter
```

IMPORTANT: Always use `superbot3 space create` — never manually mkdir space directories.

## Status Report

When asked for status:
```bash
# List all space directories
ls ~/.superbot3/spaces/

# Check each space.json
cat ~/.superbot3/spaces/*/space.json

# Check tmux windows
tmux list-windows -t superbot3 -F "#{window_name} #{window_active}"
```

Report: space name, active/inactive, running/stopped (has tmux window), last session ID.
