const fs = require('fs');
const path = require('path');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeIfNotExists(filePath, content) {
  if (!fs.existsSync(filePath)) {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, content, 'utf-8');
    return true;
  }
  return false;
}

module.exports = function init(home) {
  console.log(`Initializing superbot3 at ${home}...`);

  // Create directory structure
  const dirs = [
    path.join(home, 'bin'),
    path.join(home, 'broker'),
    path.join(home, 'orchestrator', '.claude', 'skills', 'master-cli'),
    path.join(home, 'orchestrator', '.claude', 'teams', 'superbot3', 'inboxes'),
    path.join(home, 'spaces'),
    path.join(home, 'templates', 'default', '.claude', 'skills', 'core-methodology'),
    path.join(home, 'templates', 'default', '.claude', 'skills', 'space-cli'),
    path.join(home, 'templates', 'default', '.claude', 'agents'),
    path.join(home, 'templates', 'default', '.claude', 'plugins'),
    path.join(home, 'templates', 'default', 'knowledge', 'logs'),
  ];

  dirs.forEach(ensureDir);

  // config.json
  writeIfNotExists(path.join(home, 'config.json'), JSON.stringify({
    version: '0.1.0',
    home: home,
    broker: {
      port: 3000,
      host: 'localhost',
    },
    model: 'claude-opus-4-6',
  }, null, 2));

  // Master orchestrator CLAUDE.md
  writeIfNotExists(
    path.join(home, 'orchestrator', '.claude', 'CLAUDE.md'),
    fs.readFileSync(path.join(__dirname, '..', 'templates', 'master-claude.md'), 'utf-8')
  );

  // Master settings.json
  writeIfNotExists(
    path.join(home, 'orchestrator', '.claude', 'settings.json'),
    JSON.stringify({
      permissions: {
        allow: [
          "Bash(tmux *)",
          "Bash(kill *)",
          "Bash(ps *)",
          "Bash(cat *)",
          "Bash(ls *)",
          "Bash(echo *)",
        ],
        deny: [],
      },
    }, null, 2)
  );

  // Master scheduled_tasks.json (heartbeat cron — 60s PID check)
  writeIfNotExists(
    path.join(home, 'orchestrator', '.claude', 'scheduled_tasks.json'),
    JSON.stringify({
      tasks: [
        {
          id: 'heartbeat-pid-check',
          cron: '* * * * *',
          prompt: 'Run a health check: scan all spaces, verify each running space has a live tmux pane. If any space is dead, restart it with --resume using the sessionId from space.json. Report any issues.',
          createdAt: Date.now(),
          recurring: true,
          permanent: true,
        },
      ],
    }, null, 2)
  );

  // Master CLI skill
  writeIfNotExists(
    path.join(home, 'orchestrator', '.claude', 'skills', 'master-cli', 'SKILL.md'),
    fs.readFileSync(path.join(__dirname, '..', 'templates', 'master-cli-skill.md'), 'utf-8')
  );

  // Master team config
  writeIfNotExists(
    path.join(home, 'orchestrator', '.claude', 'teams', 'superbot3', 'config.json'),
    JSON.stringify({
      name: 'superbot3',
      description: 'Master orchestrator team',
      createdAt: Date.now(),
      leadAgentId: 'team-lead@superbot3',
      members: [],
    }, null, 2)
  );

  // Master inbox (empty)
  writeIfNotExists(
    path.join(home, 'orchestrator', '.claude', 'teams', 'superbot3', 'inboxes', 'team-lead.json'),
    '[]'
  );

  // Broker server.js (minimal /health for now)
  writeIfNotExists(
    path.join(home, 'broker', 'server.js'),
    fs.readFileSync(path.join(__dirname, '..', 'templates', 'broker-server.js'), 'utf-8')
  );

  // Default space template files
  const templateDir = path.join(home, 'templates', 'default');

  // Template CLAUDE.md (placeholder — will be customized per space)
  writeIfNotExists(
    path.join(templateDir, '.claude', 'CLAUDE.md'),
    fs.readFileSync(path.join(__dirname, '..', 'templates', 'space-claude.md'), 'utf-8')
  );

  // Template settings.json
  writeIfNotExists(
    path.join(templateDir, '.claude', 'settings.json'),
    JSON.stringify({
      permissions: {
        allow: [],
        deny: [],
      },
    }, null, 2)
  );

  // Template scheduled_tasks.json (empty — no default schedules)
  writeIfNotExists(
    path.join(templateDir, '.claude', 'scheduled_tasks.json'),
    JSON.stringify({ tasks: [] }, null, 2)
  );

  // Agent definitions
  const agentFiles = ['planner.md', 'coder.md', 'researcher.md', 'reviewer.md'];
  agentFiles.forEach(f => {
    const src = path.join(__dirname, '..', 'templates', 'agents', f);
    if (fs.existsSync(src)) {
      writeIfNotExists(path.join(templateDir, '.claude', 'agents', f), fs.readFileSync(src, 'utf-8'));
    }
  });

  // Skills
  const skillDirs = ['core-methodology', 'space-cli'];
  skillDirs.forEach(s => {
    const src = path.join(__dirname, '..', 'templates', 'skills', s, 'SKILL.md');
    if (fs.existsSync(src)) {
      writeIfNotExists(path.join(templateDir, '.claude', 'skills', s, 'SKILL.md'), fs.readFileSync(src, 'utf-8'));
    }
  });

  console.log('');
  console.log('superbot3 initialized successfully!');
  console.log('');
  console.log('Directory structure:');
  console.log(`  ${home}/`);
  console.log('  ├── config.json');
  console.log('  ├── broker/');
  console.log('  ├── orchestrator/.claude/');
  console.log('  ├── spaces/');
  console.log('  └── templates/default/');
  console.log('');
  console.log('Next: superbot3 space create <name> --code-dir <path>');
};
