const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { refreshAllSpaceCredentials } = require('../auth');
const { tmuxSessionExists, tmuxWindowExists } = require('../tmuxMessage');
const { writeLaunchScript, launchSpace } = require('../launchSpace');
const state = require('../state');
const { generateMissingSpaceJsons } = require('../migrate');

function findNewestSession(claudeConfigDir) {
  const projectsDir = path.join(claudeConfigDir, 'projects');
  try {
    const dirs = fs.readdirSync(projectsDir, { withFileTypes: true }).filter(d => d.isDirectory());
    let newest = null;
    let newestMtime = 0;
    for (const dir of dirs) {
      const dirPath = path.join(projectsDir, dir.name);
      const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.jsonl'));
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stat = fs.statSync(filePath);
        if (stat.mtimeMs > newestMtime) {
          newestMtime = stat.mtimeMs;
          newest = { sessionId: file.replace('.jsonl', ''), filePath };
        }
      }
    }
    return newest;
  } catch {
    return null;
  }
}

module.exports = async function start(home) {
  console.log('Starting superbot3...\n');

  // Ensure space.json exists for all spaces in state.json
  generateMissingSpaceJsons(home);

  const config = JSON.parse(fs.readFileSync(path.join(home, 'config.json'), 'utf-8'));
  const port = config.broker?.port || 3100;
  const model = config.model || 'claude-opus-4-6';

  // Refresh credentials
  console.log('Refreshing credentials...');
  refreshAllSpaceCredentials(home);

  // Start broker
  console.log('Starting broker...');
  const brokerScript = path.resolve(__dirname, '..', '..', 'broker', 'server.js');
  if (!fs.existsSync(brokerScript)) { console.error('Error: broker/server.js not found.'); process.exit(1); }

  let brokerRunning = false;
  try {
    const resp = execSync(`curl -s http://localhost:${port}/health 2>/dev/null`, { encoding: 'utf-8' });
    if (resp.includes('superbot3')) { brokerRunning = true; console.log(`  Broker already running on port ${port}`); }
  } catch {}

  if (!brokerRunning) {
    const broker = spawn('node', [brokerScript], {
      detached: true, stdio: 'ignore',
      env: { ...process.env, SUPERBOT3_HOME: home, SUPERBOT3_BROKER_PORT: String(port) },
    });
    broker.unref();
    const pidDir = path.join(home, '.tmp');
    fs.mkdirSync(pidDir, { recursive: true });
    fs.writeFileSync(path.join(pidDir, 'broker.pid'), String(broker.pid), 'utf-8');

    let ready = false;
    for (let i = 0; i < 20; i++) {
      try { execSync(`curl -s http://localhost:${port}/health > /dev/null 2>&1`); ready = true; break; } catch { execSync('sleep 0.25'); }
    }
    console.log(ready ? `  Broker started (PID: ${broker.pid}, port: ${port})` : '  Warning: Broker may not have started');
  }

  // tmux session + master
  console.log('Setting up tmux session + master...');
  const masterConfigDir = path.join(home, 'orchestrator', '.claude');
  const masterSystemPromptFile = path.join(home, 'orchestrator', 'system-prompt.md');
  const masterOpts = { systemPromptFile: fs.existsSync(masterSystemPromptFile) ? masterSystemPromptFile : null };

  if (tmuxSessionExists('superbot3')) {
    console.log('  tmux session exists');
    if (!tmuxWindowExists('superbot3', 'master')) {
      const script = writeLaunchScript('master', path.join(home, 'orchestrator'), model, null, masterConfigDir, masterOpts);
      execSync(`tmux new-window -t superbot3 -n master "bash ${script}"`);
      console.log('  Master launched');
    } else {
      console.log('  Master already running');
    }
  } else {
    const script = writeLaunchScript('master', path.join(home, 'orchestrator'), model, null, masterConfigDir, masterOpts);
    execSync(`tmux new-session -d -s superbot3 -n master "bash ${script}"`);
    console.log('  Created tmux session with master');
  }

  // Start active spaces
  const spaces = state.getAllSpaces(home).filter(s => s.active && !s.archived);
  if (spaces.length > 0) {
    console.log(`\nStarting ${spaces.length} space(s)...`);
    for (const space of spaces) {
      const launched = launchSpace(home, space.slug);
      if (launched) console.log(`  Started "${space.slug}"`);
    }
  } else {
    console.log('\nNo active spaces to start.');
  }

  // Capture session IDs
  if (spaces.length > 0) {
    console.log('\nCapturing session IDs...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    for (const space of spaces) {
      const configDir = state.claudeConfigDir(home, space.slug);
      const session = findNewestSession(configDir);
      if (session) {
        state.updateSpace(home, space.slug, { sessionId: session.sessionId });
        console.log(`  ${space.slug}: ${session.sessionId}`);
      }
    }
  }

  console.log(`\nsuperbot3 is running!\n`);
  console.log(`  Broker:  http://localhost:${port}`);
  console.log('  tmux:    tmux attach -t superbot3');
  console.log('  Spaces:  superbot3 space list');
  console.log('  Message: superbot3 message <space> "text"');
  console.log('  Stop:    superbot3 stop');
};
