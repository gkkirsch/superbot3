const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TMUX_SESSION = 'superbot3';

/**
 * Send text to a tmux pane via send-keys.
 * Handles escaping of special characters for safe delivery.
 *
 * @param {string} paneTarget - tmux pane target (pane ID like %5, or session:window)
 * @param {string} text - message text to send
 */
function sendToPane(paneTarget, text) {
  // Use tmux's load-buffer + paste-buffer to inject text without shell escaping issues.
  // Newlines must be collapsed to spaces because Claude Code's input treats each newline
  // as a submission (Enter), which would split a multi-line message into separate turns.
  const sanitized = text.replace(/\r?\n/g, ' ');

  const tmpDir = path.join(require('os').tmpdir(), 'superbot3-msg');
  fs.mkdirSync(tmpDir, { recursive: true });
  const tmpFile = path.join(tmpDir, `msg-${process.pid}-${Date.now()}.txt`);

  try {
    fs.writeFileSync(tmpFile, sanitized, 'utf-8');
    execSync(`tmux load-buffer "${tmpFile}"`);
    execSync(`tmux paste-buffer -t ${paneTarget}`);
    execSync(`tmux send-keys -t ${paneTarget} Enter`);
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

/**
 * Check if a tmux pane is alive.
 */
function isPaneAlive(paneId) {
  try {
    const output = execSync('tmux list-panes -a -F "#{pane_id}" 2>/dev/null', { encoding: 'utf-8' });
    return output.split('\n').map(s => s.trim()).includes(paneId);
  } catch {
    return false;
  }
}

/**
 * Get the tmux pane target for a space (its tmux window in the superbot3 session).
 * Spaces run in windows named after their slug.
 *
 * @param {string} spaceSlug - space slug name
 * @returns {string} tmux target like "superbot3:myspace"
 */
function getSpacePaneTarget(spaceSlug) {
  return `${TMUX_SESSION}:${spaceSlug}`;
}

/**
 * Get the tmux pane target for the master orchestrator.
 */
function getMasterPaneTarget() {
  return `${TMUX_SESSION}:master`;
}

/**
 * Check if a space's tmux window exists.
 */
function isSpaceWindowAlive(spaceSlug) {
  try {
    const output = execSync(`tmux list-windows -t ${TMUX_SESSION} -F "#{window_name}" 2>/dev/null`, { encoding: 'utf-8' });
    return output.split('\n').map(s => s.trim()).includes(spaceSlug);
  } catch {
    return false;
  }
}

/**
 * Get the pane ID for a worker from the worker registry.
 *
 * @param {string} home - SUPERBOT3_HOME path
 * @param {string} spaceName - space slug
 * @param {string} workerName - worker name
 * @returns {{ paneId: string, worker: object } | null}
 */
function getWorkerPane(home, spaceName, workerName) {
  const registryPath = path.join(home, 'spaces', spaceName, 'workers.json');
  try {
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
    const worker = (registry.workers || []).find(w => w.name === workerName);
    if (worker && worker.paneId) {
      return { paneId: worker.paneId, worker };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Read the worker registry for a space.
 */
function readWorkerRegistry(home, spaceName) {
  const registryPath = path.join(home, 'spaces', spaceName, 'workers.json');
  try {
    return JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
  } catch {
    return { workers: [] };
  }
}

/**
 * Write the worker registry for a space.
 */
function writeWorkerRegistry(home, spaceName, registry) {
  const registryPath = path.join(home, 'spaces', spaceName, 'workers.json');
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2), 'utf-8');
}

module.exports = {
  sendToPane,
  isPaneAlive,
  getSpacePaneTarget,
  getMasterPaneTarget,
  isSpaceWindowAlive,
  getWorkerPane,
  readWorkerRegistry,
  writeWorkerRegistry,
  TMUX_SESSION,
};
