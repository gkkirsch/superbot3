---
name: claude-code-internals
description: "Hard-won knowledge about Claude Code internals: team system, permissions, inbox protocol, agent identity. Reference before building anything that touches these systems."
---

# Claude Code Internals

What we've learned by reading the source and debugging real issues. This is ground truth — not docs, not guesses.

## Team Lead Detection

**Source**: `src/utils/swarm/permissionSync.ts` → `isTeamLeader()`

```typescript
export function isTeamLeader(teamName?: string): boolean {
  const team = teamName || getTeamName()
  if (!team) return false
  const agentId = getAgentId()
  return !agentId || agentId === 'team-lead'
}
```

**Key rule**: The agent-id MUST be exactly `team-lead` (no suffix). If you use `team-lead@myteam`, `isTeamLeader()` returns false and Claude Code treats you as a **swarm worker** instead of the leader.

**What breaks**: Workers send permission requests to the leader via mailbox. If the leader IS the worker (wrong agent-id), it sends permission requests to itself → deadlock. The UI shows "Waiting for team lead approval" forever.

**Correct launch args**:
```bash
claude --agent-id 'team-lead' --agent-name 'team-lead' --team-name '<team-name>'
```

**Wrong** (causes deadlock):
```bash
claude --agent-id 'team-lead@myteam' ...
```

## isTeamLead vs isTeamLeader (Two Different Functions!)

There are TWO separate functions that check leadership:

1. **`isTeamLeader()`** in `permissionSync.ts` — checks `agentId === 'team-lead'` (exact string). Used by the **permission system** to decide worker vs leader behavior.

2. **`isTeamLead(teamContext)`** in `teammate.ts` — checks `myAgentId === teamContext.leadAgentId`. Used by the **inbox poller** and task system.

The permission system uses `isTeamLeader()`. The inbox system uses `isTeamLead()`. They can disagree if agent-id doesn't match expectations.

## Swarm Worker Detection

**Source**: `permissionSync.ts` → `isSwarmWorker()`

```typescript
export function isSwarmWorker(): boolean {
  const teamName = getTeamName()
  const agentId = getAgentId()
  return !!teamName && !!agentId && !isTeamLeader()
}
```

An agent is a swarm worker if it has BOTH a team name and agent ID, AND is NOT the team leader. Workers get the swarm permission handler which forwards tool approvals to the leader.

## Permission Flow (Swarm)

When a **worker** needs to run a tool:
1. `swarmWorkerHandler` intercepts the permission check
2. Creates a `SwarmPermissionRequest` and writes it to `~/.claude/teams/{team}/permissions/pending/`
3. Also sends a `permission_request` message to the leader's mailbox
4. Worker polls `permissions/resolved/` directory for the response
5. Leader's UI shows the request, user approves/denies
6. Leader writes response to `resolved/` and sends `permission_response` to worker mailbox

**`--dangerously-skip-permissions`** bypasses the normal permission system BUT does NOT bypass the swarm permission flow. If `isSwarmWorker()` returns true, the swarm handler still kicks in regardless of `--dangerously-skip-permissions`.

## Agent Identity Resolution

**Source**: `teammate.ts`

Priority order for resolving agent identity:
1. **AsyncLocalStorage** (in-process teammates) — via `teammateContext.ts`
2. **dynamicTeamContext** (tmux teammates via CLI args `--agent-id`, `--team-name`)

Functions:
- `getAgentId()` — returns the agent ID
- `getAgentName()` — returns the agent name
- `getTeamName()` — returns the team name
- `isTeammate()` — true if running as a teammate (has both agentId AND teamName)

## Inbox / Mailbox Protocol

**Source**: `teammateMailbox.ts`

Inboxes are JSON files at `~/.claude/teams/{team}/inboxes/{agent-name}.json`.

**Write protocol** (must follow exactly):
1. `mkdirSync` on parent dir
2. Create file with `wx` flag (fail if exists)
3. Lock with `proper-lockfile` (10 retries, 5-100ms backoff)
4. Read current content, parse JSON array, append new message, write back
5. Release lock in finally block

**Never write inbox files directly** with the Write/Edit tools — use `superbot3 message` CLI or the `writeToMailbox()` function which handles locking.

Message format:
```json
{
  "from": "sender-name",
  "text": "message content",
  "timestamp": "2026-04-08T10:00:00.000Z",
  "summary": "brief preview"
}
```

## Team Config File

**Location**: `~/.claude/teams/{team-name}/config.json`

```json
{
  "name": "team-name",
  "description": "Team description",
  "createdAt": 1775643049366,
  "leadAgentId": "team-lead",
  "members": [
    {
      "agentId": "researcher@team-name",
      "name": "researcher",
      "agentType": "general-purpose",
      "joinedAt": 1775643050000,
      "tmuxPaneId": "%42",
      "cwd": "/path/to/work",
      "subscriptions": [],
      "isActive": true,
      "mode": "bypassPermissions"
    }
  ]
}
```

**`leadAgentId` must be `"team-lead"`** — not `"team-lead@team-name"`. This is checked by `isTeamLead()` in `teammate.ts`.

## CLAUDE_CONFIG_DIR Isolation

Setting `CLAUDE_CONFIG_DIR` makes Claude Code use that directory instead of `~/.claude/` for:
- settings.json (permissions, hooks)
- teams/ (team configs, inboxes)
- skills/ (skill discovery)
- agents/ (agent definitions)
- plugins/ (plugin configs)
- projects/ (session JSONL files)

This is how superbot3 isolates spaces — each space has its own `.claude/` directory.

## Scheduled Tasks (Cron)

**Source**: `useScheduledTasks.ts`

File: `{CLAUDE_CONFIG_DIR}/scheduled_tasks.json`

```json
{
  "tasks": [
    {
      "id": "unique-id",
      "cron": "0 * * * *",
      "prompt": "What to do when triggered",
      "createdAt": 1775643982899,
      "recurring": true,
      "permanent": true
    }
  ]
}
```

- `recurring: true` — re-fires on schedule (vs one-shot)
- `permanent: true` — survives session restarts
- `lastFiredAt` — updated by the scheduler after each fire
- Scheduler checks every 60 seconds whether any task's cron matches

## Trust Prompt

When Claude launches in a directory, it shows "Is this a project you created or one you trust?" The `--dangerously-skip-permissions` flag should bypass this, but if the trust check fires before the flag is processed, it can still appear. This is a known edge case with tmux `send-keys` launches vs script launches.

## System Prompt Architecture

**Source**: `src/utils/systemPrompt.ts`, `src/utils/claudemd.ts`, `src/main.tsx`

The system prompt is built from multiple sources in priority order:

1. **`overrideSystemPrompt`** — completely replaces everything (used by loop mode)
2. **Agent definition body** — if `mainThreadAgentDefinition` is set, its `getSystemPrompt()` output REPLACES the default. Custom agents (`.claude/agents/*.md`) use the markdown body as the prompt.
3. **`--system-prompt` / `--system-prompt-file`** CLI flag — replaces default if no agent
4. **Default system prompt** — the standard Claude Code prompt (built-in)
5. **`--append-system-prompt` / `--append-system-prompt-file`** — always APPENDED at the end (even with agents)
6. **Teammate addendum** — if running as a swarm teammate, extra instructions are appended

**CLAUDE.md is NOT the system prompt.** It's loaded separately as user context/instructions. The hierarchy:
- `/etc/claude-code/CLAUDE.md` — managed/enterprise (lowest priority)
- `~/.claude/CLAUDE.md` — user global
- `CLAUDE.md` / `.claude/CLAUDE.md` — project root (discovered by walking up from cwd)
- `CLAUDE.local.md` — local project overrides (highest priority)
- `.claude/rules/*.md` — additional rule files

Files closer to cwd have higher priority (loaded later, model pays more attention).

**`@include` directive**: CLAUDE.md files can include other files with `@path` syntax.

**For superbot3**: The master and space orchestrators use `CLAUDE.md` for their identity/instructions. This is the right mechanism — it's the standard way to give Claude persistent instructions. For stronger control, use `--append-system-prompt-file` in the launch script to inject instructions that are part of the actual system prompt (harder to ignore than CLAUDE.md context).

**Agent definitions** (`.claude/agents/*.md`):
- Frontmatter: `permissionMode`, `model`, `tools`, `disallowedTools`, `skills`, `mcpServers`, `hooks`, `maxTurns`, `memory`, `isolation`, `effort`
- Body: becomes the system prompt (replaces default)
- `omitClaudeMd: true` in frontmatter skips loading CLAUDE.md hierarchy (saves tokens for read-only agents)

## Custom System Prompts in superbot3

superbot3 uses `--system-prompt-file` to completely replace the default Claude Code system prompt:
- Master: `~/.superbot3/orchestrator/system-prompt.md`
- Spaces: `~/.superbot3/spaces/<slug>/system-prompt.md`

These files are:
- Generated from templates during `init` (master) and `space create` (spaces)
- Editable via dashboard API: `GET/PUT /api/master/system-prompt` and `GET/PUT /api/spaces/:name/system-prompt`
- Self-editable by the orchestrators themselves (they can Read/Edit their own file)
- Changes take effect on next restart (the file is read at launch time)

CLAUDE.md still works alongside the system prompt — it's loaded as user context/instructions. The system prompt defines the core identity; CLAUDE.md adds project-specific rules.

## WebFetch Tool

**Source**: `src/tools/WebFetchTool/`

How it works:
1. `axios.get()` the URL (arraybuffer, 60s timeout, 10MB max)
2. HTML → markdown via `turndown` library
3. Truncate to 100K chars
4. Run through Haiku with user's prompt to summarize/extract
5. Cache result in LRU (15min TTL, 50MB max)

Key details:
- **Preapproved hosts**: ~80 code-related domains (react.dev, docs.python.org, kubernetes.io, etc.) skip permission prompt. See `preapproved.ts` for full list.
- **Domain blocklist preflight**: Before fetching, checks `api.anthropic.com/api/web/domain_info?domain=X`. Skip with `skipWebFetchPreflight: true` in settings.
- **Redirects**: Same-host only (www ↔ non-www). Cross-host redirects return info to Claude to re-fetch.
- **Binary content**: PDFs etc. saved to disk with proper extension. Claude can read the saved file.
- **Permission rules**: Per-domain `allow`/`deny`/`ask` rules stored in settings. Format: `domain:hostname`.
- **User-Agent**: Custom agent string from `getWebFetchUserAgent()`.

## WebSearch Tool

**Source**: `src/tools/WebSearchTool/`

Uses Anthropic's built-in `web_search_20250305` server-side tool — NOT a third-party API.

How it works:
1. Creates a new API call with the user's query + `web_search` tool schema
2. Claude server-side executes the search
3. Returns `server_tool_use` + `web_search_tool_result` blocks with titles/URLs
4. Claude synthesizes results into text with citations

Key details:
- Max 8 searches per call (`max_uses: 8`)
- Supports `allowed_domains` and `blocked_domains` filtering
- Only works with: firstParty API, Vertex (Claude 4.0+), Foundry
- Uses Haiku by default (feature flag `tengu_plum_vx3`), falls back to main model
- No permission prompt — uses `passthrough` behavior (always asks)
- Results include both search hits (title + URL) and text summaries

## Plugin Skill Discovery (How It Actually Works)

**Source**: `src/utils/plugins/pluginLoader.ts`, `src/utils/plugins/loadPluginCommands.ts`, `src/utils/plugins/marketplaceManager.ts`

Plugin skills are loaded through a completely separate path from `.claude/skills/`:

1. `getPluginSkills()` (memoized) → `loadAllPluginsCacheOnly()`
2. → `loadPluginsFromMarketplaces({ cacheOnly: true })`
3. Reads `enabledPlugins` from merged settings (user + project + local + policy)
4. For each `plugin@marketplace` entry, loads the marketplace catalog
5. Resolves plugin install path from cache: `{CLAUDE_CONFIG_DIR}/plugins/cache/{marketplace}/{plugin}/{version}/`
6. Loads skills from the plugin's `skills/` directory

**Plugin skill names are NAMESPACED**: `{pluginName}:{skillName}`. E.g., `browser:browser`, `memory-knowledge:memory`.

**Marketplace resolution pipeline**:
- Marketplaces come from: `known_marketplaces.json` (global), `extraKnownMarketplaces` (settings.json), or `--add-dir` flag
- `extraKnownMarketplaces` in settings.json supports `source: 'directory'` for local and `source: 'settings'` for inline declarations
- The marketplace needs a `.claude-plugin/marketplace.json` at its installLocation

**Known failure mode (2026-04-10)**: Local `directory` source marketplaces declared via `extraKnownMarketplaces` in project-level settings.json appear to silently fail during `loadPluginsFromMarketplaces`. The marketplace catalog parsing succeeds but plugin skills are never loaded. The exact failure point is unclear — errors are caught and logged only via `logForDebugging` which isn't visible in normal operation.

**Working approach**: Use a real marketplace (e.g., superchargeclaudecode.com) that goes through the standard git-clone → cache pipeline. Plugins installed from git-based marketplaces work reliably.

**What does NOT work for local plugins**:
- Putting plugins in `.claude/plugins/cache/custom-marketplace/...` with a local `known_marketplaces.json` entry
- Using `extraKnownMarketplaces` with `source: 'directory'` pointing to local cache
- Using `source: 'settings'` with inline plugin declarations (requires remote sources only)

**What DOES work**:
- Standard marketplace flow: git repo → marketplace.json → install → cache
- Plugins from `claude-plugins-official` and `supercharge-claude-code` load correctly
- Skills in `.claude/skills/` (non-plugin) always work via the Skill tool

## Things Still Unknown

- How `--resume <sessionId>` interacts with `CLAUDE_CONFIG_DIR` (does it look in the config dir's projects/ for the session file?)
- Whether in-process teammates respect `CLAUDE_CONFIG_DIR` or always use the parent's config
- Full list of what `--dangerously-skip-permissions` actually bypasses vs what it doesn't

## TODO

- Replace gog CLI's OpenClaw OAuth client with our own Google Cloud OAuth credentials. Steps: create GCP project → enable Gmail API → create OAuth consent screen → create Desktop App credentials → `gog auth credentials set /path/to/credentials.json` → `gog auth add ibekidkirsch@gmail.com`
