# superbot3

AI orchestration platform built on Claude Code. Each space runs as its own Claude Code instance with isolated plugins, skills, knowledge, and memory.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/gkkirsch/superbot3/main/install.sh | bash
```

### Prerequisites

- Node.js 18+
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) (`npm install -g @anthropic-ai/claude-code`)
- tmux (`brew install tmux` on macOS)
- git

## Quick Start

```bash
superbot3 start                           # Boot everything
superbot3 space create "My Project"       # Create a space
superbot3 message my-project "hello"      # Talk to it
```

Dashboard: http://localhost:3100

## Features

- Per-space plugin, skill, and agent isolation
- Built-in memory system (remember, recall, reflect)
- Knowledge base wiki (Karpathy-style compile/query/lint)
- Dashboard with chat, file explorer, schedules, settings
- Broker-side cron scheduler
- Master orchestrator with health monitoring
- One-command install and update (`superbot3 update`)

## Architecture

```
Broker (Express) → Master Orchestrator (Claude) → Space Orchestrators (Claude)
```

- **Code** lives at `~/.superbot3-app/` (replaceable, versioned)
- **Data** lives at `~/.superbot3/` (user config, spaces, never overwritten)

## Commands

| Command | Description |
|---------|-------------|
| `superbot3 start` | Boot broker + master + all active spaces |
| `superbot3 stop` | Shut down everything |
| `superbot3 space create <name>` | Create a new space |
| `superbot3 space list` | List all spaces |
| `superbot3 message <space> "text"` | Message a space |
| `superbot3 update` | Pull latest code and rebuild |
| `superbot3 reload` | Restart broker (spaces stay alive) |

## Update

```bash
superbot3 update
superbot3 reload    # Apply to running broker
```
