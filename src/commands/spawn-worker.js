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

  // Create tmux pane with smart layout:
  //   First worker  → split space window vertically (space top, worker bottom)
  //   More workers  → split an existing worker pane horizontally (workers side by side at bottom)
  const targetWindow = `${TMUX_SESSION}:${spaceName}`;
  // Find which existing workers still have live panes
  let livePaneIds = new Set();
  try {
    const out = execSync('tmux list-panes -a -F "#{pane_id}" 2>/dev/null', { encoding: 'utf-8' });
    out.split('\n').filter(Boolean).forEach(id => livePaneIds.add(id.trim()));
  } catch {}
  const liveWorkers = (space.workers || []).filter(w => w.paneId && livePaneIds.has(w.paneId));

  let paneId;
  try {
    if (liveWorkers.length === 0) {
      // First worker: split the space window vertically — space stays on top (60/40)
      paneId = execSync(`tmux split-window -t ${targetWindow} -v -l 40% -P -F '#{pane_id}' 2>/dev/null`, { encoding: 'utf-8' }).trim();
    } else {
      // Additional workers: split the last worker pane horizontally — workers sit side by side
      const lastWorkerPane = liveWorkers[liveWorkers.length - 1].paneId;
      paneId = execSync(`tmux split-window -t ${lastWorkerPane} -h -P -F '#{pane_id}' 2>/dev/null`, { encoding: 'utf-8' }).trim();
      // Rebalance bottom panes so workers share space evenly
      try { execSync(`tmux select-layout -t ${targetWindow} tiled 2>/dev/null`); } catch {}
      // Re-apply: space on top (main-horizontal gives top pane the majority)
      try { execSync(`tmux select-layout -t ${targetWindow} main-horizontal 2>/dev/null`); } catch {}
    }
  } catch {
    console.error('Error: Failed to create tmux pane');
    process.exit(1);
  }

  // Set pane title, border color, and give space pane a distinct color too
  try { execSync(`tmux select-pane -t ${paneId} -T "${final}" 2>/dev/null`); } catch {}
  try { execSync(`tmux set-option -p -t ${paneId} pane-border-style "fg=${color}" 2>/dev/null`); } catch {}
  // Color the space pane border with the space's color
  if (space.paneId) {
    try { execSync(`tmux set-option -p -t ${space.paneId} pane-border-style "fg=${space.color || 'white'}" 2>/dev/null`); } catch {}
  }
  // Enable pane border titles so you can see which pane is which
  try { execSync(`tmux set-option -w -t ${targetWindow} pane-border-status top 2>/dev/null`); } catch {}
  try { execSync(`tmux set-option -w -t ${targetWindow} pane-border-format " #{pane_title} " 2>/dev/null`); } catch {}

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
