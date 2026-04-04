const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { writeToInbox, getSpaceInboxPath, getMasterInboxPath } = require('../inbox');

function isSpaceRunningInTmux(slug) {
  try {
    const output = execSync(`tmux list-windows -t superbot3 -F "#{window_name}" 2>/dev/null`, { encoding: 'utf-8' });
    return output.split('\n').map(s => s.trim()).includes(slug);
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

    // If the space is running in tmux, send via tmux send-keys (direct input)
    if (isSpaceRunningInTmux(spaceName)) {
      try {
        // Escape single quotes in the message for tmux
        const escaped = text.replace(/'/g, "'\\''");
        execSync(`tmux send-keys -t superbot3:${spaceName} -l '${escaped}'`);
        execSync(`tmux send-keys -t superbot3:${spaceName} Enter`);
        console.log(`Message sent to space "${spaceName}" (via tmux)`);
        return;
      } catch (err) {
        console.log(`  tmux send failed, falling back to inbox: ${err.message}`);
      }
    }

    // Fallback: write to inbox file
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const inboxPath = getSpaceInboxPath(config.claudeConfigDir, config.slug);
    try {
      await writeToInbox(inboxPath, {
        from: 'superbot3-cli',
        text: text,
        summary: text.slice(0, 80),
      });
      console.log(`Message sent to space "${spaceName}" (via inbox)`);
      console.log(`  Inbox: ${inboxPath}`);
    } catch (err) {
      console.error(`Error sending message: ${err.message}`);
      process.exit(1);
    }
  } else {
    // Message to master orchestrator
    if (isSpaceRunningInTmux('master')) {
      try {
        const escaped = text.replace(/'/g, "'\\''");
        execSync(`tmux send-keys -t superbot3:master -l '${escaped}'`);
        execSync(`tmux send-keys -t superbot3:master Enter`);
        console.log('Message sent to master orchestrator (via tmux)');
        return;
      } catch (err) {
        console.log(`  tmux send failed, falling back to inbox: ${err.message}`);
      }
    }

    const inboxPath = getMasterInboxPath(home);
    try {
      await writeToInbox(inboxPath, {
        from: 'superbot3-cli',
        text: text,
        summary: text.slice(0, 80),
      });
      console.log('Message sent to master orchestrator (via inbox)');
      console.log(`  Inbox: ${inboxPath}`);
    } catch (err) {
      console.error(`Error sending message: ${err.message}`);
      process.exit(1);
    }
  }
};
