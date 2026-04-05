# Dashboard vs Claude Instance: Skill/Agent/Plugin Visibility Mismatch

**Date:** 2026-04-04
**Status:** Confirmed mismatch — needs fix

## Problem

The dashboard API shows user-level skills, agents, and plugins for each space, but the actual Claude instance running in that space **cannot see user-level items** because `CLAUDE_CONFIG_DIR` is overridden to point to the space's `.claude/` directory.

## Root Cause

When a space launches, the tmux script sets:
```
CLAUDE_CONFIG_DIR=/Users/gkkirsch/superbot3/spaces/<space>/.claude
```

This means Claude Code only discovers:
- `$CLAUDE_CONFIG_DIR/skills/` (space skills)
- `$CLAUDE_CONFIG_DIR/agents/` (space agents)
- `$CLAUDE_CONFIG_DIR/plugins/` (space plugins)
- Project-level skills from CWD parent directories (`.agents/skills/`, project-root `.claude/skills/`)
- Built-in skills (update-config, keybindings-help, simplify, loop, schedule, claude-api)

Claude Code does **NOT** discover:
- `~/.claude/skills/` (user skills)
- `~/.claude/agents/` (user agents)
- `~/.claude/plugins/installed_plugins.json` (user plugins)

But the broker API (`broker/server.js`) explicitly scans these user-level directories:
- Line 913-915: `path.join(homeDir, '.claude', 'skills')` → added to skills response
- Line ~1096: `path.join(homeDir, '.claude', 'agents')` → added to agents response
- Line 615: `getInstalledPlugins(path.join(homedir, '.claude'))` → added to plugins response

## Verified Mismatch (second-space)

### Skills: Dashboard shows 13, Claude sees 11
- **Dashboard shows but Claude CAN'T see (10 user skills):** pack-install, superbot-brainstorming, superbot-browser, superbot-implementation, supercharge-api, systematic-debugging, test-driven-development, tmux-testing, verification-before-completion, web-project-setup
- **Claude sees but Dashboard DOESN'T show (8 items):** update-config, keybindings-help, simplify, loop, schedule, claude-api (built-ins), shadcn (project-level), superbot3-dev (project-level)

### Agents: Dashboard shows 7, Claude sees 4
- **Dashboard shows but Claude CAN'T see (3 user agents):** code-reviewer, social-media-poster, space-worker

### Plugins
- nano-banana-pro installed at user-level (`~/.claude/plugins/`) but NOT in space's plugin dir
- Space has claude-plugins-official marketplace cloned but no plugins installed or enabled

## Fix Options

### Option A: Stop showing user-level items (accurate but less useful)
Remove the user-level scans from the broker API. Only show what Claude can actually see.

### Option B: Symlink/copy user items into space (make Claude see them)
When creating a space, symlink `~/.claude/skills/*` → `<space>/.claude/skills/`, same for agents.
Downside: symlinks can break, copies get stale.

### Option C: Show user items with a "not visible to Claude" badge
Keep showing them in the dashboard but add a warning indicator that they're user-level and won't be seen by the space's Claude instance unless copied in.

### Option D: Set both CLAUDE_CONFIG_DIR and a secondary env var
If Claude Code supports a "user config" fallback when CLAUDE_CONFIG_DIR is set, use it. (Needs research — likely not supported.)
