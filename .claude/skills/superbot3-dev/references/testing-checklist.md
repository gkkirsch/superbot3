# Testing Checklist

Run through this before claiming any feature is complete.

## Space Creation
- [ ] `superbot3 space create <name>` — creates all files
- [ ] `superbot3 space create <name> --code-dir <path>` — codeDir in space.json
- [ ] Duplicate name rejected
- [ ] Invalid chars sanitized
- [ ] Nonexistent code dir rejected
- [ ] .credentials.json has valid OAuth tokens
- [ ] .claude.json has trust entries for space dir + code dir
- [ ] settings.json has `skipDangerousModePermissionPrompt: true`
- [ ] Skills installed: core-methodology, space-cli
- [ ] Agents installed: planner, coder, researcher, reviewer
- [ ] scheduled_tasks.json exists with empty tasks
- [ ] knowledge/logs/ directory exists

## Space Startup
- [ ] `superbot3 start` boots broker + master + all active spaces
- [ ] Zero permission prompts on boot
- [ ] Claude authenticates automatically
- [ ] Space knows its name (send "what is your name?")
- [ ] Space sees its skills (send "list your skills")
- [ ] Space sees its agents (send "list your agents")
- [ ] Spaces with codeDir launch in code repo cwd
- [ ] Inbox polling active (messages delivered within seconds)

## Messaging
- [ ] `superbot3 message <space> "text"` — delivered via inbox
- [ ] `superbot3 message "text"` — delivered to master
- [ ] Dashboard chat — message sent + response appears
- [ ] Typing indicator shows while waiting
- [ ] No XML tags visible in chat
- [ ] Lockfile prevents concurrent write corruption

## Dashboard
- [ ] Home page loads: master chat + space status grid
- [ ] Sidebar shows all spaces with running indicators
- [ ] Click space → space detail page
- [ ] Chat tab works (send + receive)
- [ ] Knowledge tab: create, edit, delete files
- [ ] Schedules tab: create, edit, delete crons
- [ ] Skills tab: lists all skills
- [ ] Plugins tab: lists plugins
- [ ] Workers tab: shows active workers (or empty state)
- [ ] Create Space form: creates + auto-starts
- [ ] Theme toggle works

## Schedules
- [ ] Create via dashboard → appears in scheduled_tasks.json
- [ ] `permanent: true` on every task
- [ ] Human-readable cron descriptions correct
- [ ] Edit works → file updated
- [ ] Delete works → file updated
- [ ] Claude's scheduler picks up changes (check tmux output)

## Shutdown
- [ ] `superbot3 space stop <name>` — space stops
- [ ] `superbot3 stop` — everything stops
- [ ] tmux session cleaned up
- [ ] Broker process killed
