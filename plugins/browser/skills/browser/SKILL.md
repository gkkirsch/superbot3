---
name: browser
description: "Browser automation with per-space session isolation. Open pages, fill forms, click buttons, take screenshots, extract data. Each space runs its own isolated browser session using the system Chrome."
when-to-use: "When the user needs to interact with websites — navigate pages, fill forms, click buttons, take screenshots, extract data, test web apps, or automate any browser task."
allowed-tools: Bash(agent-browser *), Bash(npx agent-browser *)
user-invocable: true
---

# Browser Automation

Every space gets its own isolated browser session using the system Chrome with a persistent profile. Real Chrome fingerprint — no bot detection blocks.

## CRITICAL RULES

1. **NEVER use `agent-browser close --all`** — this kills browser sessions in ALL spaces. Only use `agent-browser close` (no --all) to close YOUR session.
2. **NEVER use `--session` or `--profile` flags** — these are set automatically via env vars (`AGENT_BROWSER_SESSION` and `AGENT_BROWSER_PROFILE`). Adding them overrides isolation.
3. Agent-browser is pre-installed. Skip version checks.
4. Before your first browser command, verify your session: `agent-browser session`

## Core Workflow

Every browser automation follows this pattern:

```
1. Verify session  →  agent-browser session  (should show your space slug)
2. Open URL        →  agent-browser open <url>
3. Wait for load   →  agent-browser wait --load networkidle
4. Snapshot        →  agent-browser snapshot -i    (get element refs like @e1, @e2)
5. Interact        →  agent-browser click/fill/select @ref
6. Re-snapshot     →  agent-browser snapshot -i    (after any navigation or DOM change)
```

## Essential Commands

### Navigation
```bash
agent-browser open <url>              # Navigate to URL
agent-browser back                    # Go back
agent-browser forward                 # Go forward
agent-browser reload                  # Reload page
agent-browser close                   # Close THIS session only
```

### Snapshot (Discover Elements)
```bash
agent-browser snapshot -i             # Interactive elements with refs (@e1, @e2...)
agent-browser snapshot -i -C          # Include cursor-interactive elements (divs with onclick)
agent-browser snapshot -s "#selector" # Scope to CSS selector
```

### Interaction (Use @refs from Snapshot)
```bash
agent-browser click @e1               # Click element
agent-browser fill @e2 "text"         # Clear and type text
agent-browser type @e2 "text"         # Type without clearing (append)
agent-browser select @e1 "option"     # Select dropdown option
agent-browser check @e1               # Check checkbox
agent-browser press Enter             # Press key
agent-browser keyboard type "text"    # Type at current focus (no selector)
agent-browser scroll down 500         # Scroll page
```

### Get Information
```bash
agent-browser get text @e1            # Get element text
agent-browser get text body           # Get all page text
agent-browser get url                 # Get current URL
agent-browser get title               # Get page title
```

### Wait
```bash
agent-browser wait @e1                # Wait for element to appear
agent-browser wait --load networkidle # Wait for network idle
agent-browser wait --url "**/page"    # Wait for URL pattern
agent-browser wait 2000               # Wait milliseconds
```

### Screenshots
```bash
agent-browser screenshot              # Screenshot to temp dir
agent-browser screenshot page.png     # Screenshot to specific file
agent-browser screenshot --full       # Full page screenshot
agent-browser screenshot --annotate   # Labeled screenshot with numbered elements
```

### Tabs
```bash
agent-browser tab list                # List open tabs
agent-browser tab new                 # New tab
agent-browser tab 2                   # Switch to tab 2
agent-browser tab close               # Close current tab
```

## Command Chaining

Chain commands with `&&` when you don't need intermediate output:

```bash
agent-browser open https://example.com && agent-browser wait --load networkidle && agent-browser snapshot -i
```

Run separately when you need to parse output (e.g., snapshot to discover refs, then interact).

## Authentication

Your browser profile persists across sessions. Cookies and login state are saved automatically in the space's `browser-profile/` directory.

### Login and it stays logged in
```bash
agent-browser open https://example.com/login
agent-browser snapshot -i
agent-browser fill @e1 "user@example.com"
agent-browser fill @e2 "password"
agent-browser click @e3
agent-browser wait --url "**/dashboard"
# Done — next time you open this site, you're already logged in
```

### Auth Vault (encrypted credential storage)
```bash
# Save credentials once
echo "password" | agent-browser auth save mysite --url https://example.com/login --username user --password-stdin

# Login using saved profile
agent-browser auth login mysite
```

## Data Extraction
```bash
agent-browser open https://example.com/products
agent-browser snapshot -i
agent-browser get text @e5              # Specific element
agent-browser get text body > page.txt  # Full page text
agent-browser eval "JSON.stringify([...document.querySelectorAll('.price')].map(e => e.textContent))"
```

## Debugging
```bash
agent-browser --headed open https://example.com  # Show browser window
agent-browser highlight @e1                       # Highlight element
agent-browser console                             # View console logs
agent-browser errors                              # View page errors
```

## Important Notes

- Uses system Chrome with a persistent profile — real fingerprint, not bot-detectable
- Your session is isolated — other spaces cannot see or affect your browser
- The browser daemon persists between commands (no startup cost after first command)
- Use `agent-browser close` when done (NEVER `close --all`)
- Login state persists in `browser-profile/` — log in once, stay logged in
- Screenshots go to temp dir by default — use explicit paths for important captures
- First command: verify session with `agent-browser session`
