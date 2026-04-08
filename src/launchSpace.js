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
function writeLaunchScript(name, cwd, model, resumeSessionId, claudeConfigDir, teamArgs) {
  const scriptDir = path.join(require('os').homedir(), '.superbot3', '.tmp');
  fs.mkdirSync(scriptDir, { recursive: true });

  const scriptPath = path.join(scriptDir, `launch-${name}.sh`);

  const claudeArgs = ['--dangerously-skip-permissions', `--model ${model}`];
  if (resumeSessionId) {
    claudeArgs.push(`--resume ${resumeSessionId}`);
  }
  if (teamArgs) {
    claudeArgs.push(`--agent-id '${teamArgs.agentId}'`);
    claudeArgs.push(`--agent-name '${teamArgs.agentName}'`);
    claudeArgs.push(`--team-name '${teamArgs.teamName}'`);
  }

  const script = `#!/bin/bash
cd "${cwd}"
export CLAUDE_CONFIG_DIR="${claudeConfigDir}"
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
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

  // Ensure team config and inbox exist
  ensureTeamConfig(claudeConfigDir, slug);
  ensureInbox(claudeConfigDir, slug, 'team-lead');

  // Write launch script with correct agent-id (just 'team-lead', no @suffix)
  const teamArgs = { agentId: 'team-lead', agentName: 'team-lead', teamName: slug };
  const scriptPath = writeLaunchScript(slug, cwd, model, space.sessionId, claudeConfigDir, teamArgs);

  // Create tmux window and run the launch script
  execSync(`tmux new-window -t ${tmuxSession} -n ${slug} "bash ${scriptPath}"`);

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
