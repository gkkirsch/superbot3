/**
 * Shared space launch logic — used by both `space create` and `start`.
 * Handles writing the launch script and spawning the tmux window.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Write a launcher script that starts Claude in interactive mode.
 * Sets CLAUDE_CONFIG_DIR for full isolation.
 */
function writeLaunchScript(name, cwd, model, resumeSessionId, claudeConfigDir, opts = {}) {
  const scriptDir = path.join(require('os').homedir(), '.superbot3', '.tmp');
  fs.mkdirSync(scriptDir, { recursive: true });

  const scriptPath = path.join(scriptDir, `launch-${name}.sh`);

  const claudeArgs = ['--dangerously-skip-permissions', `--model ${model}`];
  // Resume previous session if available
  if (resumeSessionId) claudeArgs.push(`--resume '${resumeSessionId}'`);
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
${browserExports}
exec claude ${claudeArgs.join(' ')}
`;

  fs.writeFileSync(scriptPath, script, { mode: 0o755 });
  return scriptPath;
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

  const systemPromptFile = path.join(space.spaceDir, 'system-prompt.md');
  const scriptPath = writeLaunchScript(slug, cwd, model, space.sessionId, claudeConfigDir, {
    systemPromptFile: fs.existsSync(systemPromptFile) ? systemPromptFile : null,
    spaceDir: space.spaceDir,
  });

  // Create tmux window and run the launch script
  execSync(`tmux new-window -t ${tmuxSession} -n ${slug} "bash ${scriptPath}"`);

  return true;
}

module.exports = {
  writeLaunchScript,
  tmuxSessionExists,
  tmuxWindowExists,
  launchSpace,
};
