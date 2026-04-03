const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { getSpaces } = require('./space-list');

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

module.exports = async function start(home) {
  console.log('Starting superbot3...');
  console.log('');

  const config = JSON.parse(fs.readFileSync(path.join(home, 'config.json'), 'utf-8'));
  const port = config.broker?.port || 3100;

  // Step 1: Start broker
  console.log('Starting broker...');
  const brokerScript = path.join(home, 'broker', 'server.js');
  if (!fs.existsSync(brokerScript)) {
    console.error('Error: Broker server.js not found. Run superbot3 init first.');
    process.exit(1);
  }

  // Check if broker is already running on our port
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

    // Write PID file
    fs.writeFileSync(path.join(home, 'broker', 'broker.pid'), String(broker.pid), 'utf-8');

    // Wait for broker to be ready
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

  // Step 2: Create tmux session
  console.log('Setting up tmux session...');
  if (tmuxSessionExists('superbot3')) {
    console.log('  tmux session "superbot3" already exists');
  } else {
    execSync('tmux new-session -d -s superbot3 -n master');
    console.log('  Created tmux session "superbot3" with window "master"');
  }

  // Step 3: Launch master orchestrator
  console.log('Launching master orchestrator...');
  const masterConfigDir = path.join(home, 'orchestrator', '.claude');

  if (tmuxWindowExists('superbot3', 'master')) {
    console.log('  Master window already exists');
  }

  // Send the launch command to master window
  const masterCmd = `cd ${home}/orchestrator && env CLAUDECODE=1 CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 CLAUDE_CONFIG_DIR=${masterConfigDir} claude --dangerously-skip-permissions --model ${config.model || 'claude-opus-4-6'}`;

  // Only send if the window is fresh (check if claude is already running)
  try {
    const paneCmd = execSync(`tmux display-message -t superbot3:master -p "#{pane_current_command}" 2>/dev/null`, { encoding: 'utf-8' }).trim();
    if (paneCmd === 'zsh' || paneCmd === 'bash') {
      execSync(`tmux send-keys -t superbot3:master '${masterCmd}' Enter`);
      console.log('  Master orchestrator launched in tmux');
    } else {
      console.log(`  Master already running (${paneCmd})`);
    }
  } catch {
    execSync(`tmux send-keys -t superbot3:master '${masterCmd}' Enter`);
    console.log('  Master orchestrator launched in tmux');
  }

  // Step 4: Start active spaces
  const spaces = getSpaces(home);
  const activeSpaces = spaces.filter(s => s.active);

  if (activeSpaces.length > 0) {
    console.log(`\nStarting ${activeSpaces.length} active space(s)...`);

    for (const space of activeSpaces) {
      const cwd = space.codeDir || space.spaceDir;
      const spaceConfigDir = space.claudeConfigDir;

      if (tmuxWindowExists('superbot3', space.slug)) {
        console.log(`  Space "${space.slug}" already has a window`);
        continue;
      }

      // Create tmux window for space
      execSync(`tmux new-window -t superbot3 -n ${space.slug}`);

      // Build spawn command
      const resumeFlag = space.sessionId ? ` --resume ${space.sessionId}` : '';
      const spaceCmd = `cd ${cwd} && env CLAUDECODE=1 CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 CLAUDE_CONFIG_DIR=${spaceConfigDir} claude --dangerously-skip-permissions --model ${config.model || 'claude-opus-4-6'}${resumeFlag}`;

      execSync(`tmux send-keys -t superbot3:${space.slug} '${spaceCmd}' Enter`);
      console.log(`  Started space "${space.slug}" (cwd: ${cwd})`);
    }
  } else {
    console.log('\nNo active spaces to start.');
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
