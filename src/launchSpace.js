const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { tmuxSessionExists, tmuxWindowExists } = require('./tmuxMessage');
const state = require('./state');

function writeLaunchScript(name, cwd, model, resumeSessionId, claudeConfigDir, opts = {}) {
  const scriptDir = path.join(require('os').homedir(), '.superbot3', '.tmp');
  fs.mkdirSync(scriptDir, { recursive: true });
  const scriptPath = path.join(scriptDir, `launch-${name}.sh`);

  const claudeArgs = ['--dangerously-skip-permissions', `--model ${model}`];
  if (resumeSessionId) claudeArgs.push(`--resume '${resumeSessionId}'`);
  if (opts.systemPromptFile && fs.existsSync(opts.systemPromptFile)) {
    claudeArgs.push(`--system-prompt-file '${opts.systemPromptFile}'`);
  }

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

function launchSpace(home, slug, tmuxSession = 'superbot3') {
  const space = state.getSpace(home, slug);
  if (!space) {
    console.log(`  Space "${slug}" not found in state`);
    return false;
  }

  const spaceDir = state.spaceDir(home, slug);
  const configDir = state.claudeConfigDir(home, slug);
  const cwd = space.codeDir || spaceDir;

  // Resolve model: space override > global config > default
  let model = space.model;
  if (!model) {
    try {
      const gc = JSON.parse(fs.readFileSync(path.join(home, 'config.json'), 'utf-8'));
      model = gc.model || 'claude-sonnet-4-6';
    } catch {
      model = 'claude-sonnet-4-6';
    }
  }

  if (!tmuxSessionExists(tmuxSession)) {
    console.log(`  tmux session "${tmuxSession}" not running — cannot launch space`);
    return false;
  }

  if (tmuxWindowExists(tmuxSession, slug)) {
    console.log(`  Space "${slug}" already has a tmux window`);
    return false;
  }

  const systemPromptFile = space.systemPrompt || path.join(spaceDir, 'system-prompt.md');
  const scriptPath = writeLaunchScript(slug, cwd, model, space.sessionId, configDir, {
    systemPromptFile: fs.existsSync(systemPromptFile) ? systemPromptFile : null,
    spaceDir,
  });

  execSync(`tmux new-window -t ${tmuxSession} -n ${slug} "bash ${scriptPath}"`);

  // Capture the pane ID and set the title
  try {
    const paneId = execSync(
      `tmux list-panes -t ${tmuxSession}:${slug} -F "#{pane_id}" 2>/dev/null`,
      { encoding: 'utf-8' }
    ).trim().split('\n')[0];
    if (paneId) {
      state.updateSpace(home, slug, { paneId });
      execSync(`tmux select-pane -t ${paneId} -T "${space.name || slug}" 2>/dev/null`);
      if (space.color) {
        execSync(`tmux set-option -p -t ${paneId} pane-border-style "fg=${space.color}" 2>/dev/null`);
      }
    }
  } catch {}

  return true;
}

module.exports = {
  writeLaunchScript,
  launchSpace,
};
