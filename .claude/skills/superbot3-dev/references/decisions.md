# Architectural Decisions

These are final. Do not deviate without user approval.

## Core
- **CLAUDE_CONFIG_DIR per space** for full isolation (teams, inboxes, plugins, skills, agents, settings)
- **Standard swarms/teams mode** — NOT coordinator mode (hardcoded prompt, no tools, feature-gated)
- **File-based everything** — no database anywhere. Dashboard reads/writes files directly.
- **tmux for process management** — required dependency. Workers spawn via tmux panes.
- **Inbox for messaging** — no tmux send-keys for message delivery. Lockfile-protected JSON files.

## Scheduling
- **Built-in cron scheduler** (`scheduled_tasks.json`) — no external cron service
- **Always `permanent: true`** — tasks never auto-expire
- **Dashboard writes file directly** — chokidar picks up changes in Claude Code
- **No default schedules** — user configures via chat or dashboard

## Knowledge
- **Frontmatter is single source of truth** — no separate index file
- **Progressive enhancement**: frontmatter > H1 > filename + first line
- **Startup scan**: orchestrator reads first 10 lines of each knowledge/*.md
- **Daily logs**: `knowledge/logs/YYYY/MM/YYYY-MM-DD.md`, append-only, timestamped
- **No cross-space knowledge**
- **No standard files** — whatever the user creates

## Master Orchestrator
- Lives at `~/.superbot3/orchestrator/` — NOT a space
- **Launcher + watchdog + message relay ONLY** — not a decision-maker
- **No knowledge directory** — CLAUDE.md is all it needs
- Has `master-cli` skill
- Dashboard home chat writes to master inbox

## Session Persistence
- **`--resume <sessionId>`** for conversation continuity
- Session ID stored in `space.json`
- Recovery: CLAUDE.md → knowledge scan → daily log → missed cron detection → stale team cleanup

## Dashboard
- **Left nav**: Dashboard + space list only. No plugins page, no library, no docs.
- **Space page**: Chat (primary) + tabs (Knowledge, Schedules, Plugins, Skills, Workers, Settings)
- **No projects** inside spaces — orchestrator manages internally
- **No draggable widgets** — fixed layout
- **React + Vite + Tailwind + shadcn** — same as superbot2
- **Colors**: ink (#0a0a0a), surface (#141414), parchment (#d4cdc4), stone (#706b63), sand (#c4a882), ember (#DC504A), moss (#8a9a7b)

## Authentication
- Three gates pre-populated per space:
  1. `.credentials.json` — OAuth tokens from keychain
  2. `.claude.json` — `hasCompletedOnboarding` + `hasTrustDialogAccepted` per path
  3. `settings.json` — `skipDangerousModePermissionPrompt: true`
- Refreshed on every `superbot3 start`
