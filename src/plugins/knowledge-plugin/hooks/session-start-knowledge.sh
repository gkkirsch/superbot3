#!/bin/bash
# SessionStart hook for knowledge plugin
# Reads wiki index and injects context

INDEX_FILE="knowledge/wiki/index.md"
if [ -f "$INDEX_FILE" ]; then
  CONTENT=$(head -50 "$INDEX_FILE")
  # Escape for JSON embedding
  CONTENT="${CONTENT//\\/\\\\}"
  CONTENT="${CONTENT//\"/\\\"}"
  CONTENT="${CONTENT//$'\n'/\\n}"
  CONTENT="${CONTENT//$'\t'/\\t}"
  CONTENT="${CONTENT//$'\r'/}"
  CONTEXT="## Your Knowledge Base\\n\\nWiki index:\\n${CONTENT}\\n\\nUse /knowledge-base to compile, query, lint, ingest."
else
  CONTEXT="## Your Knowledge Base\\n\\nNo wiki compiled yet. Drop files in knowledge/raw/ and use /knowledge-base compile."
fi

printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}' "$CONTEXT"
