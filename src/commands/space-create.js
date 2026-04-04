const fs = require('fs');
const path = require('path');
const { setupConfigDir } = require('../auth');

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

module.exports = function spaceCreate(home, name, opts) {
  // Validate name (slug format)
  const slug = name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const spaceDir = path.join(home, 'spaces', slug);

  if (fs.existsSync(path.join(spaceDir, 'space.json'))) {
    console.error(`Error: Space "${slug}" already exists at ${spaceDir}`);
    process.exit(1);
  }

  // Resolve code dir
  let codeDir = null;
  if (opts.codeDir) {
    codeDir = path.resolve(opts.codeDir);
    if (!fs.existsSync(codeDir)) {
      console.error(`Error: Code directory does not exist: ${codeDir}`);
      process.exit(1);
    }
  }

  console.log(`Creating space "${slug}"...`);

  // Create space directory structure
  const dirs = [
    path.join(spaceDir, '.claude', 'skills', 'core-methodology'),
    path.join(spaceDir, '.claude', 'skills', 'space-cli'),
    path.join(spaceDir, '.claude', 'agents'),
    path.join(spaceDir, '.claude', 'plugins'),
    path.join(spaceDir, '.claude', 'teams'),
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
    name: slug,
    slug: slug,
    codeDir: codeDir,
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

  // Customize CLAUDE.md with space name
  const claudeMdPath = path.join(spaceDir, '.claude', 'CLAUDE.md');
  if (fs.existsSync(claudeMdPath)) {
    let content = fs.readFileSync(claudeMdPath, 'utf-8');
    content = content.replace(/\{\{SPACE_NAME\}\}/g, slug);
    fs.writeFileSync(claudeMdPath, content, 'utf-8');
  }

  // Set up auth (credentials + config) so CLAUDE_CONFIG_DIR works
  const claudeConfigDir = path.join(spaceDir, '.claude');
  if (setupConfigDir(claudeConfigDir, spaceDir)) {
    console.log('  Auth configured from default keychain');
  }

  // Ensure scheduled_tasks.json exists (empty — no default schedules)
  const schedulePath = path.join(spaceDir, '.claude', 'scheduled_tasks.json');
  if (!fs.existsSync(schedulePath)) {
    fs.writeFileSync(schedulePath, JSON.stringify({ tasks: [] }, null, 2), 'utf-8');
  }

  console.log('');
  console.log(`Space "${slug}" created successfully!`);
  console.log('');
  console.log(`  Space dir:  ${spaceDir}`);
  if (codeDir) {
    console.log(`  Code dir:   ${codeDir}`);
  }
  console.log(`  Config dir: ${path.join(spaceDir, '.claude')}`);
  console.log('');
  console.log('Contents:');
  console.log('  ├── space.json');
  console.log('  ├── .claude/');
  console.log('  │   ├── CLAUDE.md');
  console.log('  │   ├── settings.json');
  console.log('  │   ├── scheduled_tasks.json');
  console.log('  │   ├── agents/ (planner, coder, researcher, reviewer)');
  console.log('  │   ├── skills/ (core-methodology, space-cli)');
  console.log('  │   └── plugins/');
  console.log('  └── knowledge/');
  console.log('      └── logs/');
};
