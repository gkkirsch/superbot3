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

  // Find Chrome extensions (AdBlock, 1Password)
  const chromeExtDir = path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome', 'Default', 'Extensions');
  const extIds = [
    'gighmmpiobklfepjocnamgkkbiglidom', // AdBlock
    'aeblfdkhhhdcdjpifhhbdiojplfjncoa', // 1Password
  ];
  const extPaths = [];
  for (const id of extIds) {
    try {
      const versions = fs.readdirSync(path.join(chromeExtDir, id)).filter(v => !v.startsWith('.'));
      if (versions.length > 0) extPaths.push(path.join(chromeExtDir, id, versions[versions.length - 1]));
    } catch {}
  }

  return {
    AGENT_BROWSER_SESSION: slug,
    AGENT_BROWSER_PROFILE: profileDir,
    AGENT_BROWSER_HEADED: 'true',
    AGENT_BROWSER_ARGS: '--no-first-run,--no-default-browser-check',
    ...(extPaths.length > 0 ? { AGENT_BROWSER_EXTENSIONS: extPaths.join(',') } : {}),
  };
}

module.exports = { getBrowserEnv };
