/**
 * Central state management for superbot3.
 *
 * All space and worker metadata lives in ~/.superbot3/state.json.
 * Uses mkdir-based locking for safe concurrent writes.
 */
const fs = require('fs');
const path = require('path');

const LOCK_TIMEOUT = 5000; // ms
const LOCK_POLL = 50; // ms

function statePath(home) {
  return path.join(home, 'state.json');
}

function lockPath(home) {
  return path.join(home, '.state.lock');
}

// ── Locking ──────────────────────────────────────────────────────────────────

function acquireLock(home) {
  const lp = lockPath(home);
  const start = Date.now();
  while (true) {
    try {
      fs.mkdirSync(lp);
      // Write our PID for stale detection
      fs.writeFileSync(path.join(lp, 'pid'), String(process.pid));
      return;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      // Check for stale lock
      try {
        const pid = parseInt(fs.readFileSync(path.join(lp, 'pid'), 'utf-8'));
        try { process.kill(pid, 0); } catch {
          // Process is dead — steal the lock
          fs.rmSync(lp, { recursive: true, force: true });
          continue;
        }
      } catch {}
      if (Date.now() - start > LOCK_TIMEOUT) {
        throw new Error('Timeout acquiring state lock');
      }
      // Busy wait
      const end = Date.now() + LOCK_POLL;
      while (Date.now() < end) {} // spin
    }
  }
}

function releaseLock(home) {
  try { fs.rmSync(lockPath(home), { recursive: true, force: true }); } catch {}
}

// ── Read/Write ───────────────────────────────────────────────────────────────

function readState(home) {
  try {
    return JSON.parse(fs.readFileSync(statePath(home), 'utf-8'));
  } catch {
    return { spaces: {} };
  }
}

function writeState(home, state) {
  fs.writeFileSync(statePath(home), JSON.stringify(state, null, 2), 'utf-8');
}

/**
 * Atomically update state: acquires lock, reads, calls fn(state), writes, releases.
 */
function updateState(home, fn) {
  acquireLock(home);
  try {
    const state = readState(home);
    fn(state);
    writeState(home, state);
    return state;
  } finally {
    releaseLock(home);
  }
}

// ── Space helpers ────────────────────────────────────────────────────────────

function getSpace(home, slug) {
  const state = readState(home);
  return state.spaces[slug] || null;
}

function getAllSpaces(home) {
  const state = readState(home);
  return Object.values(state.spaces);
}

function setSpace(home, slug, spaceData) {
  updateState(home, state => {
    state.spaces[slug] = spaceData;
  });
}

function removeSpace(home, slug) {
  updateState(home, state => {
    delete state.spaces[slug];
  });
}

function updateSpace(home, slug, updates) {
  updateState(home, state => {
    if (!state.spaces[slug]) return;
    Object.assign(state.spaces[slug], updates);
  });
}

// ── Worker helpers ───────────────────────────────────────────────────────────

function getWorkers(home, slug) {
  const space = getSpace(home, slug);
  return (space && space.workers) || [];
}

function getWorker(home, slug, workerName) {
  const workers = getWorkers(home, slug);
  return workers.find(w => w.name === workerName) || null;
}

function addWorker(home, slug, worker) {
  updateState(home, state => {
    if (!state.spaces[slug]) throw new Error(`Space "${slug}" not found`);
    if (!state.spaces[slug].workers) state.spaces[slug].workers = [];
    state.spaces[slug].workers.push(worker);
  });
}

function removeWorker(home, slug, workerName) {
  updateState(home, state => {
    if (!state.spaces[slug]) return;
    state.spaces[slug].workers = (state.spaces[slug].workers || []).filter(w => w.name !== workerName);
  });
}

function updateWorker(home, slug, workerName, updates) {
  updateState(home, state => {
    if (!state.spaces[slug]) return;
    const worker = (state.spaces[slug].workers || []).find(w => w.name === workerName);
    if (worker) Object.assign(worker, updates);
  });
}

// ── Path helpers (computed, never stored) ────────────────────────────────────

function spaceDir(home, slug) {
  return path.join(home, 'spaces', slug);
}

function claudeConfigDir(home, slug) {
  return path.join(home, 'spaces', slug, '.claude');
}

module.exports = {
  readState,
  writeState,
  updateState,
  getSpace,
  getAllSpaces,
  setSpace,
  removeSpace,
  updateSpace,
  getWorkers,
  getWorker,
  addWorker,
  removeWorker,
  updateWorker,
  spaceDir,
  claudeConfigDir,
};
