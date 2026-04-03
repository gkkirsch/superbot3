const fs = require('fs');
const path = require('path');
const { isSpaceRunning } = require('./space-list');

module.exports = function spaceStatus(home, name) {
  const spaceDir = path.join(home, 'spaces', name);
  const configPath = path.join(spaceDir, 'space.json');

  if (!fs.existsSync(configPath)) {
    console.error(`Error: Space "${name}" not found at ${spaceDir}`);
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const running = isSpaceRunning(config.slug);

  console.log('');
  console.log(`Space: ${config.name}`);
  console.log('─'.repeat(40));
  console.log(`  Status:      ${running ? '● running' : '○ stopped'}`);
  console.log(`  Active:      ${config.active ? 'yes' : 'no'}`);
  console.log(`  Code dir:    ${config.codeDir || '(none)'}`);
  console.log(`  Space dir:   ${config.spaceDir}`);
  console.log(`  Config dir:  ${config.claudeConfigDir}`);
  console.log(`  Session ID:  ${config.sessionId || '(none)'}`);
  console.log(`  Created:     ${config.created}`);
  console.log('');

  // Show agents
  const agentsDir = path.join(spaceDir, '.claude', 'agents');
  if (fs.existsSync(agentsDir)) {
    const agents = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));
    console.log(`  Agents:      ${agents.map(a => a.replace('.md', '')).join(', ')}`);
  }

  // Show skills
  const skillsDir = path.join(spaceDir, '.claude', 'skills');
  if (fs.existsSync(skillsDir)) {
    const skills = fs.readdirSync(skillsDir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name);
    console.log(`  Skills:      ${skills.join(', ')}`);
  }

  // Show knowledge files
  const knowledgeDir = path.join(spaceDir, 'knowledge');
  if (fs.existsSync(knowledgeDir)) {
    const files = fs.readdirSync(knowledgeDir).filter(f => f.endsWith('.md'));
    console.log(`  Knowledge:   ${files.length} file(s)`);
  }

  // Show scheduled tasks
  const schedulePath = path.join(spaceDir, '.claude', 'scheduled_tasks.json');
  if (fs.existsSync(schedulePath)) {
    try {
      const schedule = JSON.parse(fs.readFileSync(schedulePath, 'utf-8'));
      console.log(`  Schedules:   ${schedule.tasks.length} task(s)`);
    } catch {
      console.log('  Schedules:   (invalid)');
    }
  }

  console.log('');
};
