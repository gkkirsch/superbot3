const express = require('express');
const path = require('path');
const fs = require('fs');
const { execSync, execFile } = require('child_process');
const http = require('http');

const app = express();
const PORT = process.env.SUPERBOT3_BROKER_PORT || 3100;
const SUPERBOT3_HOME = process.env.SUPERBOT3_HOME || path.join(require('os').homedir(), '.superbot3');

app.use(express.json({ limit: '10mb' }));

// CORS — allow Chrome extensions and local dev tools
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

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
  const space = state.getSpace(SUPERBOT3_HOME, name);
  if (!space) return null;
  space.running = isWindowRunning(name);
  // Compute paths for backward compat
  space.spaceDir = state.spaceDir(SUPERBOT3_HOME, name);
  space.claudeConfigDir = state.claudeConfigDir(SUPERBOT3_HOME, name);
  return space;
}

const { sendToPane, getSpacePaneTarget, getMasterPaneTarget, isSpaceWindowAlive, isPaneAlive, capturePaneOutput, getPaneInfo } = require('../src/tmuxMessage');
const state = require('../src/state');

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
  const spaces = state.getAllSpaces(SUPERBOT3_HOME)
    .filter(s => !s.archived)
    .map(s => {
      s.running = isWindowRunning(s.slug);
      s.spaceDir = state.spaceDir(SUPERBOT3_HOME, s.slug);
      s.claudeConfigDir = state.claudeConfigDir(SUPERBOT3_HOME, s.slug);
      return s;
    });
  res.json(spaces);
});

app.get('/api/spaces/:name', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });
  res.json(config);
});

app.post('/api/spaces/:name/browser', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });

  const port = process.env.SUPERBOT3_BROKER_PORT || 3100;
  const url = req.body.url || `http://localhost:${port}/browser-welcome?space=${config.slug}&name=${encodeURIComponent(config.name)}&color=${encodeURIComponent(config.color || '#706b63')}`;
  const { launchSpaceChrome, getCdpPort } = require(path.join(__dirname, '..', 'src', 'browserEnv'));
  const cdpPort = launchSpaceChrome(config.slug, config.spaceDir);

  // Navigate to the URL via CDP (or wait for Chrome to start then navigate)
  const { exec } = require('child_process');
  setTimeout(() => {
    exec(`agent-browser --cdp ${cdpPort} open "${url}" 2>/dev/null`, () => {});
    exec(`osascript -e 'tell application "Google Chrome" to activate' 2>/dev/null`, () => {});
  }, 2000);
  res.json({ ok: true, url });
});

app.delete('/api/spaces/:name', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });

  try {
    // Kill tmux window if running
    try {
      execSync(`tmux kill-window -t superbot3:${config.slug} 2>/dev/null`, { timeout: 5000 });
    } catch {}

    // Remove the space directory
    fs.rmSync(config.spaceDir, { recursive: true, force: true });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete space' });
  }
});

app.put('/api/spaces/:name/settings', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });

  const spaceJsonPath = path.join(config.spaceDir, 'space.json');
  try {
    const spaceJson = JSON.parse(fs.readFileSync(spaceJsonPath, 'utf-8'));
    if (req.body.codeDir !== undefined) spaceJson.codeDir = req.body.codeDir;
    if (req.body.active !== undefined) spaceJson.active = req.body.active;
    fs.writeFileSync(spaceJsonPath, JSON.stringify(spaceJson, null, 2), 'utf-8');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

app.post('/api/spaces', async (req, res) => {
  const { name, codeDir } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  try {
    const { createSpace } = require(path.join(__dirname, '..', 'src', 'commands', 'space-create'));
    const resolvedCodeDir = codeDir ? path.resolve(codeDir) : null;
    const spaceConfig = createSpace(SUPERBOT3_HOME, name, resolvedCodeDir);

    // Auto-start the space using the shared launchSpace module
    try {
      const { launchSpace } = require(path.join(__dirname, '..', 'src', 'launchSpace'));
      const config = JSON.parse(fs.readFileSync(path.join(SUPERBOT3_HOME, 'config.json'), 'utf-8'));
      const model = config.model || 'claude-opus-4-6';
      launchSpace(spaceConfig, model);
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

app.post('/api/spaces/:name/message', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });

  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Text is required' });

  if (!isSpaceWindowAlive(req.params.name)) {
    return res.status(400).json({ error: `Space "${req.params.name}" is not running` });
  }

  try {
    const target = getSpacePaneTarget(req.params.name);
    sendToPane(target, text);
    console.log(`[tmux] Message sent to space "${config.slug}"`);
    res.json({ ok: true });
  } catch (err) {
    console.error(`[tmux] Failed to send to space "${config.slug}": ${err.message}`);
    res.status(500).json({ error: `Failed to send message: ${err.message}` });
  }
});

app.get('/api/spaces/:name/messages', (req, res) => {
  // Legacy endpoint — conversation JSONL is the sole data source.
  // Return empty array for backwards compatibility with dashboard.
  res.json([]);
});

app.post('/api/master/message', (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Text is required' });

  if (!isWindowRunning('master')) {
    return res.status(400).json({ error: 'Master orchestrator is not running' });
  }

  try {
    const target = getMasterPaneTarget();
    sendToPane(target, text);
    console.log(`[tmux] Message sent to master`);
    res.json({ ok: true });
  } catch (err) {
    console.error(`[tmux] Failed to send to master: ${err.message}`);
    res.status(500).json({ error: `Failed to send message: ${err.message}` });
  }
});

app.get('/api/master/messages', (req, res) => {
  // Legacy endpoint — conversation JSONL is the sole data source.
  res.json([]);
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

function findAllSessions(projectsDir) {
  const allFiles = [];
  try {
    const dirs = fs.readdirSync(projectsDir, { withFileTypes: true })
      .filter(d => d.isDirectory());
    for (const dir of dirs) {
      const dirPath = path.join(projectsDir, dir.name);
      const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.jsonl'));
      for (const file of files) {
        allFiles.push(path.join(dirPath, file));
      }
    }
  } catch {}
  return allFiles;
}

function parseAllConversations(projectsDir, { limit = 100, before = null } = {}) {
  const sessionFiles = findAllSessions(projectsDir);
  const allMessages = [];
  for (const filePath of sessionFiles) {
    const messages = parseConversation(filePath);
    allMessages.push(...messages);
  }
  // Sort chronologically
  allMessages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  // Deduplicate messages that appear in multiple sessions (same text + close timestamps)
  const deduped = [];
  for (const msg of allMessages) {
    const isDupe = deduped.some(existing =>
      existing.role === msg.role
      && existing.text === msg.text
      && Math.abs(new Date(existing.timestamp).getTime() - new Date(msg.timestamp).getTime()) < 10000
    );
    if (!isDupe) {
      deduped.push(msg);
    }
  }
  // Apply before filter
  let filtered = deduped;
  if (before) {
    const beforeTime = new Date(before).getTime();
    filtered = deduped.filter(m => new Date(m.timestamp).getTime() < beforeTime);
  }
  // Return the N most recent messages
  return filtered.slice(-limit);
}

// Strip <teammate-message> XML wrapper from legacy messages
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

        // Unwrap teammate-message XML if present (legacy messages)
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

// Rich conversation parser — preserves tool calls, thinking blocks, system messages
function parseRichConversation(jsonlPath) {
  if (!jsonlPath) return [];
  const messages = [];
  try {
    const lines = fs.readFileSync(jsonlPath, 'utf-8').split('\n').filter(Boolean);
    for (const line of lines) {
      let obj;
      try { obj = JSON.parse(line); } catch { continue; }

      if (obj.type === 'user' && obj.message?.role === 'user') {
        const content = obj.message.content;
        const blocks = [];

        if (typeof content === 'string') {
          if (content.trim()) blocks.push({ type: 'text', text: content.trim() });
        } else if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'text' && block.text?.trim()) {
              blocks.push({ type: 'text', text: block.text.trim() });
            } else if (block.type === 'tool_result') {
              blocks.push({
                type: 'tool_result',
                tool_use_id: block.tool_use_id,
                content: typeof block.content === 'string' ? block.content
                  : Array.isArray(block.content) ? block.content.filter(b => b.type === 'text').map(b => b.text).join('\n')
                  : '',
                is_error: block.is_error || false,
              });
            }
          }
        }

        if (blocks.length === 0) continue;

        // Check for teammate message XML in the first text block
        let origin = obj.origin || null;
        let teammateId = null;
        let teammateColor = null;
        let teammateSummary = null;
        const firstText = blocks.find(b => b.type === 'text');
        if (firstText) {
          const tmMatch = firstText.text.match(/<teammate-message\s+([^>]*)>([\s\S]*?)<\/teammate-message>/);
          if (tmMatch) {
            const attrs = tmMatch[1];
            const idMatch = attrs.match(/teammate_id="([^"]+)"/);
            const colorMatch = attrs.match(/color="([^"]+)"/);
            const summaryMatch = attrs.match(/summary="([^"]+)"/);
            teammateId = idMatch ? idMatch[1] : null;
            teammateColor = colorMatch ? colorMatch[1] : null;
            teammateSummary = summaryMatch ? summaryMatch[1] : null;
            origin = 'teammate';
            firstText.text = tmMatch[2].trim();
          }
        }

        messages.push({
          type: 'user',
          blocks,
          timestamp: obj.timestamp || '',
          origin,
          teammateId,
          teammateColor,
          teammateSummary,
        });

      } else if (obj.type === 'assistant' && obj.message?.role === 'assistant') {
        const content = obj.message.content;
        const blocks = [];
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'text' && block.text?.trim()) {
              blocks.push({ type: 'text', text: block.text.trim() });
            } else if (block.type === 'tool_use') {
              blocks.push({
                type: 'tool_use',
                id: block.id,
                name: block.name,
                input: block.input || {},
              });
            } else if (block.type === 'thinking' && block.thinking?.trim()) {
              blocks.push({ type: 'thinking', thinking: block.thinking.trim() });
            }
          }
        }
        if (blocks.length === 0) continue;

        messages.push({
          type: 'assistant',
          blocks,
          timestamp: obj.timestamp || '',
          model: obj.message.model || null,
          usage: obj.message.usage ? {
            input_tokens: obj.message.usage.input_tokens || 0,
            output_tokens: obj.message.usage.output_tokens || 0,
            cache_read: obj.message.usage.cache_read_input_tokens || 0,
            cache_creation: obj.message.usage.cache_creation_input_tokens || 0,
          } : null,
          stopReason: obj.message.stop_reason || null,
        });

      } else if (obj.type === 'system') {
        // Skip noise subtypes
        if (obj.subtype === 'turn_duration') continue;
        messages.push({
          type: 'system',
          subtype: obj.subtype || 'informational',
          text: typeof obj.content === 'string' ? obj.content : '',
          timestamp: obj.timestamp || '',
        });
      }
    }
  } catch {}
  return messages;
}

function parseAllRichConversations(projectsDir, { limit = 200 } = {}) {
  const sessionFiles = findAllSessions(projectsDir);
  const allMessages = [];
  for (const filePath of sessionFiles) {
    allMessages.push(...parseRichConversation(filePath));
  }
  allMessages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // Deduplicate by timestamp + type (some messages appear across sessions)
  const deduped = [];
  for (const msg of allMessages) {
    const isDupe = deduped.some(existing =>
      existing.type === msg.type
      && existing.timestamp === msg.timestamp
    );
    if (!isDupe) deduped.push(msg);
  }

  // Link tool_result blocks back to their tool_use via id
  const toolUseMap = new Map();
  for (const msg of deduped) {
    if (msg.type === 'assistant') {
      for (const block of msg.blocks) {
        if (block.type === 'tool_use') toolUseMap.set(block.id, block);
      }
    }
  }
  for (const msg of deduped) {
    if (msg.type === 'user') {
      for (const block of msg.blocks) {
        if (block.type === 'tool_result' && toolUseMap.has(block.tool_use_id)) {
          const toolUse = toolUseMap.get(block.tool_use_id);
          toolUse.result = block.content;
          toolUse.is_error = block.is_error;
        }
      }
    }
  }

  return deduped.slice(-limit);
}

app.get('/api/spaces/:name/conversation/rich', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });
  const projectsDir = path.join(config.claudeConfigDir, 'projects');
  const limit = parseInt(req.query.limit) || 200;
  const messages = parseAllRichConversations(projectsDir, { limit });
  res.json(messages);
});

app.get('/api/master/conversation/rich', (req, res) => {
  const projectsDir = path.join(SUPERBOT3_HOME, 'orchestrator', '.claude', 'projects');
  const limit = parseInt(req.query.limit) || 200;
  const messages = parseAllRichConversations(projectsDir, { limit });
  res.json(messages);
});

app.get('/api/spaces/:name/conversation', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });

  const projectsDir = path.join(config.claudeConfigDir, 'projects');
  const limit = parseInt(req.query.limit) || 100;
  const before = req.query.before || null;
  const messages = parseAllConversations(projectsDir, { limit, before });
  res.json(messages);
});

app.get('/api/master/conversation', (req, res) => {
  const projectsDir = path.join(SUPERBOT3_HOME, 'orchestrator', '.claude', 'projects');
  const limit = parseInt(req.query.limit) || 100;
  const before = req.query.before || null;
  const messages = parseAllConversations(projectsDir, { limit, before });
  res.json(messages);
});

// ── Workers ──────────────────────────────────────────────────────────────────

app.get('/api/spaces/:name/workers', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });

  // Get live tmux panes
  const livePanes = new Set();
  try {
    const output = execSync('tmux list-panes -a -F "#{pane_id}" 2>/dev/null', { encoding: 'utf-8' });
    output.split('\n').filter(Boolean).forEach(id => livePanes.add(id.trim()));
  } catch {}

  const workers = state.getWorkers(SUPERBOT3_HOME, req.params.name);
  const members = workers.map(w => ({
    ...w,
    tmuxPaneId: w.paneId,
    alive: w.paneId && w.paneId !== 'pending' && livePanes.has(w.paneId),
  }));

  res.json({ members });
});

// Spawn a worker
app.post('/api/spaces/:name/workers', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });

  const { workerName, prompt, model, cwd } = req.body;
  if (!workerName || !prompt) return res.status(400).json({ error: 'workerName and prompt are required' });

  try {
    const spawnWorker = require('../src/commands/spawn-worker');
    spawnWorker(SUPERBOT3_HOME, config.slug, workerName, prompt, { model, cwd });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Message a specific worker
app.post('/api/spaces/:name/workers/:worker/message', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });

  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text is required' });

  const worker = state.getWorker(SUPERBOT3_HOME, req.params.name, req.params.worker);
  if (!worker) return res.status(404).json({ error: 'Worker not found' });

  if (!worker.paneId || !isPaneAlive(worker.paneId)) {
    return res.status(400).json({ error: 'Worker pane is not alive' });
  }

  try {
    sendToPane(worker.paneId, text);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Kill a worker
app.delete('/api/spaces/:name/workers/:worker', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });

  const worker = state.getWorker(SUPERBOT3_HOME, req.params.name, req.params.worker);
  if (!worker) return res.status(404).json({ error: 'Worker not found' });

  if (worker.paneId && worker.paneId !== 'pending') {
    try { execSync(`tmux kill-pane -t ${worker.paneId} 2>/dev/null`); } catch {}
  }

  state.removeWorker(SUPERBOT3_HOME, req.params.name, req.params.worker);
  res.json({ ok: true });
});

// Interrupt a worker
app.post('/api/spaces/:name/workers/:worker/interrupt', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });

  const worker = state.getWorker(SUPERBOT3_HOME, req.params.name, req.params.worker);
  if (!worker) return res.status(404).json({ error: 'Worker not found' });

  if (!worker.paneId || worker.paneId === 'pending') {
    return res.status(400).json({ error: 'Worker has no active tmux pane' });
  }

  try {
    execSync(`tmux send-keys -t ${worker.paneId} Escape`);
  } catch {
    return res.status(500).json({ error: 'Failed to send Escape' });
  }

  const { message } = req.body || {};
  if (message) {
    setTimeout(() => { try { sendToPane(worker.paneId, message); } catch {} }, 1000);
  }

  res.json({ ok: true });
});

// ── Peek ─────────────────────────────────────────────────────────────────────

app.get('/api/spaces/:name/peek', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });

  const output = capturePaneOutput(getSpacePaneTarget(req.params.name), 50);
  if (output === null) return res.status(400).json({ error: 'Could not capture pane output' });
  res.json({ output });
});

app.get('/api/spaces/:name/workers/:worker/peek', (req, res) => {
  const worker = state.getWorker(SUPERBOT3_HOME, req.params.name, req.params.worker);
  if (!worker) return res.status(404).json({ error: 'Worker not found' });
  if (!worker.paneId || !isPaneAlive(worker.paneId)) return res.status(400).json({ error: 'Worker pane not alive' });

  const output = capturePaneOutput(worker.paneId, 50);
  if (output === null) return res.status(400).json({ error: 'Could not capture pane output' });
  res.json({ output });
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

  function scanDir(dir, prefix) {
    const results = [];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        const relPath = prefix ? `${prefix}/${e.name}` : e.name;
        const fullPath = path.join(dir, e.name);
        if (e.isDirectory()) {
          results.push({ name: relPath, type: 'dir' });
          results.push(...scanDir(fullPath, relPath));
        } else {
          const stat = fs.statSync(fullPath);
          results.push({ name: relPath, type: 'file', path: fullPath, size: stat.size, modified: stat.mtime.toISOString() });
        }
      }
    } catch {}
    return results;
  }

  try {
    res.json(scanDir(knowledgeDir, ''));
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

// ── System Prompt ───────────────────────────────────────────────────────────

// Get/set space system prompt
app.get('/api/spaces/:name/system-prompt', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });

  const filePath = path.join(config.spaceDir, 'system-prompt.md');
  if (!fs.existsSync(filePath)) return res.json({ content: '' });
  res.json({ content: fs.readFileSync(filePath, 'utf-8') });
});

app.put('/api/spaces/:name/system-prompt', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });

  const filePath = path.join(config.spaceDir, 'system-prompt.md');
  fs.writeFileSync(filePath, req.body.content, 'utf-8');
  res.json({ ok: true });
});

// Get/set master system prompt
app.get('/api/master/system-prompt', (req, res) => {
  const filePath = path.join(SUPERBOT3_HOME, 'orchestrator', 'system-prompt.md');
  if (!fs.existsSync(filePath)) return res.json({ content: '' });
  res.json({ content: fs.readFileSync(filePath, 'utf-8') });
});

app.put('/api/master/system-prompt', (req, res) => {
  const filePath = path.join(SUPERBOT3_HOME, 'orchestrator', 'system-prompt.md');
  fs.writeFileSync(filePath, req.body.content, 'utf-8');
  res.json({ ok: true });
});

// ── Memory ───────────────────────────────────────────────────────────────────

function walkDir(dir, base) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(base, fullPath);
    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath, base));
    } else {
      const stat = fs.statSync(fullPath);
      results.push({ name: relPath, path: fullPath, size: stat.size, modified: stat.mtime.toISOString() });
    }
  }
  return results;
}

app.get('/api/spaces/:name/memory', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });

  const memoryDir = path.join(config.spaceDir, 'memory');
  const files = walkDir(memoryDir, memoryDir);
  res.json(files);
});

app.get('/api/spaces/:name/memory/stats', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });

  const memoryDir = path.join(config.spaceDir, 'memory');
  const topicsDir = path.join(memoryDir, 'topics');
  const sessionsDir = path.join(memoryDir, 'sessions');
  const memoryMd = path.join(memoryDir, 'MEMORY.md');

  let topicCount = 0;
  try { topicCount = fs.readdirSync(topicsDir).filter(f => f.endsWith('.md')).length; } catch {}

  let sessionCount = 0;
  try { sessionCount = walkDir(sessionsDir, sessionsDir).length; } catch {}

  let memoryMdSize = 0;
  let memoryMdLines = 0;
  try {
    const content = fs.readFileSync(memoryMd, 'utf-8');
    memoryMdSize = Buffer.byteLength(content, 'utf-8');
    memoryMdLines = content.split('\n').length;
  } catch {}

  res.json({
    topicCount,
    sessionCount,
    memoryMdSize,
    memoryMdLines,
    memoryMdCap: { bytes: 25600, lines: 200 },
  });
});

app.get('/api/spaces/:name/memory/file', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });

  const relPath = req.query.path;
  if (!relPath) return res.status(400).json({ error: 'path query param required' });
  const filePath = path.join(config.spaceDir, 'memory', relPath);

  // Prevent path traversal
  if (!filePath.startsWith(path.join(config.spaceDir, 'memory'))) {
    return res.status(400).json({ error: 'Invalid path' });
  }

  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  const content = fs.readFileSync(filePath, 'utf-8');
  res.json({ content });
});

app.put('/api/spaces/:name/memory/file', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });

  const relPath = req.query.path || req.body.path;
  if (!relPath) return res.status(400).json({ error: 'path required' });
  const filePath = path.join(config.spaceDir, 'memory', relPath);

  // Prevent path traversal
  if (!filePath.startsWith(path.join(config.spaceDir, 'memory'))) {
    return res.status(400).json({ error: 'Invalid path' });
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, req.body.content, 'utf-8');
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

  // Add installed plugins not in any marketplace (e.g. built-in plugins)
  const marketplaceKeys = new Set(results.map(r => `${r.name}@${r.marketplace}`));
  for (const [key, entries] of Object.entries(spaceInstalled)) {
    if (!marketplaceKeys.has(key) && entries.length > 0) {
      const [name, marketplace] = key.split('@');
      const isEnabled = enabled[key] === true;
      // Try to read plugin.json for metadata
      let description = '';
      let author = null;
      const installPath = entries[0].installPath;
      try {
        const pjPath = path.join(installPath, '.claude-plugin', 'plugin.json');
        if (fs.existsSync(pjPath)) {
          const pj = JSON.parse(fs.readFileSync(pjPath, 'utf-8'));
          description = pj.description || '';
          author = pj.author?.name || null;
        }
      } catch {}
      results.push({
        name,
        description,
        category: 'built-in',
        marketplace: marketplace || 'local',
        homepage: null,
        source: null,
        installed: true,
        hasFiles: true,
        enabled: isEnabled,
        version: entries[0].version || null,
        skills: null,
        lspServers: null,
        tags: null,
        keywords: null,
        strict: null,
        author,
      });
    }
  }

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

/** Toggle a plugin enabled/disabled — runs claude plugin install/enable/disable with per-space CLAUDE_CONFIG_DIR */
app.post('/api/spaces/:name/plugins/toggle', async (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });

  const { pluginKey, enabled } = req.body;
  if (!pluginKey) return res.status(400).json({ error: 'pluginKey required' });

  const { execSync } = require('child_process');
  const env = { ...process.env, CLAUDE_CONFIG_DIR: config.claudeConfigDir };

  try {
    if (enabled) {
      // Ensure the marketplace is registered in the space before installing
      const [, marketplace] = pluginKey.split('@');
      if (marketplace && marketplace !== 'claude-plugins-official') {
        const kmPath = path.join(config.claudeConfigDir, 'plugins', 'known_marketplaces.json');
        const km = readJsonSafe(kmPath) || {};
        if (!km[marketplace]) {
          // Try to find marketplace URL from global config
          const globalKm = readJsonSafe(path.join(require('os').homedir(), '.claude', 'plugins', 'known_marketplaces.json')) || {};
          if (globalKm[marketplace] && globalKm[marketplace].source) {
            const url = globalKm[marketplace].source.url || `https://superchargeclaudecode.com/api/marketplaces/${marketplace}/marketplace.json`;
            try {
              execSync(`claude plugin marketplace add "${url}"`, { env, stdio: 'pipe', timeout: 30000 });
            } catch {}
          }
        }
      }
      // Install + enable the plugin into the space's config dir
      try {
        execSync(`claude plugin install "${pluginKey}" --scope user`, { env, stdio: 'pipe', timeout: 60000 });
      } catch (installErr) {
        // May already be installed — try enable anyway
      }
      try {
        execSync(`claude plugin enable "${pluginKey}" --scope user`, { env, stdio: 'pipe', timeout: 30000 });
      } catch (enableErr) {
        // Fallback: write enabledPlugins directly if CLI fails
        const settingsPath = path.join(config.claudeConfigDir, 'settings.json');
        const settings = readJsonSafe(settingsPath) || { permissions: { allow: [], deny: [] } };
        if (!settings.enabledPlugins) settings.enabledPlugins = {};
        settings.enabledPlugins[pluginKey] = true;
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      }
    } else {
      // Disable the plugin
      try {
        execSync(`claude plugin disable "${pluginKey}" --scope user`, { env, stdio: 'pipe', timeout: 30000 });
      } catch (disableErr) {
        // Fallback: write enabledPlugins directly
        const settingsPath = path.join(config.claudeConfigDir, 'settings.json');
        const settings = readJsonSafe(settingsPath) || { permissions: { allow: [], deny: [] } };
        if (!settings.enabledPlugins) settings.enabledPlugins = {};
        settings.enabledPlugins[pluginKey] = false;
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      }
    }
    res.json({ ok: true, enabled: !!enabled });
  } catch (err) {
    res.status(500).json({ error: err.message, enabled: !!enabled });
  }
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

  const { name, description, content, files, sourcePath } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });

  const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
  const skillDir = path.join(config.claudeConfigDir, 'skills', safeName);

  if (fs.existsSync(skillDir)) return res.status(409).json({ error: 'Skill already exists' });

  // If sourcePath provided, copy the entire directory
  if (sourcePath) {
    const resolved = path.resolve(sourcePath.replace(/^~/, require('os').homedir()));
    if (!fs.existsSync(resolved)) return res.status(400).json({ error: `Path not found: ${resolved}` });
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      // Copy directory recursively
      function copyDir(src, dest) {
        fs.mkdirSync(dest, { recursive: true });
        for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
          const s = path.join(src, entry.name);
          const d = path.join(dest, entry.name);
          if (entry.isDirectory()) copyDir(s, d);
          else fs.copyFileSync(s, d);
        }
      }
      copyDir(resolved, skillDir);
      // Try to read name from SKILL.md if not explicitly set
      const skillMdPath = path.join(skillDir, 'SKILL.md');
      if (fs.existsSync(skillMdPath)) {
        const fileCount = fs.readdirSync(resolved, { recursive: true }).length;
        return res.json({ ok: true, name: safeName, fileCount });
      }
      return res.json({ ok: true, name: safeName });
    } else {
      // Single file — treat as SKILL.md
      fs.mkdirSync(skillDir, { recursive: true });
      fs.copyFileSync(resolved, path.join(skillDir, 'SKILL.md'));
      return res.json({ ok: true, name: safeName });
    }
  }

  fs.mkdirSync(skillDir, { recursive: true });

  if (content) {
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content);
  } else {
    const skillMd = `---\nname: ${safeName}\ndescription: "${(description || '').replace(/"/g, '\\"')}"\nuser-invocable: true\n---\n\n# ${safeName}\n\n${description || 'Add your skill documentation here.'}\n`;
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillMd);
  }

  if (files && typeof files === 'object') {
    for (const [fp, fc] of Object.entries(files)) {
      const safePath = fp.replace(/\.\./g, '');
      const fullPath = path.join(skillDir, safePath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, fc);
    }
  }

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

// ── Plugin Credentials (macOS Keychain) ─────────────────────────────────────

function keychainExec(args) {
  return new Promise((resolve, reject) => {
    execFile('security', args, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout.trim());
    });
  });
}

async function keychainSet(spaceSlug, pluginName, key, value) {
  const service = `superbot3-${spaceSlug}`;
  const account = `${pluginName}/${key}`;
  await keychainExec(['add-generic-password', '-s', service, '-a', account, '-w', value, '-U']);
}

async function keychainGet(spaceSlug, pluginName, key) {
  const service = `superbot3-${spaceSlug}`;
  const account = `${pluginName}/${key}`;
  try {
    return await keychainExec(['find-generic-password', '-s', service, '-a', account, '-w']);
  } catch {
    return null;
  }
}

async function keychainDelete(spaceSlug, pluginName, key) {
  const service = `superbot3-${spaceSlug}`;
  const account = `${pluginName}/${key}`;
  try {
    await keychainExec(['delete-generic-password', '-s', service, '-a', account]);
    return true;
  } catch {
    return false;
  }
}

async function keychainHas(spaceSlug, pluginName, key) {
  return (await keychainGet(spaceSlug, pluginName, key)) !== null;
}

/** Parse YAML frontmatter with nested structure support (for metadata.credentials) */
function parseYamlFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  try {
    const yaml = require('js-yaml');
    return yaml.load(match[1]) || {};
  } catch {
    return parseFrontmatter(content);
  }
}

/** Read credential declarations from a plugin's skill SKILL.md files + credentials.json fallback */
function getPluginCredentials(pluginDir) {
  // 1. Check SKILL.md frontmatter in skills directories
  for (const sub of ['.claude-plugin/skills', 'skills']) {
    const skillsDir = path.join(pluginDir, sub);
    try {
      const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const skillMd = path.join(skillsDir, entry.name, 'SKILL.md');
        if (!fs.existsSync(skillMd)) continue;
        try {
          const content = fs.readFileSync(skillMd, 'utf-8');
          const fm = parseYamlFrontmatter(content);
          const creds = fm.metadata?.credentials ?? fm.credentials;
          if (Array.isArray(creds) && creds.length > 0) return creds;
        } catch { /* skip */ }
      }
    } catch { /* dir doesn't exist */ }
  }

  // 2. Fallback: .claude-plugin/credentials.json
  const credJsonPath = path.join(pluginDir, '.claude-plugin', 'credentials.json');
  try {
    const data = JSON.parse(fs.readFileSync(credJsonPath, 'utf-8'));
    if (Array.isArray(data) && data.length > 0) return data;
  } catch { /* skip */ }

  return [];
}

const CREDENTIAL_VALIDATORS = {
  GEMINI_API_KEY: async (value) => {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(value)}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (response.ok) return { valid: true };
      const body = await response.json().catch(() => ({}));
      return { valid: false, error: body?.error?.message || `HTTP ${response.status}` };
    } catch (err) {
      return { valid: false, error: err.message || 'Network error' };
    }
  },
};

app.get('/api/spaces/:name/plugins/:plugin/credentials', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });

  const pluginName = req.params.plugin;
  // Find plugin dir — check all marketplaces
  const marketplacePlugins = getMarketplacePlugins(config.claudeConfigDir);
  const mp = marketplacePlugins.find(p => p.name === pluginName);
  const marketplace = mp?.marketplace;
  const pluginDir = marketplace ? resolvePluginDir(config.claudeConfigDir, pluginName, marketplace) : null;

  if (!pluginDir) return res.json({ credentials: [], configured: {} });

  const credentials = getPluginCredentials(pluginDir);
  const slug = config.slug || req.params.name;

  Promise.all(credentials.map(async (cred) => {
    const has = await keychainHas(slug, pluginName, cred.key);
    return [cred.key, has];
  })).then(entries => {
    const configured = {};
    for (const [key, has] of entries) configured[key] = has;
    res.json({ credentials, configured });
  }).catch(err => {
    res.status(500).json({ error: err.message });
  });
});

app.post('/api/spaces/:name/plugins/:plugin/credentials', async (req, res) => {
  try {
    const config = getSpaceConfig(req.params.name);
    if (!config) return res.status(404).json({ error: 'Space not found' });

    const { key, value } = req.body;
    if (!key || !value) return res.status(400).json({ error: 'key and value required' });

    const pluginName = req.params.plugin;
    const slug = config.slug || req.params.name;

    await keychainSet(slug, pluginName, key, value);

    const validator = CREDENTIAL_VALIDATORS[key];
    if (validator) {
      const validation = await validator(value);
      return res.json({ ok: true, validation });
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/spaces/:name/plugins/:plugin/credentials/:key', async (req, res) => {
  try {
    const config = getSpaceConfig(req.params.name);
    if (!config) return res.status(404).json({ error: 'Space not found' });

    const pluginName = req.params.plugin;
    const slug = config.slug || req.params.name;
    const deleted = await keychainDelete(slug, pluginName, req.params.key);
    res.json({ ok: deleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── System Prompt (CLAUDE.md) ────────────────────────────────────────────────

app.get('/api/spaces/:name/system-prompt', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });
  const claudeMdPath = path.join(config.claudeConfigDir, 'CLAUDE.md');
  try {
    const content = fs.readFileSync(claudeMdPath, 'utf-8');
    res.json({ content, path: claudeMdPath });
  } catch {
    res.json({ content: '', path: claudeMdPath });
  }
});

app.put('/api/spaces/:name/system-prompt', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });
  const { content } = req.body;
  if (typeof content !== 'string') return res.status(400).json({ error: 'content required' });
  const claudeMdPath = path.join(config.claudeConfigDir, 'CLAUDE.md');
  fs.writeFileSync(claudeMdPath, content, 'utf-8');
  res.json({ ok: true });
});

// ── Model ────────────────────────────────────────────────────────────────────

app.post('/api/spaces/:name/model', (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });
  const { model } = req.body;
  if (!model || typeof model !== 'string') return res.status(400).json({ error: 'model required' });
  const spaceJsonPath = path.join(SUPERBOT3_HOME, 'spaces', req.params.name, 'space.json');
  try {
    const spaceJson = JSON.parse(fs.readFileSync(spaceJsonPath, 'utf-8'));
    spaceJson.model = model;
    fs.writeFileSync(spaceJsonPath, JSON.stringify(spaceJson, null, 2), 'utf-8');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Restart Space ────────────────────────────────────────────────────────────

app.post('/api/spaces/:name/restart', async (req, res) => {
  const config = getSpaceConfig(req.params.name);
  if (!config) return res.status(404).json({ error: 'Space not found' });

  try {
    // Kill existing tmux window
    try {
      execSync(`tmux kill-window -t superbot3:${config.slug} 2>/dev/null`);
    } catch {}

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Re-launch using shared launchSpace module
    const { launchSpace } = require(path.join(__dirname, '..', 'src', 'launchSpace'));
    const globalConfig = JSON.parse(fs.readFileSync(path.join(SUPERBOT3_HOME, 'config.json'), 'utf-8'));
    const model = config.model || globalConfig.model || 'claude-opus-4-6';
    launchSpace(config, model);

    res.json({ ok: true, message: `Space "${config.slug}" restarted` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── WebSocket for real-time updates ──────────────────────────────────────────

let wss = null;
try {
  const { WebSocketServer } = require('ws');
  const server = http.createServer(app);

  wss = new WebSocketServer({ server, path: '/ws' });

  // Watch conversation JSONL files for real-time Claude responses
  const chokidar = require('chokidar');

  const watchPaths = [
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

    if (filePath.includes('/orchestrator/')) {
      type = 'master';
    } else {
      const match = filePath.match(/spaces\/([^/]+)\//);
      if (match) {
        type = 'space';
        space = match[1];
      }
    }

    const payload = JSON.stringify({ type: 'conversation_update', source: type, space });
    wss.clients.forEach(client => {
      if (client.readyState === 1) client.send(payload);
    });
  });

  // Watch state.json for space list changes (create, remove, update)
  const stateWatcher = chokidar.watch(path.join(SUPERBOT3_HOME, 'state.json'), {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
  });

  stateWatcher.on('change', () => {
    const payload = JSON.stringify({ type: 'spaces_changed' });
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

// ── Broker-Side Cron Scheduler ───────────────────────────────────────────────
// Claude Code's built-in scheduler is feature-gated (AGENT_TRIGGERS) and may not fire.
// This scheduler reads scheduled_tasks.json for each space and sends prompts via tmux send-keys.

function parseCronFields(expr) {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;

  function expand(field, min, max) {
    const values = new Set();
    for (const part of field.split(',')) {
      const stepMatch = part.match(/^\*(?:\/(\d+))?$/);
      if (stepMatch) {
        const step = stepMatch[1] ? parseInt(stepMatch[1]) : 1;
        for (let i = min; i <= max; i += step) values.add(i);
        continue;
      }
      const rangeMatch = part.match(/^(\d+)-(\d+)(?:\/(\d+))?$/);
      if (rangeMatch) {
        const lo = parseInt(rangeMatch[1]), hi = parseInt(rangeMatch[2]);
        const step = rangeMatch[3] ? parseInt(rangeMatch[3]) : 1;
        for (let i = lo; i <= hi; i += step) values.add(i);
        continue;
      }
      const num = parseInt(part);
      if (!isNaN(num) && num >= min && num <= max) values.add(num);
    }
    return values;
  }

  return {
    minute: expand(parts[0], 0, 59),
    hour: expand(parts[1], 0, 23),
    dom: expand(parts[2], 1, 31),
    month: expand(parts[3], 1, 12),
    dow: expand(parts[4], 0, 6),
    domWild: parts[2] === '*',
    dowWild: parts[4] === '*',
  };
}

function cronMatches(fields, date) {
  if (!fields.minute.has(date.getMinutes())) return false;
  if (!fields.hour.has(date.getHours())) return false;
  if (!fields.month.has(date.getMonth() + 1)) return false;
  const dayMatch = fields.domWild && fields.dowWild ? true
    : fields.domWild ? fields.dow.has(date.getDay())
    : fields.dowWild ? fields.dom.has(date.getDate())
    : fields.dom.has(date.getDate()) || fields.dow.has(date.getDay());
  return dayMatch;
}

// Track last-fired per task to prevent double-firing
const lastFiredMap = new Map();

function runSchedulerTick() {
  const now = new Date();
  const nowMinuteKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;

  try {
    const allSpaces = state.getAllSpaces(SUPERBOT3_HOME).filter(s => s.active && !s.archived);

    for (const space of allSpaces) {
      const slug = space.slug;
      const tasksPath = path.join(state.claudeConfigDir(SUPERBOT3_HOME, slug), 'scheduled_tasks.json');
      let data;
      try {
        data = JSON.parse(fs.readFileSync(tasksPath, 'utf-8'));
      } catch { continue; }

      if (!data.tasks || !Array.isArray(data.tasks)) continue;

      for (const task of data.tasks) {
        const fields = parseCronFields(task.cron);
        if (!fields) continue;

        const taskKey = `${slug}:${task.id}:${nowMinuteKey}`;
        if (lastFiredMap.has(taskKey)) continue;

        if (cronMatches(fields, now)) {
          lastFiredMap.set(taskKey, true);
          console.log(`[scheduler] Firing task ${task.id} for space ${slug}: ${task.prompt.slice(0, 60)}`);

          // Send the prompt to the space via tmux send-keys
          try {
            if (isSpaceWindowAlive(slug)) {
              const target = getSpacePaneTarget(slug);
              sendToPane(target, task.prompt);
            } else {
              console.error(`[scheduler] Space "${slug}" is not running — skipping`);
            }
          } catch (err) {
            console.error(`[scheduler] Failed to send to ${slug}: ${err.message}`);
          }

          // Update lastFiredAt in the file
          task.lastFiredAt = Date.now();
          try {
            fs.writeFileSync(tasksPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
          } catch {}
        }
      }
    }
  } catch (err) {
    console.error(`[scheduler] Tick error: ${err.message}`);
  }

  // Clean old entries from lastFiredMap (keep last 10 minutes only)
  if (lastFiredMap.size > 1000) {
    lastFiredMap.clear();
  }
}

// Run scheduler check every 30 seconds
setInterval(runSchedulerTick, 30000);
// Also run immediately on startup
setTimeout(runSchedulerTick, 5000);
console.log('[scheduler] Broker-side cron scheduler started (30s tick)');

// ── Browser welcome page ─────────────────────────────────────────────────────

app.get('/browser-welcome', (req, res) => {
  const { space, name, color } = req.query;
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${name || space || 'Browser'}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: "Inter", -apple-system, sans-serif; background: #0a0a0a; color: #d4cdc4; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
  .container { text-align: center; max-width: 540px; padding: 60px; }
  .logo { height: 36px; margin-bottom: 56px; opacity: 0.7; }
  p { font-size: 20px; color: #706b63; line-height: 1.8; }
  .space-name { color: ${color || '#c4a882'}; font-weight: 500; }
</style>
</head>
<body>
<div class="container">
  <img src="/superbot-logo.png" alt="superbot3" class="logo" onerror="this.style.display='none'">
  <p>This browser belongs to the <span class="space-name">${name || space}</span> space. Anything you log into here stays logged in — cookies, sessions, and passwords are saved to this space's profile and won't affect other spaces.</p>
</div>
</body>
</html>`);
});

// ── SPA fallback ─────────────────────────────────────────────────────────────

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  const indexPath = path.resolve(distPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile('index.html', { root: distPath });
  } else {
    res.status(404).send('Dashboard not built. Run: cd broker/dashboard-ui && npm run build');
  }
});
