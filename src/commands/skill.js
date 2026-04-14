const fs = require('fs');
const path = require('path');

function create(home, spaceName, skillName, opts = {}) {
  const configPath = path.join(home, 'spaces', spaceName, 'space.json');
  if (!fs.existsSync(configPath)) {
    console.error(`Error: Space "${spaceName}" not found.`);
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const skillDir = path.join(config.claudeConfigDir, 'skills', skillName);

  if (fs.existsSync(skillDir)) {
    console.error(`Error: Skill "${skillName}" already exists at ${skillDir}`);
    process.exit(1);
  }

  fs.mkdirSync(skillDir, { recursive: true });

  const description = opts.description || `${skillName} skill`;
  const body = opts.body || `# ${skillName}\n\nDescribe what this skill does and how to use it.\n`;

  const content = `---
name: ${skillName}
description: "${description}"
---

${body}`;

  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content, 'utf-8');
  console.log(`Skill "${skillName}" created at ${skillDir}/SKILL.md`);
  console.log('  Restart the space for it to take effect.');
}

function list(home, spaceName) {
  const configPath = path.join(home, 'spaces', spaceName, 'space.json');
  if (!fs.existsSync(configPath)) {
    console.error(`Error: Space "${spaceName}" not found.`);
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const skillsDir = path.join(config.claudeConfigDir, 'skills');

  if (!fs.existsSync(skillsDir)) {
    console.log('No skills.');
    return;
  }

  const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillMd = path.join(skillsDir, entry.name, 'SKILL.md');
    if (fs.existsSync(skillMd)) {
      // Parse description from frontmatter
      const content = fs.readFileSync(skillMd, 'utf-8');
      const descMatch = content.match(/description:\s*"?([^"\n]+)"?/);
      const desc = descMatch ? descMatch[1] : '';
      console.log(`  ${entry.name} — ${desc}`);
    }
  }
}

function remove(home, spaceName, skillName) {
  const configPath = path.join(home, 'spaces', spaceName, 'space.json');
  if (!fs.existsSync(configPath)) {
    console.error(`Error: Space "${spaceName}" not found.`);
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const skillDir = path.join(config.claudeConfigDir, 'skills', skillName);

  if (!fs.existsSync(skillDir)) {
    console.error(`Error: Skill "${skillName}" not found.`);
    process.exit(1);
  }

  fs.rmSync(skillDir, { recursive: true });
  console.log(`Skill "${skillName}" removed. Restart the space for it to take effect.`);
}

module.exports = { create, list, remove };
