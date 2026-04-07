# Plugin/Skill/Agent System Reference

## Key Insight
Plugins are installed **globally** at `~/.claude/plugins/`. CLAUDE_CONFIG_DIR does NOT change this.
Per-space control is via `enabledPlugins` in each space's `settings.json`.

## Plugin File Structure
```
~/.claude/plugins/
├── cache/{marketplace}/{plugin-name}/{version}/.claude-plugin/
│   ├── plugin.json          # Manifest (name, version, skills, agents, mcpServers, hooks, userConfig)
│   ├── skills/{skill}/SKILL.md
│   ├── agents/{agent}.md
│   ├── hooks.json
│   └── .mcp.json
├── data/{plugin-id}/        # Persistent data (survives updates)
├── installed_plugins.json   # V2 format: { version: 2, plugins: { "name@market": [...] } }
├── known_marketplaces.json
└── blocklist.json
```

## Enable/Disable
```json
// In space's .claude/settings.json:
{
  "enabledPlugins": {
    "plugin-name@marketplace": true,   // enabled
    "another@market": false            // disabled
  }
}
```
- **Plugin-level only** — no per-skill or per-agent disabling built in
- When disabled, ALL plugin skills/agents/hooks/MCP servers unavailable

## Skill Discovery (priority order)
1. Managed/policy: `$MANAGED_DIR/.claude/skills/`
2. User: `$CLAUDE_CONFIG_DIR/skills/`
3. Project: `{cwd}/.claude/skills/`
4. Plugin: from enabled plugins
5. Bundled: system skills

First wins on name collision. Conditional skills (with `paths` frontmatter) activate dynamically.

## Agent Discovery (later wins on collision)
1. Built-in (explore, plan, general-purpose, etc.)
2. Plugin agents
3. User: `$CLAUDE_CONFIG_DIR/agents/`
4. Project: `{cwd}/.claude/agents/`

Plugin agents namespaced: `{plugin}:{namespace}:{agent-name}`
Plugin agents CANNOT set: permissionMode, hooks, mcpServers (security boundary)

## Hooks
Configured in settings.json `hooks` key. Sources: user settings, project settings, local settings, policy, plugin manifests.
Events: PreToolUse, PostToolUse, SessionStart, SessionEnd, Notification, Stop, SubagentStart, TeammateIdle, TaskCreated, CwdChanged, FileChanged, etc.
Types: command, prompt, http, agent. All support `if` conditional and `once` flag.

## For Dashboard Implementation
- **Read plugins**: parse `~/.claude/plugins/installed_plugins.json`
- **Enable/disable**: write to space's `settings.json` `enabledPlugins`
- **List skills**: scan `$CLAUDE_CONFIG_DIR/skills/` + parse enabled plugin manifests
- **List agents**: scan `$CLAUDE_CONFIG_DIR/agents/` + parse enabled plugin manifests
- **Plugin config**: read `manifest.userConfig` schema, read/write `settings.pluginConfigs[id].options`
- **No individual skill disable**: must disable entire plugin or rename standalone skill file
