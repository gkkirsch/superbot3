const { isSpaceWindowAlive } = require('../tmuxMessage');
const state = require('../state');

function getSpaces(home) {
  return state.getAllSpaces(home);
}

function isSpaceRunning(slug) {
  return isSpaceWindowAlive(slug);
}

module.exports = function spaceList(home) {
  const spaces = getSpaces(home);

  if (spaces.length === 0) {
    console.log('No spaces found. Create one with: superbot3 space create <name>');
    return;
  }

  console.log('');
  console.log('  Name              Status      Model              Code Dir');
  console.log('  ────              ──────      ─────              ────────');

  for (const space of spaces) {
    if (space.archived) continue;
    const running = isSpaceRunning(space.slug);
    const status = running ? '● running' : '○ stopped';
    const model = space.model || '(default)';
    const codeDir = space.codeDir || '(none)';
    console.log(`  ${(space.name || space.slug).padEnd(18)}${status.padEnd(12)}${model.padEnd(19)}${codeDir}`);
  }

  console.log('');
  console.log(`Total: ${spaces.filter(s => !s.archived).length} space(s)`);
};

module.exports.getSpaces = getSpaces;
module.exports.isSpaceRunning = isSpaceRunning;
