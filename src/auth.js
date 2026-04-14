const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Read OAuth credentials from the macOS Keychain.
 * Searches all "Claude Code-credentials*" entries and returns the one with
 * the latest (or non-expired) token. Claude Code stores credentials with a
 * hash suffix based on CLAUDE_CONFIG_DIR — different sessions have different entries.
 */
function readDefaultCredentials() {
  const username = os.userInfo().username;

  // Find all Claude Code credential service names in the keychain
  let serviceNames = [];
  try {
    const dump = execSync('security dump-keychain 2>/dev/null', { encoding: 'utf-8' });
    const lines = dump.split('\n').filter(l => l.includes('"svce"') && l.includes('Claude Code-credentials'));
    for (const line of lines) {
      const match = line.match(/="(Claude Code-credentials[^"]*)"/);
      if (match) serviceNames.push(match[1]);
    }
    serviceNames = [...new Set(serviceNames)];
  } catch {}

  if (serviceNames.length === 0) {
    serviceNames = ['Claude Code-credentials'];
  }

  let bestRaw = null;
  let bestExpiry = 0;

  for (const svc of serviceNames) {
    try {
      const raw = execSync(
        `security find-generic-password -a "${username}" -s "${svc}" -w 2>/dev/null`,
        { encoding: 'utf-8' }
      ).trim();
      const parsed = JSON.parse(raw);
      if (parsed.claudeAiOauth && parsed.claudeAiOauth.accessToken) {
        const expiry = parsed.claudeAiOauth.expiresAt || 0;
        if (expiry > bestExpiry) {
          bestExpiry = expiry;
          bestRaw = raw;
        }
      }
    } catch {}
  }

  return bestRaw;
}

/**
 * Read the global Claude config from ~/.claude.json (default location when no CLAUDE_CONFIG_DIR).
 * Extracts only the fields needed for auth, onboarding bypass, and trust.
 */
function readDefaultGlobalConfig() {
  const globalConfigPath = path.join(os.homedir(), '.claude.json');
  try {
    const data = JSON.parse(fs.readFileSync(globalConfigPath, 'utf-8'));
    return {
      hasCompletedOnboarding: data.hasCompletedOnboarding || false,
      oauthAccount: data.oauthAccount || null,
      theme: data.theme || undefined,
      userID: data.userID || undefined,
      bypassPermissionsModeAccepted: true,
    };
  } catch {
    return null;
  }
}

/**
 * Set up a Claude config directory with credentials and global config.
 *
 * Files created:
 * 1. .credentials.json — OAuth tokens (fallback when keychain entry doesn't exist)
 * 2. .claude.json — Global config with onboarding, trust, and bypass-permissions pre-accepted
 * 3. settings.json — Merged with skipDangerousModePermissionPrompt: true
 *
 * @param {string} configDir - The CLAUDE_CONFIG_DIR path (e.g., /path/to/space/.claude)
 * @param {string} workDir - The cwd where Claude will run (for trust dialog pre-acceptance)
 * @param {string} [codeDir] - Optional additional directory to trust (e.g., the linked code repo)
 */
function setupConfigDir(configDir, workDir, codeDir) {
  fs.mkdirSync(configDir, { recursive: true });
  let success = true;

  // 1. Copy credentials
  const credsJson = readDefaultCredentials();
  if (credsJson) {
    fs.writeFileSync(path.join(configDir, '.credentials.json'), credsJson, { mode: 0o600 });
  } else {
    console.log('  Warning: Could not read credentials from keychain. Spaces may need manual login.');
    success = false;
  }

  // 2. Create global config with trust and permissions pre-accepted
  const globalConfig = readDefaultGlobalConfig() || {
    hasCompletedOnboarding: true,
    bypassPermissionsModeAccepted: true,
  };

  // Pre-accept trust dialog for the working directory (and codeDir if set)
  const effectiveWorkDir = workDir || path.dirname(configDir);
  globalConfig.projects = globalConfig.projects || {};
  globalConfig.projects[effectiveWorkDir] = {
    hasTrustDialogAccepted: true,
    allowedTools: [],
  };
  if (codeDir && codeDir !== effectiveWorkDir) {
    globalConfig.projects[codeDir] = {
      hasTrustDialogAccepted: true,
      allowedTools: [],
    };
  }

  fs.writeFileSync(
    path.join(configDir, '.claude.json'),
    JSON.stringify(globalConfig, null, 2),
    'utf-8'
  );

  // 3. Merge skipDangerousModePermissionPrompt + permission allow rules into settings.json
  const settingsPath = path.join(configDir, 'settings.json');
  let settings = {};
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  } catch {}
  settings.skipDangerousModePermissionPrompt = true;
  // Ensure .claude/ directory is allowed for edits (teammates may not inherit bypass mode)
  if (!settings.permissions) settings.permissions = { allow: [], deny: [] };
  if (!settings.permissions.allow) settings.permissions.allow = [];
  const allowRules = [
    'Edit(.claude/**)',
    'Write(.claude/**)',
    'Read(.claude/**)',
    'Bash(cat .claude/**)',
    'Bash(ls .claude/**)',
  ];
  for (const rule of allowRules) {
    if (!settings.permissions.allow.includes(rule)) {
      settings.permissions.allow.push(rule);
    }
  }
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

  return success;
}

/**
 * Refresh credentials and config in all existing space config dirs.
 */
function refreshAllSpaceCredentials(home) {
  const credsJson = readDefaultCredentials();
  if (!credsJson) return;

  const st = require('./state');
  const spaces = st.getAllSpaces(home);
  for (const space of spaces) {
    const configDir = st.claudeConfigDir(home, space.slug);
    const spaceDir = st.spaceDir(home, space.slug);
    setupConfigDir(configDir, spaceDir, space.codeDir);
  }

  // Also update orchestrator
  const orchDir = path.join(home, 'orchestrator', '.claude');
  const orchWorkDir = path.join(home, 'orchestrator');
  setupConfigDir(orchDir, orchWorkDir);
}

module.exports = {
  readDefaultCredentials,
  readDefaultGlobalConfig,
  setupConfigDir,
  refreshAllSpaceCredentials,
};
