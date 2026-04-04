const express = require('express');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const http = require('http');

const app = express();
const PORT = process.env.SUPERBOT3_BROKER_PORT || 3100;
const SUPERBOT3_HOME = process.env.SUPERBOT3_HOME || path.join(require('os').homedir(), 'superbot3');

app.use(express.json());

// Serve static dashboard in production
const distPath = path.join(__dirname, 'dashboard-ui', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isWindowRunning(windowName) {
  try {
    const output = execSync('tmux list-windows -t superbot3 -F "#{window_name}" 2>/dev/null', { encoding: 'utf-8' });
    return output.split('\n').map(s => s.trim()).includes(windowName);
  } catch {
    return false;
  }
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function getSpaceConfig(name) {
  const configPath = path.join(SUPERBOT3_HOME, 'spaces', name, 'space.json');
  const config = readJsonSafe(configPath);
  if (!config) return null;
  config.running = isWindowRunning(name);
  return config;
}

function getInboxMessages(inboxPath) {
  try {
    return JSON.parse(fs.readFileSync(inboxPath, 'utf-8'));
  } catch {
    return [];
  }
}

const { writeToInbox } = require('../src/inbox');

// ── Health ───────────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({
    service: 'superbot3',
    status: 'ok',
    uptime: process.uptime(),
    home: SUPERBOT3_HOME,
    timestamp: new Date().toISOString(),
  });
});

// ── Spaces ───────────────────────────────────────────────────────────────────

app.get('/api/spaces', (req, res) => {
  const spacesDir = path.join(SUPERBOT3_HOME, 'spaces');
  try {
    const entries = fs.readdirSync(spacesDir, { withFileTypes: true });
    const spaces = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const config = getSpaceConfig(entry.name);
        if (config) spaces.push(config);
      }
    }
    res.json(spaces);
  } catch {
    res.json([]);
  }
});

app.get('/api/spaces/:name', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });
  res.json(config);
});

app.post('/api/spaces', (req, res) => {
  const { name, codeDir } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  try {
    const spaceCreate = require(path.join(SUPERBOT3_HOME, '..', 'superbot3', 'src', 'commands', 'space-create'));
    // Inline the creation logic rather than requiring the module (which calls process.exit)
    const slug = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
    const spaceDir = path.join(SUPERBOT3_HOME, 'spaces', slug);

    if (fs.existsSync(path.join(spaceDir, 'space.json'))) {
      return res.status(409).json({ error: `Space "${slug}" already exists` });
    }

    if (codeDir && !fs.existsSync(codeDir)) {
      return res.status(400).json({ error: `Code directory does not exist: ${codeDir}` });
    }

    // Create directories
    const dirs = [
      path.join(spaceDir, '.claude', 'skills'),
      path.join(spaceDir, '.claude', 'agents'),
      path.join(spaceDir, '.claude', 'plugins'),
      path.join(spaceDir, '.claude', 'teams', slug, 'inboxes'),
      path.join(spaceDir, 'knowledge'),
    ];
    dirs.forEach(d => fs.mkdirSync(d, { recursive: true }));

    // Copy templates
    const templateDir = path.join(SUPERBOT3_HOME, 'templates', 'default');
    if (fs.existsSync(templateDir)) {
      copyDirRecursive(templateDir, spaceDir);
    }

    // Write space.json
    const spaceConfig = {
      $schema: 'superbot3-space-v1',
      name: slug, slug, codeDir: codeDir || null,
      spaceDir, claudeConfigDir: path.join(spaceDir, '.claude'),
      active: true, created: new Date().toISOString(),
      sessionId: null, browser: { maxConcurrent: 1, cdpPort: 9222 },
    };
    fs.writeFileSync(path.join(spaceDir, 'space.json'), JSON.stringify(spaceConfig, null, 2));

    // Customize CLAUDE.md
    const claudeMdPath = path.join(spaceDir, '.claude', 'CLAUDE.md');
    if (fs.existsSync(claudeMdPath)) {
      let content = fs.readFileSync(claudeMdPath, 'utf-8');
      content = content.replace(/\{\{SPACE_NAME\}\}/g, slug);
      fs.writeFileSync(claudeMdPath, content);
    }

    // Setup auth
    try {
      const { setupConfigDir } = require(path.join(__dirname, '..', 'src', 'auth'));
      setupConfigDir(path.join(spaceDir, '.claude'), spaceDir);
    } catch {}

    res.json(spaceConfig);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else if (!fs.existsSync(destPath)) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ── Messages ─────────────────────────────────────────────────────────────────

app.post('/api/spaces/:name/message', async (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });

  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Text is required' });

  const inboxPath = path.join(config.claudeConfigDir, 'teams', config.slug, 'inboxes', 'team-lead.json');
  await writeToInbox(inboxPath, { from: 'user', text, summary: text.slice(0, 80) });
  res.json({ ok: true });
});

app.get('/api/spaces/:name/messages', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });

  const inboxDir = path.join(config.claudeConfigDir, 'teams', config.slug, 'inboxes');
  let messages = [];
  try {
    const files = fs.readdirSync(inboxDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const msgs = getInboxMessages(path.join(inboxDir, file));
      messages = messages.concat(msgs);
    }
  } catch {}
  messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  res.json(messages);
});

app.post('/api/master/message', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Text is required' });

  const inboxPath = path.join(SUPERBOT3_HOME, 'orchestrator', '.claude', 'teams', 'superbot3', 'inboxes', 'team-lead.json');
  await writeToInbox(inboxPath, { from: 'user', text, summary: text.slice(0, 80) });
  res.json({ ok: true });
});

app.get('/api/master/messages', (req, res) => {
  const inboxDir = path.join(SUPERBOT3_HOME, 'orchestrator', '.claude', 'teams', 'superbot3', 'inboxes');
  let messages = [];
  try {
    const files = fs.readdirSync(inboxDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const msgs = getInboxMessages(path.join(inboxDir, file));
      messages = messages.concat(msgs);
    }
  } catch {}
  messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  res.json(messages);
});

app.get('/api/master/status', (req, res) => {
  res.json({ running: isWindowRunning('master') });
});

// ── Conversation Logs ────────────────────────────────────────────────────────
// Read Claude's conversation from JSONL session logs

function findLatestSession(projectsDir) {
  try {
    const dirs = fs.readdirSync(projectsDir, { withFileTypes: true })
      .filter(d => d.isDirectory());
    let latest = null;
    let latestMtime = 0;
    for (const dir of dirs) {
      const dirPath = path.join(projectsDir, dir.name);
      const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.jsonl'));
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stat = fs.statSync(filePath);
        if (stat.mtimeMs > latestMtime) {
          latestMtime = stat.mtimeMs;
          latest = filePath;
        }
      }
    }
    return latest;
  } catch {
    return null;
  }
}

// Strip <teammate-message> XML wrapper from inbox-delivered messages
function unwrapTeammateMessage(text) {
  const match = text.match(/<teammate-message[^>]*>\n?([\s\S]*?)\n?<\/teammate-message>/);
  if (match) {
    // Extract the sender from teammate_id attribute
    const fromMatch = text.match(/teammate_id="([^"]+)"/);
    return { text: match[1].trim(), from: 'user' };
  }
  return null;
}

function parseConversation(jsonlPath) {
  if (!jsonlPath) return [];
  const messages = [];
  try {
    const lines = fs.readFileSync(jsonlPath, 'utf-8').split('\n').filter(Boolean);
    for (const line of lines) {
      const obj = JSON.parse(line);
      if (obj.type === 'user' && obj.message?.role === 'user') {
        const content = obj.message.content;
        let text = typeof content === 'string' ? content
          : Array.isArray(content) ? content.filter(b => b.type === 'text').map(b => b.text).join('\n')
          : '';
        text = text.trim();
        if (!text) continue;

        // Unwrap teammate-message XML if present (inbox-delivered messages)
        const unwrapped = unwrapTeammateMessage(text);
        if (unwrapped) {
          messages.push({
            from: unwrapped.from,
            text: unwrapped.text,
            timestamp: obj.timestamp || '',
            read: true,
            role: 'user',
          });
        } else {
          messages.push({
            from: obj.userType === 'external' ? 'user' : 'system',
            text,
            timestamp: obj.timestamp || '',
            read: true,
            role: 'user',
          });
        }
      } else if (obj.type === 'assistant' && obj.message?.role === 'assistant') {
        const content = obj.message.content;
        const texts = [];
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'text' && block.text?.trim()) {
              texts.push(block.text.trim());
            }
            // Extract actual response from SendMessage tool calls
            if (block.type === 'tool_use' && block.name === 'SendMessage' && block.input) {
              const msg = block.input.message;
              if (typeof msg === 'string' && msg.trim()) {
                texts.push(msg.trim());
              }
            }
          }
        }
        // Filter out terse tool summaries like "Replied to user with..."
        const meaningful = texts.filter(t => !t.match(/^Replied to \w+[ :]/)
          && !t.match(/^Responded to \w+[ :]/));
        if (meaningful.length > 0) {
          messages.push({
            from: 'assistant',
            text: meaningful.join('\n\n'),
            timestamp: obj.timestamp || '',
            read: true,
            role: 'assistant',
          });
        }
      }
    }
  } catch {}
  return messages;
}

app.get('/api/spaces/:name/conversation', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });

  const projectsDir = path.join(config.claudeConfigDir, 'projects');
  const sessionPath = findLatestSession(projectsDir);
  const messages = parseConversation(sessionPath);
  res.json(messages);
});

app.get('/api/master/conversation', (req, res) => {
  const projectsDir = path.join(SUPERBOT3_HOME, 'orchestrator', '.claude', 'projects');
  const sessionPath = findLatestSession(projectsDir);
  const messages = parseConversation(sessionPath);
  res.json(messages);
});

// ── Workers ──────────────────────────────────────────────────────────────────

app.get('/api/spaces/:name/workers', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });

  const teamsDir = path.join(config.claudeConfigDir, 'teams');
  let members = [];
  try {
    const teamDirs = fs.readdirSync(teamsDir, { withFileTypes: true });
    for (const d of teamDirs) {
      if (!d.isDirectory()) continue;
      const teamConfig = readJsonSafe(path.join(teamsDir, d.name, 'config.json'));
      if (teamConfig?.members) members = members.concat(teamConfig.members);
    }
  } catch {}
  res.json({ members });
});

// ── Schedules ────────────────────────────────────────────────────────────────

// Port of Claude Code's cronToHuman() from src/utils/cron.ts
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatLocalTime(minute, hour) {
  const d = new Date(2000, 0, 1, hour, minute);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function cronToHuman(cron) {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return cron;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  // Every N minutes: */N * * * *
  const everyMinMatch = minute.match(/^\*\/(\d+)$/);
  if (everyMinMatch && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    const n = parseInt(everyMinMatch[1], 10);
    return n === 1 ? 'Every minute' : `Every ${n} minutes`;
  }

  // Every hour: N * * * *
  if (minute.match(/^\d+$/) && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    const m = parseInt(minute, 10);
    if (m === 0) return 'Every hour';
    return `Every hour at :${m.toString().padStart(2, '0')}`;
  }

  // Every N hours: M */N * * *
  const everyHourMatch = hour.match(/^\*\/(\d+)$/);
  if (minute.match(/^\d+$/) && everyHourMatch && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    const n = parseInt(everyHourMatch[1], 10);
    const m = parseInt(minute, 10);
    const suffix = m === 0 ? '' : ` at :${m.toString().padStart(2, '0')}`;
    return n === 1 ? `Every hour${suffix}` : `Every ${n} hours${suffix}`;
  }

  // Remaining cases need numeric minute+hour
  if (!minute.match(/^\d+$/) || !hour.match(/^\d+$/)) return cron;
  const m = parseInt(minute, 10);
  const h = parseInt(hour, 10);

  // Daily at specific time: M H * * *
  if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return `Every day at ${formatLocalTime(m, h)}`;
  }

  // Specific day of week: M H * * D
  if (dayOfMonth === '*' && month === '*' && dayOfWeek.match(/^\d$/)) {
    const dayIndex = parseInt(dayOfWeek, 10) % 7;
    const dayName = DAY_NAMES[dayIndex];
    if (dayName) return `Every ${dayName} at ${formatLocalTime(m, h)}`;
  }

  // Weekdays: M H * * 1-5
  if (dayOfMonth === '*' && month === '*' && dayOfWeek === '1-5') {
    return `Weekdays at ${formatLocalTime(m, h)}`;
  }

  return cron;
}

app.get('/api/spaces/:name/schedules', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });

  const schedulePath = path.join(config.claudeConfigDir, 'scheduled_tasks.json');
  const data = readJsonSafe(schedulePath) || { tasks: [] };
  // Enrich each task with human-readable cron description
  const tasks = (data.tasks || []).map(t => ({
    ...t,
    humanCron: cronToHuman(t.cron),
  }));
  res.json({ tasks });
});

app.put('/api/spaces/:name/schedules', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });

  const { tasks } = req.body;
  const schedulePath = path.join(config.claudeConfigDir, 'scheduled_tasks.json');
  const data = { tasks: (tasks || []).map(t => ({ ...t, permanent: true })) };
  fs.writeFileSync(schedulePath, JSON.stringify(data, null, 2) + '\n');
  res.json({ ok: true });
});

app.post('/api/spaces/:name/schedules', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });

  const { cron, prompt, recurring } = req.body;
  if (!cron || !prompt) return res.status(400).json({ error: 'cron and prompt are required' });

  const schedulePath = path.join(config.claudeConfigDir, 'scheduled_tasks.json');
  const data = readJsonSafe(schedulePath) || { tasks: [] };
  const { randomUUID } = require('crypto');
  const task = {
    id: randomUUID().slice(0, 8),
    cron,
    prompt,
    createdAt: Date.now(),
    recurring: recurring !== false,
    permanent: true,
  };
  data.tasks.push(task);
  fs.mkdirSync(path.dirname(schedulePath), { recursive: true });
  fs.writeFileSync(schedulePath, JSON.stringify(data, null, 2) + '\n');
  res.json({ ...task, humanCron: cronToHuman(cron) });
});

app.delete('/api/spaces/:name/schedules/:id', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });

  const schedulePath = path.join(config.claudeConfigDir, 'scheduled_tasks.json');
  const data = readJsonSafe(schedulePath) || { tasks: [] };
  const before = data.tasks.length;
  data.tasks = data.tasks.filter(t => t.id !== req.params.id);
  if (data.tasks.length === before) return res.status(404).json({ error: 'Task not found' });
  fs.writeFileSync(schedulePath, JSON.stringify(data, null, 2) + '\n');
  res.json({ ok: true });
});

// ── Knowledge ────────────────────────────────────────────────────────────────

app.get('/api/spaces/:name/knowledge', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });

  const knowledgeDir = path.join(config.spaceDir, 'knowledge');
  try {
    const entries = fs.readdirSync(knowledgeDir, { withFileTypes: true });
    const files = entries
      .filter(e => e.isFile() && e.name.endsWith('.md'))
      .map(e => {
        const stat = fs.statSync(path.join(knowledgeDir, e.name));
        return { name: e.name, path: path.join(knowledgeDir, e.name), size: stat.size, modified: stat.mtime.toISOString() };
      });
    res.json(files);
  } catch {
    res.json([]);
  }
});

app.get('/api/spaces/:name/knowledge/:file', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });

  const filePath = path.join(config.spaceDir, 'knowledge', req.params.file);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

  const content = fs.readFileSync(filePath, 'utf-8');
  res.json({ content });
});

app.put('/api/spaces/:name/knowledge/:file', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });

  const filePath = path.join(config.spaceDir, 'knowledge', req.params.file);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, req.body.content, 'utf-8');
  res.json({ ok: true });
});

app.delete('/api/spaces/:name/knowledge/:file', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });

  const filePath = path.join(config.spaceDir, 'knowledge', req.params.file);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

  fs.unlinkSync(filePath);
  res.json({ ok: true });
});

// ── Plugins ──────────────────────────────────────────────────────────────────

/** Read plugins from a single marketplace directory (cloned repo or flat JSON) */
function readMarketplaceDir(mpDir, marketplaceName) {
  const plugins = [];
  // Style 1: cloned repo with .claude-plugin/marketplace.json
  const clonedPath = path.join(mpDir, '.claude-plugin', 'marketplace.json');
  if (fs.existsSync(clonedPath)) {
    try {
      const mp = JSON.parse(fs.readFileSync(clonedPath, 'utf-8'));
      if (mp.plugins) {
        for (const p of mp.plugins) plugins.push({ ...p, marketplace: marketplaceName });
      }
    } catch { /* skip */ }
    return plugins;
  }
  // Style 2: flat JSON file (supercharge-style, the marketplace entry IS a JSON file)
  try {
    const stat = fs.statSync(mpDir);
    if (stat.isFile()) {
      const mp = JSON.parse(fs.readFileSync(mpDir, 'utf-8'));
      if (mp.plugins) {
        for (const p of mp.plugins) plugins.push({ ...p, marketplace: marketplaceName });
      }
    }
  } catch { /* skip */ }
  return plugins;
}

/** Read marketplace plugins from a given marketplaces directory */
function readMarketplacesFrom(marketplacesDir) {
  const plugins = [];
  try {
    const entries = fs.readdirSync(marketplacesDir, { withFileTypes: true });
    for (const entry of entries) {
      const mpPath = path.join(marketplacesDir, entry.name);
      plugins.push(...readMarketplaceDir(mpPath, entry.name));
    }
  } catch { /* dir doesn't exist */ }
  return plugins;
}

/** Read all marketplace plugins: space-local + global ~/.claude */
function getMarketplacePlugins(claudeConfigDir) {
  const seen = new Set();
  const plugins = [];

  // Space-local marketplaces
  const spacePlugins = readMarketplacesFrom(path.join(claudeConfigDir, 'plugins', 'marketplaces'));
  for (const p of spacePlugins) {
    const key = `${p.name}@${p.marketplace}`;
    if (!seen.has(key)) { seen.add(key); plugins.push(p); }
  }

  // Global ~/.claude marketplaces (fallback for marketplaces not in the space)
  const globalDir = path.join(require('os').homedir(), '.claude', 'plugins', 'marketplaces');
  const globalPlugins = readMarketplacesFrom(globalDir);
  for (const p of globalPlugins) {
    const key = `${p.name}@${p.marketplace}`;
    if (!seen.has(key)) { seen.add(key); plugins.push(p); }
  }

  return plugins;
}

/** Read installed_plugins.json for a space */
function getInstalledPlugins(claudeConfigDir) {
  const ipPath = path.join(claudeConfigDir, 'plugins', 'installed_plugins.json');
  const data = readJsonSafe(ipPath);
  if (!data || !data.plugins) return {};
  return data.plugins; // { "name@marketplace": [ { scope, installPath, ... } ] }
}

/** Read enabledPlugins from space settings.json */
function getEnabledPlugins(claudeConfigDir) {
  const settingsPath = path.join(claudeConfigDir, 'settings.json');
  const settings = readJsonSafe(settingsPath);
  if (!settings || !settings.enabledPlugins) return {};
  return settings.enabledPlugins; // { "name@marketplace": true/false }
}

app.get('/api/spaces/:name/plugins', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });

  const marketplacePlugins = getMarketplacePlugins(config.claudeConfigDir);
  const installed = getInstalledPlugins(config.claudeConfigDir);
  const enabled = getEnabledPlugins(config.claudeConfigDir);

  // Build enriched plugin list
  const results = marketplacePlugins.map(mp => {
    const key = `${mp.name}@${mp.marketplace}`;
    const installEntries = installed[key] || [];
    const isInstalled = installEntries.length > 0;
    const isEnabled = enabled[key] === true;
    return {
      name: mp.name,
      description: mp.description || '',
      category: mp.category || 'other',
      marketplace: mp.marketplace,
      homepage: mp.homepage || null,
      source: typeof mp.source === 'string' ? mp.source : (mp.source?.url || null),
      installed: isInstalled,
      enabled: isEnabled,
      version: mp.version || installEntries[0]?.version || null,
      skills: mp.skills || null,
      lspServers: mp.lspServers ? Object.keys(mp.lspServers) : null,
      tags: mp.tags || null,
      keywords: mp.keywords || null,
      strict: mp.strict ?? null,
      author: mp.author?.name || null,
    };
  });

  // Sort: enabled first, then installed, then alphabetical
  results.sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    if (a.installed !== b.installed) return a.installed ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  res.json(results);
});

/** Resolve a plugin's directory on disk given its name and marketplace */
function resolvePluginDir(claudeConfigDir, pluginName, marketplace) {
  // 1. Check space-local marketplace (cloned repo with external_plugins/ and plugins/)
  const spaceMpDir = path.join(claudeConfigDir, 'plugins', 'marketplaces', marketplace);
  for (const sub of ['external_plugins', 'plugins']) {
    const candidate = path.join(spaceMpDir, sub, pluginName);
    if (fs.existsSync(candidate)) return candidate;
  }

  // 2. Check global installed plugin cache
  const cacheDir = path.join(require('os').homedir(), '.claude', 'plugins', 'cache', marketplace, pluginName);
  if (fs.existsSync(cacheDir)) {
    // Find latest version dir
    try {
      const versions = fs.readdirSync(cacheDir, { withFileTypes: true })
        .filter(e => e.isDirectory() && !e.name.startsWith('.'))
        .map(e => e.name);
      if (versions.length > 0) return path.join(cacheDir, versions[versions.length - 1]);
    } catch { /* skip */ }
  }

  // 3. Check global marketplace (cloned repo style)
  const globalMpDir = path.join(require('os').homedir(), '.claude', 'plugins', 'marketplaces', marketplace);
  for (const sub of ['external_plugins', 'plugins']) {
    const candidate = path.join(globalMpDir, sub, pluginName);
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}

/** Recursively list files in a directory, returning relative paths */
function listFilesRecursive(dir, prefix = '') {
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      // Skip hidden dirs like .git, node_modules, bun.lock
      if (entry.name.startsWith('.') && entry.isDirectory()) continue;
      if (entry.name === 'node_modules') continue;

      const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        results.push({ path: relPath, type: 'dir' });
        results.push(...listFilesRecursive(path.join(dir, entry.name), relPath));
      } else {
        const stat = fs.statSync(path.join(dir, entry.name));
        results.push({ path: relPath, type: 'file', size: stat.size });
      }
    }
  } catch { /* skip */ }
  return results;
}

/** List files in a plugin */
app.get('/api/spaces/:name/plugins/:marketplace/:plugin/files', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });

  const pluginDir = resolvePluginDir(config.claudeConfigDir, req.params.plugin, req.params.marketplace);
  if (!pluginDir) return res.status(404).json({ error: 'Plugin not found on disk' });

  const files = listFilesRecursive(pluginDir);
  res.json({ root: pluginDir, files });
});

/** Read a single file from a plugin */
app.get('/api/spaces/:name/plugins/:marketplace/:plugin/file', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });

  const pluginDir = resolvePluginDir(config.claudeConfigDir, req.params.plugin, req.params.marketplace);
  if (!pluginDir) return res.status(404).json({ error: 'Plugin not found on disk' });

  const relPath = req.query.path;
  if (!relPath) return res.status(400).json({ error: 'path query param required' });
  const filePath = path.join(pluginDir, relPath);

  // Security: ensure resolved path is inside pluginDir
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(pluginDir))) {
    return res.status(403).json({ error: 'Access denied' });
  }

  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    return res.status(404).json({ error: 'File not found' });
  }

  // Only serve text files up to 500KB
  const stat = fs.statSync(resolved);
  if (stat.size > 500 * 1024) {
    return res.json({ content: null, error: 'File too large', size: stat.size });
  }

  try {
    const content = fs.readFileSync(resolved, 'utf-8');
    res.json({ content, size: stat.size, path: relPath });
  } catch {
    res.json({ content: null, error: 'Binary file', size: stat.size });
  }
});

/** Toggle a plugin enabled/disabled in the space's settings.json */
app.post('/api/spaces/:name/plugins/toggle', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });

  const { pluginKey, enabled } = req.body;
  if (!pluginKey) return res.status(400).json({ error: 'pluginKey required' });

  const settingsPath = path.join(config.claudeConfigDir, 'settings.json');
  const settings = readJsonSafe(settingsPath) || { permissions: { allow: [], deny: [] } };
  if (!settings.enabledPlugins) settings.enabledPlugins = {};
  settings.enabledPlugins[pluginKey] = !!enabled;
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  res.json({ ok: true, enabled: !!enabled });
});

/** Add a marketplace to the space's known_marketplaces.json */
app.post('/api/spaces/:name/plugins/add-marketplace', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });

  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });

  const slug = url.replace(/.*\//, '').replace(/\.git$/, '').replace(/\.json$/, '') || 'custom';

  const kmPath = path.join(config.claudeConfigDir, 'plugins', 'known_marketplaces.json');
  const km = readJsonSafe(kmPath) || {};
  km[slug] = {
    source: { source: url.includes('github.com') ? 'github' : 'url', url },
    installLocation: path.join(config.claudeConfigDir, 'plugins', 'marketplaces', slug),
    lastUpdated: new Date().toISOString(),
  };
  fs.writeFileSync(kmPath, JSON.stringify(km, null, 2));
  res.json({ ok: true, slug });
});

// ── Skills ───────────────────────────────────────────────────────────────────

/** Parse YAML frontmatter from a markdown string */
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const fm = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      let val = line.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      fm[key] = val;
    }
  }
  return fm;
}

app.get('/api/spaces/:name/skills', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });

  const skillsDir = path.join(config.claudeConfigDir, 'skills');
  try {
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    const skills = entries
      .filter(e => e.isDirectory())
      .map(e => {
        const skillMd = path.join(skillsDir, e.name, 'SKILL.md');
        let description = '';
        if (fs.existsSync(skillMd)) {
          const fm = parseFrontmatter(fs.readFileSync(skillMd, 'utf-8'));
          description = fm.description || '';
        }
        return { dirname: e.name, name: e.name, description };
      });
    res.json(skills);
  } catch {
    res.json([]);
  }
});

app.get('/api/spaces/:name/skills/:skill', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });

  const skillDir = path.join(config.claudeConfigDir, 'skills', req.params.skill);
  if (!fs.existsSync(skillDir)) return res.status(404).json({ error: 'Skill not found' });

  const skillMd = path.join(skillDir, 'SKILL.md');
  let content = '', frontmatter = {};
  if (fs.existsSync(skillMd)) {
    content = fs.readFileSync(skillMd, 'utf-8');
    frontmatter = parseFrontmatter(content);
  }
  const files = listFilesRecursive(skillDir);
  res.json({ name: req.params.skill, content, frontmatter, files });
});

app.get('/api/spaces/:name/skills/:skill/file', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });

  const skillDir = path.join(config.claudeConfigDir, 'skills', req.params.skill);
  if (!fs.existsSync(skillDir)) return res.status(404).json({ error: 'Skill not found' });

  const relPath = req.query.path;
  if (!relPath) return res.status(400).json({ error: 'path query param required' });

  const filePath = path.resolve(path.join(skillDir, relPath));
  if (!filePath.startsWith(path.resolve(skillDir))) return res.status(403).json({ error: 'Access denied' });
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return res.status(404).json({ error: 'File not found' });

  const stat = fs.statSync(filePath);
  if (stat.size > 500 * 1024) return res.json({ content: null, error: 'File too large', size: stat.size });
  try {
    res.json({ content: fs.readFileSync(filePath, 'utf-8'), size: stat.size, path: relPath });
  } catch {
    res.json({ content: null, error: 'Binary file', size: stat.size });
  }
});

/** Create a new skill directory with SKILL.md */
app.post('/api/spaces/:name/skills', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });

  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });

  const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
  const skillDir = path.join(config.claudeConfigDir, 'skills', safeName);

  if (fs.existsSync(skillDir)) return res.status(409).json({ error: 'Skill already exists' });

  fs.mkdirSync(skillDir, { recursive: true });
  const skillMd = `---\nname: ${safeName}\ndescription: "${(description || '').replace(/"/g, '\\"')}"\n---\n\n# ${safeName}\n\nAdd your skill documentation here.\n`;
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillMd);
  res.json({ ok: true, name: safeName });
});

// ── Agents ───────────────────────────────────────────────────────────────────

app.get('/api/spaces/:name/agents', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });

  const agentsDir = path.join(config.claudeConfigDir, 'agents');
  try {
    const entries = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));
    const agents = entries.map(f => {
      const content = fs.readFileSync(path.join(agentsDir, f), 'utf-8');
      const fm = parseFrontmatter(content);
      return {
        filename: f,
        name: fm.name || f.replace('.md', ''),
        description: fm.description || '',
        model: fm.model || null,
        permissionMode: fm.permissionMode || null,
      };
    });
    res.json(agents);
  } catch {
    res.json([]);
  }
});

app.get('/api/spaces/:name/agents/:agent', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });

  const agentFile = path.join(config.claudeConfigDir, 'agents', req.params.agent);
  if (!fs.existsSync(agentFile)) return res.status(404).json({ error: 'Agent not found' });

  const content = fs.readFileSync(agentFile, 'utf-8');
  const frontmatter = parseFrontmatter(content);
  res.json({ filename: req.params.agent, content, frontmatter });
});

// ── WebSocket for real-time updates ──────────────────────────────────────────

let wss = null;
try {
  const { WebSocketServer } = require('ws');
  const server = http.createServer(app);

  wss = new WebSocketServer({ server, path: '/ws' });

  // Watch inbox directories for changes and broadcast
  const chokidar = require('chokidar');

  const watchPaths = [
    path.join(SUPERBOT3_HOME, 'orchestrator', '.claude', 'teams', '**', 'inboxes', '*.json'),
    path.join(SUPERBOT3_HOME, 'spaces', '*', '.claude', 'teams', '**', 'inboxes', '*.json'),
    // Watch conversation JSONL files for real-time Claude responses
    path.join(SUPERBOT3_HOME, 'orchestrator', '.claude', 'projects', '**', '*.jsonl'),
    path.join(SUPERBOT3_HOME, 'spaces', '*', '.claude', 'projects', '**', '*.jsonl'),
  ];

  const watcher = chokidar.watch(watchPaths, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
  });

  watcher.on('change', (filePath) => {
    let type = 'unknown';
    let space = null;
    let eventType = 'inbox_update';

    if (filePath.endsWith('.jsonl')) {
      eventType = 'conversation_update';
    }

    if (filePath.includes('/orchestrator/')) {
      type = 'master';
    } else {
      const match = filePath.match(/spaces\/([^/]+)\//);
      if (match) {
        type = 'space';
        space = match[1];
      }
    }

    const payload = JSON.stringify({ type: eventType, source: type, space });
    wss.clients.forEach(client => {
      if (client.readyState === 1) client.send(payload);
    });
  });

  server.listen(PORT, () => {
    console.log(`superbot3 broker running on port ${PORT} (WebSocket enabled)`);
    console.log(`Home: ${SUPERBOT3_HOME}`);
  });
} catch (err) {
  // Fallback: no WebSocket (ws or chokidar not installed)
  console.log('WebSocket dependencies not found, running HTTP-only mode');
  app.listen(PORT, () => {
    console.log(`superbot3 broker running on port ${PORT}`);
    console.log(`Home: ${SUPERBOT3_HOME}`);
  });
}

// ── SPA fallback ─────────────────────────────────────────────────────────────

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  const indexPath = path.join(distPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Dashboard not built. Run: cd broker/dashboard-ui && npm run build');
  }
});
