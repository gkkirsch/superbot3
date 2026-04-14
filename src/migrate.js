/**
 * Migrate from per-space space.json files to central state.json.
 * Runs automatically when state.json is missing but spaces/ directory has space.json files.
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
      const spaceData = {
        name: old.name || entry.name,
        slug: old.slug || entry.name,
        codeDir: old.codeDir || null,
        model: old.model || null,
        active: old.active !== false,
        archived: old.archived || false,
        created: old.created || new Date().toISOString(),
        sessionId: old.sessionId || null,
        paneId: old.paneId || null,
        color: old.color || null,
        systemPrompt: old.systemPrompt || null,
        agent: old.agent || null,
        workers: old.workers || [],
      };
      // Preserve browser config if present
      if (old.browser) spaceData.browser = old.browser;

      state.setSpace(home, spaceData.slug, spaceData);
      migrated++;

      // Rename old space.json to space.json.bak
      fs.renameSync(oldConfigPath, oldConfigPath + '.bak');
    } catch (e) {
      console.error(`  Warning: Could not migrate space "${entry.name}": ${e.message}`);
    }
  }

  if (migrated > 0) {
    console.log(`Migrated ${migrated} space(s) to state.json`);
  }
  return migrated > 0;
}

module.exports = { migrate };
