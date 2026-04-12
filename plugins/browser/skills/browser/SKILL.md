---
name: browser
description: "Browser automation using the space's real Chrome browser via CDP. Open pages, fill forms, click buttons, take screenshots, extract data."
when-to-use: "When the user needs to interact with websites — navigate pages, fill forms, click buttons, take screenshots, extract data, test web apps, or automate any browser task."
allowed-tools: Bash(agent-browser *)
user-invocable: true
---

# Browser Automation

Controls the space's real Chrome browser via CDP (Chrome DevTools Protocol). Real Chrome, real fingerprint, real extensions — no bot detection.

## CRITICAL RULES

1. **ALWAYS check your CDP port first**: run `echo $AGENT_BROWSER_CDP` — this is your port
2. **ALWAYS use `--cdp $AGENT_BROWSER_CDP`** on every agent-browser command
3. **NEVER run `agent-browser open` without `--cdp`** — that launches a separate Chromium
4. **NEVER use `--auto-connect`, `--profile`, `--session`, or `--executable-path`**
5. **NEVER use `close --all`** — only `agent-browser --cdp $AGENT_BROWSER_CDP close`
6. **If commands fail**, the Chrome browser may not be running. Tell the user to click the globe icon in the dashboard to launch it.

## Core Workflow

```
1. Check port     →  echo $AGENT_BROWSER_CDP
2. Open URL       →  agent-browser --cdp $AGENT_BROWSER_CDP open <url>
3. Wait           →  agent-browser --cdp $AGENT_BROWSER_CDP wait --load networkidle
4. Snapshot       →  agent-browser --cdp $AGENT_BROWSER_CDP snapshot -i
5. Interact       →  agent-browser --cdp $AGENT_BROWSER_CDP click/fill/select @ref
6. Re-snapshot    →  agent-browser --cdp $AGENT_BROWSER_CDP snapshot -i
```

## Essential Commands

All commands MUST include `--cdp $AGENT_BROWSER_CDP`.

### Navigation
```bash
agent-browser --cdp $AGENT_BROWSER_CDP open <url>
agent-browser --cdp $AGENT_BROWSER_CDP back
agent-browser --cdp $AGENT_BROWSER_CDP forward
agent-browser --cdp $AGENT_BROWSER_CDP reload
```

### Snapshot (Discover Elements)
```bash
agent-browser --cdp $AGENT_BROWSER_CDP snapshot -i
agent-browser --cdp $AGENT_BROWSER_CDP snapshot -i -C    # include cursor-interactive
agent-browser --cdp $AGENT_BROWSER_CDP snapshot -s "#id" # scope to selector
```

### Interaction
```bash
agent-browser --cdp $AGENT_BROWSER_CDP click @e1
agent-browser --cdp $AGENT_BROWSER_CDP fill @e2 "text"
agent-browser --cdp $AGENT_BROWSER_CDP type @e2 "text"
agent-browser --cdp $AGENT_BROWSER_CDP select @e1 "option"
agent-browser --cdp $AGENT_BROWSER_CDP check @e1
agent-browser --cdp $AGENT_BROWSER_CDP press Enter
agent-browser --cdp $AGENT_BROWSER_CDP scroll down 500
```

### Get Information
```bash
agent-browser --cdp $AGENT_BROWSER_CDP get text @e1
agent-browser --cdp $AGENT_BROWSER_CDP get text body
agent-browser --cdp $AGENT_BROWSER_CDP get url
agent-browser --cdp $AGENT_BROWSER_CDP get title
```

### Wait
```bash
agent-browser --cdp $AGENT_BROWSER_CDP wait @e1
agent-browser --cdp $AGENT_BROWSER_CDP wait --load networkidle
agent-browser --cdp $AGENT_BROWSER_CDP wait --url "**/page"
agent-browser --cdp $AGENT_BROWSER_CDP wait 2000
```

### Screenshots
```bash
agent-browser --cdp $AGENT_BROWSER_CDP screenshot
agent-browser --cdp $AGENT_BROWSER_CDP screenshot page.png
agent-browser --cdp $AGENT_BROWSER_CDP screenshot --full
agent-browser --cdp $AGENT_BROWSER_CDP screenshot --annotate
```

### Tabs
```bash
agent-browser --cdp $AGENT_BROWSER_CDP tab list
agent-browser --cdp $AGENT_BROWSER_CDP tab new
agent-browser --cdp $AGENT_BROWSER_CDP tab 2
agent-browser --cdp $AGENT_BROWSER_CDP tab close
```

## Data Extraction
```bash
agent-browser --cdp $AGENT_BROWSER_CDP eval "JSON.stringify([...document.querySelectorAll('.item')].map(e => e.textContent))"
```

## If Chrome Isn't Running

If you get connection errors, the Chrome browser for this space isn't running. Tell the user:

> "Click the globe icon in the dashboard header to launch your browser, then I can control it."

Do NOT try to launch Chrome yourself.
