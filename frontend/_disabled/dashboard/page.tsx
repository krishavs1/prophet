"use client"

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

type Project = {
  id: string
  name: string
  description?: string | null
  createdAt: string
  updatedAt: string
}

export default function DashboardPage(): JSX.Element {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [creating, setCreating] = useState<boolean>(false)
  const [name, setName] = useState<string>('My First Project')
  const [description, setDescription] = useState<string>('')

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const res = await fetch('/api/projects', { cache: 'no-store' })
        const data = (await res.json()) as { projects: Project[] }
        if (mounted) setProjects(data.projects)
      } catch {
        // prettier-ignore
        console.log('[dashboard] failed to load projects')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  async function createProject(): Promise<void> {
    try {
      setCreating(true)
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: description || undefined }),
      })
      if (!res.ok) throw new Error('create failed')
      const { project } = (await res.json()) as { project: Project }
      setProjects((p) => [project, ...p])
      setName('My Project')
      setDescription('')
    } catch (e) {
      // prettier-ignore
      console.log('[dashboard] create project error', e)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className=\"mx-auto max-w-4xl px-6 py-10\">
      <div className=\"mb-8 flex items-center justify-between\">
        <h1 className=\"text-2xl font-bold\">Your Projects</h1>
        <Link href=\"/\">
          <Button variant=\"outline\">Home</Button>
        </Link>
      </div>

      <div className=\"mb-10 rounded-lg border border-border bg-card p-4\">
        <h2 className=\"mb-3 font-semibold\">Create Project</h2>
        <div className=\"grid gap-3 sm:grid-cols-2\">
          <input
            className=\"rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent\"
            placeholder=\"Project name\"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className=\"rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent\"
            placeholder=\"Description (optional)\"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className=\"mt-3\">
          <Button onClick={createProject} disabled={creating || !name.trim()}>
            {creating ? 'Creating...' : 'Create'}
          </Button>
        </div>
      </div>

      {loading ? (
        <p className=\"text-sm text-muted-foreground\">Loading...</p>
      ) : projects.length === 0 ? (
        <p className=\"text-sm text-muted-foreground\">No projects yet. Create one to begin.</p>
      ) : (
        <ul className=\"grid gap-4\">
          {projects.map((p) => (
            <li key={p.id} className=\"rounded-lg border border-border bg-card p-4\">
              <div className=\"flex items-center justify-between\">
                <div>
                  <h3 className=\"font-semibold\">{p.name}</h3>
                  {p.description ? <p className=\"text-sm text-muted-foreground\">{p.description}</p> : null}
                </div>
                <Link href={`/projects/${p.id}`}>
                  <Button variant=\"secondary\">Open</Button>
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

