'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface JobRow {
  stage: 'intake' | 'signboard' | 'compliance' | 'copilot'
  status: 'queued' | 'running' | 'done' | 'failed' | 'parked'
  attempts: number
  last_error: string | null
}

interface Progress {
  status: string
  deficiency_notice: { deficiencies: Array<{ doc_id: string; label: string; reason: string }> } | null
  jobs: JobRow[]
}

const STAGES: Array<{ key: JobRow['stage']; label: string; description: string }> = [
  { key: 'intake', label: 'Intake & classification', description: 'Checklist, legibility, consistency' },
  { key: 'signboard', label: 'Signboard analysis', description: 'Text runs and lettering heights' },
  { key: 'compliance', label: 'Compliance assessment', description: 'Deterministic rule engine' },
  { key: 'copilot', label: 'Officer brief', description: 'Draft brief and letter' },
]

const ACTIVE_STATUSES = ['SUBMITTED', 'INTAKE_CHECK', 'ANALYSING']

function stageState(jobs: JobRow[], stage: JobRow['stage']): JobRow | undefined {
  return [...jobs].reverse().find((j) => j.stage === stage)
}

export function PipelineProgress({ applicationId, initialStatus }: { applicationId: string; initialStatus: string }) {
  const [progress, setProgress] = useState<Progress | null>(null)
  const router = useRouter()

  useEffect(() => {
    let stop = false
    let timer: ReturnType<typeof setTimeout>

    async function poll() {
      try {
        const res = await fetch(`/api/applications/${applicationId}/progress`, { cache: 'no-store' })
        if (res.ok) {
          const next: Progress = (await res.json()) as Progress
          setProgress((prev) => {
            if (next.status !== (prev?.status ?? initialStatus)) router.refresh()
            return next
          })
          if (!ACTIVE_STATUSES.includes(next.status)) return // settled; stop polling
        }
      } catch {
        // transient poll failures are fine; the next tick retries
      }
      if (!stop) timer = setTimeout(poll, 1500)
    }

    if (ACTIVE_STATUSES.includes(initialStatus)) void poll()
    return () => {
      stop = true
      clearTimeout(timer)
    }
  }, [applicationId, initialStatus, router])

  if (!ACTIVE_STATUSES.includes(progress?.status ?? initialStatus)) return null

  const jobs = progress?.jobs ?? []

  return (
    <Card data-testid="pipeline-progress">
      <CardHeader>
        <CardTitle>Processing your application</CardTitle>
        <CardDescription>
          Automated checks run in stages; an MBJB officer makes every decision.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="space-y-3">
          {STAGES.map((stage) => {
            const job = stageState(jobs, stage.key)
            const state = job?.status ?? 'pending'
            const marker =
              state === 'done' ? '✓' : state === 'running' ? '●' : state === 'parked' ? '⚠' : '○'
            return (
              <li
                key={stage.key}
                className="flex items-start gap-3"
                data-testid={`stage-${stage.key}`}
                data-state={state}
              >
                <span
                  className={
                    state === 'done'
                      ? 'text-green-600'
                      : state === 'running'
                        ? 'animate-pulse text-blue-600'
                        : state === 'parked'
                          ? 'text-amber-600'
                          : 'text-muted-foreground'
                  }
                >
                  {marker}
                </span>
                <div>
                  <p className="text-sm font-medium">{stage.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {state === 'parked'
                      ? 'Paused for an officer to look at — no action needed from you.'
                      : stage.description}
                  </p>
                </div>
              </li>
            )
          })}
        </ol>
      </CardContent>
    </Card>
  )
}
