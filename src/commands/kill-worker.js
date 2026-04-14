const { execSync } = require('child_process');
const state = require('../state');

module.exports = async function killWorker(home, spaceName, workerName) {
  const worker = state.getWorker(home, spaceName, workerName);
  if (!worker) {
    console.error(`Error: Worker "${workerName}" not found in space "${spaceName}"`);
    const ws = state.getWorkers(home, spaceName);
    if (ws.length) console.error(`Available workers: ${ws.map(w => w.name).join(', ')}`);
    process.exit(1);
  }

  if (worker.paneId && worker.paneId !== 'pending') {
    // Get the pane's shell PID so we can kill the entire process tree
    let panePid;
    try {
      const out = execSync(`tmux list-panes -a -F "#{pane_id} #{pane_pid}" 2>/dev/null`, { encoding: 'utf-8' });
      for (const line of out.split('\n')) {
        const [id, pid] = line.trim().split(' ');
        if (id === worker.paneId) { panePid = pid; break; }
      }
    } catch {}

    // Send /exit for graceful Claude shutdown
    try {
      execSync(`tmux send-keys -t ${worker.paneId} Escape 2>/dev/null`);
      execSync(`tmux send-keys -t ${worker.paneId} '/exit' Enter 2>/dev/null`);
    } catch {}

    // Brief wait for graceful exit
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Kill the process tree (shell + all children including claude)
    if (panePid) {
      try { execSync(`kill -TERM -- -$(ps -o pgid= -p ${panePid} | tr -d ' ') 2>/dev/null`); } catch {}
      // Fallback: kill individual processes
      try { execSync(`pkill -TERM -P ${panePid} 2>/dev/null`); } catch {}
      try { execSync(`kill -TERM ${panePid} 2>/dev/null`); } catch {}
    }

    // Kill the tmux pane
    try {
      execSync(`tmux kill-pane -t ${worker.paneId} 2>/dev/null`);
    } catch {}

    console.log(`Killed worker pane ${worker.paneId}`);
  }

  state.removeWorker(home, spaceName, workerName);
  console.log(`Worker "${workerName}" killed.`);
};
