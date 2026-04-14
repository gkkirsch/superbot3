const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const lockfile = require('proper-lockfile');

const LOCK_OPTIONS = {
  retries: { retries: 10, minTimeout: 5, maxTimeout: 100 },
};

/**
 * Kill a worker: destroy its tmux pane and remove from team config.
 */
module.exports = async function killWorker(home, spaceName, workerName) {
  const spaceConfig = loadSpaceConfig(home, spaceName);
  if (!spaceConfig) return;

  const teamConfigPath = path.join(spaceConfig.claudeConfigDir, 'teams', spaceName, 'config.json');
  let teamConfig;
  try {
    teamConfig = JSON.parse(fs.readFileSync(teamConfigPath, 'utf-8'));
  } catch {
    console.error(`Error: Team config not found for space "${spaceName}"`);
    process.exit(1);
  }

  const member = (teamConfig.members || []).find(m => m.name === workerName);
  if (!member) {
    console.error(`Error: Worker "${workerName}" not found in space "${spaceName}"`);
    const names = (teamConfig.members || []).filter(m => m.name !== 'team-lead').map(m => m.name);
    if (names.length) console.error(`Available workers: ${names.join(', ')}`);
    process.exit(1);
  }

  // Kill tmux pane
  if (member.tmuxPaneId && member.tmuxPaneId !== 'pending') {
    try {
      execSync(`tmux kill-pane -t ${member.tmuxPaneId} 2>/dev/null`);
      console.log(`Killed tmux pane ${member.tmuxPaneId}`);
    } catch {
      console.log(`Pane ${member.tmuxPaneId} already dead`);
    }
  }

  // Remove from team config (locked write)
  await lockedConfigUpdate(teamConfigPath, (config) => {
    config.members = (config.members || []).filter(m => m.name !== workerName);
    return config;
  });

  console.log(`Removed "${workerName}" from team config`);

  // Optionally clean up inbox
  const inboxPath = path.join(spaceConfig.claudeConfigDir, 'teams', spaceName, 'inboxes', `${workerName}.json`);
  if (fs.existsSync(inboxPath)) {
    // Archive instead of delete — rename with timestamp
    const archivePath = inboxPath.replace('.json', `.${Date.now()}.archived.json`);
    fs.renameSync(inboxPath, archivePath);
    console.log(`Archived inbox to ${path.basename(archivePath)}`);
  }

  console.log(`Worker "${workerName}" killed.`);
};

function loadSpaceConfig(home, spaceName) {
  const configPath = path.join(home, 'spaces', spaceName, 'space.json');
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch {
    console.error(`Error: Space "${spaceName}" not found.`);
    process.exit(1);
  }
}

async function lockedConfigUpdate(configPath, updateFn) {
  const release = await lockfile.lock(configPath, {
    lockfilePath: configPath + '.lock',
    ...LOCK_OPTIONS,
  });
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const updated = updateFn(config);
    fs.writeFileSync(configPath, JSON.stringify(updated, null, 2), 'utf-8');
  } finally {
    await release();
  }
}
