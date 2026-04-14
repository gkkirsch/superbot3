const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { sendToPane, TMUX_SESSION, tmuxSessionExists } = require('../tmuxMessage');
const state = require('../state');

const COLORS = ['red', 'green', 'blue', 'yellow', 'cyan', 'magenta', 'orange', 'purple', 'pink', 'teal'];

module.exports = function spawnWorker(home, spaceName, name, prompt, opts = {}) {
  const space = state.getSpace(home, spaceName);
  if (!space) {
    console.error(`Error: Space "${spaceName}" not found`);
    process.exit(1);
  }

  if (!tmuxSessionExists(TMUX_SESSION)) {
    console.error(`Error: tmux session '${TMUX_SESSION}' not running`);
    process.exit(1);
  }

  // Sanitize and deduplicate name
  let sanitized = name.replace(/@/g, '-').replace(/[^a-zA-Z0-9_-]/g, '-');
  const existing = (space.workers || []).map(w => w.name);
  let final = sanitized;
  let suffix = 2;
  while (existing.includes(final)) {
    final = `${sanitized}-${suffix}`;
    suffix++;
  }

  // Resolve cwd and model
  const cwd = opts.cwd || space.codeDir || state.spaceDir(home, spaceName);
  let model = opts.model || space.model;
  if (!model) {
    try {
      const gc = JSON.parse(fs.readFileSync(path.join(home, 'config.json'), 'utf-8'));
      model = gc.model || 'claude-sonnet-4-6';
    } catch {
      model = 'claude-sonnet-4-6';
    }
  }

  // Pick color
  const workerCount = (space.workers || []).length;
  const color = opts.color || COLORS[workerCount % COLORS.length];

  // Create tmux pane — split from the space's window
  const targetWindow = `${TMUX_SESSION}:${spaceName}`;
  let paneId;
  try {
    paneId = execSync(`tmux split-window -t ${targetWindow} -v -P -F '#{pane_id}' 2>/dev/null`, { encoding: 'utf-8' }).trim();
  } catch {
    console.error('Error: Failed to create tmux pane');
    process.exit(1);
  }

  // Set pane title and border color
  try { execSync(`tmux select-pane -t ${paneId} -T "${final}" 2>/dev/null`); } catch {}
  try { execSync(`tmux set-option -p -t ${paneId} pane-border-style "fg=${color}" 2>/dev/null`); } catch {}

  // Write worker to state
  state.addWorker(home, spaceName, {
    name: final,
    model,
    paneId,
    cwd,
    color,
    prompt,
    agent: opts.agent || null,
    spawnedAt: Date.now(),
  });

  // Launch Claude in the pane
  const claudeBin = process.env.CLAUDE_CODE_TEAMMATE_COMMAND || execSync('command -v claude 2>/dev/null', { encoding: 'utf-8' }).trim();
  const configDir = state.claudeConfigDir(home, spaceName);

  const escapedCwd = cwd.replace(/'/g, "'\\''");
  const escapedClaude = claudeBin.replace(/'/g, "'\\''");
  const escapedConfig = configDir.replace(/'/g, "'\\''");
  const escapedModel = model.replace(/'/g, "'\\''");

  const cmd = `cd '${escapedCwd}' && env CLAUDE_CONFIG_DIR='${escapedConfig}' '${escapedClaude}' --dangerously-skip-permissions --model '${escapedModel}'`;
  execSync(`tmux send-keys -t ${paneId} ${JSON.stringify(cmd)} Enter`);

  // Send initial prompt after Claude starts up
  setTimeout(() => {
    try { sendToPane(paneId, prompt); } catch {}
  }, 4000);

  console.log(`paneId=${paneId}`);
  console.log(`name=${final}`);
  console.log(`color=${color}`);
  console.log(`model=${model}`);
};
