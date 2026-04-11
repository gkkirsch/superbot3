#!/usr/bin/env node
/**
 * Warm up a space's browser profile to resist bot detection.
 *
 * Does what anti-detect browser services do:
 * 1. Visits common sites to build history/cookies
 * 2. Scrolls naturally, moves mouse, clicks around
 * 3. Accepts cookie banners
 * 4. Builds up localStorage/sessionStorage data
 * 5. Lets tracking pixels fire
 *
 * Usage: node warmup-browser.js <space-slug>
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const slug = process.argv[2];
if (!slug) {
  console.error('Usage: node warmup-browser.js <space-slug>');
  process.exit(1);
}

const { getBrowserEnv } = require('./browserEnv');

const home = process.env.SUPERBOT3_HOME || path.join(os.homedir(), '.superbot3');
const spaceDir = path.join(home, 'spaces', slug);

if (!fs.existsSync(path.join(spaceDir, 'space.json'))) {
  console.error(`Space "${slug}" not found`);
  process.exit(1);
}

const headless = process.argv.includes('--headless');
const env = {
  ...process.env,
  ...getBrowserEnv(slug, spaceDir),
  ...(headless ? { AGENT_BROWSER_HEADED: 'false' } : {}),
};

function run(cmd, timeout = 30000) {
  try {
    return execSync(`agent-browser ${cmd}`, { env, timeout, stdio: 'pipe', encoding: 'utf-8' });
  } catch {
    return null;
  }
}

function randomDelay(min, max) {
  const ms = Math.floor(Math.random() * (max - min) + min);
  run(`wait ${ms}`);
}

function randomScroll() {
  const distance = Math.floor(Math.random() * 800 + 200);
  run(`scroll down ${distance}`);
  randomDelay(500, 1500);
  // Sometimes scroll back up a bit
  if (Math.random() > 0.6) {
    run(`scroll up ${Math.floor(distance * 0.3)}`);
    randomDelay(300, 800);
  }
}

function simulateMouseMove() {
  // Move mouse to random positions
  const x = Math.floor(Math.random() * 800 + 100);
  const y = Math.floor(Math.random() * 500 + 100);
  run(`mouse move ${x} ${y}`);
  randomDelay(200, 600);
}

function tryAcceptCookies() {
  // Common cookie banner button texts
  const result = run('snapshot -i');
  if (!result) return;
  const acceptPatterns = ['accept', 'agree', 'got it', 'ok', 'allow', 'consent'];
  const lines = result.split('\n');
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (acceptPatterns.some(p => lower.includes(p)) && line.includes('ref=')) {
      const match = line.match(/ref=(e\d+)/);
      if (match) {
        run(`click @${match[1]}`);
        randomDelay(500, 1000);
        return;
      }
    }
  }
}

const sites = [
  { url: 'https://www.google.com/search?q=weather+today', actions: ['scroll', 'mouse'] },
  { url: 'https://www.youtube.com', actions: ['scroll', 'scroll', 'mouse', 'cookies'] },
  { url: 'https://www.reddit.com/r/popular', actions: ['scroll', 'scroll', 'mouse'] },
  { url: 'https://www.amazon.com', actions: ['cookies', 'scroll', 'mouse'] },
  { url: 'https://en.wikipedia.org/wiki/Main_Page', actions: ['scroll', 'mouse'] },
  { url: 'https://github.com/trending', actions: ['scroll', 'scroll'] },
  { url: 'https://stackoverflow.com/questions', actions: ['scroll', 'mouse'] },
  { url: 'https://news.ycombinator.com', actions: ['scroll'] },
  { url: 'https://www.nytimes.com', actions: ['cookies', 'scroll', 'mouse'] },
  { url: 'https://www.linkedin.com', actions: ['cookies', 'scroll'] },
  { url: 'https://x.com', actions: ['scroll', 'mouse'] },
  { url: 'https://www.facebook.com', actions: ['scroll'] },
];

console.log(`\nWarming up browser profile for "${slug}"...`);
console.log(`Profile: ${path.join(spaceDir, 'browser-profile')}\n`);

let visited = 0;
for (const site of sites) {
  const domain = new URL(site.url).hostname.replace('www.', '');
  process.stdout.write(`  ${domain}... `);

  if (!run(`open "${site.url}"`, 45000)) {
    console.log('✗ (timeout)');
    continue;
  }

  // Wait for page load
  run('wait --load networkidle', 15000);
  randomDelay(1000, 2000);

  // Perform human-like actions
  for (const action of site.actions) {
    switch (action) {
      case 'scroll':
        randomScroll();
        break;
      case 'mouse':
        simulateMouseMove();
        break;
      case 'cookies':
        tryAcceptCookies();
        break;
    }
  }

  // Let tracking pixels and async scripts settle
  randomDelay(1500, 3000);
  visited++;
  console.log('✓');
}

// Close the browser
run('close');

console.log(`\nDone. Visited ${visited}/${sites.length} sites with human-like behavior.`);
console.log('Profile now has browsing history, cookies, and natural interaction patterns.\n');
