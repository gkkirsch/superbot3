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

app.post('/api/spaces', async (req, res) => {
  const { name, codeDir } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  try {
    const { createSpace } = require(path.join(__dirname, '..', 'src', 'commands', 'space-create'));
    const resolvedCodeDir = codeDir ? path.resolve(codeDir) : null;
    const spaceConfig = createSpace(SUPERBOT3_HOME, name, resolvedCodeDir);

    // Auto-start the space if tmux session exists
    try {
      const config = JSON.parse(fs.readFileSync(path.join(SUPERBOT3_HOME, 'config.json'), 'utf-8'));
      const model = config.model || 'claude-opus-4-6';
      const spaceWorkDir = spaceConfig.codeDir || spaceConfig.spaceDir;

      // Ensure inbox exists
      const inboxDir = path.join(spaceConfig.claudeConfigDir, 'teams', spaceConfig.slug, 'inboxes');
      fs.mkdirSync(inboxDir, { recursive: true });
      const inboxPath = path.join(inboxDir, 'team-lead.json');
      if (!fs.existsSync(inboxPath)) {
        fs.writeFileSync(inboxPath, '[]', 'utf-8');
      }

      // Write launch script
      const scriptDir = path.join(SUPERBOT3_HOME, '.tmp');
      fs.mkdirSync(scriptDir, { recursive: true });
      const scriptPath = path.join(scriptDir, `launch-${spaceConfig.slug}.sh`);
      const teamArgs = `--agent-id 'team-lead@${spaceConfig.slug}' --agent-name 'team-lead' --team-name '${spaceConfig.slug}'`;
      const script = `#!/bin/bash\ncd "${spaceWorkDir}"\nexport CLAUDE_CONFIG_DIR="${spaceConfig.claudeConfigDir}"\nexport CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1\nexec claude --dangerously-skip-permissions --model ${model} ${teamArgs}\n`;
      fs.writeFileSync(scriptPath, script, { mode: 0o755 });

      // Launch in tmux if session exists
      if (isWindowRunning('master') || isWindowRunning(spaceConfig.slug)) {
        execSync(`tmux new-window -t superbot3 -n ${spaceConfig.slug} "bash ${scriptPath}"`, { timeout: 5000 });
        // Send startup prompt
        const startupPrompt = 'Read your CLAUDE.md. Scan knowledge/ for context. Report your identity, skills, agents, and knowledge files.';
        await writeToInbox(inboxPath, { from: 'superbot3', text: startupPrompt });
      }
    } catch (startErr) {
      // Space was created successfully but auto-start failed — not fatal
      console.log(`Note: Space created but auto-start failed: ${startErr.message}`);
    }

    res.json(spaceConfig);
  } catch (err) {
    if (err.message.includes('already exists')) {
      return res.status(409).json({ error: err.message });
    }
    if (err.message.includes('does not exist')) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

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
  const spaceInstalled = getInstalledPlugins(config.claudeConfigDir);
  const enabled = getEnabledPlugins(config.claudeConfigDir);

  // Build enriched plugin list (space-only — no global fallback)
  const results = marketplacePlugins.map(mp => {
    const key = `${mp.name}@${mp.marketplace}`;
    const installEntries = spaceInstalled[key] || [];
    const isInstalled = installEntries.length > 0;
    const hasFiles = resolvePluginDir(config.claudeConfigDir, mp.name, mp.marketplace) !== null;
    const isEnabled = enabled[key] === true;
    return {
      name: mp.name,
      description: mp.description || '',
      category: mp.category || 'other',
      marketplace: mp.marketplace,
      homepage: mp.homepage || null,
      source: typeof mp.source === 'string' ? mp.source : (mp.source?.url || null),
      installed: isInstalled,
      hasFiles: hasFiles,
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

/** Find latest version directory inside a cache dir */
function findLatestVersion(cacheDir) {
  try {
    const versions = fs.readdirSync(cacheDir, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => e.name);
    if (versions.length > 0) return path.join(cacheDir, versions[versions.length - 1]);
  } catch { /* skip */ }
  return null;
}

/** Resolve a plugin's directory on disk given its name and marketplace.
 *  Space-isolated: only checks paths within the space's CLAUDE_CONFIG_DIR.
 *  Resolution order:
 *  1. Explicit installPath from space's installed_plugins.json
 *  2. Space-local plugin cache (<space>/.claude/plugins/cache/)
 *  3. Space-local marketplace repo (external_plugins/ and plugins/)
 */
function resolvePluginDir(claudeConfigDir, pluginName, marketplace) {
  const key = `${pluginName}@${marketplace}`;

  // 1. Check space installed_plugins.json for explicit installPath
  const spaceIp = readJsonSafe(path.join(claudeConfigDir, 'plugins', 'installed_plugins.json'));
  if (spaceIp?.plugins?.[key]?.[0]?.installPath) {
    const ip = spaceIp.plugins[key][0].installPath;
    if (fs.existsSync(ip)) return ip;
  }

  // 2. Space-local plugin cache
  const spaceCacheDir = path.join(claudeConfigDir, 'plugins', 'cache', marketplace, pluginName);
  const spaceVersion = findLatestVersion(spaceCacheDir);
  if (spaceVersion) return spaceVersion;

  // 3. Space-local marketplace (cloned repo with external_plugins/ and plugins/)
  const spaceMpDir = path.join(claudeConfigDir, 'plugins', 'marketplaces', marketplace);
  for (const sub of ['external_plugins', 'plugins']) {
    const candidate = path.join(spaceMpDir, sub, pluginName);
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

/** Scan a directory for skill subdirectories (each containing SKILL.md or SKILL.md.disabled) */
function scanSkillsDir(skillsDir, source) {
  const results = [];
  try {
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const dirPath = path.join(skillsDir, e.name);
      const skillMd = path.join(dirPath, 'SKILL.md');
      const disabledMd = path.join(dirPath, 'SKILL.md.disabled');
      const hasActive = fs.existsSync(skillMd);
      const hasDisabled = fs.existsSync(disabledMd);
      if (!hasActive && !hasDisabled) continue;
      let description = '';
      const mdPath = hasActive ? skillMd : disabledMd;
      const fm = parseFrontmatter(fs.readFileSync(mdPath, 'utf-8'));
      description = fm.description || '';
      results.push({
        dirname: e.name,
        name: fm.name || e.name,
        description,
        source,
        path: dirPath,
        hasFiles: true,
        enabled: hasActive,
      });
    }
  } catch { /* dir doesn't exist */ }
  return results;
}

app.get('/api/spaces/:name/skills', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });

  const allSkills = [];

  // 1. Space skills
  const spaceSkillsDir = path.join(config.claudeConfigDir, 'skills');
  allSkills.push(...scanSkillsDir(spaceSkillsDir, 'space'));

  // 2. Plugin skills — for each enabled plugin, scan its .claude-plugin/skills/ dir
  const enabled = getEnabledPlugins(config.claudeConfigDir);
  for (const [pluginKey, isEnabled] of Object.entries(enabled)) {
    if (!isEnabled) continue;
    const atIdx = pluginKey.lastIndexOf('@');
    if (atIdx <= 0) continue;
    const pluginName = pluginKey.slice(0, atIdx);
    const marketplace = pluginKey.slice(atIdx + 1);
    const pluginDir = resolvePluginDir(config.claudeConfigDir, pluginName, marketplace);
    if (!pluginDir) continue;
    // Check both .claude-plugin/skills/ and skills/ (different plugin layouts)
    for (const sub of ['.claude-plugin/skills', 'skills']) {
      const pluginSkillsDir = path.join(pluginDir, sub);
      if (fs.existsSync(pluginSkillsDir)) {
        const pluginSkills = scanSkillsDir(pluginSkillsDir, `plugin:${pluginName}`);
        // Plugin skills are always enabled (controlled by plugin toggle)
        pluginSkills.forEach(s => { s.enabled = true; });
        allSkills.push(...pluginSkills);
        break; // use first found layout
      }
    }
  }

  // 3. Project skills — from codeDir's .claude/skills/ (if codeDir is set and different from spaceDir)
  if (config.codeDir && config.codeDir !== config.spaceDir) {
    const projectSkillsDir = path.join(config.codeDir, '.claude', 'skills');
    allSkills.push(...scanSkillsDir(projectSkillsDir, 'project'));
  }

  res.json(allSkills);
});

/** Resolve a skill directory given name and optional source query param */
function resolveSkillDir(config, skillName, source) {
  if (source === 'project') {
    if (config.codeDir && config.codeDir !== config.spaceDir) {
      return path.join(config.codeDir, '.claude', 'skills', skillName);
    }
    return null;
  }
  if (source && source.startsWith('plugin:')) {
    const pluginName = source.slice('plugin:'.length);
    const enabled = getEnabledPlugins(config.claudeConfigDir);
    for (const [pluginKey, isEnabled] of Object.entries(enabled)) {
      if (!isEnabled) continue;
      const atIdx = pluginKey.lastIndexOf('@');
      if (atIdx <= 0) continue;
      const pName = pluginKey.slice(0, atIdx);
      if (pName !== pluginName) continue;
      const marketplace = pluginKey.slice(atIdx + 1);
      const pluginDir = resolvePluginDir(config.claudeConfigDir, pName, marketplace);
      if (!pluginDir) continue;
      for (const sub of ['.claude-plugin/skills', 'skills']) {
        const candidate = path.join(pluginDir, sub, skillName);
        if (fs.existsSync(candidate)) return candidate;
      }
    }
    return null;
  }
  // Default: space skill
  return path.join(config.claudeConfigDir, 'skills', skillName);
}

app.get('/api/spaces/:name/skills/:skill', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });

  const source = req.query.source || 'space';
  const skillDir = resolveSkillDir(config, req.params.skill, source);
  if (!skillDir || !fs.existsSync(skillDir)) return res.status(404).json({ error: 'Skill not found' });

  // Check both SKILL.md and SKILL.md.disabled
  let skillMdPath = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) {
    skillMdPath = path.join(skillDir, 'SKILL.md.disabled');
  }
  let content = '', frontmatter = {};
  if (fs.existsSync(skillMdPath)) {
    content = fs.readFileSync(skillMdPath, 'utf-8');
    frontmatter = parseFrontmatter(content);
  }
  const files = listFilesRecursive(skillDir);
  res.json({ name: req.params.skill, content, frontmatter, files, source });
});

app.get('/api/spaces/:name/skills/:skill/file', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });

  const source = req.query.source || 'space';
  const skillDir = resolveSkillDir(config, req.params.skill, source);
  if (!skillDir || !fs.existsSync(skillDir)) return res.status(404).json({ error: 'Skill not found' });

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

/** Toggle a space skill enabled/disabled by renaming SKILL.md <-> SKILL.md.disabled */
app.post('/api/spaces/:name/skills/:skill/toggle', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });

  const { enabled } = req.body;
  const skillDir = path.join(config.claudeConfigDir, 'skills', req.params.skill);
  if (!fs.existsSync(skillDir)) return res.status(404).json({ error: 'Skill not found' });

  const activePath = path.join(skillDir, 'SKILL.md');
  const disabledPath = path.join(skillDir, 'SKILL.md.disabled');

  if (enabled) {
    // Enable: rename .disabled -> active
    if (fs.existsSync(disabledPath)) {
      fs.renameSync(disabledPath, activePath);
    }
  } else {
    // Disable: rename active -> .disabled
    if (fs.existsSync(activePath)) {
      fs.renameSync(activePath, disabledPath);
    }
  }

  res.json({ ok: true, enabled: !!enabled });
});

// ── Agents ───────────────────────────────────────────────────────────────────

/** Scan a directory for agent .md files */
function scanAgentsDir(agentsDir, source) {
  const results = [];
  try {
    const entries = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));
    for (const f of entries) {
      const filePath = path.join(agentsDir, f);
      const content = fs.readFileSync(filePath, 'utf-8');
      const fm = parseFrontmatter(content);
      results.push({
        filename: f,
        name: fm.name || f.replace('.md', ''),
        description: fm.description || '',
        model: fm.model || null,
        permissionMode: fm.permissionMode || null,
        source,
        path: filePath,
      });
    }
  } catch { /* dir doesn't exist */ }
  return results;
}

app.get('/api/spaces/:name/agents', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });

  const allAgents = [];

  // 1. Space agents
  const spaceAgentsDir = path.join(config.claudeConfigDir, 'agents');
  allAgents.push(...scanAgentsDir(spaceAgentsDir, 'space'));

  // 2. Plugin agents — for each enabled plugin, scan its agents/ dir
  const enabled = getEnabledPlugins(config.claudeConfigDir);
  for (const [pluginKey, isEnabled] of Object.entries(enabled)) {
    if (!isEnabled) continue;
    const atIdx = pluginKey.lastIndexOf('@');
    if (atIdx <= 0) continue;
    const pluginName = pluginKey.slice(0, atIdx);
    const marketplace = pluginKey.slice(atIdx + 1);
    const pluginDir = resolvePluginDir(config.claudeConfigDir, pluginName, marketplace);
    if (!pluginDir) continue;
    for (const sub of ['.claude-plugin/agents', 'agents']) {
      const pluginAgentsDir = path.join(pluginDir, sub);
      if (fs.existsSync(pluginAgentsDir)) {
        allAgents.push(...scanAgentsDir(pluginAgentsDir, `plugin:${pluginName}`));
        break;
      }
    }
  }

  // 3. Project agents — from codeDir's .claude/agents/ (if codeDir is set and different from spaceDir)
  if (config.codeDir && config.codeDir !== config.spaceDir) {
    const projectAgentsDir = path.join(config.codeDir, '.claude', 'agents');
    allAgents.push(...scanAgentsDir(projectAgentsDir, 'project'));
  }

  res.json(allAgents);
});

/** Resolve an agent file given filename and optional source */
function resolveAgentFile(config, agentFilename, source) {
  if (source === 'project') {
    if (config.codeDir && config.codeDir !== config.spaceDir) {
      return path.join(config.codeDir, '.claude', 'agents', agentFilename);
    }
    return null;
  }
  if (source && source.startsWith('plugin:')) {
    const pluginName = source.slice('plugin:'.length);
    const enabled = getEnabledPlugins(config.claudeConfigDir);
    for (const [pluginKey, isEnabled] of Object.entries(enabled)) {
      if (!isEnabled) continue;
      const atIdx = pluginKey.lastIndexOf('@');
      if (atIdx <= 0) continue;
      const pName = pluginKey.slice(0, atIdx);
      if (pName !== pluginName) continue;
      const marketplace = pluginKey.slice(atIdx + 1);
      const pluginDir = resolvePluginDir(config.claudeConfigDir, pName, marketplace);
      if (!pluginDir) continue;
      for (const sub of ['.claude-plugin/agents', 'agents']) {
        const candidate = path.join(pluginDir, sub, agentFilename);
        if (fs.existsSync(candidate)) return candidate;
      }
    }
    return null;
  }
  return path.join(config.claudeConfigDir, 'agents', agentFilename);
}

app.get('/api/spaces/:name/agents/:agent', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });

  const source = req.query.source || 'space';
  const agentFile = resolveAgentFile(config, req.params.agent, source);
  if (!agentFile || !fs.existsSync(agentFile)) return res.status(404).json({ error: 'Agent not found' });

  const content = fs.readFileSync(agentFile, 'utf-8');
  const frontmatter = parseFrontmatter(content);
  res.json({ filename: req.params.agent, content, frontmatter, source });
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
