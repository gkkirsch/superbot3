#!/bin/bash
# spawn-worker.sh — Spawn a Claude Code worker in a tmux pane
#
# Creates a separate Claude Code process in a tmux pane.
# Workers are tracked in a simple workers.json registry per space.
# Messages are delivered via tmux send-keys (no inbox files).
#
# Usage:
#   spawn-worker.sh --space <slug> --name <worker-name> --prompt "Do stuff"
#
# Required: --space, --name, --prompt
# Optional: --cwd (default: space dir), --model (default: from config),
#           --type (default: space-worker), --color (auto-assigned)

set -uo pipefail

# --- Color palette (round-robin) ---
COLORS=(red green blue yellow cyan magenta orange purple pink teal)

# --- Parse arguments ---
SPACE=""
NAME=""
PROMPT=""
CWD=""
AGENT_TYPE="space-worker"
MODEL=""
COLOR=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --space)  SPACE="$2";      shift 2 ;;
    --name)   NAME="$2";       shift 2 ;;
    --prompt) PROMPT="$2";     shift 2 ;;
    --cwd)    CWD="$2";        shift 2 ;;
    --type)   AGENT_TYPE="$2"; shift 2 ;;
    --model)  MODEL="$2";      shift 2 ;;
    --color)  COLOR="$2";      shift 2 ;;
    *) echo "ERROR: Unknown option: $1" >&2; exit 1 ;;
  esac
done

# --- Validate ---
if [[ -z "$SPACE" ]]; then echo "ERROR: --space is required" >&2; exit 1; fi
if [[ -z "$NAME" ]]; then echo "ERROR: --name is required" >&2; exit 1; fi
if [[ -z "$PROMPT" ]]; then echo "ERROR: --prompt is required" >&2; exit 1; fi

# --- Resolve paths ---
SUPERBOT3_HOME="${SUPERBOT3_HOME:-$HOME/.superbot3}"
SPACE_DIR="$SUPERBOT3_HOME/spaces/$SPACE"
SPACE_JSON="$SPACE_DIR/space.json"

if [[ ! -f "$SPACE_JSON" ]]; then
  echo "ERROR: Space '$SPACE' not found at $SPACE_JSON" >&2; exit 1
fi

CONFIG_DIR=$(jq -r '.claudeConfigDir' "$SPACE_JSON")
REGISTRY="$SPACE_DIR/workers.json"

# Create registry if it doesn't exist
if [[ ! -f "$REGISTRY" ]]; then
  echo '{"workers":[]}' > "$REGISTRY"
fi

# Default cwd to space's codeDir or spaceDir
if [[ -z "$CWD" ]]; then
  CWD=$(jq -r '.codeDir // .spaceDir' "$SPACE_JSON")
fi

# Default model from global config
if [[ -z "$MODEL" ]]; then
  GLOBAL_CONFIG="$SUPERBOT3_HOME/config.json"
  if [[ -f "$GLOBAL_CONFIG" ]]; then
    MODEL=$(jq -r '.model // "claude-sonnet-4-6"' "$GLOBAL_CONFIG")
  else
    MODEL="claude-sonnet-4-6"
  fi
fi

# --- Sanitize and deduplicate name ---
SANITIZED_NAME=$(echo "$NAME" | sed 's/@/-/g; s/[^a-zA-Z0-9_-]/-/g')
EXISTING_NAMES=$(jq -r '.workers[].name // empty' "$REGISTRY" 2>/dev/null)
DEDUPED_NAME="$SANITIZED_NAME"
SUFFIX=2
while echo "$EXISTING_NAMES" | grep -qx "$DEDUPED_NAME"; do
  DEDUPED_NAME="${SANITIZED_NAME}-${SUFFIX}"
  SUFFIX=$((SUFFIX + 1))
done
SANITIZED_NAME="$DEDUPED_NAME"

# --- Assign color ---
if [[ -z "$COLOR" ]]; then
  WORKER_COUNT=$(jq '.workers | length' "$REGISTRY" 2>/dev/null || echo "0")
  COLOR_INDEX=$((WORKER_COUNT % ${#COLORS[@]}))
  COLOR="${COLORS[$COLOR_INDEX]}"
fi

# --- Timestamps ---
SPAWNED_AT=$(date +%s)000
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")

# --- Check tmux ---
TMUX_SESSION="superbot3"
if ! tmux has-session -t "$TMUX_SESSION" 2>/dev/null; then
  echo "ERROR: tmux session '$TMUX_SESSION' not running" >&2; exit 1
fi

# --- Step 1: Create tmux pane ---
TARGET_WINDOW="$TMUX_SESSION:$SPACE"
PANE_ID=$(tmux split-window -t "$TARGET_WINDOW" -v -P -F '#{pane_id}' 2>/dev/null)

if [[ -z "$PANE_ID" ]]; then
  echo "ERROR: Failed to create tmux pane" >&2
  exit 1
fi

# Set pane title and border color
tmux select-pane -t "$PANE_ID" -T "$SANITIZED_NAME" 2>/dev/null
tmux set-option -p -t "$PANE_ID" pane-border-style "fg=$COLOR" 2>/dev/null

# --- Step 2: Write worker to registry ---
WORKER_JSON=$(jq -n \
  --arg name "$SANITIZED_NAME" \
  --arg agentType "$AGENT_TYPE" \
  --arg model "$MODEL" \
  --arg prompt "$PROMPT" \
  --arg color "$COLOR" \
  --argjson spawnedAt "$SPAWNED_AT" \
  --arg cwd "$CWD" \
  --arg paneId "$PANE_ID" \
  '{
    name: $name,
    agentType: $agentType,
    model: $model,
    prompt: $prompt,
    color: $color,
    spawnedAt: $spawnedAt,
    paneId: $paneId,
    cwd: $cwd,
    isActive: true
  }')

# Atomic write to registry
TMP_REG="${REGISTRY}.tmp.$$"
jq --argjson worker "$WORKER_JSON" '.workers += [$worker]' "$REGISTRY" > "$TMP_REG" 2>/dev/null
if [[ $? -eq 0 ]]; then
  mv "$TMP_REG" "$REGISTRY"
else
  rm -f "$TMP_REG"
  echo "ERROR: Failed to update worker registry" >&2
  tmux kill-pane -t "$PANE_ID" 2>/dev/null
  exit 1
fi

# --- Step 3: Launch Claude in the pane ---
CLAUDE_BIN="${CLAUDE_CODE_TEAMMATE_COMMAND:-$(command -v claude 2>/dev/null)}"
if [[ -z "$CLAUDE_BIN" ]]; then
  echo "ERROR: Cannot find claude binary" >&2; exit 1
fi

ESC_CWD=$(printf '%q' "$CWD")
ESC_CLAUDE=$(printf '%q' "$CLAUDE_BIN")
ESC_CONFIG=$(printf '%q' "$CONFIG_DIR")

CMD="cd ${ESC_CWD} && env"
CMD="$CMD CLAUDE_CONFIG_DIR=${ESC_CONFIG}"
CMD="$CMD ${ESC_CLAUDE}"
CMD="$CMD --dangerously-skip-permissions"
CMD="$CMD --model $(printf '%q' "$MODEL")"

tmux send-keys -t "$PANE_ID" "$CMD" Enter

# --- Step 4: Send initial prompt via send-keys ---
# Wait for Claude to start up before sending the prompt
sleep 3

# Use load-buffer + paste-buffer for safe escaping of the prompt
TMPDIR="${TMPDIR:-/tmp}"
TMP_PROMPT="$TMPDIR/superbot3-prompt-$$.txt"
printf '%s' "$PROMPT" > "$TMP_PROMPT"
tmux load-buffer "$TMP_PROMPT"
tmux paste-buffer -t "$PANE_ID"
tmux send-keys -t "$PANE_ID" Enter
rm -f "$TMP_PROMPT"

# --- Output ---
echo "paneId=$PANE_ID"
echo "name=$SANITIZED_NAME"
echo "color=$COLOR"
echo "model=$MODEL"
