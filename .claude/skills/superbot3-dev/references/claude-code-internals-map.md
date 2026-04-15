# Claude Code Internals Map

Source location: `~/dev/claude-code-internals-main/src/`

## Config & Environment
| File | What it does |
|------|-------------|
| `utils/envUtils.ts` | `getClaudeConfigHomeDir()` — resolves `CLAUDE_CONFIG_DIR` or `~/.claude` |
| `utils/env.ts` | `getGlobalClaudeFile()` — `.claude.json` path (at `$CLAUDE_CONFIG_DIR/.claude.json`) |
| `utils/config.ts` | Global config read/write, trust dialog check, project config |
| `utils/settings/settings.ts` | Settings merge (user > project > policy), `enabledPlugins`, `skipDangerousModePermissionPrompt` |
| `utils/settings/types.ts` | Full settings schema (Zod) |
| `bootstrap/state.ts` | Session state, `additionalDirectoriesForClaudeMd`, `useCoworkPlugins` |

## Plugin System
| File | What it does |
|------|-------------|
| `utils/plugins/pluginDirectories.ts:53-63` | Primary plugins dir: `$CLAUDE_CONFIG_DIR/plugins/` or `$CLAUDE_CODE_PLUGIN_CACHE_DIR` |
| `utils/plugins/pluginDirectories.ts:85-90` | Seed dirs: `$CLAUDE_CODE_PLUGIN_SEED_DIR` (PATH-like, read-only fallback) |
| `utils/plugins/pluginLoader.ts` | Full load pipeline — marketplace, session, primary, seed dirs |
| `utils/plugins/pluginOptionsStorage.ts` | Plugin configuration/credentials storage |
| `cli/handlers/plugins.ts` | `claude plugin install/uninstall/list` CLI handlers |

## Skill System
| File | What it does |
|------|-------------|
| `skills/loadSkillsDir.ts:78-94` | `getSkillsPath(source)` — user: `$CLAUDE_CONFIG_DIR/skills`, project: `.claude/skills` |
| `skills/loadSkillsDir.ts` | Full skill loading with frontmatter parsing, budget system (1% of context) |
| `skills/bundled/` | Built-in skills (commit, simplify, schedule, etc.) |

## Agent System
| File | What it does |
|------|-------------|
| `tools/AgentTool/loadAgentsDir.ts` | Discovery: built-in → plugin → user → project. Later overrides earlier. |
| `tools/AgentTool/builtInAgents.ts` | Built-in agent types (explore, plan, general-purpose, etc.) |
| `tools/AgentTool/runAgent.ts` | Agent execution |
| `tools/AgentTool/forkSubagent.ts` | Fork with shared prompt cache |

## Team / Swarm System
| File | What it does |
|------|-------------|
| `utils/swarm/teamHelpers.ts` | Team file I/O, member management |
| `utils/swarm/constants.ts` | `TEAM_LEAD_NAME`, `SWARM_SESSION_NAME`, `TEAMMATE_COMMAND_ENV_VAR` |
| `utils/swarm/spawnUtils.ts:96-128` | `TEAMMATE_ENV_VARS` — what gets forwarded to workers (includes `CLAUDE_CONFIG_DIR`) |
| `utils/swarm/spawnUtils.ts:38-89` | `buildInheritedCliFlags()` — permission mode, model, settings, plugins |
| `tools/shared/spawnMultiAgent.ts:399-440` | Actual tmux spawn command construction |
| `utils/swarm/inProcessRunner.ts` | In-process teammate execution (AsyncLocalStorage) |

## Messaging
| File | What it does |
|------|-------------|
| `utils/teammateMailbox.ts` | `writeToMailbox()`, `readMailbox()`, `readUnreadMessages()` (Claude Code internal — superbot3 uses CLI messaging instead) |
| `hooks/useInboxPoller.ts` | 1000ms polling, message routing (Claude Code internal — not used by superbot3) |
| `tools/SendMessageTool/SendMessageTool.ts` | SendMessage tool implementation |

## Cron / Scheduling
| File | What it does |
|------|-------------|
| `utils/cronScheduler.ts` | `createCronScheduler()` — 1s check loop, lockfile, file watcher, jitter |
| `utils/cronTasks.ts` | `CronTask` type, read/write, `scheduled_tasks.json` at `.claude/scheduled_tasks.json` |
| `utils/cron.ts` | Parser, `computeNextCronRun()`, `cronToHuman()` |
| `utils/cronTasksLock.ts` | Scheduler lock (prevents double-fire across sessions) |

## CLAUDE.md / Memory
| File | What it does |
|------|-------------|
| `utils/claudemd.ts` | Discovery: managed → user → project (walk up from cwd). `@include` directive. |
| `memdir/` | Auto-memory system (MEMORY.md index, topic files, 25KB cap, consolidation) |
| `memdir/paths.ts` | `getAutoMemPath()` resolution |

## Coordinator Mode (we DON'T use this)
| File | What it does |
|------|-------------|
| `coordinator/coordinatorMode.ts` | `isCoordinatorMode()` — checks `CLAUDE_CODE_COORDINATOR_MODE` env var |
| `coordinator/coordinatorMode.ts:111` | `getCoordinatorSystemPrompt()` — hardcoded, can't customize |

## Bridge (remote control — future reference)
| File | What it does |
|------|-------------|
| `bridge/bridgeApi.ts` | REST client for remote environments |
| `bridge/bridgeMessaging.ts` | Bidirectional message routing with dedup |
| `bridge/replBridgeTransport.ts` | Transport abstraction (WS, SSE) |

## Key Constants
- Claude Code inbox poll interval: 1000ms (not used by superbot3)
- Cron check interval: 1000ms
- Cron jitter: 10% of interval, capped at 15min
- Recurring task max age: 7 days (but we use `permanent: true`)
- Skill description budget: 1% of context (~8KB for 200K context)
- Skill description max: 250 chars
- Memory cap: 25KB / 200 lines
