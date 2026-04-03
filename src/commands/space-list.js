const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function getSpaces(home) {
  const spacesDir = path.join(home, 'spaces');
  if (!fs.existsSync(spacesDir)) return [];

  const entries = fs.readdirSync(spacesDir, { withFileTypes: true });
  const spaces = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const configPath = path.join(spacesDir, entry.name, 'space.json');
      if (fs.existsSync(configPath)) {
        try {
          const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
          spaces.push(config);
        } catch (e) {
          // skip invalid
        }
      }
    }
  }
  return spaces;
}

function isSpaceRunning(slug) {
  try {
    const output = execSync(`tmux list-windows -t superbot3 -F "#{window_name}" 2>/dev/null`, { encoding: 'utf-8' });
    return output.split('\n').map(s => s.trim()).includes(slug);
  } catch {
    return false;
  }
}

module.exports = function spaceList(home) {
  const spaces = getSpaces(home);

  if (spaces.length === 0) {
    console.log('No spaces found. Create one with: superbot3 space create <name>');
    return;
  }

  console.log('');
  console.log('Spaces:');
  console.log('');
  console.log('  Name              Status    Active    Code Dir');
  console.log('  ────              ──────    ──────    ────────');

  for (const space of spaces) {
    const running = isSpaceRunning(space.slug);
    const status = running ? '● running' : '○ stopped';
    const active = space.active ? 'yes' : 'no';
    const codeDir = space.codeDir || '(none)';
    console.log(`  ${space.name.padEnd(18)}${status.padEnd(12)}${active.padEnd(10)}${codeDir}`);
  }

  console.log('');
  console.log(`Total: ${spaces.length} space(s)`);
};

module.exports.getSpaces = getSpaces;
module.exports.isSpaceRunning = isSpaceRunning;
