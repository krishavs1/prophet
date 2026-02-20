"use client"

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

type Project = {
  id: string
  name: string
  description?: string | null
}

type Run = {
  id: string
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED'
  createdAt: string
  updatedAt: string
}

export default function ProjectPage(): JSX.Element {
  const params = useParams<{ projectId: string }>()
  const router = useRouter()
  const projectId = params.projectId
  const [project, setProject] = useState<Project | null>(null)
  const [runs, setRuns] = useState<Run[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [creating, setCreating] = useState<boolean>(false)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const [pRes, rRes] = await Promise.all([
          fetch(`/api/projects/${projectId}`, { cache: 'no-store' }),
          fetch(`/api/projects/${projectId}/runs`, { cache: 'no-store' }),
        ])
        if (!pRes.ok) {
          router.replace('/dashboard')
          return
        }
        const { project } = (await pRes.json()) as { project: Project }
        const { runs } = (await rRes.json()) as { runs: Run[] }
        if (mounted) {
          setProject(project)
          setRuns(runs)
        }
      } catch {
        // prettier-ignore
        console.log('[project] load failed')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [projectId, router])

  async function createRun(): Promise<void> {
    try {
      setCreating(true)
      const res = await fetch(`/api/projects/${projectId}/runs`, { method: 'POST' })
      if (!res.ok) throw new Error('create failed')
      const { run } = (await res.json()) as { run: Run }
      setRuns((r) => [run, ...r])
      // Immediately open the pipeline UI in context of this run
      router.push(`/analyze?projectId=${projectId}&runId=${run.id}`)
    } catch (e) {
      // prettier-ignore
      console.log('[project] create run error', e)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{project?.name ?? 'Project'}</h1>
        <Link href="/dashboard">
          <Button variant="outline">Back</Button>
        </Link>
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : !project ? (
        <p className="text-sm text-muted-foreground">Project not found.</p>
      ) : (
        <>
          {project.description ? <p className="mb-6 text-sm text-muted-foreground">{project.description}</p> : null}
          <div className="mb-6">
            <Button onClick={createRun} disabled={creating}>
              {creating ? 'Creating...' : 'New Run'}
            </Button>
          </div>
          <h2 className="mb-3 font-semibold">Runs</h2>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No runs yet.</p>
          ) : (
            <ul className="grid gap-3">
              {runs.map((run) => (
                <li key={run.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
                  <div>
                    <p className="font-mono text-xs text-muted-foreground">Run {run.id.slice(0, 8)}</p>
                    <p className="text-sm">Status: {run.status}</p>
                  </div>
                  <Link href={`/analyze?projectId=${projectId}&runId=${run.id}`}>
                    <Button variant="secondary">Open Pipeline</Button>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

