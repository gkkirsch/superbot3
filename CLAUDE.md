# Superbot3

## Tech Stack

### Dashboard UI (`broker/dashboard-ui/`)
- **Framework**: Vite + React 19 + TypeScript
- **Styling**: Tailwind CSS v4
- **Routing**: React Router v7
- **Data fetching**: TanStack React Query v5
- **UI primitives**: Radix UI (@radix-ui/react-dialog, @radix-ui/react-switch)
- **Icons**: Lucide React (`lucide-react`) — always use Lucide icons, never other icon libraries
- **Markdown**: React Markdown + remark-gfm

### Backend (`broker/server.js`)
- Express.js on port 3100
- WebSocket (ws) with chokidar for real-time file watching

## Conventions

### Icons
- **Always use Lucide React** for all icons (`import { IconName } from 'lucide-react'`)
- Never use other icon libraries (no heroicons, no font-awesome, no material icons)
- Browse available icons at https://lucide.dev/icons

### UI Components
- Custom shadcn-style components live in `broker/dashboard-ui/src/components/ui/`
- Use existing UI primitives (Card, Badge, Sheet, Tabs, Switch) before creating new ones
- Use the project's semantic color tokens: `text-parchment`, `text-stone`, `text-sand`, `text-ember`, `text-moss`, `bg-ink`, `bg-surface`, `border-border-custom`

### Dashboard Layout
- Sidebar: spaces list with star/pin, Chat nav, create space
- Space detail: left column (chat), right column (slide-in panel with tabs: Plugins, Files, Schedules, Settings)
- Plugins tab has three views: Home (installed), Browse (marketplace search), Detail (single plugin)
