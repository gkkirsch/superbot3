const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

module.exports = function update() {
  const appDir = path.resolve(__dirname, '..', '..');
  const home = process.env.SUPERBOT3_HOME || path.join(os.homedir(), '.superbot3');

  console.log('Updating superbot3...');
  console.log(`  Code: ${appDir}`);
  console.log(`  Data: ${home}`);
  console.log('');

  // 1. Pull latest code
  console.log('Pulling latest code...');
  try {
    execSync('git pull origin main', { cwd: appDir, stdio: 'inherit' });
  } catch (err) {
    console.error('Error: git pull failed.');
    process.exit(1);
  }

  // 2. Install dependencies
  console.log('');
  console.log('Installing dependencies...');
  try {
    execSync('npm install --production', { cwd: appDir, stdio: 'inherit' });
  } catch (err) {
    console.error('Error: npm install failed.');
    process.exit(1);
  }

  // 3. Rebuild dashboard
  const dashboardDir = path.join(appDir, 'broker', 'dashboard-ui');
  if (fs.existsSync(path.join(dashboardDir, 'package.json'))) {
    console.log('');
    console.log('Rebuilding dashboard...');
    try {
      execSync('npm install', { cwd: dashboardDir, stdio: 'inherit' });
      execSync('npm run build', { cwd: dashboardDir, stdio: 'inherit' });
    } catch (err) {
      console.error('Warning: Dashboard build failed. The previous build will still work.');
    }
  }

  // 4. Refresh space system prompts
  const spacesDir = path.join(home, 'spaces');
  const templatePath = path.join(appDir, 'src', 'templates', 'space-system-prompt.md');
  if (fs.existsSync(spacesDir) && fs.existsSync(templatePath)) {
    console.log('');
    console.log('Refreshing space system prompts...');
    const template = fs.readFileSync(templatePath, 'utf-8');

    const entries = fs.readdirSync(spacesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const spaceJsonPath = path.join(spacesDir, entry.name, 'space.json');
      if (!fs.existsSync(spaceJsonPath)) continue;

      const spaceConfig = JSON.parse(fs.readFileSync(spaceJsonPath, 'utf-8'));
      const promptPath = path.join(spacesDir, entry.name, 'system-prompt.md');

      // Apply template replacements
      let content = template;
      content = content.replace(/\{\{SPACE_NAME\}\}/g, spaceConfig.slug);
      content = content.replace(/\{\{SPACE_SLUG\}\}/g, spaceConfig.slug);
      content = content.replace(/\{\{SPACE_DIR\}\}/g, spaceConfig.spaceDir || path.join(spacesDir, entry.name));
      if (spaceConfig.codeDir) {
        content = content.replace(/\{\{CODE_DIR_SECTION\}\}/g, `Your code directory is \`${spaceConfig.codeDir}\`. This is where your workers should make code changes.`);
      } else {
        content = content.replace(/\n\{\{CODE_DIR_SECTION\}\}\n/g, '\n');
        content = content.replace(/\{\{CODE_DIR_SECTION\}\}/g, '');
      }

      fs.writeFileSync(promptPath, content, 'utf-8');
      console.log(`  ✓ ${entry.name}`);
    }
  }

  // 5. Refresh master system prompt
  const masterTemplatePath = path.join(appDir, 'src', 'templates', 'master-system-prompt.md');
  const masterPromptPath = path.join(home, 'orchestrator', 'system-prompt.md');
  if (fs.existsSync(masterTemplatePath) && fs.existsSync(path.join(home, 'orchestrator'))) {
    console.log('');
    console.log('Refreshing master system prompt...');
    fs.copyFileSync(masterTemplatePath, masterPromptPath);
    console.log('  ✓ master');
  }

  // 6. Refresh master settings (ensure enabledPlugins: {} stays)
  const masterSettingsPath = path.join(home, 'orchestrator', '.claude', 'settings.json');
  if (fs.existsSync(masterSettingsPath)) {
    try {
      const settings = JSON.parse(fs.readFileSync(masterSettingsPath, 'utf-8'));
      if (!settings.enabledPlugins) {
        settings.enabledPlugins = {};
        fs.writeFileSync(masterSettingsPath, JSON.stringify(settings, null, 2), 'utf-8');
      }
    } catch {}
  }

  console.log('');
  console.log('Updated successfully!');
  console.log('');
  console.log('  Restart: superbot3 stop && superbot3 start');
};
