const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { writeToInbox, getSpaceInboxPath, getMasterInboxPath } = require('../inbox');

/**
 * Deliver a message via tmux send-keys (used when inbox polling isn't active yet).
 * Returns true if successful, false otherwise.
 */
function deliverViaTmux(tmuxSession, windowName, text) {
  const escaped = text.replace(/'/g, "'\\''");
  try {
    execSync(`tmux send-keys -t ${tmuxSession}:${windowName} '${escaped}' Enter`, { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

module.exports = async function message(home, spaceName, text) {
  if (!text) {
    console.error('Error: Message text is required');
    process.exit(1);
  }

  if (spaceName) {
    // Message to a specific space
    const spaceDir = path.join(home, 'spaces', spaceName);
    const configPath = path.join(spaceDir, 'space.json');

    if (!fs.existsSync(configPath)) {
      console.error(`Error: Space "${spaceName}" not found.`);
      console.error(`Available spaces:`);
      const spacesDir = path.join(home, 'spaces');
      if (fs.existsSync(spacesDir)) {
        const entries = fs.readdirSync(spacesDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && fs.existsSync(path.join(spacesDir, entry.name, 'space.json'))) {
            console.error(`  - ${entry.name}`);
          }
        }
      }
      process.exit(1);
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const teamConfigPath = path.join(config.claudeConfigDir, 'teams', config.slug, 'config.json');

    if (fs.existsSync(teamConfigPath)) {
      // Normal path: inbox polling is active
      const inboxPath = getSpaceInboxPath(config.claudeConfigDir, config.slug);
      try {
        await writeToInbox(inboxPath, { from: 'user', text, summary: text.slice(0, 80) });
        console.log(`Message sent to space "${spaceName}" (via inbox)`);
      } catch (err) {
        console.error(`Error sending message: ${err.message}`);
        process.exit(1);
      }
    } else {
      // Bootstrap: TeamCreate hasn't run yet, deliver via tmux
      console.log(`No team config for "${spaceName}" — delivering via tmux send-keys`);
      if (deliverViaTmux('superbot3', config.slug, text)) {
        console.log(`Message delivered to space "${spaceName}" (via tmux)`);
      } else {
        // Fall back to inbox — message will be picked up when TeamCreate eventually runs
        const inboxPath = getSpaceInboxPath(config.claudeConfigDir, config.slug);
        await writeToInbox(inboxPath, { from: 'user', text, summary: text.slice(0, 80) });
        console.log(`Message queued for space "${spaceName}" (via inbox — will deliver after TeamCreate runs)`);
      }
    }
  } else {
    // Message to master orchestrator
    const masterConfigPath = path.join(home, 'orchestrator', '.claude', 'teams', 'superbot3', 'config.json');

    if (fs.existsSync(masterConfigPath)) {
      const inboxPath = getMasterInboxPath(home);
      try {
        await writeToInbox(inboxPath, { from: 'user', text, summary: text.slice(0, 80) });
        console.log('Message sent to master orchestrator (via inbox)');
      } catch (err) {
        console.error(`Error sending message: ${err.message}`);
        process.exit(1);
      }
    } else {
      console.log('No team config for master — delivering via tmux send-keys');
      if (deliverViaTmux('superbot3', 'master', text)) {
        console.log('Message delivered to master orchestrator (via tmux)');
      } else {
        const inboxPath = getMasterInboxPath(home);
        await writeToInbox(inboxPath, { from: 'user', text, summary: text.slice(0, 80) });
        console.log('Message queued for master orchestrator (via inbox)');
      }
    }
  }
};
