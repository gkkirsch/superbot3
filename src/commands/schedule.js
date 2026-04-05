const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function getSchedulePath(home, spaceName) {
  return path.join(home, 'spaces', spaceName, '.claude', 'scheduled_tasks.json');
}

function readSchedule(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return { tasks: [] };
  }
}

function writeSchedule(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function cronToHuman(cron) {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return cron;
  const [minute, hour, dom, month, dow] = parts;

  const everyMin = minute.match(/^\*\/(\d+)$/);
  if (everyMin && hour === '*' && dom === '*' && month === '*' && dow === '*') {
    const n = parseInt(everyMin[1]);
    return n === 1 ? 'Every minute' : `Every ${n} minutes`;
  }
  if (minute.match(/^\d+$/) && hour === '*' && dom === '*' && month === '*' && dow === '*') {
    return parseInt(minute) === 0 ? 'Every hour' : `Every hour at :${minute.padStart(2, '0')}`;
  }
  const everyHour = hour.match(/^\*\/(\d+)$/);
  if (minute.match(/^\d+$/) && everyHour && dom === '*' && month === '*' && dow === '*') {
    const n = parseInt(everyHour[1]);
    return n === 1 ? 'Every hour' : `Every ${n} hours`;
  }
  if (minute.match(/^\d+$/) && hour.match(/^\d+$/) && dom === '*' && month === '*' && dow === '*') {
    const d = new Date(2000, 0, 1, parseInt(hour), parseInt(minute));
    return `Every day at ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  }
  return cron;
}

function add(home, spaceName, cron, prompt) {
  const spaceDir = path.join(home, 'spaces', spaceName);
  if (!fs.existsSync(path.join(spaceDir, 'space.json'))) {
    console.error(`Error: Space "${spaceName}" does not exist.`);
    process.exit(1);
  }
  const filePath = getSchedulePath(home, spaceName);
  const data = readSchedule(filePath);
  const id = crypto.randomUUID().slice(0, 8);
  data.tasks.push({
    id,
    cron,
    prompt,
    createdAt: Date.now(),
    recurring: true,
    permanent: true,
  });
  writeSchedule(filePath, data);
  console.log(`Schedule created: ${id}`);
  console.log(`  Cron: ${cron} (${cronToHuman(cron)})`);
  console.log(`  Prompt: ${prompt}`);
}

function list(home, spaceName) {
  const spaceDir = path.join(home, 'spaces', spaceName);
  if (!fs.existsSync(path.join(spaceDir, 'space.json'))) {
    console.error(`Error: Space "${spaceName}" does not exist.`);
    process.exit(1);
  }
  const filePath = getSchedulePath(home, spaceName);
  const data = readSchedule(filePath);
  if (data.tasks.length === 0) {
    console.log('No scheduled tasks.');
    return;
  }
  for (const t of data.tasks) {
    const human = cronToHuman(t.cron);
    const fired = t.lastFiredAt ? new Date(t.lastFiredAt).toLocaleString() : 'never';
    console.log(`  ${t.id}  ${human.padEnd(25)} ${t.prompt.slice(0, 50)}`);
    console.log(`         cron: ${t.cron}  last: ${fired}`);
  }
}

function remove(home, spaceName, id) {
  const spaceDir = path.join(home, 'spaces', spaceName);
  if (!fs.existsSync(path.join(spaceDir, 'space.json'))) {
    console.error(`Error: Space "${spaceName}" does not exist.`);
    process.exit(1);
  }
  const filePath = getSchedulePath(home, spaceName);
  const data = readSchedule(filePath);
  const before = data.tasks.length;
  data.tasks = data.tasks.filter(t => t.id !== id);
  if (data.tasks.length === before) {
    console.error(`Task "${id}" not found.`);
    process.exit(1);
  }
  writeSchedule(filePath, data);
  console.log(`Schedule "${id}" removed.`);
}

module.exports = { add, list, remove };
