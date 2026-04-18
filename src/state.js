/**
 * Central state management for superbot3.
 *
 * Split architecture:
 *   - space.json (per-space): identity & config (name, slug, codeDir, model, color, etc.)
 *   - state.json (central): runtime process table (paneId, sessionId, workers, lastStopped)
 *
 * Uses mkdir-based locking for safe concurrent writes to state.json.
 */
const fs = require('fs');
const path = require('path');

const LOCK_TIMEOUT = 5000; // ms
const LOCK_POLL = 50; // ms

const CONFIG_FIELDS = ['name', 'slug', 'codeDir', 'model', 'color', 'active', 'archived', 'created', 'systemPrompt', 'agent'];
const RUNTIME_FIELDS = ['paneId', 'sessionId', 'workers', 'lastStopped'];

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
      fs.writeFileSync(path.join(lp, 'pid'), String(process.pid));
      return;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try {
        const pid = parseInt(fs.readFileSync(path.join(lp, 'pid'), 'utf-8'));
        try { process.kill(pid, 0); } catch {
          fs.rmSync(lp, { recursive: true, force: true });
          continue;
        }
      } catch {}
      if (Date.now() - start > LOCK_TIMEOUT) {
        throw new Error('Timeout acquiring state lock');
      }
      const end = Date.now() + LOCK_POLL;
      while (Date.now() < end) {} // spin
    }
  }
}

function releaseLock(home) {
  try { fs.rmSync(lockPath(home), { recursive: true, force: true }); } catch {}
}

// ── Read/Write (state.json — runtime) ───────────────────────────────────────

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

// ── Space config (space.json — per-space) ───────────────────────────────────

function spaceJsonPath(home, slug) {
  return path.join(home, 'spaces', slug, 'space.json');
}

function getSpaceConfig(home, slug) {
  try {
    return JSON.parse(fs.readFileSync(spaceJsonPath(home, slug), 'utf-8'));
  } catch {
    return null;
  }
}

function updateSpaceConfig(home, slug, updates) {
  const p = spaceJsonPath(home, slug);
  let config;
  try {
    config = JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    config = {};
  }
  Object.assign(config, updates);
  fs.writeFileSync(p, JSON.stringify(config, null, 2), 'utf-8');
}

function getAllSpaceConfigs(home) {
  const spacesDir = path.join(home, 'spaces');
  try {
    const entries = fs.readdirSync(spacesDir, { withFileTypes: true });
    const configs = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const config = getSpaceConfig(home, entry.name);
      if (config) configs.push(config);
    }
    return configs;
  } catch {
    return [];
  }
}

// ── Merged views ────────────────────────────────────────────────────────────

function getFullSpace(home, slug) {
  const config = getSpaceConfig(home, slug);
  if (!config) return null;
  const st = readState(home);
  const runtime = st.spaces[slug] || {};
  return { ...config, ...runtime };
}

function getSpace(home, slug) {
  const st = readState(home);
  return st.spaces[slug] || null;
}

function getAllSpaces(home) {
  const configs = getAllSpaceConfigs(home);
  const st = readState(home);
  return configs.map(config => {
    const runtime = st.spaces[config.slug] || {};
    return { ...config, ...runtime };
  });
}

function setSpace(home, slug, spaceData) {
  const configData = {};
  const runtimeData = {};
  for (const [key, value] of Object.entries(spaceData)) {
    if (CONFIG_FIELDS.includes(key)) {
      configData[key] = value;
    } else {
      runtimeData[key] = value;
    }
  }
  if (Object.keys(configData).length > 0) {
    const p = spaceJsonPath(home, slug);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(configData, null, 2), 'utf-8');
  }
  updateState(home, state => {
    state.spaces[slug] = runtimeData;
  });
}

function removeSpace(home, slug) {
  // Remove from state.json
  updateState(home, state => {
    delete state.spaces[slug];
  });
  // Remove space.json
  try { fs.unlinkSync(spaceJsonPath(home, slug)); } catch {}
}

function updateSpace(home, slug, updates) {
  const configUpdates = {};
  const runtimeUpdates = {};
  for (const [key, value] of Object.entries(updates)) {
    if (CONFIG_FIELDS.includes(key)) {
      configUpdates[key] = value;
    } else {
      runtimeUpdates[key] = value;
    }
  }
  if (Object.keys(configUpdates).length > 0) {
    updateSpaceConfig(home, slug, configUpdates);
  }
  if (Object.keys(runtimeUpdates).length > 0) {
    updateState(home, state => {
      if (!state.spaces[slug]) state.spaces[slug] = {};
      Object.assign(state.spaces[slug], runtimeUpdates);
    });
  }
}

// ── Worker helpers ───────────────────────────────────────────────────────────

function getWorkers(home, slug) {
  const runtime = getSpace(home, slug);
  return (runtime && runtime.workers) || [];
}

function getWorker(home, slug, workerName) {
  const workers = getWorkers(home, slug);
  return workers.find(w => w.name === workerName) || null;
}

function addWorker(home, slug, worker) {
  updateState(home, state => {
    if (!state.spaces[slug]) state.spaces[slug] = {};
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
  getSpaceConfig,
  updateSpaceConfig,
  getAllSpaceConfigs,
  getFullSpace,
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
