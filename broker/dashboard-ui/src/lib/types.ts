export interface Space {
  name: string
  slug: string
  codeDir: string | null
  spaceDir: string
  claudeConfigDir: string
  active: boolean
  created: string
  sessionId: string | null
  browser?: { maxConcurrent: number; cdpPort: number }
  lastStopped?: string
  running?: boolean
}

export interface InboxMessage {
  from: string
  text: string
  timestamp: string
  read: boolean
  color?: string
  summary?: string
}

export interface ScheduledTask {
  id: string
  cron: string
  prompt: string
  createdAt: number
  recurring: boolean
  permanent?: boolean
}

export interface KnowledgeFile {
  name: string
  path: string
  size: number
  modified: string
}

export interface AgentDef {
  name: string
  filename: string
}

export interface SkillDef {
  name: string
  dirname: string
}

export interface WorkerInfo {
  name: string
  role: string
  status: string
}
