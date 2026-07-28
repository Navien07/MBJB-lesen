'use client'

import { useActionState, useState } from 'react'
import { overrideFinding, type OfficerActionState } from '../actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export interface EvidenceObservation {
  id: string
  run_text: string
  role: string
  language: string
  relative_glyph_height: number
  bbox: { x: number; y: number; w: number; h: number } | null
}

export interface FindingView {
  id: string
  rule_id: string
  status: 'compliant' | 'non_compliant' | 'escalated'
  severity: 'critical' | 'major' | 'advisory'
  confidence: number | null
  corrective_action: string | null
  observed_value: Record<string, unknown> | null
  rule_version: string
  produced_by: { engine: string | null; model: string | null }
  evidence: {
    document_id?: string
    observation_ids?: string[]
    detail?: Record<string, unknown>
  } | null
  documentName: string | null
  artworkUrl: string | null
  observations: EvidenceObservation[]
  override: { to_status: string; reason: string } | null
}

const SEVERITIES = ['critical', 'major', 'advisory'] as const
const STATUS_STYLES: Record<FindingView['status'], string> = {
  compliant: 'bg-green-100 text-green-900',
  non_compliant: 'bg-red-100 text-red-900',
  escalated: 'bg-amber-100 text-amber-900',
}

function OverrideForm({ finding, applicationId }: { finding: FindingView; applicationId: string }) {
  const [state, formAction, pending] = useActionState<OfficerActionState, FormData>(
    overrideFinding,
    { error: null },
  )
  return (
    <form action={formAction} className="space-y-3 border-t pt-4">
      <input type="hidden" name="applicationId" value={applicationId} />
      <input type="hidden" name="findingId" value={finding.id} />
      <input type="hidden" name="ruleId" value={finding.rule_id} />
      <input type="hidden" name="fromStatus" value={finding.status} />
      <input
        type="hidden"
        name="toStatus"
        value={finding.status === 'non_compliant' ? 'acceptable' : 'not_acceptable'}
      />
      <Label htmlFor={`reason-${finding.id}`}>
        Override this finding — written reason (required)
      </Label>
      <Textarea
        id={`reason-${finding.id}`}
        name="reason"
        rows={2}
        placeholder="Why the engine's finding does not apply in this case…"
        data-testid={`override-reason-${finding.rule_id}`}
      />
      {state.error ? (
        <p role="alert" className="text-xs text-destructive" data-testid={`override-error-${finding.rule_id}`}>
          {state.error}
        </p>
      ) : null}
      <Button type="submit" variant="outline" size="sm" disabled={pending} data-testid={`override-submit-${finding.rule_id}`}>
        Record override
      </Button>
    </form>
  )
}

function EvidenceDialog({ finding, applicationId }: { finding: FindingView; applicationId: string }) {
  const observed = finding.observed_value ?? {}
  return (
    <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>
          {finding.rule_id} <span className="text-muted-foreground">v{finding.rule_version}</span>
        </DialogTitle>
        <DialogDescription>
          Produced by {finding.produced_by.engine ?? 'unknown engine'}; model:{' '}
          {finding.produced_by.model ?? 'none'} · confidence {finding.confidence ?? '—'}
        </DialogDescription>
      </DialogHeader>

      {finding.artworkUrl ? (
        <figure className="space-y-2">
          {/* Storage-signed URL; next/image cannot optimise it, and evidence must be exact */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={finding.artworkUrl}
            alt={`Signboard artwork evidence for ${finding.rule_id}`}
            className="w-full rounded border"
            data-testid="evidence-artwork"
          />
          <figcaption className="text-xs text-muted-foreground">
            {finding.documentName} — the runs this finding measured:
          </figcaption>
        </figure>
      ) : finding.documentName ? (
        <p className="text-sm" data-testid="evidence-document">
          Evidence document: <span className="font-medium">{finding.documentName}</span>
        </p>
      ) : null}

      {finding.observations.length > 0 ? (
        <ul className="space-y-1 text-sm" data-testid="evidence-observations">
          {finding.observations.map((obs) => (
            <li key={obs.id} className="flex items-baseline justify-between gap-3 rounded border px-2 py-1">
              <span className="truncate font-medium">{obs.run_text}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {obs.role} · height {obs.relative_glyph_height}
                {obs.bbox ? ` · region [${obs.bbox.x}, ${obs.bbox.y}, ${obs.bbox.w}×${obs.bbox.h}]` : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {Object.keys(observed).length > 0 ? (
        <div className="rounded bg-muted p-3 text-xs" data-testid="evidence-observed">
          <p className="mb-1 font-medium">Observed value</p>
          <pre className="whitespace-pre-wrap">{JSON.stringify(observed, null, 2)}</pre>
        </div>
      ) : null}

      {finding.corrective_action ? (
        <p className="text-sm">{finding.corrective_action}</p>
      ) : null}

      {finding.override ? (
        <p className="rounded border border-amber-300 bg-amber-50 p-2 text-sm" data-testid={`overridden-${finding.rule_id}`}>
          Overridden as <span className="font-medium">{finding.override.to_status}</span>:{' '}
          {finding.override.reason}
        </p>
      ) : (
        <OverrideForm finding={finding} applicationId={applicationId} />
      )}
    </DialogContent>
  )
}

export function FindingsPanel({
  findings,
  applicationId,
}: {
  findings: FindingView[]
  applicationId: string
}) {
  const [open, setOpen] = useState<string | null>(null)

  return (
    <div className="space-y-6">
      {SEVERITIES.map((severity) => {
        const group = findings.filter((f) => f.severity === severity)
        if (group.length === 0) return null
        return (
          <section key={severity} data-testid={`severity-${severity}`}>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {severity} ({group.length})
            </h3>
            <ul className="space-y-2">
              {group.map((finding) => (
                <li key={finding.id}>
                  <Dialog
                    open={open === finding.id}
                    onOpenChange={(next) => setOpen(next ? finding.id : null)}
                  >
                    <DialogTrigger asChild>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-3 rounded-lg border bg-background p-3 text-left hover:bg-muted/50"
                        data-testid={`finding-${finding.rule_id}`}
                      >
                        <span className="min-w-0">
                          <span className="font-medium">{finding.rule_id}</span>
                          {finding.corrective_action ? (
                            <span className="block truncate text-xs text-muted-foreground">
                              {finding.corrective_action}
                            </span>
                          ) : null}
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          {finding.override ? (
                            <Badge variant="outline" className="bg-amber-100 text-amber-900">
                              overridden
                            </Badge>
                          ) : null}
                          <Badge variant="outline" className={STATUS_STYLES[finding.status]}>
                            {finding.status.replace('_', ' ')}
                          </Badge>
                        </span>
                      </button>
                    </DialogTrigger>
                    <EvidenceDialog finding={finding} applicationId={applicationId} />
                  </Dialog>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
