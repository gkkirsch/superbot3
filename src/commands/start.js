const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { getSpaces } = require('./space-list');
const { writeToInbox } = require('../inbox');

function tmuxSessionExists(name) {
  try {
    execSync(`tmux has-session -t ${name} 2>/dev/null`);
    return true;
  } catch {
    return false;
  }
}

function tmuxWindowExists(session, windowName) {
  try {
    const output = execSync(`tmux list-windows -t ${session} -F "#{window_name}" 2>/dev/null`, { encoding: 'utf-8' });
    return output.split('\n').map(s => s.trim()).includes(windowName);
  } catch {
    return false;
  }
}

/**
 * Write a launcher script that starts Claude in interactive mode.
 * Initial instructions come via CLAUDE.md, not -p flag.
 */
function writeLaunchScript(name, cwd, model, resumeSessionId) {
  const scriptDir = path.join(require('os').homedir(), 'superbot3', '.tmp');
  fs.mkdirSync(scriptDir, { recursive: true });

  const scriptPath = path.join(scriptDir, `launch-${name}.sh`);

  const claudeArgs = ['--dangerously-skip-permissions', `--model ${model}`];
  if (resumeSessionId) {
    claudeArgs.push(`--resume ${resumeSessionId}`);
  }

  // Start Claude in interactive mode. The CLAUDE.md in the cwd's .claude/ dir
  // provides identity and instructions. We'll send a startup prompt via stdin.
  const script = `#!/bin/bash
cd "${cwd}"
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
exec claude ${claudeArgs.join(' ')}
`;

  fs.writeFileSync(scriptPath, script, { mode: 0o755 });
  return scriptPath;
}

module.exports = async function start(home) {
  console.log('Starting superbot3...');
  console.log('');

  const config = JSON.parse(fs.readFileSync(path.join(home, 'config.json'), 'utf-8'));
  const port = config.broker?.port || 3100;
  const model = config.model || 'claude-opus-4-6';

  // Step 1: Start broker
  console.log('Starting broker...');
  const brokerScript = path.join(home, 'broker', 'server.js');
  if (!fs.existsSync(brokerScript)) {
    console.error('Error: Broker server.js not found. Run superbot3 init first.');
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
    fs.writeFileSync(path.join(home, 'broker', 'broker.pid'), String(broker.pid), 'utf-8');

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

  if (tmuxSessionExists('superbot3')) {
    console.log('  tmux session "superbot3" already exists');
    if (!tmuxWindowExists('superbot3', 'master')) {
      const masterScript = writeLaunchScript('master', path.join(home, 'orchestrator'), model);
      execSync(`tmux new-window -t superbot3 -n master "bash ${masterScript}"`);
      console.log('  Master orchestrator launched in new window');
    } else {
      console.log('  Master window already exists');
    }
  } else {
    const masterScript = writeLaunchScript('master', path.join(home, 'orchestrator'), model);
    execSync(`tmux new-session -d -s superbot3 -n master "bash ${masterScript}"`);
    console.log('  Created tmux session with master orchestrator');
  }

  // Step 3: Start active spaces
  const spaces = getSpaces(home);
  const activeSpaces = spaces.filter(s => s.active);

  if (activeSpaces.length > 0) {
    console.log(`\nStarting ${activeSpaces.length} active space(s)...`);

    for (const space of activeSpaces) {
      const spaceWorkDir = space.spaceDir;

      if (tmuxWindowExists('superbot3', space.slug)) {
        console.log(`  Space "${space.slug}" already has a window`);
        continue;
      }

      const spaceScript = writeLaunchScript(space.slug, spaceWorkDir, model, space.sessionId);
      execSync(`tmux new-window -t superbot3 -n ${space.slug} "bash ${spaceScript}"`);
      console.log(`  Started space "${space.slug}" (cwd: ${spaceWorkDir})`);
    }
  } else {
    console.log('\nNo active spaces to start.');
  }

  // Step 4: Wait for Claude instances to initialize, then send startup prompts
  // Claude needs ~10-15s to load. We send prompts via tmux send-keys after it's ready.
  console.log('\nWaiting for Claude instances to initialize...');
  execSync('sleep 12');

  // Send startup prompt to master
  const masterStartup = 'Scan ~/superbot3/spaces/*/space.json to discover all spaces. Report what spaces you find and their status.';
  try {
    execSync(`tmux send-keys -t superbot3:master -l '${masterStartup.replace(/'/g, "'\\''")}'`);
    execSync(`tmux send-keys -t superbot3:master Enter`);
    console.log('  Sent startup prompt to master');
  } catch (e) {
    console.log('  Could not send startup prompt to master');
  }

  // Send startup prompt to each space
  for (const space of activeSpaces) {
    const spaceStartup = `Read your CLAUDE.md. Scan knowledge/ for context. Report your identity, skills, agents, and knowledge files.`;
    try {
      execSync(`tmux send-keys -t superbot3:${space.slug} -l '${spaceStartup.replace(/'/g, "'\\''")}'`);
      execSync(`tmux send-keys -t superbot3:${space.slug} Enter`);
      console.log(`  Sent startup prompt to ${space.slug}`);
    } catch (e) {
      console.log(`  Could not send startup prompt to ${space.slug} (may have closed)`);
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
