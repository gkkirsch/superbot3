---
name: superbot3-dev
description: Development guide for working on the superbot3 codebase. Architecture decisions, file references, Claude Code internals, testing patterns.
when-to-use: When developing, debugging, or extending superbot3. Use this before making any changes to understand the architecture and constraints.
user-invocable: true
---

# Superbot3 Development Guide

You are working on **superbot3** — an AI orchestration platform built on top of Claude Code. Before making any changes, read this skill thoroughly. It contains every architectural decision, constraint, and pattern you need.

## Architecture Overview

Superbot3 has three layers:

```
pm2/launchd → Broker (Node/Express) → Master Orchestrator (Claude) → Space Orchestrators (Claude)
```

- **Broker** (`broker/server.js`): Node/Express + WebSocket. Serves dashboard UI, REST API, file watching. Infrastructure only, not AI.
- **Master Orchestrator** (`orchestrator/.claude/`): Claude Code instance. Launcher + watchdog + message relay. NOT a decision-maker.
- **Space Orchestrators** (`spaces/{name}/.claude/`): Claude Code instances, one per space. Fully autonomous. Own workers, schedule, knowledge.

## The Core Isolation Mechanism: CLAUDE_CONFIG_DIR

Each space gets its own `CLAUDE_CONFIG_DIR` pointing to `spaces/{name}/.claude/`. This isolates:
- Teams + inboxes (`$DIR/teams/`)
- Plugins (`$DIR/plugins/`)
- Skills (`$DIR/skills/`)
- Agents (`$DIR/agents/`)
- Settings (`$DIR/settings.json`)
- CLAUDE.md (`$DIR/CLAUDE.md`)
- Scheduled tasks (`$DIR/scheduled_tasks.json`)
- Credentials (`$DIR/.credentials.json`)
- Trust config (`$DIR/.claude.json`)

`CLAUDE_CONFIG_DIR` auto-propagates to tmux-spawned workers via `TEAMMATE_ENV_VARS` (see Claude Code internals: `src/utils/swarm/spawnUtils.ts:96-128`).

Workers get BOTH:
- Space context via CLAUDE_CONFIG_DIR (plugins, skills, settings)
- Code repo context via cwd (project .claude/, CLAUDE.md)

## Key Decisions (DO NOT VIOLATE)

1. **Swarms/teams mode, NOT coordinator mode** — coordinator mode has hardcoded prompt, no tool access, is feature-gated
2. **No cross-space knowledge** — each space is self-contained
3. **File-based everything** — no database. Dashboard reads/writes files.
4. **Always `permanent: true`** on scheduled tasks
5. **Dashboard writes `scheduled_tasks.json` directly** — chokidar picks up changes
6. **Frontmatter is single source of truth for knowledge** — no separate index file, progressive enhancement
7. **Master has NO knowledge directory** — CLAUDE.md only
8. **PID check for heartbeat** — no inbox heartbeat protocol
9. **`--resume` for session persistence** — session ID stored in space.json
10. **Two CLI skills** — master-cli (for master) and space-cli (for spaces)
11. **Inbox messaging only** — no tmux send-keys for message delivery
12. **Per-space plugin/skill isolation** — via CLAUDE_CONFIG_DIR

## Directory Structure

```
~/.superbot3/
├── config.json                          # Global config
├── package.json                         # Node dependencies
├── bin/superbot3                        # CLI entrypoint
├── src/
│   ├── auth.js                          # Credential setup per space
│   ├── inbox.js                         # Shared inbox write (lockfile protocol)
│   ├── commands/
│   │   ├── init.js                      # superbot3 init
│   │   ├── start.js                     # superbot3 start (broker + master + spaces)
│   │   ├── stop.js                      # superbot3 space stop
│   │   ├── stop-all.js                  # superbot3 stop
│   │   ├── space-create.js              # superbot3 space create
│   │   ├── space-list.js                # superbot3 space list
│   │   ├── space-status.js              # superbot3 space status
│   │   ├── message.js                   # superbot3 message
│   │   └── logs.js                      # superbot3 logs
│   └── templates/                       # Space templates (CLAUDE.md, skills, agents)
├── broker/
│   ├── server.js                        # Express + WebSocket + all API endpoints
│   └── dashboard-ui/                    # React + Vite + Tailwind + shadcn
│       └── src/
│           ├── pages/                   # Dashboard, SpaceDetail, CreateSpace
│           ├── features/                # ChatSection, tabs (Knowledge, Schedules, etc.)
│           ├── components/              # Sidebar, UI primitives
│           ├── hooks/                   # useSpaces, useWebSocket, usePanel, useTheme
│           └── lib/                     # api.ts, types.ts, utils.ts
├── orchestrator/                        # Master orchestrator (NOT a space)
│   └── .claude/
│       ├── CLAUDE.md
│       ├── settings.json
│       ├── scheduled_tasks.json         # Heartbeat cron (60s PID check)
│       └── skills/master-cli/SKILL.md
├── spaces/                              # Space directories
│   └── {name}/
│       ├── space.json
│       ├── .claude/                     # = CLAUDE_CONFIG_DIR
│       │   ├── CLAUDE.md
│       │   ├── settings.json
│       │   ├── .claude.json             # Trust + onboarding flags
│       │   ├── .credentials.json        # OAuth tokens
│       │   ├── scheduled_tasks.json
│       │   ├── skills/                  # core-methodology, space-cli
│       │   ├── agents/                  # planner, coder, researcher, reviewer
│       │   ├── plugins/                 # Per-space installed plugins
│       │   └── teams/{name}/
│       │       ├── config.json
│       │       └── inboxes/team-lead.json
│       └── knowledge/
│           └── logs/YYYY/MM/
└── templates/default/                   # Templates copied during space create
```

## CLI Commands

| Command | What it does |
|---------|-------------|
| `superbot3 init` | Creates `~/.superbot3/` skeleton |
| `superbot3 start` | Boots broker + master + all active spaces |
| `superbot3 stop` | Shuts down everything |
| `superbot3 space create <name> [--code-dir <path>]` | Creates a space |
| `superbot3 space list` | Lists spaces with running status |
| `superbot3 space status <name>` | Detailed space info |
| `superbot3 space stop <name> [--force]` | Stops a space |
| `superbot3 message <space> "text"` | Message a space orchestrator |
| `superbot3 message "text"` | Message the master orchestrator |
| `superbot3 logs <space>` | Tail space daily log |

## Messaging Protocol

All messaging uses tmux send-keys — instant delivery, no files or polling:

```javascript
const { sendToPane, getSpacePaneTarget } = require('../src/tmuxMessage.js');

// Send to a space
const target = getSpacePaneTarget('my-space');
sendToPane(target, 'your message');

// Send to a worker by pane ID
sendToPane('%5', 'your message');
```

- Uses `tmux load-buffer` + `paste-buffer` for safe escaping of special chars
- Workers tracked in `spaces/{slug}/workers.json` (pane IDs, names, config)
- No inbox files, no lockfiles, no team config needed

## Authentication Setup

Each space needs three things for zero-permission launches (see `src/auth.js`):

1. **`.credentials.json`** — OAuth tokens copied from keychain
2. **`.claude.json`** — `hasCompletedOnboarding: true` + `projects[path].hasTrustDialogAccepted: true`
3. **`settings.json`** — `skipDangerousModePermissionPrompt: true`

The `setupConfigDir()` function in `src/auth.js` handles all three. Called during `space create` and refreshed during `start`.

## Claude Code Internals Reference

When you need to understand HOW Claude Code works internally, reference these source files:

| What | File | Key Functions |
|------|------|---------------|
| Config dir resolution | `src/utils/envUtils.ts` | `getClaudeConfigHomeDir()` — reads `CLAUDE_CONFIG_DIR` |
| Plugin discovery | `src/utils/plugins/pluginDirectories.ts` | `getPluginsDirectory()`, `getPluginSeedDirs()` |
| Plugin loading | `src/utils/plugins/pluginLoader.ts` | Full plugin load pipeline |
| Skill discovery | `src/skills/loadSkillsDir.ts` | `getSkillsPath()` — user vs project paths |
| Agent discovery | `src/tools/AgentTool/loadAgentsDir.ts` | `getAgentDefinitionsWithOverrides()` |
| Team config | `src/utils/swarm/teamHelpers.ts` | `readTeamFile()`, `writeTeamFileAsync()` |
| Inbox protocol | `src/utils/teammateMailbox.ts` | `writeToMailbox()`, `readUnreadMessages()` |
| Inbox polling | `src/hooks/useInboxPoller.ts` | 1000ms poll, message routing |
| Spawn mechanics | `src/tools/shared/spawnMultiAgent.ts` | Tmux spawn command, env var forwarding |
| Env var forwarding | `src/utils/swarm/spawnUtils.ts` | `TEAMMATE_ENV_VARS`, `buildInheritedEnvVars()` |
| Cron scheduler | `src/utils/cronScheduler.ts` | `createCronScheduler()`, check/fire loop |
| Cron tasks | `src/utils/cronTasks.ts` | `CronTask` type, `scheduled_tasks.json` format |
| Cron parsing | `src/utils/cron.ts` | `cronToHuman()`, `parseCronExpression()` |
| CLAUDE.md discovery | `src/utils/claudemd.ts` | Walk-up from cwd, `@include` directive |
| Global config | `src/utils/env.ts` | `getGlobalClaudeFile()` — `.claude.json` location |
| Trust dialog | `src/utils/config.ts` | `checkHasTrustDialogAccepted()` |
| Settings merge | `src/utils/settings/settings.ts` | Source priority, merge customizer |
| Coordinator mode | `src/coordinator/coordinatorMode.ts` | We DON'T use this — reference only |
| Auto-memory | `src/memdir/` | Memory system (inspiration for knowledge) |

All internals source is at: `~/dev/claude-code-internals-main/src/`

## Testing Patterns

### Terminal verification
```bash
# Check space files
superbot3 space create test && ls -la ~/.superbot3/spaces/test/.claude/

# Check running status
superbot3 start && tmux list-panes -t superbot3 -a

# Check messaging
superbot3 message test "hello" && cat ~/.superbot3/spaces/test/.claude/teams/test/inboxes/team-lead.json

# Check broker
curl localhost:3100/health
curl localhost:3100/api/spaces
curl localhost:3100/api/spaces/test/skills

# Check auth
cat ~/.superbot3/spaces/test/.claude/.credentials.json | head -5
cat ~/.superbot3/spaces/test/.claude/.claude.json
```

### Browser verification
```
1. Open http://localhost:3100
2. Sidebar: spaces listed with running indicators
3. Click space: chat works, tabs load data
4. Create Space: form works, space auto-starts
5. Knowledge tab: create/edit/delete files
6. Schedules tab: create/edit/delete crons
7. Skills tab: lists skills from plugins + standalone
8. Send chat message: response appears with typing indicator
```

### Common debugging
```bash
# See what Claude is doing in a space
tmux capture-pane -t superbot3:{space} -p | tail -50

# Check inbox state
cat ~/.superbot3/spaces/{name}/.claude/teams/{name}/inboxes/team-lead.json | python3 -m json.tool

# Check if broker is serving dashboard
curl -I localhost:3100

# Rebuild dashboard
cd ~/.superbot3/broker/dashboard-ui && npm run build

# Check conversation log
ls ~/.superbot3/spaces/{name}/.claude/projects/
```

## Known Gaps (as of Phase 2)

1. **Cross-team messaging fragile** — spaces write to master inbox via raw bash. Need proper `crossTeamMessage` utility with lockfile.
2. ~~**Session IDs not captured**~~ — FIXED: `start.js` now captures session IDs from newest JSONL file and stores in space.json. `--resume` works on restart.
3. **Master cannot message spaces** — no utility for master-to-space messaging.
4. **Plugin management UI** — needs work (install/uninstall/enable/disable per space).

## Tech Stack

- **CLI**: Node.js + Commander
- **Broker**: Express + ws (WebSocket) + chokidar (file watching)
- **Dashboard**: React + Vite + TypeScript + Tailwind v4 + shadcn/ui
- **Dependencies**: proper-lockfile, commander, express, ws, chokidar, react-markdown, remark-gfm
- **Process management**: tmux (required dependency)
- **Theme**: ink (#0a0a0a), surface (#141414), parchment (#d4cdc4), stone (#706b63), sand (#c4a882), ember (#DC504A), moss (#8a9a7b) + Space Mono font
