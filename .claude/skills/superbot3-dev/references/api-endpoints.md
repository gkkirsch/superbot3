# Superbot3 Broker API Reference

All endpoints served by `broker/server.js` at `http://localhost:3100`.

## Health
- `GET /health` — `{"service":"superbot3","status":"ok"}`

## Spaces
- `GET /api/spaces` — List all spaces (scans `spaces/*/space.json`, checks tmux for running status)
- `GET /api/spaces/:name` — Single space detail
- `POST /api/spaces` — Create space `{ name, codeDir? }` — also auto-starts in tmux
- `POST /api/spaces/:name/message` — Send message to space via tmux send-keys `{ text }`

## Master
- `GET /api/master/status` — Master PID + running status
- `POST /api/master/message` — Send message to master via tmux send-keys `{ text }`

## Conversation (for chat)
- `GET /api/spaces/:name/conversation` — Parse space's JSONL session file, return user+assistant messages
- `GET /api/master/conversation` — Same for master orchestrator

## Workers
- `GET /api/spaces/:name/workers` — Read team config, return active workers

## Schedules
- `GET /api/spaces/:name/schedules` — Read `scheduled_tasks.json`, return tasks with `humanCron`
- `POST /api/spaces/:name/schedules` — Create task `{ cron, prompt, recurring? }` — always `permanent: true`
- `PUT /api/spaces/:name/schedules` — Full replace of scheduled_tasks.json
- `DELETE /api/spaces/:name/schedules/:id` — Remove task by id

## Knowledge
- `GET /api/spaces/:name/knowledge` — List files in `knowledge/` with frontmatter scan (first 10 lines)
- `GET /api/spaces/:name/knowledge/:file` — Read file content
- `PUT /api/spaces/:name/knowledge/:file` — Create or update file
- `DELETE /api/spaces/:name/knowledge/:file` — Delete file

## Plugins
- `GET /api/spaces/:name/plugins` — List installed plugins

## Skills
- `GET /api/spaces/:name/skills` — List skills (from plugins + standalone)

## Agents
- `GET /api/spaces/:name/agents` — List agent definitions

## WebSocket
- `ws://localhost:3100/ws` — Real-time updates
  - Watches JSONL session files for conversation updates via chokidar
  - Watches state.json for space list changes
  - Events: `conversation_update`, `spaces_changed`
