# Team Config Fix: Missing config.json Broke isTeamLead()

**Date:** 2026-04-04
**Status:** Fixed

## Problem

Spaces were missing `teams/<slug>/config.json`, which caused Claude Code's `isTeamLead()` to always return `false`. This meant:
- The inbox poller may not activate properly
- Team functionality (spawning teammates, receiving messages) was degraded
- Claude didn't fully recognize itself as the team leader

## Root Cause

`space-create.js` created the `teams/` directory and `start.js` created the inbox file, but **neither created `config.json`**. Claude Code's internal `isTeamLead(config)` function checks `config.leadAgentId` against the current agent ID — without config.json, it returns `false`.

## Fix

1. **`space-create.js`** — Now creates `teams/<slug>/config.json` with `leadAgentId: "team-lead@<slug>"` during space creation
2. **`start.js`** — Added `ensureTeamConfig()` that creates config.json on startup for existing spaces (retroactive fix)
3. **Existing spaces** — Manually created config.json for all 4 existing spaces

## CronCreate Durable Issue (Separate)

`CronCreate` with `durable: true` does NOT persist jobs. The tool schema defines the parameter, and the description says "persist to .claude/scheduled_tasks.json and survive restarts", but the implementation ignores it — all jobs are session-only. This is a Claude Code v2.1.92 limitation, not a superbot3 bug. The `scheduled_tasks.json` file exists in each space but remains empty `{"tasks": []}`.

**Workaround:** Use `RemoteTrigger` (the `/schedule` skill) for persistent scheduled tasks — these use Anthropic's cloud-based scheduling system instead of local cron.
