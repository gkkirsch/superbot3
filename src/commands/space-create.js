const fs = require('fs');
const path = require('path');
const { setupConfigDir } = require('../auth');
const { tmuxSessionExists, launchSpace } = require('../launchSpace');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyTemplate(templateDir, targetDir) {
  if (!fs.existsSync(templateDir)) return;
  const entries = fs.readdirSync(templateDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(templateDir, entry.name);
    const destPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      ensureDir(destPath);
      copyTemplate(srcPath, destPath);
    } else {
      if (!fs.existsSync(destPath)) {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}

/**
 * Core space creation logic. Returns the spaceConfig object on success.
 * Throws on error instead of calling process.exit (safe for both CLI and server).
 */
function titleCase(str) {
  return str.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function createSpace(home, name, codeDir) {
  const slug = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  // Use the original name as the friendly name (preserves casing/spaces)
  // Fall back to title-cased slug if name is already a slug
  const friendlyName = name.includes(' ') || name !== name.toLowerCase() ? name : titleCase(slug);
  const spaceDir = path.join(home, 'spaces', slug);

  if (fs.existsSync(path.join(spaceDir, 'space.json'))) {
    throw new Error(`Space "${slug}" already exists at ${spaceDir}`);
  }

  if (codeDir && !fs.existsSync(codeDir)) {
    throw new Error(`Code directory does not exist: ${codeDir}`);
  }

  // Create space directory structure
  const dirs = [
    path.join(spaceDir, '.claude', 'skills', 'core-methodology'),
    path.join(spaceDir, '.claude', 'skills', 'space-cli'),
    path.join(spaceDir, '.claude', 'skills', 'schedule-manager'),
    path.join(spaceDir, '.claude', 'skills', 'knowledge-base'),
    path.join(spaceDir, '.claude', 'skills', 'memory'),
    path.join(spaceDir, '.claude', 'agents'),
    path.join(spaceDir, '.claude', 'hooks'),
    path.join(spaceDir, '.claude', 'plugins'),
    path.join(spaceDir, '.claude', 'teams'),
    path.join(spaceDir, '.claude', 'scratchpad'),
    path.join(spaceDir, 'memory', 'topics'),
    path.join(spaceDir, 'memory', 'sessions'),
    path.join(spaceDir, 'knowledge', 'raw'),
    path.join(spaceDir, 'knowledge', 'wiki', 'concepts'),
    path.join(spaceDir, 'knowledge', 'wiki', 'summaries'),
    path.join(spaceDir, 'knowledge', 'wiki', 'connections'),
    path.join(spaceDir, 'knowledge', 'queries', 'reflections'),
    path.join(spaceDir, 'knowledge', 'logs'),
  ];
  dirs.forEach(ensureDir);

  // Copy from default template
  const templateDir = path.join(home, 'templates', 'default');
  if (fs.existsSync(templateDir)) {
    copyTemplate(templateDir, spaceDir);
  }

  // Generate space.json
  const spaceConfig = {
    $schema: 'superbot3-space-v1',
    name: friendlyName,
    slug: slug,
    codeDir: codeDir || null,
    spaceDir: spaceDir,
    claudeConfigDir: path.join(spaceDir, '.claude'),
    active: true,
    created: new Date().toISOString(),
    sessionId: null,
    browser: {
      maxConcurrent: 1,
      cdpPort: 9222,
    },
  };
  fs.writeFileSync(path.join(spaceDir, 'space.json'), JSON.stringify(spaceConfig, null, 2), 'utf-8');

  // Copy SessionStart hook scripts into the space's .claude/hooks/
  const hooksTemplateDir = path.join(__dirname, '..', 'templates', 'hooks');
  const hooksTargetDir = path.join(spaceDir, '.claude', 'hooks');
  if (fs.existsSync(hooksTemplateDir)) {
    const hookFiles = fs.readdirSync(hooksTemplateDir);
    for (const file of hookFiles) {
      const src = path.join(hooksTemplateDir, file);
      const dest = path.join(hooksTargetDir, file);
      fs.copyFileSync(src, dest);
      // Preserve executable bit
      try { fs.chmodSync(dest, 0o755); } catch {}
    }
  }

  // Customize CLAUDE.md with space name and code dir
  const claudeMdPath = path.join(spaceDir, '.claude', 'CLAUDE.md');
  if (fs.existsSync(claudeMdPath)) {
    let content = fs.readFileSync(claudeMdPath, 'utf-8');
    content = content.replace(/\{\{SPACE_NAME\}\}/g, slug);
    content = content.replace(/\{\{SPACE_DIR\}\}/g, spaceDir);
    if (codeDir) {
      content = content.replace(/\{\{CODE_DIR_SECTION\}\}/g, `Your code directory is \`${codeDir}\`. This is where your workers should make code changes. Your space directory (\`${spaceDir}\`) holds knowledge, config, and project state.`);
    } else {
      content = content.replace(/\n\{\{CODE_DIR_SECTION\}\}\n/g, '\n');
    }
    fs.writeFileSync(claudeMdPath, content, 'utf-8');
  }

  // Set up auth (credentials + config) so CLAUDE_CONFIG_DIR works
  const claudeConfigDir = path.join(spaceDir, '.claude');
  setupConfigDir(claudeConfigDir, spaceDir, codeDir);

  // Add SessionStart hooks to settings.json (memory + knowledge plugins)
  const settingsPath = path.join(claudeConfigDir, 'settings.json');
  let settings = {};
  try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')); } catch {}
  if (!settings.hooks) settings.hooks = {};
  settings.hooks.SessionStart = [
    {
      hooks: [
        {
          type: 'command',
          command: 'bash .claude/hooks/session-start-memory.sh',
          async: false,
        },
        {
          type: 'command',
          command: 'bash .claude/hooks/session-start-knowledge.sh',
          async: false,
        },
      ],
    },
  ];
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

  // Create team config.json so Claude Code's isTeamLead() returns true.
  // Without this, the inbox poller won't activate and the space can't receive messages.
  const teamDir = path.join(spaceDir, '.claude', 'teams', slug);
  ensureDir(teamDir);
  const teamConfigPath = path.join(teamDir, 'config.json');
  if (!fs.existsSync(teamConfigPath)) {
    fs.writeFileSync(teamConfigPath, JSON.stringify({
      name: slug,
      description: `Space orchestrator team for ${slug}`,
      createdAt: Date.now(),
      leadAgentId: 'team-lead',
      members: [],
    }, null, 2), 'utf-8');
  }

  // Pre-seed scheduled_tasks.json with nightly consolidation crons
  const schedulePath = path.join(spaceDir, '.claude', 'scheduled_tasks.json');
  if (!fs.existsSync(schedulePath)) {
    const now = Date.now();
    const defaultSchedule = {
      tasks: [
        {
          id: 'mem-nightly',
          cron: '0 3 * * *',
          prompt: 'Run memory consolidation: spawn the memory-consolidator agent to review today\'s session transcripts, extract key decisions/learnings/preferences, update topic files in memory/topics/, and rebuild memory/MEMORY.md index.',
          createdAt: now,
          recurring: true,
          permanent: true,
        },
        {
          id: 'kb-nightly',
          cron: '0 4 * * *',
          prompt: 'Run knowledge consolidation: spawn the knowledge-consolidator agent to check knowledge/raw/ for unprocessed sources, compile them into knowledge/wiki/ (summaries, concepts, connections), and update knowledge/wiki/index.md.',
          createdAt: now,
          recurring: true,
          permanent: true,
        },
      ],
    };
    fs.writeFileSync(schedulePath, JSON.stringify(defaultSchedule, null, 2) + '\n', 'utf-8');
  }

  // Create initial memory files
  const memoryMdPath = path.join(spaceDir, 'memory', 'MEMORY.md');
  if (!fs.existsSync(memoryMdPath)) {
    fs.writeFileSync(memoryMdPath, '# Memory\n\nNo memories yet.\n', 'utf-8');
  }
  return spaceConfig;
}

/**
 * CLI entry point — wraps createSpace with console output and process.exit on error.
 */
function spaceCreateCli(home, name, opts) {
  let codeDir = null;
  if (opts.codeDir) {
    codeDir = path.resolve(opts.codeDir);
  }

  console.log(`Creating space "${name}"...`);

  let spaceConfig;
  try {
    spaceConfig = createSpace(home, name, codeDir);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }

  if (codeDir) {
    console.log('  Auth configured from default keychain');
  }

  console.log('');
  console.log(`Space "${spaceConfig.slug}" created successfully!`);
  console.log('');
  console.log(`  Space dir:  ${spaceConfig.spaceDir}`);
  if (spaceConfig.codeDir) {
    console.log(`  Code dir:   ${spaceConfig.codeDir}`);
  }
  console.log(`  Config dir: ${spaceConfig.claudeConfigDir}`);
  console.log('');
  console.log('Contents:');
  console.log('  ├── space.json');
  console.log('  ├── .claude/');
  console.log('  │   ├── CLAUDE.md');
  console.log('  │   ├── settings.json');
  console.log('  │   ├── scheduled_tasks.json (nightly memory + knowledge consolidation)');
  console.log('  │   ├── agents/ (planner, coder, researcher, reviewer, knowledge-consolidator, memory-consolidator)');
  console.log('  │   ├── skills/ (core-methodology, space-cli, schedule-manager, knowledge-base, memory)');
  console.log('  │   ├── hooks/ (session-start-memory, session-start-knowledge)');
  console.log('  │   └── plugins/');
  console.log('  ├── memory/');
  console.log('  │   ├── MEMORY.md');
  console.log('  │   ├── topics/');
  console.log('  │   └── sessions/');
  console.log('  └── knowledge/');
  console.log('      ├── raw/');
  console.log('      ├── wiki/ (concepts, summaries, connections)');
  console.log('      ├── queries/ (reflections)');
  console.log('      └── logs/');

  // Auto-launch if superbot3 is already running
  if (tmuxSessionExists('superbot3')) {
    console.log('');
    const config = JSON.parse(fs.readFileSync(path.join(home, 'config.json'), 'utf-8'));
    const model = config.model || 'claude-opus-4-6';
    const launched = launchSpace(spaceConfig, model);
    if (launched) {
      console.log(`  Started "${spaceConfig.slug}" in tmux window superbot3:${spaceConfig.slug}`);
    }
  }
}

// Export both — CLI uses the default export, server uses createSpace
module.exports = spaceCreateCli;
module.exports.createSpace = createSpace;
