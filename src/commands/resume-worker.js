const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { sendToPane, TMUX_SESSION, isPaneAlive } = require('../tmuxMessage');
const state = require('../state');

module.exports = async function resumeWorker(home, spaceName, workerName, newPrompt) {
  const worker = state.getWorker(home, spaceName, workerName);
  if (!worker) {
    console.error(`Error: Worker "${workerName}" not found in space "${spaceName}"`);
    process.exit(1);
  }
  if (worker.status !== 'hibernated') {
    console.error(`Error: Worker "${workerName}" is not hibernated (status: ${worker.status || 'alive'})`);
    process.exit(1);
  }

  const configDir = state.claudeConfigDir(home, spaceName);
  const cwd = worker.cwd || state.spaceDir(home, spaceName);
  let model = worker.model || 'claude-sonnet-4-6';

  // Create a new tmux pane — mirror spawn-worker layout logic
  const space = state.getSpace(home, spaceName);
  const targetWindow = `${TMUX_SESSION}:${spaceName}`;

  let livePaneIds = new Set();
  try {
    const out = execSync('tmux list-panes -a -F "#{pane_id}" 2>/dev/null', { encoding: 'utf-8' });
    out.split('\n').filter(Boolean).forEach(id => livePaneIds.add(id.trim()));
  } catch {}
  const workers = state.getWorkers(home, spaceName);
  const liveWorkers = workers.filter(w => w.paneId && livePaneIds.has(w.paneId) && w.name !== workerName);

  let paneId;
  try {
    if (liveWorkers.length === 0) {
      paneId = execSync(`tmux split-window -t ${targetWindow} -v -l 40% -P -F '#{pane_id}' 2>/dev/null`, { encoding: 'utf-8' }).trim();
    } else {
      const lastWorkerPane = liveWorkers[liveWorkers.length - 1].paneId;
      paneId = execSync(`tmux split-window -t ${lastWorkerPane} -h -P -F '#{pane_id}' 2>/dev/null`, { encoding: 'utf-8' }).trim();
      try { execSync(`tmux select-layout -t ${targetWindow} tiled 2>/dev/null`); } catch {}
      try { execSync(`tmux select-layout -t ${targetWindow} main-horizontal 2>/dev/null`); } catch {}
    }
  } catch (err) {
    console.error('Error: Failed to create tmux pane');
    process.exit(1);
  }

  // Set pane title and color
  try { execSync(`tmux select-pane -t ${paneId} -T "${workerName}" 2>/dev/null`); } catch {}
  if (worker.color) {
    try { execSync(`tmux set-option -p -t ${paneId} pane-border-style "fg=${worker.color}" 2>/dev/null`); } catch {}
  }
  try { execSync(`tmux set-option -w -t ${targetWindow} pane-border-status top 2>/dev/null`); } catch {}
  try { execSync(`tmux set-option -w -t ${targetWindow} pane-border-format " #{pane_title} " 2>/dev/null`); } catch {}

  // Build launch command
  const claudeBin = process.env.CLAUDE_CODE_TEAMMATE_COMMAND || execSync('command -v claude 2>/dev/null', { encoding: 'utf-8' }).trim();

  const escapedCwd = cwd.replace(/'/g, "'\\''");
  const escapedClaude = claudeBin.replace(/'/g, "'\\''");
  const escapedConfig = configDir.replace(/'/g, "'\\''");
  const escapedModel = model.replace(/'/g, "'\\''");

  let cmd = `cd '${escapedCwd}' && env CLAUDE_CONFIG_DIR='${escapedConfig}' '${escapedClaude}' --dangerously-skip-permissions`;

  // Use --resume if we have a session ID
  if (worker.sessionId) {
    const escapedSession = worker.sessionId.replace(/'/g, "'\\''");
    cmd += ` --resume '${escapedSession}'`;
  }

  // Add agent or model flag
  const agentType = worker.agent;
  if (agentType && agentType !== 'space-worker') {
    const agentDef = path.join(configDir, 'agents', `${agentType}.md`);
    if (fs.existsSync(agentDef)) {
      cmd += ` --agent '${agentType.replace(/'/g, "'\\''")}'`;
    } else {
      cmd += ` --model '${escapedModel}'`;
    }
  } else {
    cmd += ` --model '${escapedModel}'`;
  }

  execSync(`tmux send-keys -t ${paneId} ${JSON.stringify(cmd)} Enter`);

  // If there's a new prompt, send it after Claude starts
  if (newPrompt) {
    await new Promise(resolve => setTimeout(resolve, 4000));
    try { sendToPane(paneId, newPrompt); } catch {}
  }

  // Update worker in registry
  state.updateWorker(home, spaceName, workerName, {
    status: 'alive',
    isActive: true,
    paneId,
    resumedAt: Date.now(),
  });

  console.log(`Worker "${workerName}" resumed.`);
  console.log(`  Pane: ${paneId}`);
  if (worker.sessionId) console.log(`  Session: ${worker.sessionId}`);
};
