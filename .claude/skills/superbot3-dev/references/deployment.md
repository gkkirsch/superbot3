# Deployment Reference

## Landing Page (Cloudflare Pages)

**Project:** `superbot3-landing`
**Live URL:** https://superbot3-landing.pages.dev
**Source:** `landing/index.html` + `landing/logo.png` + `landing/superbot-logo.png`

### Deploy

**CRITICAL: You MUST be on the `main` branch to deploy to production.**
Cloudflare Pages production is tied to `main`. Deploying from `phase1-foundation` or any other branch creates a PREVIEW URL only — it will NOT update the production site at superbot3-landing.pages.dev.

**ALWAYS follow this exact sequence:**

```bash
cd ~/superbot3

# 1. Switch to main (stash if needed)
git stash
git checkout main

# 2. Merge changes from dev branch if needed
git merge phase1-foundation

# 3. Deploy from main
cd landing
npx wrangler pages deploy . --project-name=superbot3-landing --commit-dirty=true

# 4. Push main
cd ~/superbot3
git push origin main

# 5. Switch back to dev branch
git checkout phase1-foundation
git stash pop  # if you stashed earlier
```

**Common mistake:** Running `wrangler pages deploy` while on `phase1-foundation`. Wrangler infers the branch from git. It will deploy to a preview URL like `phase1-foundation.superbot3-landing.pages.dev` instead of production. ALWAYS checkout main first.

### After making changes

```bash
# Edit landing/index.html
# Then:
cd ~/superbot3
git checkout main
git add landing/
git commit -m "update landing page"
git push origin main
cd landing && npx wrangler pages deploy . --project-name=superbot3-landing --commit-dirty=true
```

### Important
- Production branch is `main` — deploys from other branches go to preview URLs only
- The `.pages.dev` URL updates within seconds of deploy
- Custom domain `superbot3.com` not yet registered — using `.pages.dev` for now
- Cloudflare account: ibekidkirsch@gmail.com

### Logo files
- `landing/logo.png` — 2000x2000 square icon
- `landing/superbot-logo.png` — 1130x176 wordmark
- Both referenced as `/logo.png` and `/superbot-logo.png` in the HTML (root-relative)

## Dashboard (Broker-served)

The dashboard is built into the broker and served at `localhost:3100`.

### Rebuild dashboard
```bash
cd ~/.superbot3-app/broker/dashboard-ui
npm run build
```

### Reload broker (picks up new dashboard build + server.js changes)
```bash
superbot3 reload
```

## GitHub Repo

**Repo:** github.com/gkkirsch/superbot3
**Branches:** `main` (production), `phase1-foundation` (development)

### Push changes
```bash
cd ~/superbot3
git add .
git commit -m "description"
git push origin phase1-foundation

# To update main:
git checkout main
git merge phase1-foundation
git push origin main
git checkout phase1-foundation
```

## Plugins (superchargeclaudecode.com)

Published plugins live at the supercharge marketplace.

### Publish/update a plugin
1. Copy plugin to `~/dev/gkkirsch-claude-plugins/plugins/{plugin-name}/`
2. Commit and push to `gkkirsch/gkkirsch-claude-plugins` main branch
3. Import via supercharge API or dashboard

**Published plugins:**
- `superbot3-memory` — ID: cmnmwb95600012sra109j2mh4
- `superbot3-knowledge` — ID: cmnmwbadq000e2sraxv5kke9t
