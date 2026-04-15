import type { Space, ChatMessage, ScheduledTask, KnowledgeFile, KnowledgeItem, AgentDef, SkillDef, PluginInfo, SkillDetail, AgentDetail, CredentialDeclaration, MemoryFile, MemoryStats } from './types'

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

async function putJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

// Spaces
export const fetchSpaces = () => fetchJson<Space[]>('/api/spaces')
export const fetchSpace = (name: string) => fetchJson<Space>(`/api/spaces/${name}`)
export const createSpace = (data: { name: string; codeDir?: string }) =>
  postJson<Space>('/api/spaces', data)

// Messages
export const sendSpaceMessage = (name: string, text: string) =>
  postJson<{ ok: boolean }>(`/api/spaces/${name}/message`, { text })
export const sendMasterMessage = (text: string) =>
  postJson<{ ok: boolean }>('/api/master/message', { text })
export const fetchSpaceMessages = (name: string) =>
  fetchJson<ChatMessage[]>(`/api/spaces/${name}/messages`)
export const fetchMasterMessages = () =>
  fetchJson<ChatMessage[]>('/api/master/messages')

// Master
export const fetchMasterStatus = () =>
  fetchJson<{ running: boolean; pid?: number }>('/api/master/status')

// Workers
export const fetchWorkers = (name: string) =>
  fetchJson<{ members: unknown[] }>(`/api/spaces/${name}/workers`)

// Schedules
export const fetchSchedules = (name: string) =>
  fetchJson<{ tasks: ScheduledTask[] }>(`/api/spaces/${name}/schedules`)
export const saveSchedules = (name: string, tasks: ScheduledTask[]) =>
  putJson<{ ok: boolean }>(`/api/spaces/${name}/schedules`, { tasks })
export const createSchedule = (name: string, data: { cron: string; prompt: string; recurring?: boolean }) =>
  postJson<ScheduledTask>(`/api/spaces/${name}/schedules`, data)
export const deleteSchedule = (name: string, id: string) =>
  fetch(`/api/spaces/${name}/schedules/${id}`, { method: 'DELETE' }).then(r => {
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
    return r.json() as Promise<{ ok: boolean }>
  })

// Knowledge
export const fetchKnowledge = (name: string) =>
  fetchJson<KnowledgeItem[]>(`/api/spaces/${name}/knowledge`)
export const fetchKnowledgeFile = (name: string, file: string) =>
  fetchJson<{ content: string }>(`/api/spaces/${name}/knowledge/${encodeURIComponent(file)}`)
export const saveKnowledgeFile = (name: string, file: string, content: string) =>
  putJson<{ ok: boolean }>(`/api/spaces/${name}/knowledge/${encodeURIComponent(file)}`, { content })
export const deleteKnowledgeFile = (name: string, file: string) =>
  fetch(`/api/spaces/${name}/knowledge/${encodeURIComponent(file)}`, { method: 'DELETE' }).then(r => {
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
    return r.json() as Promise<{ ok: boolean }>
  })

// Memory
export const fetchMemoryFiles = (name: string) =>
  fetchJson<MemoryFile[]>(`/api/spaces/${name}/memory`)
export const fetchMemoryStats = (name: string) =>
  fetchJson<MemoryStats>(`/api/spaces/${name}/memory/stats`)
export const fetchMemoryFile = (name: string, filePath: string) =>
  fetchJson<{ content: string }>(`/api/spaces/${name}/memory/file/${encodeURIComponent(filePath)}`)
export const saveMemoryFile = (name: string, filePath: string, content: string) =>
  putJson<{ ok: boolean }>(`/api/spaces/${name}/memory/file/${encodeURIComponent(filePath)}`, { content })

// Plugins & Skills
export const fetchPlugins = (name: string) =>
  fetchJson<PluginInfo[]>(`/api/spaces/${name}/plugins`)
export const togglePlugin = (name: string, pluginKey: string, enabled: boolean) =>
  postJson<{ ok: boolean; enabled: boolean }>(`/api/spaces/${name}/plugins/toggle`, { pluginKey, enabled })

export interface PluginFile {
  path: string
  type: 'file' | 'dir'
  size?: number
}

export const fetchPluginFiles = (space: string, marketplace: string, plugin: string) =>
  fetchJson<{ root: string; files: PluginFile[] }>(`/api/spaces/${space}/plugins/${marketplace}/${plugin}/files`)

export const fetchPluginFileContent = (space: string, marketplace: string, plugin: string, filePath: string) =>
  fetchJson<{ content: string | null; size: number; path: string; error?: string }>(
    `/api/spaces/${space}/plugins/${marketplace}/${plugin}/file?path=${encodeURIComponent(filePath)}`
  )
// Plugin Credentials
export const fetchPluginCredentials = (space: string, plugin: string) =>
  fetchJson<{ credentials: CredentialDeclaration[]; configured: Record<string, boolean> }>(`/api/spaces/${space}/plugins/${plugin}/credentials`)

export const savePluginCredential = (space: string, plugin: string, key: string, value: string) =>
  postJson<{ ok: boolean; validation?: { valid: boolean; error?: string } }>(`/api/spaces/${space}/plugins/${plugin}/credentials`, { key, value })

export const deletePluginCredential = (space: string, plugin: string, key: string) =>
  fetch(`/api/spaces/${space}/plugins/${plugin}/credentials/${key}`, { method: 'DELETE' }).then(r => r.json())

export const fetchSkills = (name: string) =>
  fetchJson<SkillDef[]>(`/api/spaces/${name}/skills`)

export const toggleSkill = (name: string, skill: string, enabled: boolean) =>
  postJson<{ ok: boolean; enabled: boolean }>(`/api/spaces/${name}/skills/${encodeURIComponent(skill)}/toggle`, { enabled })

// Agents
export const fetchAgents = (name: string) =>
  fetchJson<AgentDef[]>(`/api/spaces/${name}/agents`)
export const fetchAgentDetail = (name: string, agent: string, source?: string) =>
  fetchJson<AgentDetail>(`/api/spaces/${name}/agents/${agent}${source ? `?source=${encodeURIComponent(source)}` : ''}`)

// Skill detail
export const fetchSkillDetail = (name: string, skill: string, source?: string) =>
  fetchJson<SkillDetail>(`/api/spaces/${name}/skills/${skill}${source ? `?source=${encodeURIComponent(source)}` : ''}`)
export const fetchSkillFileContent = (space: string, skill: string, filePath: string, source?: string) =>
  fetchJson<{ content: string | null; size: number; path: string; error?: string }>(
    `/api/spaces/${space}/skills/${skill}/file?path=${encodeURIComponent(filePath)}${source ? `&source=${encodeURIComponent(source)}` : ''}`
  )

// Model
export const setSpaceModel = (name: string, model: string) =>
  postJson<{ ok: boolean }>(`/api/spaces/${name}/model`, { model })

// Restart Space
export const restartSpace = (name: string) =>
  postJson<{ ok: boolean; message: string }>(`/api/spaces/${name}/restart`, {})

// System Prompt (CLAUDE.md)
export const fetchSystemPrompt = (name: string) =>
  fetchJson<{ content: string; path: string }>(`/api/spaces/${name}/system-prompt`)
export const saveSystemPrompt = (name: string, content: string) =>
  putJson<{ ok: boolean }>(`/api/spaces/${name}/system-prompt`, { content })

// Conversation logs (Claude's session JSONL)
export interface ConversationMessage {
  from: string
  text: string
  timestamp: string
  read: boolean
  role: 'user' | 'assistant' | 'system'
}

export const fetchSpaceConversation = (name: string) =>
  fetchJson<ConversationMessage[]>(`/api/spaces/${name}/conversation`)
export const fetchMasterConversation = () =>
  fetchJson<ConversationMessage[]>('/api/master/conversation')

// Rich conversation types (preserves tool calls, thinking blocks, etc.)
export interface RichTextBlock { type: 'text'; text: string }
export interface RichToolUseBlock { type: 'tool_use'; id: string; name: string; input: Record<string, unknown>; result?: string; is_error?: boolean }
export interface RichToolResultBlock { type: 'tool_result'; tool_use_id: string; content: string; is_error: boolean }
export interface RichThinkingBlock { type: 'thinking'; thinking: string }
export type RichBlock = RichTextBlock | RichToolUseBlock | RichToolResultBlock | RichThinkingBlock

export interface RichUserMessage {
  type: 'user'
  blocks: (RichTextBlock | RichToolResultBlock)[]
  timestamp: string
  origin: string | null
  teammateId: string | null
  teammateColor: string | null
  teammateSummary: string | null
  scheduledPrompt?: string | null
}

export interface RichAssistantMessage {
  type: 'assistant'
  blocks: (RichTextBlock | RichToolUseBlock | RichThinkingBlock)[]
  timestamp: string
  model: string | null
  usage: { input_tokens: number; output_tokens: number; cache_read: number; cache_creation: number } | null
  stopReason: string | null
}

export interface RichSystemMessage {
  type: 'system'
  subtype: string
  text: string
  timestamp: string
  level?: string | null
}

export type RichMessage = RichUserMessage | RichAssistantMessage | RichSystemMessage

export interface ThinkingState {
  isThinking: boolean
  activeTool?: string | null
  turnStart?: string | null
}

export interface RichConversationResponse {
  messages: RichMessage[]
  thinking: ThinkingState
}

export const fetchSpaceRichConversation = (name: string, limit = 200) =>
  fetchJson<RichConversationResponse>(`/api/spaces/${name}/conversation/rich?limit=${limit}`)
export const fetchMasterRichConversation = (limit = 200) =>
  fetchJson<RichConversationResponse>(`/api/master/conversation/rich?limit=${limit}`)
