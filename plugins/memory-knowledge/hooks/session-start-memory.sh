#!/bin/bash
# SessionStart hook for memory plugin
# Reads MEMORY.md and injects it into the session context

MEMORY_FILE="memory/MEMORY.md"
if [ -f "$MEMORY_FILE" ]; then
  CONTENT=$(head -100 "$MEMORY_FILE")
else
  CONTENT="No memories yet. Use /memory remember to start building your memory."
fi

# Escape for JSON embedding (backslashes first, then quotes, then newlines/tabs)
CONTENT="${CONTENT//\\/\\\\}"
CONTENT="${CONTENT//\"/\\\"}"
CONTENT="${CONTENT//$'\n'/\\n}"
CONTENT="${CONTENT//$'\t'/\\t}"
CONTENT="${CONTENT//$'\r'/}"

printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"## Your Memory (from MEMORY.md)\\n\\n%s\\n\\nUse /memory to remember, recall, reflect, log. Use /knowledge-base to manage your knowledge wiki."}}' "$CONTENT"
