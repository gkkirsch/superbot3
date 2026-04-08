const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { getSpaces } = require('./space-list');
const { writeToInbox } = require('../inbox');
const { refreshAllSpaceCredentials } = require('../auth');
const {
  writeLaunchScript,
  ensureInbox,
  ensureTeamConfig,
  tmuxSessionExists,
  tmuxWindowExists,
  launchSpace,
} = require('../launchSpace');

/**
 * Find the newest JSONL session file in a space's projects directory.
 * Returns { sessionId, filePath } or null.
 */
function findNewestSession(claudeConfigDir) {
  const projectsDir = path.join(claudeConfigDir, 'projects');
  try {
    const dirs = fs.readdirSync(projectsDir, { withFileTypes: true })
      .filter(d => d.isDirectory());
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

/**
 * Update space.json with the captured session ID.
 */
function updateSpaceSessionId(spaceDir, sessionId) {
  const spaceJsonPath = path.join(spaceDir, 'space.json');
  try {
    const config = JSON.parse(fs.readFileSync(spaceJsonPath, 'utf-8'));
    config.sessionId = sessionId;
    fs.writeFileSync(spaceJsonPath, JSON.stringify(config, null, 2), 'utf-8');
    return true;
  } catch {
    return false;
  }
}

module.exports = async function start(home) {
  console.log('Starting superbot3...');
  console.log('');

  const config = JSON.parse(fs.readFileSync(path.join(home, 'config.json'), 'utf-8'));
  const port = config.broker?.port || 3100;
  const model = config.model || 'claude-opus-4-6';

  // Step 0: Refresh credentials in all spaces (tokens may have been refreshed since creation)
  console.log('Refreshing credentials...');
  refreshAllSpaceCredentials(home);

  // Step 1: Start broker
  console.log('Starting broker...');
  // Broker lives in the code directory (relative to this file), not the data directory
  const brokerScript = path.resolve(__dirname, '..', '..', 'broker', 'server.js');
  if (!fs.existsSync(brokerScript)) {
    console.error('Error: Broker server.js not found.');
    process.exit(1);
  }

  let brokerRunning = false;
  try {
    const resp = execSync(`curl -s http://localhost:${port}/health 2>/dev/null`, { encoding: 'utf-8' });
    if (resp.includes('superbot3')) {
      brokerRunning = true;
      console.log(`  Broker already running on port ${port}`);
    }
  } catch {}

  if (!brokerRunning) {
    const broker = spawn('node', [brokerScript], {
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        SUPERBOT3_HOME: home,
        SUPERBOT3_BROKER_PORT: String(port),
      },
    });
    broker.unref();
    const pidDir = path.join(home, '.tmp');
    fs.mkdirSync(pidDir, { recursive: true });
    fs.writeFileSync(path.join(pidDir, 'broker.pid'), String(broker.pid), 'utf-8');

    let ready = false;
    for (let i = 0; i < 20; i++) {
      try {
        execSync(`curl -s http://localhost:${port}/health > /dev/null 2>&1`);
        ready = true;
        break;
      } catch {
        execSync('sleep 0.25');
      }
    }
    if (ready) {
      console.log(`  Broker started (PID: ${broker.pid}, port: ${port})`);
    } else {
      console.error('  Warning: Broker may not have started correctly');
    }
  }

  // Step 2: Create tmux session with master
  console.log('Setting up tmux session + master orchestrator...');

  const masterConfigDir = path.join(home, 'orchestrator', '.claude');
  const masterTeamName = 'superbot3';
  const masterTeamArgs = { agentId: 'team-lead', agentName: 'team-lead', teamName: masterTeamName };
  ensureInbox(masterConfigDir, masterTeamName, 'team-lead');

  if (tmuxSessionExists('superbot3')) {
    console.log('  tmux session "superbot3" already exists');
    if (!tmuxWindowExists('superbot3', 'master')) {
      const masterScript = writeLaunchScript('master', path.join(home, 'orchestrator'), model, null, masterConfigDir, masterTeamArgs);
      execSync(`tmux new-window -t superbot3 -n master "bash ${masterScript}"`);
      console.log('  Master orchestrator launched in new window');
    } else {
      console.log('  Master window already exists');
    }
  } else {
    const masterScript = writeLaunchScript('master', path.join(home, 'orchestrator'), model, null, masterConfigDir, masterTeamArgs);
    execSync(`tmux new-session -d -s superbot3 -n master "bash ${masterScript}"`);
    console.log('  Created tmux session with master orchestrator');
  }

  // Step 3: Start active spaces
  const spaces = getSpaces(home);
  const activeSpaces = spaces.filter(s => s.active);

  if (activeSpaces.length > 0) {
    console.log(`\nStarting ${activeSpaces.length} active space(s)...`);

    for (const space of activeSpaces) {
      const spaceModel = space.model || model;
      const launched = launchSpace(space, spaceModel);
      if (launched) {
        const spaceWorkDir = space.codeDir || space.spaceDir;
        console.log(`  Started space "${space.slug}" (cwd: ${spaceWorkDir})`);
      }
    }
  } else {
    console.log('\nNo active spaces to start.');
  }

  // Step 4: Capture session IDs for --resume on next restart
  // Wait briefly for Claude to create session JSONL files, then capture the session ID
  if (activeSpaces.length > 0) {
    console.log('\nCapturing session IDs...');
    // Give Claude a moment to create the session file
    await new Promise(resolve => setTimeout(resolve, 3000));

    for (const space of activeSpaces) {
      const session = findNewestSession(space.claudeConfigDir);
      if (session) {
        if (updateSpaceSessionId(space.spaceDir, session.sessionId)) {
          console.log(`  ${space.slug}: ${session.sessionId}`);
        }
      } else {
        console.log(`  ${space.slug}: no session file yet (will capture on next start)`);
      }
    }
  }

  // Step 5: Send startup prompts via inbox
  // The inbox poller activates once Claude starts (team args enable it from boot).
  // We write to the inbox immediately — the poller picks them up once ready.
  console.log('\nSending startup prompts via inbox...');

  const masterStartup = 'Scan ~/.superbot3/spaces/*/space.json to discover all spaces. Report what spaces you find and their status.';
  const masterInboxPath = path.join(home, 'orchestrator', '.claude', 'teams', 'superbot3', 'inboxes', 'team-lead.json');
  try {
    await writeToInbox(masterInboxPath, { from: 'superbot3', text: masterStartup });
    console.log('  Sent startup prompt to master');
  } catch (e) {
    console.log('  Could not send startup prompt to master');
  }

  for (const space of activeSpaces) {
    const spaceStartup = 'Read your CLAUDE.md. Scan knowledge/ for context. Report your identity, skills, agents, and knowledge files.';
    const spaceInboxPath = path.join(space.claudeConfigDir, 'teams', space.slug, 'inboxes', 'team-lead.json');
    try {
      await writeToInbox(spaceInboxPath, { from: 'superbot3', text: spaceStartup });
      console.log(`  Sent startup prompt to ${space.slug}`);
    } catch (e) {
      console.log(`  Could not send startup prompt to ${space.slug}`);
    }
  }

  console.log('');
  console.log('superbot3 is running!');
  console.log('');
  console.log(`  Broker:     http://localhost:${port}/health`);
  console.log('  tmux:       tmux attach -t superbot3');
  console.log('  Spaces:     superbot3 space list');
  console.log('  Message:    superbot3 message <space> "text"');
  console.log('  Stop:       superbot3 stop');
};
