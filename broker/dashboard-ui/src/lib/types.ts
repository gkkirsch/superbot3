export interface Space {
  name: string
  slug: string
  codeDir: string | null
  spaceDir: string
  claudeConfigDir: string
  active: boolean
  created: string
  sessionId: string | null
  model?: string
  browser?: { maxConcurrent: number; cdpPort: number }
  lastStopped?: string
  running?: boolean
}

export interface ChatMessage {
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
  lastFiredAt?: number
  humanCron?: string
}

export interface KnowledgeFile {
  name: string
  path: string
  size: number
  modified: string
}

export interface KnowledgeItem {
  name: string       // relative path like "wiki/concepts/plugin-system.md"
  type: 'file' | 'dir'
  path?: string      // absolute path (for files)
  size?: number      // file size (for files)
  modified?: string  // ISO timestamp (for files)
}

export interface AgentDef {
  name: string
  filename: string
  description?: string
  model?: string | null
  permissionMode?: string | null
  source?: string
  path?: string
}

export interface SkillDef {
  name: string
  dirname: string
  description?: string
  source?: string
  path?: string
  hasFiles?: boolean
  enabled?: boolean
}

export interface SkillDetail {
  name: string
  content: string
  frontmatter: Record<string, string>
  files: { path: string; type: 'file' | 'dir'; size?: number }[]
}

export interface AgentDetail {
  filename: string
  content: string
  frontmatter: Record<string, string>
}

export interface WorkerInfo {
  name: string
  role: string
  status: string
}

export interface CredentialDeclaration {
  key: string
  label: string
  description?: string
  required?: boolean
}

export interface MemoryFile {
  name: string
  path: string
  size: number
  modified: string
}

export interface MemoryStats {
  topicCount: number
  sessionCount: number
  memoryMdSize: number
  memoryMdLines: number
  memoryMdCap: { bytes: number; lines: number }
}

export interface PluginInfo {
  name: string
  description: string
  category: string
  marketplace: string
  homepage: string | null
  source: string | null
  installed: boolean
  hasFiles: boolean
  enabled: boolean
  version: string | null
  skills: string[] | null
  lspServers: string[] | null
  tags: string[] | null
  keywords: string[] | null
  strict: boolean | null
  author: string | null
}
