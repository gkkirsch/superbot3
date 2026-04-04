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

function writeInboxMessage(inboxPath, text) {
  fs.mkdirSync(path.dirname(inboxPath), { recursive: true });
  try { fs.writeFileSync(inboxPath, '[]', { flag: 'wx' }); } catch {}
  const messages = JSON.parse(fs.readFileSync(inboxPath, 'utf-8'));
  messages.push({
    from: 'dashboard',
    text,
    timestamp: new Date().toISOString(),
    read: false,
    summary: text.slice(0, 80),
  });
  fs.writeFileSync(inboxPath, JSON.stringify(messages, null, 2), 'utf-8');
}

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

app.post('/api/spaces/:name/message', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });

  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Text is required' });

  const inboxPath = path.join(config.claudeConfigDir, 'teams', config.slug, 'inboxes', 'team-lead.json');
  writeInboxMessage(inboxPath, text);
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

app.post('/api/master/message', (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Text is required' });

  const inboxPath = path.join(SUPERBOT3_HOME, 'orchestrator', '.claude', 'teams', 'superbot3', 'inboxes', 'team-lead.json');
  writeInboxMessage(inboxPath, text);
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

function parseConversation(jsonlPath) {
  if (!jsonlPath) return [];
  const messages = [];
  try {
    const lines = fs.readFileSync(jsonlPath, 'utf-8').split('\n').filter(Boolean);
    for (const line of lines) {
      const obj = JSON.parse(line);
      if (obj.type === 'user' && obj.message?.role === 'user') {
        const content = obj.message.content;
        const text = typeof content === 'string' ? content
          : Array.isArray(content) ? content.filter(b => b.type === 'text').map(b => b.text).join('\n')
          : '';
        if (text.trim()) {
          messages.push({
            from: obj.userType === 'external' ? 'user' : 'system',
            text: text.trim(),
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
          }
        }
        if (texts.length > 0) {
          messages.push({
            from: 'assistant',
            text: texts.join('\n\n'),
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

app.get('/api/spaces/:name/schedules', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });

  const schedulePath = path.join(config.claudeConfigDir, 'scheduled_tasks.json');
  const data = readJsonSafe(schedulePath) || { tasks: [] };
  res.json(data);
});

app.put('/api/spaces/:name/schedules', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });

  const { tasks } = req.body;
  const schedulePath = path.join(config.claudeConfigDir, 'scheduled_tasks.json');
  const data = { tasks: (tasks || []).map(t => ({ ...t, permanent: true })) };
  fs.writeFileSync(schedulePath, JSON.stringify(data, null, 2));
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

// ── Plugins ──────────────────────────────────────────────────────────────────

app.get('/api/spaces/:name/plugins', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });

  const pluginsDir = path.join(config.claudeConfigDir, 'plugins');
  try {
    const entries = fs.readdirSync(pluginsDir, { withFileTypes: true });
    res.json(entries.filter(e => e.isDirectory()).map(e => e.name));
  } catch {
    res.json([]);
  }
});

// ── Skills ───────────────────────────────────────────────────────────────────

app.get('/api/spaces/:name/skills', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });

  const skillsDir = path.join(config.claudeConfigDir, 'skills');
  try {
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    const skills = entries
      .filter(e => e.isDirectory())
      .map(e => ({ dirname: e.name, name: e.name }));
    res.json(skills);
  } catch {
    res.json([]);
  }
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
      const nameMatch = content.match(/^name:\s*(.+)/m);
      return { filename: f, name: nameMatch ? nameMatch[1].trim() : f.replace('.md', '') };
    });
    res.json(agents);
  } catch {
    res.json([]);
  }
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
