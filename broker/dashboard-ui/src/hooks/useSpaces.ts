import { useQuery } from '@tanstack/react-query'
import * as api from '@/lib/api'

export function useSpaces() {
  return useQuery({
    queryKey: ['spaces'],
    queryFn: api.fetchSpaces,
    refetchInterval: 10_000,
  })
}

export function useSpace(name: string) {
  return useQuery({
    queryKey: ['space', name],
    queryFn: () => api.fetchSpace(name),
    enabled: !!name,
    refetchInterval: 10_000,
  })
}

export function useMasterStatus() {
  return useQuery({
    queryKey: ['master-status'],
    queryFn: api.fetchMasterStatus,
    refetchInterval: 10_000,
  })
}

export function useSchedules(name: string) {
  return useQuery({
    queryKey: ['schedules', name],
    queryFn: () => api.fetchSchedules(name),
    enabled: !!name,
  })
}

export function useKnowledge(name: string) {
  return useQuery({
    queryKey: ['knowledge', name],
    queryFn: () => api.fetchKnowledge(name),
    enabled: !!name,
  })
}

export function useWorkers(name: string) {
  return useQuery({
    queryKey: ['workers', name],
    queryFn: () => api.fetchWorkers(name),
    enabled: !!name,
  })
}

export function usePlugins(name: string) {
  return useQuery({
    queryKey: ['plugins', name],
    queryFn: () => api.fetchPlugins(name),
    enabled: !!name,
  })
}

export function useSkills(name: string) {
  return useQuery({
    queryKey: ['skills', name],
    queryFn: () => api.fetchSkills(name),
    enabled: !!name,
  })
}

export function useAgents(name: string) {
  return useQuery({
    queryKey: ['agents', name],
    queryFn: () => api.fetchAgents(name),
    enabled: !!name,
  })
}

export function useMasterMessages() {
  return useQuery({
    queryKey: ['master-messages'],
    queryFn: api.fetchMasterMessages,
    refetchInterval: 5_000,
  })
}

export function useSpaceMessages(name: string) {
  return useQuery({
    queryKey: ['space-messages', name],
    queryFn: () => api.fetchSpaceMessages(name),
    enabled: !!name,
    refetchInterval: 5_000,
  })
}
