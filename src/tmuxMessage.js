/**
 * Tmux helpers for superbot3.
 * Pure tmux operations — no state management (see state.js for that).
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TMUX_SESSION = 'superbot3';

function paneHasText(paneTarget, text) {
  // Check if the pasted text is still visible in the pane (i.e. not yet submitted)
  try {
    const output = execSync(`tmux capture-pane -t ${paneTarget} -p 2>/dev/null`, { encoding: 'utf-8' });
    // Check last few lines for a substring of the text (use first 60 chars to match)
    const needle = text.slice(0, 60);
    const lastLines = output.split('\n').slice(-5).join('\n');
    return lastLines.includes(needle);
  } catch {
    return false;
  }
}

function sendToPane(paneTarget, text) {
  const sanitized = text.replace(/\r?\n/g, ' ');
  const tmpDir = path.join(require('os').tmpdir(), 'superbot3-msg');
  fs.mkdirSync(tmpDir, { recursive: true });
  const tmpFile = path.join(tmpDir, `msg-${process.pid}-${Date.now()}.txt`);
  try {
    fs.writeFileSync(tmpFile, sanitized, 'utf-8');
    execSync(`tmux load-buffer "${tmpFile}"`);
    execSync(`tmux paste-buffer -t ${paneTarget}`);
    // Wait for paste to settle, then send Enter.
    // If text is still in the input (Enter got swallowed), retry.
    execSync('sleep 0.5');
    execSync(`tmux send-keys -t ${paneTarget} Enter`);
    for (let i = 0; i < 3; i++) {
      execSync('sleep 0.4');
      if (!paneHasText(paneTarget, sanitized)) break; // text was consumed — done
      execSync(`tmux send-keys -t ${paneTarget} Enter`);
    }
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

function isPaneAlive(paneId) {
  try {
    const output = execSync('tmux list-panes -a -F "#{pane_id}" 2>/dev/null', { encoding: 'utf-8' });
    return output.split('\n').map(s => s.trim()).includes(paneId);
  } catch {
    return false;
  }
}

function getSpacePaneTarget(slug, home) {
  // If we have a paneId in state, use it directly (targets the orchestrator pane
  // even when workers are split into the same window)
  if (home) {
    try {
      const state = require('./state');
      const space = state.getSpace(home, slug);
      if (space && space.paneId) return space.paneId;
    } catch {}
  }
  // Fallback to window target (only works when no workers are split in)
  return `${TMUX_SESSION}:${slug}`;
}

function getMasterPaneTarget() {
  return `${TMUX_SESSION}:master`;
}

function isSpaceWindowAlive(slug) {
  try {
    const output = execSync(`tmux list-windows -t ${TMUX_SESSION} -F "#{window_name}" 2>/dev/null`, { encoding: 'utf-8' });
    return output.split('\n').map(s => s.trim()).includes(slug);
  } catch {
    return false;
  }
}

function capturePaneOutput(paneTarget, lines = 50) {
  try {
    return execSync(`tmux capture-pane -t ${paneTarget} -p -S -${lines} 2>/dev/null`, { encoding: 'utf-8' });
  } catch {
    return null;
  }
}

function getPaneInfo(paneId) {
  try {
    const output = execSync(
      `tmux list-panes -a -F "#{pane_id}|#{pane_pid}|#{pane_current_command}|#{pane_title}" 2>/dev/null`,
      { encoding: 'utf-8' }
    );
    for (const line of output.split('\n')) {
      const [id, pid, cmd, title] = line.split('|');
      if (id === paneId) return { pid, command: cmd, title };
    }
    return null;
  } catch {
    return null;
  }
}

function tmuxSessionExists(name) {
  try {
    execSync(`tmux has-session -t ${name} 2>/dev/null`);
    return true;
  } catch {
    return false;
  }
}

function tmuxWindowExists(session, windowName) {
  try {
    const output = execSync(`tmux list-windows -t ${session} -F "#{window_name}" 2>/dev/null`, { encoding: 'utf-8' });
    return output.split('\n').map(s => s.trim()).includes(windowName);
  } catch {
    return false;
  }
}

module.exports = {
  sendToPane,
  isPaneAlive,
  getSpacePaneTarget,
  getMasterPaneTarget,
  isSpaceWindowAlive,
  capturePaneOutput,
  getPaneInfo,
  tmuxSessionExists,
  tmuxWindowExists,
  TMUX_SESSION,
};
