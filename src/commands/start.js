const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { getSpaces } = require('./space-list');
const { writeToInbox } = require('../inbox');
const { refreshAllSpaceCredentials } = require('../auth');

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
 * Sets CLAUDE_CONFIG_DIR for full isolation (teams, inbox, plugins, settings).
 * Auth works via .credentials.json fallback (copied from default keychain during init/space-create).
 */
function writeLaunchScript(name, cwd, model, resumeSessionId, claudeConfigDir, teamArgs) {
  const scriptDir = path.join(require('os').homedir(), 'superbot3', '.tmp');
  fs.mkdirSync(scriptDir, { recursive: true });

  const scriptPath = path.join(scriptDir, `launch-${name}.sh`);

  const claudeArgs = ['--dangerously-skip-permissions', `--model ${model}`];
  if (resumeSessionId) {
    claudeArgs.push(`--resume ${resumeSessionId}`);
  }
  // Add team args for inbox polling (--agent-id, --agent-name, --team-name)
  if (teamArgs) {
    claudeArgs.push(`--agent-id '${teamArgs.agentId}'`);
    claudeArgs.push(`--agent-name '${teamArgs.agentName}'`);
    claudeArgs.push(`--team-name '${teamArgs.teamName}'`);
  }

  const script = `#!/bin/bash
cd "${cwd}"
export CLAUDE_CONFIG_DIR="${claudeConfigDir}"
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
exec claude ${claudeArgs.join(' ')}
`;

  fs.writeFileSync(scriptPath, script, { mode: 0o755 });
  return scriptPath;
}

/**
 * Ensure the inbox file exists for an agent in a team.
 * This is needed so the inbox poller can read from it immediately on startup.
 */
function ensureInbox(claudeConfigDir, teamName, agentName) {
  const inboxDir = path.join(claudeConfigDir, 'teams', teamName, 'inboxes');
  fs.mkdirSync(inboxDir, { recursive: true });
  const inboxPath = path.join(inboxDir, `${agentName}.json`);
  if (!fs.existsSync(inboxPath)) {
    fs.writeFileSync(inboxPath, '[]', 'utf-8');
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

  const masterConfigDir = path.join(home, 'orchestrator', '.claude');
  const masterTeamName = 'superbot3';
  const masterTeamArgs = { agentId: `team-lead@${masterTeamName}`, agentName: 'team-lead', teamName: masterTeamName };
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
      const spaceWorkDir = space.codeDir || space.spaceDir;

      if (tmuxWindowExists('superbot3', space.slug)) {
        console.log(`  Space "${space.slug}" already has a window`);
        continue;
      }

      // Set up team args so the inbox poller is active from startup
      const spaceTeamArgs = { agentId: `team-lead@${space.slug}`, agentName: 'team-lead', teamName: space.slug };
      ensureInbox(space.claudeConfigDir, space.slug, 'team-lead');

      const spaceScript = writeLaunchScript(space.slug, spaceWorkDir, model, space.sessionId, space.claudeConfigDir, spaceTeamArgs);
      execSync(`tmux new-window -t superbot3 -n ${space.slug} "bash ${spaceScript}"`);
      console.log(`  Started space "${space.slug}" (cwd: ${spaceWorkDir})`);
    }
  } else {
    console.log('\nNo active spaces to start.');
  }

  // Step 4: Send startup prompts via inbox
  // The inbox poller activates once Claude starts (team args enable it from boot).
  // We write to the inbox immediately — the poller picks them up once ready.
  console.log('\nSending startup prompts via inbox...');

  const masterStartup = 'Scan ~/superbot3/spaces/*/space.json to discover all spaces. Report what spaces you find and their status.';
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
