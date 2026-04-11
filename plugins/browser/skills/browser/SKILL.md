---
name: browser
description: "Browser automation with per-space session isolation. Open pages, fill forms, click buttons, take screenshots, extract data. Each space runs its own isolated browser session."
when-to-use: "When the user needs to interact with websites — navigate pages, fill forms, click buttons, take screenshots, extract data, test web apps, or automate any browser task."
allowed-tools: Bash(agent-browser *), Bash(npx agent-browser *)
user-invocable: true
---

# Browser Automation

Every space gets its own isolated browser session. No port conflicts, no shared state.

## CRITICAL RULES

1. **NEVER use `agent-browser close --all`** — this kills browser sessions in ALL spaces. Only use `agent-browser close` (no --all) to close YOUR session.
2. Your session is automatically set via the `AGENT_BROWSER_SESSION` env var. Verify it's working by running `agent-browser session` — it should show your space slug.
3. **NEVER use `--session` flag** — the env var handles this. Adding `--session` overrides isolation.
4. Skip the version check — agent-browser is pre-installed.

## Core Workflow

Every browser automation follows this pattern:

```
1. Open URL        →  agent-browser open <url>
2. Snapshot        →  agent-browser snapshot -i    (get element refs like @e1, @e2)
3. Interact        →  agent-browser click/fill/select @ref
4. Re-snapshot     →  agent-browser snapshot -i    (after any navigation or DOM change)
```

## Essential Commands

### Navigation
```bash
agent-browser open <url>              # Navigate to URL
agent-browser back                    # Go back
agent-browser forward                 # Go forward
agent-browser reload                  # Reload page
agent-browser close                   # Close browser
agent-browser close --all             # Close all tabs in this session
```

### Snapshot (Discover Elements)
```bash
agent-browser snapshot -i             # Interactive elements with refs (@e1, @e2...)
agent-browser snapshot -i -C          # Include cursor-interactive elements (divs with onclick)
agent-browser snapshot -s "#selector" # Scope to CSS selector
agent-browser snapshot -i --json      # JSON output for parsing
```

### Interaction (Use @refs from Snapshot)
```bash
agent-browser click @e1               # Click element
agent-browser click @e1 --new-tab     # Click and open in new tab
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
agent-browser get html @e1            # Get element HTML
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

## Authentication Patterns

### Auth Vault (Recommended — credentials encrypted at rest)
```bash
# Save credentials once
echo "password" | agent-browser auth save mysite --url https://example.com/login --username user --password-stdin

# Login using saved profile (password never exposed)
agent-browser auth login mysite

# Manage profiles
agent-browser auth list
agent-browser auth delete mysite
```

### State Persistence (Save/restore cookies and localStorage)
```bash
# Login and save state
agent-browser open https://app.example.com/login
agent-browser snapshot -i
agent-browser fill @e1 "user@example.com"
agent-browser fill @e2 "password"
agent-browser click @e3
agent-browser wait --url "**/dashboard"
agent-browser state save auth.json

# Reuse later
agent-browser state load auth.json
agent-browser open https://app.example.com/dashboard
```

### Session Persistence (Auto-save/restore across restarts)
```bash
# First time — login normally, state auto-saved on close
agent-browser --session-name myapp open https://app.example.com/login
# ... login flow ...
agent-browser close  # State auto-saved

# Next time — state auto-loaded
agent-browser --session-name myapp open https://app.example.com/dashboard
```

### Connect to User's Chrome (Use existing logins)
```bash
# Auto-discover running Chrome
agent-browser --auto-connect open https://example.com

# Or reuse a specific Chrome profile
agent-browser --profile Default open https://gmail.com
```

## Data Extraction
```bash
agent-browser open https://example.com/products
agent-browser snapshot -i
agent-browser get text @e5              # Specific element
agent-browser get text body > page.txt  # Full page text
agent-browser eval "JSON.stringify([...document.querySelectorAll('.price')].map(e => e.textContent))"
```

## Downloads
```bash
agent-browser download @e1 ./file.pdf          # Click to download
agent-browser wait --download ./output.zip     # Wait for download
agent-browser --download-path ./downloads open <url>  # Set download dir
```

## Debugging
```bash
agent-browser --headed open https://example.com  # Show browser window
agent-browser highlight @e1                       # Highlight element
agent-browser console                             # View console logs
agent-browser errors                              # View page errors
agent-browser inspect                             # Open Chrome DevTools
```

## Important Notes

- Your session is isolated — other spaces cannot see or affect your browser
- The browser daemon persists between commands (no startup cost after first command)
- Use `agent-browser close` when done (NOT `close --all` — that kills ALL spaces' sessions)
- Screenshots go to temp dir by default — use explicit paths for important captures
- For parallel work within a space, workers share the same session (use tabs)
- First command: verify session with `agent-browser session` — should show your space slug
