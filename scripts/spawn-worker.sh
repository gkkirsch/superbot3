#!/bin/bash
# spawn-worker.sh — Spawn a Claude Code worker in a tmux pane
#
# Creates a separate Claude Code process with its own agent-id and inbox.
# Workers communicate with the space orchestrator via inbox files.
#
# Usage:
#   spawn-worker.sh --space <slug> --name <worker-name> --prompt "Do stuff"
#
# Required: --space, --name, --prompt
# Optional: --cwd (default: space dir), --model (default: from config),
#           --type (default: space-worker), --color (auto-assigned)

set -uo pipefail

source "$(dirname "$0")/lock-helper.sh"

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
TEAM_CONFIG="$CONFIG_DIR/teams/$SPACE/config.json"

if [[ ! -f "$TEAM_CONFIG" ]]; then
  echo "ERROR: Team config not found at $TEAM_CONFIG" >&2; exit 1
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
EXISTING_NAMES=$(jq -r '.members[].name // empty' "$TEAM_CONFIG" 2>/dev/null)
DEDUPED_NAME="$SANITIZED_NAME"
SUFFIX=2
while echo "$EXISTING_NAMES" | grep -qx "$DEDUPED_NAME"; do
  DEDUPED_NAME="${SANITIZED_NAME}-${SUFFIX}"
  SUFFIX=$((SUFFIX + 1))
done
SANITIZED_NAME="$DEDUPED_NAME"

# --- Generate agent ID ---
AGENT_ID="${SANITIZED_NAME}@${SPACE}"

# --- Assign color ---
if [[ -z "$COLOR" ]]; then
  MEMBER_COUNT=$(jq '.members | length' "$TEAM_CONFIG" 2>/dev/null || echo "0")
  COLOR_INDEX=$((MEMBER_COUNT % ${#COLORS[@]}))
  COLOR="${COLORS[$COLOR_INDEX]}"
fi

# --- Timestamps ---
JOINED_AT=$(date +%s)000
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")

# --- Check tmux ---
TMUX_SESSION="superbot3"
if ! tmux has-session -t "$TMUX_SESSION" 2>/dev/null; then
  echo "ERROR: tmux session '$TMUX_SESSION' not running" >&2; exit 1
fi

# --- Step 1: Write member to team config ---
MEMBER_JSON=$(jq -n \
  --arg agentId "$AGENT_ID" \
  --arg name "$SANITIZED_NAME" \
  --arg agentType "$AGENT_TYPE" \
  --arg model "$MODEL" \
  --arg prompt "$PROMPT" \
  --arg color "$COLOR" \
  --argjson joinedAt "$JOINED_AT" \
  --arg cwd "$CWD" \
  '{
    agentId: $agentId,
    name: $name,
    agentType: $agentType,
    model: $model,
    prompt: $prompt,
    color: $color,
    joinedAt: $joinedAt,
    tmuxPaneId: "pending",
    cwd: $cwd,
    subscriptions: [],
    isActive: true
  }')

locked_write "$TEAM_CONFIG" '.members += [$member]' \
  --argjson member "$MEMBER_JSON"

if [[ $? -ne 0 ]]; then
  echo "ERROR: Failed to write team config" >&2; exit 1
fi

# --- Step 2: Write initial prompt to worker's inbox ---
INBOX_DIR="$CONFIG_DIR/teams/$SPACE/inboxes"
mkdir -p "$INBOX_DIR"
INBOX_FILE="$INBOX_DIR/${SANITIZED_NAME}.json"

INBOX_MSG=$(jq -n \
  --arg text "$PROMPT" \
  --arg timestamp "$TIMESTAMP" \
  --arg color "blue" \
  '{
    from: "team-lead",
    text: $text,
    timestamp: $timestamp,
    color: $color
  }')

if [[ -f "$INBOX_FILE" ]]; then
  locked_write "$INBOX_FILE" '. + [$msg]' --argjson msg "$INBOX_MSG"
else
  echo "[$INBOX_MSG]" > "${INBOX_FILE}.tmp.$$"
  mv "${INBOX_FILE}.tmp.$$" "$INBOX_FILE"
fi

# --- Step 3: Create tmux pane ---
# Split from the space's window
TARGET_WINDOW="$TMUX_SESSION:$SPACE"
PANE_ID=$(tmux split-window -t "$TARGET_WINDOW" -v -P -F '#{pane_id}' 2>/dev/null)

if [[ -z "$PANE_ID" ]]; then
  echo "ERROR: Failed to create tmux pane" >&2
  # Rollback: remove member from config
  locked_write "$TEAM_CONFIG" '.members = [.members[] | select(.agentId == $id | not)]' \
    --arg id "$AGENT_ID"
  exit 1
fi

# Set pane title and border color
tmux select-pane -t "$PANE_ID" -T "$SANITIZED_NAME" 2>/dev/null
tmux set-option -p -t "$PANE_ID" pane-border-style "fg=$COLOR" 2>/dev/null

# --- Step 4: Update config with actual pane ID ---
locked_write "$TEAM_CONFIG" \
  '.members = [.members[] | if .agentId == $id then .tmuxPaneId = $pane else . end]' \
  --arg id "$AGENT_ID" \
  --arg pane "$PANE_ID"

# --- Step 5: Launch Claude in the pane ---
CLAUDE_BIN="${CLAUDE_CODE_TEAMMATE_COMMAND:-$(command -v claude 2>/dev/null)}"
if [[ -z "$CLAUDE_BIN" ]]; then
  echo "ERROR: Cannot find claude binary" >&2; exit 1
fi

ESC_CWD=$(printf '%q' "$CWD")
ESC_CLAUDE=$(printf '%q' "$CLAUDE_BIN")
ESC_CONFIG=$(printf '%q' "$CONFIG_DIR")

CMD="cd ${ESC_CWD} && env"
CMD="$CMD CLAUDE_CONFIG_DIR=${ESC_CONFIG}"
CMD="$CMD CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1"
CMD="$CMD ${ESC_CLAUDE}"
CMD="$CMD --agent-id $(printf '%q' "$AGENT_ID")"
CMD="$CMD --agent-name $(printf '%q' "$SANITIZED_NAME")"
CMD="$CMD --team-name $(printf '%q' "$SPACE")"
CMD="$CMD --agent-color $(printf '%q' "$COLOR")"
CMD="$CMD --agent-type $(printf '%q' "$AGENT_TYPE")"
CMD="$CMD --dangerously-skip-permissions"
CMD="$CMD --model $(printf '%q' "$MODEL")"

tmux send-keys -t "$PANE_ID" "$CMD" Enter

# --- Output ---
echo "paneId=$PANE_ID"
echo "agentId=$AGENT_ID"
echo "name=$SANITIZED_NAME"
echo "color=$COLOR"
echo "inbox=$INBOX_FILE"
