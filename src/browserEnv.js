/**
 * Shared browser environment for a space.
 * Used by launchSpace.js, warmup-browser.js, and the broker's browser API.
 * One source of truth for all browser config.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

function getBrowserEnv(slug, spaceDir) {
  const profileDir = path.join(spaceDir, 'browser-profile');

  // Use system Chrome, not Playwright's Chromium
  const chromeExe = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const useSystemChrome = fs.existsSync(chromeExe);

  return {
    AGENT_BROWSER_SESSION: slug,
    AGENT_BROWSER_PROFILE: profileDir,
    AGENT_BROWSER_HEADED: 'true',
    AGENT_BROWSER_ARGS: '--no-first-run,--no-default-browser-check',
    ...(useSystemChrome ? { AGENT_BROWSER_EXECUTABLE_PATH: chromeExe } : {}),
  };
}

/**
 * Pre-install Chrome extensions into a space's browser profile.
 * Copies extension files from the user's Chrome and registers them in Preferences.
 * Call this during space creation or warmup.
 */
function seedBrowserExtensions(spaceDir) {
  const profileExtDir = path.join(spaceDir, 'browser-profile', 'Default', 'Extensions');
  const prefsPath = path.join(spaceDir, 'browser-profile', 'Default', 'Preferences');
  const chromeExtDir = path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome', 'Default', 'Extensions');

  const extensions = [
    { id: 'gighmmpiobklfepjocnamgkkbiglidom', name: 'AdBlock' },
  ];

  fs.mkdirSync(profileExtDir, { recursive: true });

  let prefs = {};
  try { prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf-8')); } catch {}
  if (!prefs.extensions) prefs.extensions = {};
  if (!prefs.extensions.settings) prefs.extensions.settings = {};

  for (const ext of extensions) {
    const srcDir = path.join(chromeExtDir, ext.id);
    if (!fs.existsSync(srcDir)) continue;

    const destDir = path.join(profileExtDir, ext.id);
    if (!fs.existsSync(destDir)) {
      function copyDir(src, dest) {
        fs.mkdirSync(dest, { recursive: true });
        for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
          const s = path.join(src, entry.name);
          const d = path.join(dest, entry.name);
          if (entry.isDirectory()) copyDir(s, d);
          else fs.copyFileSync(s, d);
        }
      }
      copyDir(srcDir, destDir);
    }

    try {
      const versions = fs.readdirSync(path.join(profileExtDir, ext.id)).filter(v => !v.startsWith('.'));
      if (versions.length > 0) {
        prefs.extensions.settings[ext.id] = {
          from_webstore: true,
          install_time: String(Date.now() * 1000),
          location: 1,
          path: `${ext.id}/${versions[versions.length - 1]}`,
          state: 1,
          was_installed_by_default: false,
        };
      }
    } catch {}
  }

  fs.writeFileSync(prefsPath, JSON.stringify(prefs, null, 2), 'utf-8');
}

module.exports = { getBrowserEnv, seedBrowserExtensions };
