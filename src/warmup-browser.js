#!/usr/bin/env node
/**
 * Warm up a space's browser profile by visiting common sites.
 * Builds up history, cookies, and fingerprint data so the profile
 * doesn't look brand new to anti-bot systems.
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

const home = process.env.SUPERBOT3_HOME || path.join(os.homedir(), '.superbot3');
const spaceDir = path.join(home, 'spaces', slug);
const profileDir = path.join(spaceDir, 'browser-profile');

if (!fs.existsSync(path.join(spaceDir, 'space.json'))) {
  console.error(`Space "${slug}" not found`);
  process.exit(1);
}

const env = {
  ...process.env,
  AGENT_BROWSER_SESSION: `warmup-${slug}`,
  AGENT_BROWSER_PROFILE: profileDir,
  AGENT_BROWSER_HEADED: 'false', // headless for warmup
  AGENT_BROWSER_ARGS: '--no-first-run,--no-default-browser-check',
};

const sites = [
  'https://www.google.com',
  'https://www.youtube.com',
  'https://www.reddit.com',
  'https://www.amazon.com',
  'https://www.wikipedia.org',
  'https://www.github.com',
  'https://www.stackoverflow.com',
  'https://news.ycombinator.com',
  'https://www.nytimes.com',
  'https://www.linkedin.com',
  'https://twitter.com',
  'https://www.facebook.com',
];

function run(cmd) {
  try {
    execSync(cmd, { env, timeout: 15000, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

console.log(`Warming up browser profile for "${slug}"...`);
console.log(`Profile: ${profileDir}`);

let visited = 0;
for (const site of sites) {
  const domain = new URL(site).hostname.replace('www.', '');
  process.stdout.write(`  ${domain}... `);
  if (run(`agent-browser open "${site}"`)) {
    // Wait for page to fully load and set cookies
    run('agent-browser wait --load networkidle');
    // Small delay to let trackers/cookies settle
    run('agent-browser wait 1000');
    visited++;
    console.log('✓');
  } else {
    console.log('✗');
  }
}

// Close the browser
run('agent-browser close');

console.log(`\nDone. Visited ${visited}/${sites.length} sites.`);
console.log('Profile now has browsing history and cookies.');
