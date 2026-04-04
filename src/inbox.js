const fs = require('fs');
const path = require('path');
const lockfile = require('proper-lockfile');

const LOCK_OPTIONS = {
  retries: {
    retries: 10,
    minTimeout: 5,
    maxTimeout: 100,
  },
};

/**
 * Write a message to an inbox file using the same lockfile protocol as Claude Code's teammateMailbox.ts
 */
async function writeToInbox(inboxPath, message) {
  // 1. Ensure directory exists
  fs.mkdirSync(path.dirname(inboxPath), { recursive: true });

  // 2. Create file if needed (wx flag = fail if exists)
  try {
    fs.writeFileSync(inboxPath, '[]', { flag: 'wx' });
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }

  // 3. Lock, read, append, write, unlock
  const release = await lockfile.lock(inboxPath, {
    lockfilePath: inboxPath + '.lock',
    ...LOCK_OPTIONS,
  });

  try {
    const messages = JSON.parse(fs.readFileSync(inboxPath, 'utf-8'));
    messages.push({
      from: message.from || 'user',
      text: message.text,
      timestamp: new Date().toISOString(),
      read: false,
      color: message.color || undefined,
      summary: message.summary || message.text.slice(0, 80),
    });
    fs.writeFileSync(inboxPath, JSON.stringify(messages, null, 2), 'utf-8');
  } finally {
    await release();
  }
}

/**
 * Read messages from an inbox file
 */
function readInbox(inboxPath) {
  try {
    return JSON.parse(fs.readFileSync(inboxPath, 'utf-8'));
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}

/**
 * Get the inbox path for a space's team lead
 */
function getSpaceInboxPath(spaceClaudeConfigDir, spaceSlug) {
  return path.join(spaceClaudeConfigDir, 'teams', spaceSlug, 'inboxes', 'team-lead.json');
}

/**
 * Get the inbox path for the master orchestrator
 */
function getMasterInboxPath(home) {
  return path.join(home, 'orchestrator', '.claude', 'teams', 'superbot3', 'inboxes', 'team-lead.json');
}

module.exports = {
  writeToInbox,
  readInbox,
  getSpaceInboxPath,
  getMasterInboxPath,
};
