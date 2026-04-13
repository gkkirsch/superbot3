/**
 * Shared space launch logic — used by both `space create` and `start`.
 * Handles writing the launch script, ensuring team config/inbox, and spawning the tmux window.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Write a launcher script that starts Claude in interactive mode.
 * Sets CLAUDE_CONFIG_DIR for full isolation.
 */
function writeLaunchScript(name, cwd, model, resumeSessionId, claudeConfigDir, teamArgs, opts = {}) {
  const scriptDir = path.join(require('os').homedir(), '.superbot3', '.tmp');
  fs.mkdirSync(scriptDir, { recursive: true });

  const scriptPath = path.join(scriptDir, `launch-${name}.sh`);

  const claudeArgs = ['--dangerously-skip-permissions', `--model ${model}`];
  if (resumeSessionId) {
    claudeArgs.push(`--resume ${resumeSessionId}`);
  }
  // All three required for inbox polling
  if (teamArgs) {
    if (teamArgs.agentId) claudeArgs.push(`--agent-id '${teamArgs.agentId}'`);
    if (teamArgs.agentName) claudeArgs.push(`--agent-name '${teamArgs.agentName}'`);
    if (teamArgs.teamName) claudeArgs.push(`--team-name '${teamArgs.teamName}'`);
  }
  // Custom system prompt file replaces the entire default Claude Code system prompt
  if (opts.systemPromptFile && fs.existsSync(opts.systemPromptFile)) {
    claudeArgs.push(`--system-prompt-file '${opts.systemPromptFile}'`);
  }

  // Browser env from shared config
  const { getBrowserEnv } = require('./browserEnv');
  const spaceDir = opts.spaceDir || cwd;
  const browserEnv = getBrowserEnv(opts.browserSession || name, spaceDir);
  const browserExports = Object.entries(browserEnv).map(([k, v]) => `export ${k}="${v}"`).join('\n');

  const script = `#!/bin/bash
cd "${cwd}"
export CLAUDE_CONFIG_DIR="${claudeConfigDir}"
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
export CLAUDE_CODE_SYNC_PLUGIN_INSTALL=1
export ENABLE_CLAUDEAI_MCP_SERVERS=0
${browserExports}
exec claude ${claudeArgs.join(' ')}
`;

  fs.writeFileSync(scriptPath, script, { mode: 0o755 });
  return scriptPath;
}

/**
 * Ensure the inbox file exists for an agent in a team.
 */
function ensureInbox(claudeConfigDir, teamName, agentName) {
  const inboxDir = path.join(claudeConfigDir, 'teams', teamName, 'inboxes');
  fs.mkdirSync(inboxDir, { recursive: true });
  const inboxPath = path.join(inboxDir, `${agentName}.json`);
  if (!fs.existsSync(inboxPath)) {
    fs.writeFileSync(inboxPath, '[]', 'utf-8');
  }
}

/**
 * Ensure team config.json exists so Claude Code's isTeamLead() returns true.
 */
function ensureTeamConfig(claudeConfigDir, teamName) {
  const teamDir = path.join(claudeConfigDir, 'teams', teamName);
  fs.mkdirSync(teamDir, { recursive: true });
  const configPath = path.join(teamDir, 'config.json');
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify({
      name: teamName,
      description: `Space orchestrator team for ${teamName}`,
      createdAt: Date.now(),
      leadAgentId: 'team-lead',
      members: [],
    }, null, 2), 'utf-8');
  }
}

/**
 * Check if a tmux session exists.
 */
function tmuxSessionExists(name) {
  try {
    execSync(`tmux has-session -t ${name} 2>/dev/null`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a tmux window exists in a session.
 */
function tmuxWindowExists(session, windowName) {
  try {
    const output = execSync(`tmux list-windows -t ${session} -F "#{window_name}" 2>/dev/null`, { encoding: 'utf-8' });
    return output.split('\n').map(s => s.trim()).includes(windowName);
  } catch {
    return false;
  }
}

/**
 * Launch a space in a tmux window.
 * Creates the window, writes the launch script, and starts Claude.
 *
 * @param {object} space - Space config from space.json
 * @param {string} model - Claude model to use
 * @param {string} tmuxSession - tmux session name (default: 'superbot3')
 * @returns {boolean} true if launched successfully
 */
function launchSpace(space, model, tmuxSession = 'superbot3') {
  const slug = space.slug;
  const cwd = space.codeDir || space.spaceDir;
  const claudeConfigDir = space.claudeConfigDir;

  if (!tmuxSessionExists(tmuxSession)) {
    console.log(`  tmux session "${tmuxSession}" not running — cannot launch space`);
    return false;
  }

  if (tmuxWindowExists(tmuxSession, slug)) {
    console.log(`  Space "${slug}" already has a tmux window`);
    return false;
  }

  // Write team config matching TeamCreate's exact format
  const teamDir = path.join(claudeConfigDir, 'teams', slug);
  fs.mkdirSync(teamDir, { recursive: true });
  const configPath = path.join(teamDir, 'config.json');
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify({
      name: slug,
      description: `Space orchestrator team for ${slug}`,
      createdAt: Date.now(),
      leadAgentId: 'team-lead',
      members: [{
        agentId: 'team-lead',
        name: 'team-lead',
        agentType: 'team-lead',
        joinedAt: Date.now(),
        tmuxPaneId: '',
        cwd: cwd,
        subscriptions: [],
      }],
    }, null, 2), 'utf-8');
  }
  ensureInbox(claudeConfigDir, slug, 'team-lead');

  const teamArgs = { agentId: 'team-lead', agentName: 'team-lead', teamName: slug };
  const systemPromptFile = path.join(space.spaceDir, 'system-prompt.md');
  const scriptPath = writeLaunchScript(slug, cwd, model, space.sessionId, claudeConfigDir, teamArgs, {
    systemPromptFile: fs.existsSync(systemPromptFile) ? systemPromptFile : null,
    spaceDir: space.spaceDir,
  });

  // Create tmux window and run the launch script
  execSync(`tmux new-window -t ${tmuxSession} -n ${slug} "bash ${scriptPath}"`);

  // Wait briefly then capture session ID and update team config
  setTimeout(() => {
    try {
      const projectsDir = path.join(claudeConfigDir, 'projects');
      if (!fs.existsSync(projectsDir)) return;
      const dirs = fs.readdirSync(projectsDir, { withFileTypes: true }).filter(d => d.isDirectory());
      let newest = null;
      let newestMtime = 0;
      for (const dir of dirs) {
        const dirPath = path.join(projectsDir, dir.name);
        const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.jsonl'));
        for (const file of files) {
          const filePath = path.join(dirPath, file);
          const stat = fs.statSync(filePath);
          if (stat.mtimeMs > newestMtime) {
            newestMtime = stat.mtimeMs;
            newest = file.replace('.jsonl', '');
          }
        }
      }
      if (newest && fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        config.leadSessionId = newest;
        // Also update tmuxPaneId for the lead
        try {
          const paneId = execSync(`tmux list-panes -t ${tmuxSession}:${slug} -F "#{pane_id}" 2>/dev/null`, { encoding: 'utf-8' }).trim();
          if (paneId && config.members?.[0]) config.members[0].tmuxPaneId = paneId;
        } catch {}
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
      }
    } catch {}
  }, 5000);

  return true;
}

module.exports = {
  writeLaunchScript,
  ensureInbox,
  ensureTeamConfig,
  tmuxSessionExists,
  tmuxWindowExists,
  launchSpace,
};
