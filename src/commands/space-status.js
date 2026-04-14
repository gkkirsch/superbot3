const fs = require('fs');
const path = require('path');
const { isSpaceWindowAlive, getPaneInfo, isPaneAlive } = require('../tmuxMessage');
const state = require('../state');

module.exports = function spaceStatus(home, name) {
  const space = state.getSpace(home, name);
  if (!space) {
    console.error(`Error: Space "${name}" not found`);
    process.exit(1);
  }

  const spaceDir = state.spaceDir(home, space.slug);
  const running = isSpaceWindowAlive(space.slug);
  const paneInfo = space.paneId ? getPaneInfo(space.paneId) : null;

  console.log('');
  console.log(`Space: ${space.name || space.slug}`);
  console.log('─'.repeat(50));
  console.log(`  Status:      ${running ? '● running' : '○ stopped'}`);
  console.log(`  Slug:        ${space.slug}`);
  console.log(`  Model:       ${space.model || '(global default)'}`);
  console.log(`  Code dir:    ${space.codeDir || '(none)'}`);
  console.log(`  Space dir:   ${spaceDir}`);
  console.log(`  Session ID:  ${space.sessionId || '(none)'}`);
  console.log(`  Pane ID:     ${space.paneId || '(none)'}`);
  if (paneInfo) {
    console.log(`  Pane PID:    ${paneInfo.pid}`);
    console.log(`  Pane cmd:    ${paneInfo.command}`);
  }
  console.log(`  Color:       ${space.color}`);
  console.log(`  Created:     ${space.created}`);

  // Workers
  const workers = space.workers || [];
  if (workers.length > 0) {
    console.log('');
    console.log('  Workers:');
    for (const w of workers) {
      const alive = w.paneId && isPaneAlive(w.paneId);
      const status = alive ? '● alive' : '○ dead';
      const wInfo = w.paneId ? getPaneInfo(w.paneId) : null;
      console.log(`    ${status}  ${w.name}  pane=${w.paneId || 'none'}  model=${w.model || '?'}  ${wInfo ? `pid=${wInfo.pid}` : ''}`);
    }
  }

  // Agents
  const agentsDir = path.join(spaceDir, '.claude', 'agents');
  if (fs.existsSync(agentsDir)) {
    const agents = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));
    if (agents.length) console.log(`\n  Agents:      ${agents.map(a => a.replace('.md', '')).join(', ')}`);
  }

  // Skills
  const skillsDir = path.join(spaceDir, '.claude', 'skills');
  if (fs.existsSync(skillsDir)) {
    const skills = fs.readdirSync(skillsDir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name);
    if (skills.length) console.log(`  Skills:      ${skills.join(', ')}`);
  }

  // Schedules
  const schedulePath = path.join(spaceDir, '.claude', 'scheduled_tasks.json');
  if (fs.existsSync(schedulePath)) {
    try {
      const schedule = JSON.parse(fs.readFileSync(schedulePath, 'utf-8'));
      console.log(`  Schedules:   ${schedule.tasks.length} task(s)`);
    } catch {}
  }

  console.log('');
};
