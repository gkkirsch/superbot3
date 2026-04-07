#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

APP_DIR="$HOME/.superbot3-app"
DATA_DIR="$HOME/.superbot3"
REPO_URL="https://github.com/gkkirsch/superbot3.git"
BIN_LINK="/usr/local/bin/superbot3"

echo ""
echo "  ╔═══════════════════════════╗"
echo "  ║   superbot3 installer     ║"
echo "  ╚═══════════════════════════╝"
echo ""

# Check prerequisites
echo "Checking prerequisites..."

# Node.js
if ! command -v node &> /dev/null; then
  echo -e "${RED}✗ Node.js not found${NC}"
  echo "  Install: https://nodejs.org/ (v18+)"
  exit 1
fi
NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo -e "${RED}✗ Node.js $(node -v) too old (need 18+)${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Node.js $(node -v)${NC}"

# Claude Code
if ! command -v claude &> /dev/null; then
  echo -e "${RED}✗ Claude Code not found${NC}"
  echo "  Install: npm install -g @anthropic-ai/claude-code"
  exit 1
fi
echo -e "${GREEN}✓ Claude Code $(claude --version 2>/dev/null || echo 'installed')${NC}"

# tmux
if ! command -v tmux &> /dev/null; then
  echo -e "${RED}✗ tmux not found${NC}"
  echo "  Install: brew install tmux (macOS) or apt install tmux (Linux)"
  exit 1
fi
echo -e "${GREEN}✓ tmux $(tmux -V 2>/dev/null || echo 'installed')${NC}"

# git
if ! command -v git &> /dev/null; then
  echo -e "${RED}✗ git not found${NC}"
  exit 1
fi
echo -e "${GREEN}✓ git${NC}"

echo ""

# Install or update
if [ -d "$APP_DIR" ]; then
  echo "Updating superbot3..."
  cd "$APP_DIR"
  git pull origin main
else
  echo "Installing superbot3..."
  git clone "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi

# Install dependencies
echo "Installing dependencies..."
npm install --production 2>&1 | tail -1

# Build dashboard
if [ -f "broker/dashboard-ui/package.json" ]; then
  echo "Building dashboard..."
  cd broker/dashboard-ui
  npm install 2>&1 | tail -1
  npm run build 2>&1 | tail -1
  cd "$APP_DIR"
fi

# Symlink to PATH
echo "Adding to PATH..."
if [ -L "$BIN_LINK" ] || [ -f "$BIN_LINK" ]; then
  rm -f "$BIN_LINK"
fi
ln -sf "$APP_DIR/bin/superbot3" "$BIN_LINK"
chmod +x "$APP_DIR/bin/superbot3"

# Initialize data directory
echo "Initializing..."
"$BIN_LINK" init

echo ""
echo -e "${GREEN}superbot3 is ready!${NC}"
echo ""
echo "  Start:      superbot3 start"
echo "  Dashboard:  http://localhost:3100"
echo "  Create:     superbot3 space create \"My Project\""
echo ""
echo "  Update:     superbot3 update"
echo "  Docs:       https://github.com/gkkirsch/superbot3"
echo ""
