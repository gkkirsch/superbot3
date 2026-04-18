/**
 * Migration utilities for superbot3 state management.
 *
 * - migrate(): handles legacy per-space → central state.json migration
 * - generateMissingSpaceJsons(): creates space.json for spaces that only exist in state.json
 */
const fs = require('fs');
const path = require('path');
const state = require('./state');

function migrate(home) {
  const stateFile = path.join(home, 'state.json');
  if (fs.existsSync(stateFile)) return false; // already migrated

  const spacesDir = path.join(home, 'spaces');
  if (!fs.existsSync(spacesDir)) return false;

  const entries = fs.readdirSync(spacesDir, { withFileTypes: true });
  let migrated = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const oldConfigPath = path.join(spacesDir, entry.name, 'space.json');
    if (!fs.existsSync(oldConfigPath)) continue;

    try {
      const old = JSON.parse(fs.readFileSync(oldConfigPath, 'utf-8'));

      // Write config fields to space.json (keep the file, don't rename)
      const configData = {
        name: old.name || entry.name,
        slug: old.slug || entry.name,
        codeDir: old.codeDir || null,
        model: old.model || null,
        active: old.active !== false,
        archived: old.archived || false,
        created: old.created || new Date().toISOString(),
        color: old.color || null,
        systemPrompt: old.systemPrompt || null,
        agent: old.agent || null,
      };
      fs.writeFileSync(oldConfigPath, JSON.stringify(configData, null, 2), 'utf-8');

      // Write runtime fields to state.json
      const runtimeData = {
        sessionId: old.sessionId || null,
        paneId: old.paneId || null,
        workers: old.workers || [],
        lastStopped: old.lastStopped || null,
      };
      state.updateState(home, st => {
        if (!st.spaces) st.spaces = {};
        st.spaces[configData.slug] = runtimeData;
      });

      migrated++;
    } catch (e) {
      console.error(`  Warning: Could not migrate space "${entry.name}": ${e.message}`);
    }
  }

  if (migrated > 0) {
    console.log(`Migrated ${migrated} space(s) — split into space.json + state.json`);
  }
  return migrated > 0;
}

function generateMissingSpaceJsons(home) {
  const st = state.readState(home);
  for (const [slug, data] of Object.entries(st.spaces || {})) {
    const sjPath = path.join(home, 'spaces', slug, 'space.json');
    if (fs.existsSync(sjPath)) continue;
    if (!fs.existsSync(path.join(home, 'spaces', slug))) continue;

    const config = {
      name: data.name || slug,
      slug: data.slug || slug,
      codeDir: data.codeDir || null,
      model: data.model || null,
      active: data.active !== false,
      archived: data.archived || false,
      created: data.created || new Date().toISOString(),
      color: data.color || null,
      systemPrompt: data.systemPrompt || null,
      agent: data.agent || null,
    };
    fs.writeFileSync(sjPath, JSON.stringify(config, null, 2), 'utf-8');
    console.log('  Generated space.json for ' + slug);
  }
}

module.exports = { migrate, generateMissingSpaceJsons };
