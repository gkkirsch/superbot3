const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

module.exports = function spawnWorker(home, space, name, prompt, opts = {}) {
  const scriptPath = path.resolve(__dirname, '..', '..', 'scripts', 'spawn-worker.sh');

  if (!fs.existsSync(scriptPath)) {
    console.error('Error: spawn-worker.sh not found');
    process.exit(1);
  }

  const args = [
    '--space', space,
    '--name', name,
    '--prompt', prompt,
  ];

  if (opts.cwd) args.push('--cwd', opts.cwd);
  if (opts.model) args.push('--model', opts.model);
  if (opts.type) args.push('--type', opts.type);
  if (opts.color) args.push('--color', opts.color);

  try {
    const result = execSync(
      `bash ${scriptPath} ${args.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(' ')}`,
      { encoding: 'utf-8', env: { ...process.env, SUPERBOT3_HOME: home } }
    );
    console.log(result.trim());
  } catch (err) {
    const stderr = err.stderr?.trim();
    if (stderr) console.error(stderr);
    else console.error(`Error spawning worker: ${err.message}`);
    process.exit(1);
  }
};
