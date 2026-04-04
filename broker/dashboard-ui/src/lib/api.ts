import type { Space, InboxMessage, ScheduledTask, KnowledgeFile, AgentDef, SkillDef, PluginInfo, SkillDetail, AgentDetail } from './types'

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
  fetchJson<InboxMessage[]>(`/api/spaces/${name}/messages`)
export const fetchMasterMessages = () =>
  fetchJson<InboxMessage[]>('/api/master/messages')

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
  fetchJson<KnowledgeFile[]>(`/api/spaces/${name}/knowledge`)
export const fetchKnowledgeFile = (name: string, file: string) =>
  fetchJson<{ content: string }>(`/api/spaces/${name}/knowledge/${encodeURIComponent(file)}`)
export const saveKnowledgeFile = (name: string, file: string, content: string) =>
  putJson<{ ok: boolean }>(`/api/spaces/${name}/knowledge/${encodeURIComponent(file)}`, { content })

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
export const fetchSkills = (name: string) =>
  fetchJson<SkillDef[]>(`/api/spaces/${name}/skills`)

// Agents
export const fetchAgents = (name: string) =>
  fetchJson<AgentDef[]>(`/api/spaces/${name}/agents`)
export const fetchAgentDetail = (name: string, agent: string) =>
  fetchJson<AgentDetail>(`/api/spaces/${name}/agents/${agent}`)

// Skill detail
export const fetchSkillDetail = (name: string, skill: string) =>
  fetchJson<SkillDetail>(`/api/spaces/${name}/skills/${skill}`)
export const fetchSkillFileContent = (space: string, skill: string, filePath: string) =>
  fetchJson<{ content: string | null; size: number; path: string; error?: string }>(
    `/api/spaces/${space}/skills/${skill}/file?path=${encodeURIComponent(filePath)}`
  )

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
