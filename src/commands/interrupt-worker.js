const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { writeToInbox } = require('../inbox');

/**
 * Interrupt a worker by sending Escape to its tmux pane.
 * This cancels Claude's current generation. Optionally follow up with a new message.
 */
module.exports = async function interruptWorker(home, spaceName, workerName, opts = {}) {
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
    process.exit(1);
  }

  if (!member.tmuxPaneId || member.tmuxPaneId === 'pending') {
    console.error(`Error: Worker "${workerName}" has no active tmux pane`);
    process.exit(1);
  }

  // Check pane is alive
  try {
    execSync(`tmux has-session -t ${member.tmuxPaneId} 2>/dev/null`);
  } catch {
    console.error(`Error: Pane ${member.tmuxPaneId} is not alive`);
    process.exit(1);
  }

  // Send Escape to cancel current generation
  execSync(`tmux send-keys -t ${member.tmuxPaneId} Escape`);
  console.log(`Sent interrupt (Escape) to "${workerName}" (pane ${member.tmuxPaneId})`);

  // If a follow-up message was provided, wait briefly then send it via inbox
  if (opts.message) {
    // Give Claude a moment to process the cancel
    await new Promise(resolve => setTimeout(resolve, 1000));

    const inboxPath = path.join(spaceConfig.claudeConfigDir, 'teams', spaceName, 'inboxes', `${workerName}.json`);
    await writeToInbox(inboxPath, {
      from: 'team-lead',
      text: opts.message,
      color: 'blue',
      summary: opts.message.slice(0, 80),
    });
    console.log(`Follow-up message sent to "${workerName}"`);
  }
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
