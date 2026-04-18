const fs = require('fs');
const path = require('path');
const state = require('../state');

function getSettingsPath(home, spaceName) {
  if (!state.getSpace(home, spaceName)) {
    console.error(`Error: Space "${spaceName}" not found.`);
    process.exit(1);
  }
  return path.join(state.claudeConfigDir(home, spaceName), 'settings.json');
}

function readSettings(settingsPath) {
  if (!fs.existsSync(settingsPath)) return {};
  return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
}

// Get a nested value by dot path: "permissions.allow"
function getByPath(obj, dotPath) {
  return dotPath.split('.').reduce((o, k) => (o && o[k] !== undefined) ? o[k] : undefined, obj);
}

// Set a nested value by dot path
function setByPath(obj, dotPath, value) {
  const keys = dotPath.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (current[keys[i]] === undefined || typeof current[keys[i]] !== 'object') {
      current[keys[i]] = {};
    }
    current = current[keys[i]];
  }
  current[keys[keys.length - 1]] = value;
  return obj;
}

// Delete a nested value by dot path
function deleteByPath(obj, dotPath) {
  const keys = dotPath.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!current[keys[i]]) return obj;
    current = current[keys[i]];
  }
  delete current[keys[keys.length - 1]];
  return obj;
}

function get(home, spaceName, key) {
  const settingsPath = getSettingsPath(home, spaceName);
  const settings = readSettings(settingsPath);

  if (key) {
    const val = getByPath(settings, key);
    if (val === undefined) {
      console.log('(not set)');
    } else {
      console.log(JSON.stringify(val, null, 2));
    }
  } else {
    console.log(JSON.stringify(settings, null, 2));
  }
}

function set(home, spaceName, key, value) {
  const settingsPath = getSettingsPath(home, spaceName);
  let settings = readSettings(settingsPath);

  // Try to parse as JSON (for arrays, objects, booleans, numbers)
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    parsed = value; // treat as string
  }

  settings = setByPath(settings, key, parsed);
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
  console.log(`Set ${key} = ${JSON.stringify(parsed)}`);
  console.log('  Restart the space for changes to take effect.');
}

function unset(home, spaceName, key) {
  const settingsPath = getSettingsPath(home, spaceName);
  let settings = readSettings(settingsPath);
  settings = deleteByPath(settings, key);
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
  console.log(`Removed ${key}`);
  console.log('  Restart the space for changes to take effect.');
}

// Convenience: add a permission rule
function permitAdd(home, spaceName, rule) {
  const settingsPath = getSettingsPath(home, spaceName);
  const settings = readSettings(settingsPath);
  if (!settings.permissions) settings.permissions = {};
  if (!settings.permissions.allow) settings.permissions.allow = [];
  if (settings.permissions.allow.includes(rule)) {
    console.log(`Permission already exists: ${rule}`);
    return;
  }
  settings.permissions.allow.push(rule);
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
  console.log(`Added permission: ${rule}`);
}

// Convenience: add a hook
function hookAdd(home, spaceName, event, command) {
  const settingsPath = getSettingsPath(home, spaceName);
  const settings = readSettings(settingsPath);
  if (!settings.hooks) settings.hooks = {};
  if (!settings.hooks[event]) settings.hooks[event] = [];
  settings.hooks[event].push({ type: 'command', command });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
  console.log(`Added hook: ${event} → ${command}`);
  console.log('  Restart the space for it to take effect.');
}

function hookList(home, spaceName) {
  const settingsPath = getSettingsPath(home, spaceName);
  const settings = readSettings(settingsPath);
  if (!settings.hooks || Object.keys(settings.hooks).length === 0) {
    console.log('No hooks configured.');
    return;
  }
  for (const [event, hooks] of Object.entries(settings.hooks)) {
    for (const hook of hooks) {
      console.log(`  ${event} → ${hook.command || JSON.stringify(hook)}`);
    }
  }
}

function hookRemove(home, spaceName, event, index) {
  const settingsPath = getSettingsPath(home, spaceName);
  const settings = readSettings(settingsPath);
  if (!settings.hooks?.[event]) {
    console.error(`No hooks for event "${event}".`);
    process.exit(1);
  }
  const idx = parseInt(index);
  if (isNaN(idx) || idx < 0 || idx >= settings.hooks[event].length) {
    console.error(`Invalid index. Hooks for "${event}":`);
    settings.hooks[event].forEach((h, i) => console.error(`  [${i}] ${h.command || JSON.stringify(h)}`));
    process.exit(1);
  }
  const removed = settings.hooks[event].splice(idx, 1)[0];
  if (settings.hooks[event].length === 0) delete settings.hooks[event];
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
  console.log(`Removed hook: ${event} → ${removed.command}`);
}

// MCP server management
function mcpAdd(home, spaceName, name, command, args) {
  const settingsPath = getSettingsPath(home, spaceName);
  const settings = readSettings(settingsPath);
  if (!settings.mcpServers) settings.mcpServers = {};
  settings.mcpServers[name] = { command, args: args || [] };
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
  console.log(`Added MCP server: ${name} → ${command} ${(args || []).join(' ')}`);
  console.log('  Restart the space for it to take effect.');
}

function mcpList(home, spaceName) {
  const settingsPath = getSettingsPath(home, spaceName);
  const settings = readSettings(settingsPath);
  if (!settings.mcpServers || Object.keys(settings.mcpServers).length === 0) {
    console.log('No MCP servers configured.');
    return;
  }
  for (const [name, config] of Object.entries(settings.mcpServers)) {
    console.log(`  ${name} → ${config.command} ${(config.args || []).join(' ')}`);
  }
}

function mcpRemove(home, spaceName, name) {
  const settingsPath = getSettingsPath(home, spaceName);
  const settings = readSettings(settingsPath);
  if (!settings.mcpServers?.[name]) {
    console.error(`MCP server "${name}" not found.`);
    process.exit(1);
  }
  delete settings.mcpServers[name];
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
  console.log(`Removed MCP server: ${name}`);
}

module.exports = { get, set, unset, permitAdd, hookAdd, hookList, hookRemove, mcpAdd, mcpList, mcpRemove };
