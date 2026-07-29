'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, FileSearch, FileText, Ruler, Scale } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

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

const STAGES: Array<{
  key: JobRow['stage']
  label: string
  description: string
  Icon: typeof FileSearch
}> = [
  { key: 'intake', label: 'Intake & classification', description: 'Checklist, legibility, consistency', Icon: FileSearch },
  { key: 'signboard', label: 'Signboard analysis', description: 'Text runs and lettering heights', Icon: Ruler },
  { key: 'compliance', label: 'Compliance assessment', description: 'Deterministic rule engine', Icon: Scale },
  { key: 'copilot', label: 'Officer brief', description: 'Draft brief and letter', Icon: FileText },
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
    <Card data-testid="pipeline-progress" className="keyline-top">
      <CardHeader>
        <CardTitle>Processing your application</CardTitle>
        <CardDescription>
          Automated checks run in stages; an MBJB officer makes every decision.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="relative space-y-0">
          {STAGES.map((stage, index) => {
            const job = stageState(jobs, stage.key)
            const state = job?.status ?? 'pending'
            const isLast = index === STAGES.length - 1
            return (
              <li
                key={stage.key}
                className="relative flex gap-4 pb-6 last:pb-0"
                data-testid={`stage-${stage.key}`}
                data-state={state}
              >
                {!isLast ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      'absolute top-9 left-[17px] h-[calc(100%-2.25rem)] w-px',
                      state === 'done' ? 'bg-primary/50' : 'bg-border',
                    )}
                  />
                ) : null}
                <span
                  className={cn(
                    'z-10 flex size-9 shrink-0 items-center justify-center rounded-full border transition-colors',
                    state === 'done' && 'border-primary/50 bg-primary/15 text-emerald-300',
                    state === 'running' && 'animate-pulse border-primary bg-primary/20 text-emerald-200',
                    state === 'parked' && 'border-amber-500/50 bg-amber-500/15 text-amber-300',
                    (state === 'pending' || state === 'queued') && 'border-border bg-card text-muted-foreground',
                  )}
                >
                  {state === 'done' ? (
                    <Check className="size-4" aria-hidden="true" />
                  ) : state === 'parked' ? (
                    <AlertTriangle className="size-4" aria-hidden="true" />
                  ) : (
                    <stage.Icon className="size-4" aria-hidden="true" />
                  )}
                </span>
                <div className="pt-1">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <span className="font-mono text-[11px] text-muted-foreground">
                      0{index + 1}
                    </span>
                    {stage.label}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {state === 'parked'
                      ? 'Paused for an officer to look at — no action needed from you.'
                      : state === 'running'
                        ? 'Running…'
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
