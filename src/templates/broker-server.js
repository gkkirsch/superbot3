const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.SUPERBOT3_BROKER_PORT || 3100;
const SUPERBOT3_HOME = process.env.SUPERBOT3_HOME || path.join(require('os').homedir(), 'superbot3');

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({
    service: 'superbot3',
    status: 'ok',
    uptime: process.uptime(),
    home: SUPERBOT3_HOME,
    timestamp: new Date().toISOString(),
  });
});

// List spaces
app.get('/api/spaces', (req, res) => {
  const spacesDir = path.join(SUPERBOT3_HOME, 'spaces');
  try {
    const entries = fs.readdirSync(spacesDir, { withFileTypes: true });
    const spaces = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const configPath = path.join(spacesDir, entry.name, 'space.json');
        if (fs.existsSync(configPath)) {
          const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
          spaces.push(config);
        }
      }
    }
    res.json(spaces);
  } catch (err) {
    res.json([]);
  }
});

app.listen(PORT, () => {
  console.log(`superbot3 broker running on port ${PORT}`);
  console.log(`Home: ${SUPERBOT3_HOME}`);
});
