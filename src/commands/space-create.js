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
// Distinct colors for browser profile bars — each space gets a unique one
const SPACE_COLORS = [
  { name: 'blue',    rgb: [66, 133, 244],  hex: '#4285f4', avatar: 0 },
  { name: 'red',     rgb: [234, 67, 53],   hex: '#ea4335', avatar: 6 },
  { name: 'green',   rgb: [52, 168, 83],   hex: '#34a853', avatar: 2 },
  { name: 'orange',  rgb: [251, 188, 4],   hex: '#fbbc04', avatar: 4 },
  { name: 'purple',  rgb: [171, 71, 188],  hex: '#ab47bc', avatar: 8 },
  { name: 'teal',    rgb: [0, 172, 193],   hex: '#00acc1', avatar: 10 },
  { name: 'pink',    rgb: [236, 64, 122],  hex: '#ec407a', avatar: 12 },
  { name: 'indigo',  rgb: [92, 107, 192],  hex: '#5c6bc0', avatar: 14 },
  { name: 'lime',    rgb: [124, 179, 66],  hex: '#7cb342', avatar: 16 },
  { name: 'amber',   rgb: [255, 143, 0],   hex: '#ff8f00', avatar: 18 },
];

function getSpaceColor(slug) {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) hash = ((hash << 5) - hash + slug.charCodeAt(i)) | 0;
  return SPACE_COLORS[Math.abs(hash) % SPACE_COLORS.length];
}

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

  // Assign a color to this space
  const spaceColor = getSpaceColor(slug);

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
    color: spaceColor.hex,
    browser: {
      maxConcurrent: 1,
    },
  };
  fs.writeFileSync(path.join(spaceDir, 'space.json'), JSON.stringify(spaceConfig, null, 2), 'utf-8');

  // Default plugins from superbot3 marketplace on superchargeclaudecode.com
  const SUPERBOT3_MARKETPLACE = 'superbot3';
  const SUPERBOT3_MARKETPLACE_URL = 'https://superchargeclaudecode.com/api/marketplaces/superbot3/marketplace.json';
  const defaultPlugins = ['memory-knowledge', 'browser'];

  // Copy system prompt template (must happen before template replacement below)
  const systemPromptPath = path.join(spaceDir, 'system-prompt.md');
  if (!fs.existsSync(systemPromptPath)) {
    const templatePath = path.join(__dirname, '..', 'templates', 'space-system-prompt.md');
    if (fs.existsSync(templatePath)) {
      fs.copyFileSync(templatePath, systemPromptPath);
    }
  }

  // Customize templates with space name, slug, and code dir
  const templateFiles = [
    path.join(spaceDir, '.claude', 'CLAUDE.md'),
    path.join(spaceDir, 'system-prompt.md'),
  ];
  for (const filePath of templateFiles) {
    if (fs.existsSync(filePath)) {
      let content = fs.readFileSync(filePath, 'utf-8');
      content = content.replace(/\{\{SPACE_NAME\}\}/g, slug);
      content = content.replace(/\{\{SPACE_SLUG\}\}/g, slug);
      content = content.replace(/\{\{SPACE_DIR\}\}/g, spaceDir);
      if (codeDir) {
        content = content.replace(/\{\{CODE_DIR_SECTION\}\}/g, `Your code directory is \`${codeDir}\`. This is where your workers should make code changes. Your space directory (\`${spaceDir}\`) holds knowledge, config, and project state.`);
      } else {
        content = content.replace(/\n\{\{CODE_DIR_SECTION\}\}\n/g, '\n');
        content = content.replace(/\{\{CODE_DIR_SECTION\}\}/g, '');
      }
      fs.writeFileSync(filePath, content, 'utf-8');
    }
  }

  // Set up auth (credentials + config) so CLAUDE_CONFIG_DIR works
  const claudeConfigDir = path.join(spaceDir, '.claude');
  setupConfigDir(claudeConfigDir, spaceDir, codeDir);

  // Enable built-in plugins in settings.json and installed_plugins.json
  const settingsPath = path.join(claudeConfigDir, 'settings.json');
  let settings = {};
  try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')); } catch {}

  // Enable default plugins from superbot3 marketplace
  if (!settings.enabledPlugins) settings.enabledPlugins = {};
  for (const pluginName of defaultPlugins) {
    settings.enabledPlugins[`${pluginName}@${SUPERBOT3_MARKETPLACE}`] = true;
  }

  // Register the superbot3 marketplace so Claude Code can fetch and load plugins
  if (!settings.extraKnownMarketplaces) settings.extraKnownMarketplaces = {};
  settings.extraKnownMarketplaces[SUPERBOT3_MARKETPLACE] = {
    source: { source: 'url', url: SUPERBOT3_MARKETPLACE_URL },
  };

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

  // Always write scheduled_tasks.json with nightly consolidation crons
  // (overwrites the empty template copy)
  const schedulePath = path.join(spaceDir, '.claude', 'scheduled_tasks.json');
  {
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
  } // end schedule block

  // Create initial memory files
  const memoryMdPath = path.join(spaceDir, 'memory', 'MEMORY.md');
  if (!fs.existsSync(memoryMdPath)) {
    fs.writeFileSync(memoryMdPath, '# Memory\n\nNo memories yet.\n', 'utf-8');
  }

  // Seed Chrome profile with space name and color
  const profileDir = path.join(spaceDir, 'browser-profile', 'Default');
  ensureDir(profileDir);
  const prefsPath = path.join(profileDir, 'Preferences');
  let prefs = {};
  try { prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf-8')); } catch {}
  if (!prefs.profile) prefs.profile = {};
  prefs.profile.name = friendlyName;
  prefs.profile.avatar_index = spaceColor.avatar;
  prefs.profile.using_default_avatar = false;
  prefs.profile.using_gaia_avatar = false;
  prefs.profile.using_default_name = false;
  if (!prefs.browser) prefs.browser = {};
  if (!prefs.browser.theme) prefs.browser.theme = {};
  prefs.browser.theme.user_color = spaceColor.rgb[0] << 16 | spaceColor.rgb[1] << 8 | spaceColor.rgb[2];
  prefs.browser.theme.color_scheme = 2; // 2 = follow system
  fs.writeFileSync(prefsPath, JSON.stringify(prefs, null, 2), 'utf-8');

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
