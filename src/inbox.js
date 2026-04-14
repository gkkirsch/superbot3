// inbox.js — DEPRECATED
// The inbox file-based messaging system has been replaced by tmux send-keys.
// See src/tmuxMessage.js for the new messaging implementation.
//
// This file is kept as a stub to prevent import errors during migration.

async function writeToInbox() {
  console.warn('writeToInbox() is deprecated — use tmuxMessage.sendToPane() instead');
}

function readInbox() {
  console.warn('readInbox() is deprecated');
  return [];
}

function getSpaceInboxPath() {
  return '';
}

function getMasterInboxPath() {
  return '';
}

module.exports = {
  writeToInbox,
  readInbox,
  getSpaceInboxPath,
  getMasterInboxPath,
};
