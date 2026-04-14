const fs = require('fs');
const path = require('path');

function create(home, spaceName, agentName, opts = {}) {
  const configPath = path.join(home, 'spaces', spaceName, 'space.json');
  if (!fs.existsSync(configPath)) {
    console.error(`Error: Space "${spaceName}" not found.`);
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const agentDir = path.join(config.claudeConfigDir, 'agents');
  fs.mkdirSync(agentDir, { recursive: true });

  const agentPath = path.join(agentDir, `${agentName}.md`);
  if (fs.existsSync(agentPath)) {
    console.error(`Error: Agent "${agentName}" already exists at ${agentPath}`);
    process.exit(1);
  }

  const description = opts.description || `${agentName} agent`;
  const model = opts.model || '';
  const body = opts.body || `You are the ${agentName} agent. Describe your role and instructions here.\n`;

  let frontmatter = `---\n`;
  if (model) frontmatter += `model: ${model}\n`;
  frontmatter += `permissionMode: bypassPermissions\n`;
  frontmatter += `---\n`;

  const content = `${frontmatter}\n${body}`;

  fs.writeFileSync(agentPath, content, 'utf-8');
  console.log(`Agent "${agentName}" created at ${agentPath}`);
  console.log('  Restart the space for it to take effect.');
}

function list(home, spaceName) {
  const configPath = path.join(home, 'spaces', spaceName, 'space.json');
  if (!fs.existsSync(configPath)) {
    console.error(`Error: Space "${spaceName}" not found.`);
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const agentDir = path.join(config.claudeConfigDir, 'agents');

  if (!fs.existsSync(agentDir)) {
    console.log('No agents.');
    return;
  }

  const files = fs.readdirSync(agentDir).filter(f => f.endsWith('.md'));
  for (const file of files) {
    const name = path.basename(file, '.md');
    const content = fs.readFileSync(path.join(agentDir, file), 'utf-8');
    // Extract model from frontmatter
    const modelMatch = content.match(/model:\s*(.+)/);
    const model = modelMatch ? modelMatch[1].trim() : 'default';
    console.log(`  ${name} (model: ${model})`);
  }
}

function remove(home, spaceName, agentName) {
  const configPath = path.join(home, 'spaces', spaceName, 'space.json');
  if (!fs.existsSync(configPath)) {
    console.error(`Error: Space "${spaceName}" not found.`);
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const agentPath = path.join(config.claudeConfigDir, 'agents', `${agentName}.md`);

  if (!fs.existsSync(agentPath)) {
    console.error(`Error: Agent "${agentName}" not found.`);
    process.exit(1);
  }

  fs.unlinkSync(agentPath);
  console.log(`Agent "${agentName}" removed. Restart the space for it to take effect.`);
}

function show(home, spaceName, agentName) {
  const configPath = path.join(home, 'spaces', spaceName, 'space.json');
  if (!fs.existsSync(configPath)) {
    console.error(`Error: Space "${spaceName}" not found.`);
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const agentPath = path.join(config.claudeConfigDir, 'agents', `${agentName}.md`);

  if (!fs.existsSync(agentPath)) {
    console.error(`Error: Agent "${agentName}" not found.`);
    process.exit(1);
  }

  console.log(fs.readFileSync(agentPath, 'utf-8'));
}

module.exports = { create, list, remove, show };
