const fs = require('fs');
const path = require('path');

module.exports = function logs(home, spaceName) {
  const spaceDir = path.join(home, 'spaces', spaceName);
  if (!fs.existsSync(path.join(spaceDir, 'space.json'))) {
    console.error(`Error: Space "${spaceName}" not found.`);
    process.exit(1);
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const logPath = path.join(spaceDir, 'knowledge', 'logs', String(year), month, `${year}-${month}-${day}.md`);

  if (!fs.existsSync(logPath)) {
    console.log(`No daily log found for today (${year}-${month}-${day})`);
    console.log(`Path: ${logPath}`);
    return;
  }

  console.log(`Daily log for ${spaceName} (${year}-${month}-${day}):`);
  console.log('─'.repeat(50));
  console.log(fs.readFileSync(logPath, 'utf-8'));
};
