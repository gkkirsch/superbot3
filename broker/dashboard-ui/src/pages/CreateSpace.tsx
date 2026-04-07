import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createSpace } from '@/lib/api'

export function CreateSpace() {
  const [name, setName] = useState('')
  const [codeDir, setCodeDir] = useState('')
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => createSpace({ name, codeDir: codeDir || undefined }),
    onSuccess: (space) => {
      queryClient.invalidateQueries({ queryKey: ['spaces'] })
      navigate(`/spaces/${space.slug}`)
    },
  })

  const slug = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-')

  return (
    <div className="max-w-md mx-auto p-6 mt-12">
      <h1 className="text-lg font-semibold text-foreground mb-6">Create Space</h1>

      <form
        onSubmit={e => {
          e.preventDefault()
          if (!name.trim()) return
          mutation.mutate()
        }}
        className="space-y-4"
      >
        <div>
          <label className="block text-sm text-stone mb-1">Space Name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="HostReply AI"
            className="w-full bg-muted rounded-md px-3 py-2 text-sm text-foreground placeholder:text-stone outline-none focus:ring-1 focus:ring-sand/50"
          />
          {name && (
            <div className="text-xs text-stone mt-1">Directory: {slug}</div>
          )}
        </div>

        <div>
          <label className="block text-sm text-stone mb-1">Code Directory (optional)</label>
          <input
            value={codeDir}
            onChange={e => setCodeDir(e.target.value)}
            placeholder="/path/to/project"
            className="w-full bg-muted rounded-md px-3 py-2 text-sm text-foreground placeholder:text-stone outline-none focus:ring-1 focus:ring-sand/50"
          />
        </div>

        <button
          type="submit"
          disabled={!name.trim() || mutation.isPending}
          className="w-full bg-sand/20 text-sand hover:bg-sand/30 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-40 transition-colors"
        >
          {mutation.isPending ? 'Creating...' : 'Create Space'}
        </button>

        {mutation.isError && (
          <div className="text-xs text-ember">
            Failed: {(mutation.error as Error).message}
          </div>
        )}
      </form>
    </div>
  )
}
