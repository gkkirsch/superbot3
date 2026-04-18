const { execSync } = require('child_process');
const state = require('../state');
const { capturePaneOutput } = require('../tmuxMessage');
const fs = require('fs');
const path = require('path');

module.exports = async function hibernateWorker(home, spaceName, workerName) {
  const worker = state.getWorker(home, spaceName, workerName);
  if (!worker) {
    console.error(`Error: Worker "${workerName}" not found in space "${spaceName}"`);
    process.exit(1);
  }
  if (worker.status === 'hibernated') {
    console.log(`Worker "${workerName}" is already hibernated.`);
    return;
  }

  // Capture summary from pane output (last 100 lines)
  let summary = '';
  if (worker.paneId) {
    const output = capturePaneOutput(worker.paneId, 100);
    if (output) {
      const lines = output.split('\n').filter(l => l.trim()).slice(-20);
      summary = lines.join('\n');
    }
  }

  // Find session ID — look for newest session in the space's config dir
  const configDir = state.claudeConfigDir(home, spaceName);
  let sessionId = null;
  try {
    const projectsDir = path.join(configDir, 'projects');
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
    sessionId = newest;
  } catch {}

  // Gracefully exit and kill the pane
  if (worker.paneId) {
    try {
      execSync(`tmux send-keys -t ${worker.paneId} Escape 2>/dev/null`);
      execSync(`tmux send-keys -t ${worker.paneId} '/exit' Enter 2>/dev/null`);
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 1500));
    try {
      execSync(`tmux kill-pane -t ${worker.paneId} 2>/dev/null`);
    } catch {}
  }

  // Update worker in registry
  state.updateWorker(home, spaceName, workerName, {
    status: 'hibernated',
    isActive: false,
    sessionId,
    summary,
    hibernatedAt: Date.now(),
    paneId: null,
  });

  console.log(`Worker "${workerName}" hibernated.`);
  if (sessionId) console.log(`  Session: ${sessionId}`);
  console.log(`  Summary: ${summary.slice(0, 100)}...`);
};
