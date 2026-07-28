import Link from 'next/link'
import { notFound } from 'next/navigation'
import { startReview } from '../actions'
import { DecisionForm } from './decision-form'
import { FindingsPanel, type FindingView } from './findings-panel'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { CopilotResult } from '@/lib/agents/copilot/schema'
import { requireOfficer } from '@/lib/auth'
import type { ApplicationStatus } from '@/lib/status'
import { supabaseServer } from '@/lib/supabase/server'

export default async function OfficerCasePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireOfficer()
  const { id } = await params
  const supabase = await supabaseServer()

  const { data: application } = await supabase.from('applications').select('*').eq('id', id).single()
  if (!application) notFound()
  const status = application.status as ApplicationStatus

  const [{ data: findings }, { data: escalations }, { data: documents }, { data: observations }, { data: overrides }] =
    await Promise.all([
      supabase.from('findings').select('*').eq('application_id', id).order('severity'),
      supabase.from('escalations').select('*').eq('application_id', id),
      supabase.from('documents').select('id, doc_type, filename, mime_type, storage_path').eq('application_id', id),
      supabase.from('signboard_observations').select('*').eq('application_id', id),
      supabase
        .from('audit_log')
        .select('detail')
        .eq('application_id', id)
        .eq('action', 'finding.overridden'),
    ])

  const documentById = new Map((documents ?? []).map((d) => [d.id, d]))
  const observationById = new Map((observations ?? []).map((o) => [o.id, o]))
  const overrideByFinding = new Map(
    (overrides ?? []).map((o) => {
      const detail = o.detail as { finding_id: string; to_status: string; reason: string }
      return [detail.finding_id, { to_status: detail.to_status, reason: detail.reason }]
    }),
  )

  // sign artwork URLs once per referenced document
  const artworkUrls = new Map<string, string>()
  for (const docId of new Set(
    (findings ?? [])
      .map((f) => (f.evidence as { document_id?: string } | null)?.document_id)
      .filter((d): d is string => Boolean(d)),
  )) {
    const doc = documentById.get(docId)
    if (doc && doc.mime_type.startsWith('image/')) {
      const { data: signed } = await supabase.storage
        .from('documents')
        .createSignedUrl(doc.storage_path, 3600)
      if (signed?.signedUrl) artworkUrls.set(docId, signed.signedUrl)
    }
  }

  const findingViews: FindingView[] = (findings ?? []).map((f) => {
    const evidence = f.evidence as FindingView['evidence']
    const docId = evidence?.document_id
    const doc = docId ? documentById.get(docId) : undefined
    const obs = (evidence?.observation_ids ?? [])
      .map((oid) => observationById.get(oid))
      .filter((o): o is NonNullable<typeof o> => Boolean(o))
      .map((o) => ({
        id: o.id,
        run_text: o.run_text,
        role: o.role,
        language: o.language,
        relative_glyph_height: Number(o.relative_glyph_height),
        bbox: o.bbox,
      }))
    return {
      id: f.id,
      rule_id: f.rule_id,
      status: f.status,
      severity: f.severity as FindingView['severity'],
      confidence: f.confidence === null ? null : Number(f.confidence),
      corrective_action: f.corrective_action,
      observed_value: f.observed_value,
      rule_version: f.rule_version,
      produced_by: f.produced_by,
      evidence,
      documentName: doc?.filename ?? null,
      artworkUrl: (docId && artworkUrls.get(docId)) || null,
      observations: obs,
      override: overrideByFinding.get(f.id) ?? null,
    }
  })

  const copilot = application.copilot_result as CopilotResult | null
  const draftConditions = (copilot?.suggested_conditions ?? [])
    .map((c) => `${c.rule_id} :: ${c.condition}`)
    .join('\n')

  const decided = ['APPROVED', 'APPROVED_WITH_CONDITIONS', 'AMENDMENT_REQUESTED', 'REJECTED'].includes(status)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold" data-testid="case-title">
            {application.company_name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {application.business_activity} · {application.premise_address} · risk{' '}
            {application.risk_tier ?? '—'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={status} />
          {status === 'ASSESSED' ? (
            <form action={startReview}>
              <input type="hidden" name="applicationId" value={id} />
              <Button type="submit" data-testid="start-review">
                Start review
              </Button>
            </form>
          ) : null}
        </div>
      </div>

      {copilot ? (
        <Card>
          <CardHeader>
            <CardTitle>Officer brief</CardTitle>
            <CardDescription>
              Drafted from the findings — risk rank <strong>{copilot.risk_rank}</strong>. The
              findings below are the facts; this brief may not contradict them.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap font-sans text-sm" data-testid="officer-brief">
              {copilot.brief_md}
            </pre>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Findings</CardTitle>
          <CardDescription>
            Click a finding to open its evidence. Overrides require a written reason and are
            recorded in the append-only audit log.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {findingViews.length > 0 ? (
            <FindingsPanel findings={findingViews} applicationId={id} />
          ) : (
            <p className="text-sm text-muted-foreground">No findings yet — the pipeline may still be running.</p>
          )}
        </CardContent>
      </Card>

      {(escalations ?? []).length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Escalations — officer determination required</CardTitle>
            <CardDescription>
              The system declined to determine these; they are yours to decide.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {(escalations ?? []).map((esc) => (
                <li key={esc.id} className="rounded-lg border p-3" data-testid={`escalation-${esc.rule_id}`}>
                  <p className="text-sm font-medium">{esc.rule_id}</p>
                  <p className="text-sm text-muted-foreground">{esc.reason}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {status === 'OFFICER_REVIEW' ? (
        <DecisionForm
          applicationId={id}
          draftLetter={copilot?.letter_md ?? ''}
          draftConditions={draftConditions}
        />
      ) : null}

      {decided ? (
        <Card data-testid="decision-recorded">
          <CardHeader>
            <CardTitle>Decision recorded</CardTitle>
            <CardDescription>
              This case is {status.replaceAll('_', ' ').toLowerCase()}.{' '}
              <Link className="underline" href={`/officer/cases/${id}/replay`}>
                View the full audit replay
              </Link>
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}
    </div>
  )
}
