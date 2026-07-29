import Link from 'next/link'
import { notFound } from 'next/navigation'
import { StatusBadge } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { ApplicationStatus } from '@/lib/status'
import { supabaseServer } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const ACTOR_STYLES: Record<string, string> = {
  human: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
  agent: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  system: 'border-border bg-muted text-muted-foreground',
}

export default async function AuditReplayPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await supabaseServer()

  const { data: application } = await supabase
    .from('applications')
    .select('id, company_name, status')
    .eq('id', id)
    .single()
  if (!application) notFound()

  const [{ data: entries }, { data: profiles }, { data: findings }] = await Promise.all([
    supabase
      .from('audit_log')
      .select('*')
      .eq('application_id', id)
      .order('id', { ascending: true }),
    supabase.from('profiles').select('id, full_name'),
    supabase
      .from('findings')
      .select('rule_id, status, confidence, rule_version, produced_by')
      .eq('application_id', id),
  ])

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Case replay — {application.company_name}</h1>
          <p className="text-sm text-muted-foreground">
            Append-only history; nothing here can be edited or deleted.{' '}
            <Link href={`/officer/cases/${id}`} className="underline">
              Back to the case
            </Link>
          </p>
        </div>
        <StatusBadge status={application.status as ApplicationStatus} />
      </div>

      <Card data-testid="replay-timeline">
        <CardHeader>
          <CardTitle>Ordered history</CardTitle>
          <CardDescription>
            Every action with its actor; model and rule versions where an agent or the engine was
            involved.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="relative space-y-3 border-l border-border/70 pl-5">
            {(entries ?? []).map((entry) => {
              const detail = entry.detail as Record<string, unknown>
              const reason = typeof detail.reason === 'string' ? detail.reason : null
              const actorName =
                entry.actor_type === 'human'
                  ? (nameById.get(entry.actor_id ?? '') ?? entry.actor_id)
                  : entry.actor_id
              return (
                <li key={entry.id} className="relative rounded-lg border bg-card p-3" data-testid={`replay-${entry.action}`}>
                  <span
                    aria-hidden="true"
                    className="absolute top-5 -left-[calc(1.25rem+3.5px)] size-1.5 rounded-full bg-primary/70"
                  />
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-mono text-xs text-muted-foreground">
                      {new Date(entry.created_at).toLocaleString('en-MY')}
                    </span>
                    <Badge variant="outline" className={ACTOR_STYLES[entry.actor_type]}>
                      {entry.actor_type}: {actorName}
                    </Badge>
                    <span className="font-mono text-sm font-medium">{entry.action}</span>
                    {entry.model_version ? (
                      <Badge variant="outline" data-testid="model-version">
                        model {entry.model_version}
                      </Badge>
                    ) : null}
                    {entry.rule_version ? (
                      <Badge variant="outline" data-testid="rule-version">
                        rules {entry.rule_version}
                      </Badge>
                    ) : null}
                    {entry.tokens ? (
                      <span className="text-xs text-muted-foreground">
                        tokens {(entry.tokens as { input: number }).input}/
                        {(entry.tokens as { output: number }).output}
                      </span>
                    ) : null}
                  </div>
                  {reason ? (
                    <p className="mt-1 text-sm" data-testid="replay-reason">
                      Reason: {reason}
                    </p>
                  ) : null}
                  {Object.keys(detail).length > 0 && !reason ? (
                    <pre className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                      {JSON.stringify(detail, null, 2)}
                    </pre>
                  ) : null}
                </li>
              )
            })}
          </ol>
        </CardContent>
      </Card>

      {(findings ?? []).length > 0 ? (
        <Card data-testid="replay-findings">
          <CardHeader>
            <CardTitle>Findings in force</CardTitle>
            <CardDescription>Confidence and provenance per finding.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 text-sm sm:grid-cols-2">
              {(findings ?? []).map((f) => (
                <li key={f.rule_id} className="flex items-center justify-between rounded border px-2 py-1">
                  <span className="font-medium">{f.rule_id}</span>
                  <span className="text-xs text-muted-foreground">
                    {f.status} · conf {f.confidence ?? '—'} · {f.rule_version} ·{' '}
                    {(f.produced_by as { engine?: string }).engine}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
