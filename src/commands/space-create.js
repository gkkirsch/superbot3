const fs = require('fs');
const path = require('path');
const { setupConfigDir } = require('../auth');
const { launchSpace } = require('../launchSpace');
const { tmuxSessionExists } = require('../tmuxMessage');
const state = require('../state');

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

function createSpace(home, name, opts = {}) {
  const slug = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const friendlyName = name.includes(' ') || name !== name.toLowerCase() ? name : titleCase(slug);
  const spaceDir = state.spaceDir(home, slug);
  const configDir = state.claudeConfigDir(home, slug);

  // Check if space already exists
  if (state.getSpaceConfig(home, slug) || state.getSpace(home, slug)) {
    throw new Error(`Space "${slug}" already exists`);
  }

  const codeDir = opts.codeDir || null;
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

  const spaceColor = getSpaceColor(slug);

  // Write space config to per-space space.json
  const spaceJsonData = {
    name: friendlyName,
    slug,
    codeDir,
    model: opts.model || null,
    active: true,
    archived: false,
    created: new Date().toISOString(),
    color: spaceColor.hex,
    systemPrompt: opts.systemPrompt || null,
    agent: opts.agent || null,
  };
  fs.writeFileSync(path.join(spaceDir, 'space.json'), JSON.stringify(spaceJsonData, null, 2), 'utf-8');

  // Write runtime state to central state.json
  state.setSpace(home, slug, {
    paneId: null,
    sessionId: null,
    workers: [],
  });

  // Merged view for return value
  const spaceData = { ...spaceJsonData, paneId: null, sessionId: null, workers: [] };

  // Default plugins
  const SUPERBOT3_MARKETPLACE = 'superbot3';
  const SUPERBOT3_MARKETPLACE_URL = 'https://superchargeclaudecode.com/api/marketplaces/superbot3/marketplace.json';
  const defaultPlugins = ['memory-knowledge', 'browser'];

  // Copy and customize system prompt template
  const systemPromptPath = path.join(spaceDir, 'system-prompt.md');
  if (!fs.existsSync(systemPromptPath)) {
    const templatePath = path.join(__dirname, '..', 'templates', 'space-system-prompt.md');
    if (fs.existsSync(templatePath)) {
      fs.copyFileSync(templatePath, systemPromptPath);
    }
  }

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

  // Auth setup
  setupConfigDir(configDir, spaceDir, codeDir);

  // Settings: plugins + marketplace
  const settingsPath = path.join(configDir, 'settings.json');
  let settings = {};
  try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')); } catch {}
  if (!settings.enabledPlugins) settings.enabledPlugins = {};
  for (const pluginName of defaultPlugins) {
    settings.enabledPlugins[`${pluginName}@${SUPERBOT3_MARKETPLACE}`] = true;
  }
  if (!settings.extraKnownMarketplaces) settings.extraKnownMarketplaces = {};
  settings.extraKnownMarketplaces[SUPERBOT3_MARKETPLACE] = {
    source: { source: 'url', url: SUPERBOT3_MARKETPLACE_URL },
  };
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

  // Scheduled tasks
  const schedulePath = path.join(configDir, 'scheduled_tasks.json');
  const now = Date.now();
  fs.writeFileSync(schedulePath, JSON.stringify({
    tasks: [
      { id: 'mem-nightly', cron: '0 3 * * *', prompt: 'Run memory consolidation: spawn the memory-consolidator agent to review today\'s session transcripts, extract key decisions/learnings/preferences, update topic files in memory/topics/, and rebuild memory/MEMORY.md index.', createdAt: now, recurring: true, permanent: true },
      { id: 'kb-nightly', cron: '0 4 * * *', prompt: 'Run knowledge consolidation: spawn the knowledge-consolidator agent to check knowledge/raw/ for unprocessed sources, compile them into knowledge/wiki/ (summaries, concepts, connections), and update knowledge/wiki/index.md.', createdAt: now, recurring: true, permanent: true },
    ],
  }, null, 2) + '\n', 'utf-8');

  // Memory
  const memoryMdPath = path.join(spaceDir, 'memory', 'MEMORY.md');
  if (!fs.existsSync(memoryMdPath)) {
    fs.writeFileSync(memoryMdPath, '# Memory\n\nNo memories yet.\n', 'utf-8');
  }

  // Chrome profile
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
  prefs.browser.theme.color_scheme = 2;
  fs.writeFileSync(prefsPath, JSON.stringify(prefs, null, 2), 'utf-8');

  return spaceData;
}

function spaceCreateCli(home, name, opts) {
  let codeDir = opts.codeDir ? path.resolve(opts.codeDir) : null;

  console.log(`Creating space "${name}"...`);

  let spaceData;
  try {
    spaceData = createSpace(home, name, { codeDir, model: opts.model, systemPrompt: opts.systemPrompt, agent: opts.agent });
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }

  const spaceDir = state.spaceDir(home, spaceData.slug);
  console.log('');
  console.log(`Space "${spaceData.slug}" created.`);
  console.log(`  Dir:   ${spaceDir}`);
  if (spaceData.codeDir) console.log(`  Code:  ${spaceData.codeDir}`);
  if (spaceData.model) console.log(`  Model: ${spaceData.model}`);

  // Auto-launch if superbot3 is already running
  if (tmuxSessionExists('superbot3')) {
    console.log('');
    const launched = launchSpace(home, spaceData.slug);
    if (launched) {
      console.log(`  Started in tmux window superbot3:${spaceData.slug}`);
    }
  }
}

module.exports = spaceCreateCli;
module.exports.createSpace = createSpace;
