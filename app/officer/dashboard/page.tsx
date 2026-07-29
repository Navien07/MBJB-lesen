import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DOCUMENT_CHECKLIST } from '@/lib/applications/schema'
import { STATUS_LABELS, type ApplicationStatus } from '@/lib/status'
import { supabaseServer } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function rate(numerator: number, denominator: number): string {
  if (denominator === 0) return '—'
  return `${Math.round((numerator / denominator) * 1000) / 10}%`
}

export default async function OfficerDashboardPage() {
  const supabase = await supabaseServer()

  const [{ data: applications }, { data: findings }, { data: overrides }, { data: decisions }, { data: notices }] =
    await Promise.all([
      supabase.from('applications').select('status'),
      supabase.from('findings').select('rule_id'),
      supabase.from('audit_log').select('detail').eq('action', 'finding.overridden'),
      supabase.from('decisions').select('outcome'),
      supabase.from('audit_log').select('detail').eq('action', 'deficiency.notice_issued'),
    ])

  // override rate per rule — the honest measure of whether the AI is any good
  const findingsByRule = new Map<string, number>()
  for (const f of findings ?? []) {
    findingsByRule.set(f.rule_id, (findingsByRule.get(f.rule_id) ?? 0) + 1)
  }
  const overridesByRule = new Map<string, number>()
  for (const o of overrides ?? []) {
    const ruleId = (o.detail as { rule_id?: string }).rule_id
    if (ruleId) overridesByRule.set(ruleId, (overridesByRule.get(ruleId) ?? 0) + 1)
  }
  const overrideRows = [...findingsByRule.entries()]
    .map(([ruleId, count]) => ({
      ruleId,
      findings: count,
      overrides: overridesByRule.get(ruleId) ?? 0,
    }))
    .sort((a, b) => b.overrides / b.findings - a.overrides / a.findings || b.findings - a.findings)

  const statusCounts = new Map<string, number>()
  for (const a of applications ?? []) {
    statusCounts.set(a.status, (statusCounts.get(a.status) ?? 0) + 1)
  }

  const decisionCounts = new Map<string, number>()
  for (const d of decisions ?? []) {
    decisionCounts.set(d.outcome, (decisionCounts.get(d.outcome) ?? 0) + 1)
  }

  const deficiencyCounts = new Map<string, number>()
  for (const n of notices ?? []) {
    const deficiencies = (n.detail as { deficiencies?: Array<{ doc_id: string }> }).deficiencies ?? []
    for (const d of deficiencies) {
      deficiencyCounts.set(d.doc_id, (deficiencyCounts.get(d.doc_id) ?? 0) + 1)
    }
  }
  const checklistLabel = new Map(DOCUMENT_CHECKLIST.map((d) => [d.docId, d.label]))

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Licensing dashboard</h1>

      {/* deliberately first and full-width: the honest measure of the AI */}
      <Card data-testid="override-rate" className="keyline-top">
        <CardHeader>
          <CardTitle>Officer override rate per rule</CardTitle>
          <CardDescription>
            How often officers overrule the engine&apos;s findings. A high rate means the rule —
            or the system — is wrong, and is the first thing to investigate.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {overrideRows.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rule</TableHead>
                  <TableHead className="text-right">Findings</TableHead>
                  <TableHead className="text-right">Overridden</TableHead>
                  <TableHead className="text-right">Override rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overrideRows.map((row) => (
                  <TableRow key={row.ruleId} data-testid={`override-row-${row.ruleId}`}>
                    <TableCell className="font-mono font-medium">{row.ruleId}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{row.findings}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{row.overrides}</TableCell>
                    <TableCell
                      className={`text-right font-mono font-semibold tabular-nums ${row.overrides > 0 ? 'text-amber-300' : 'text-emerald-300'}`}
                      data-testid={`override-rate-${row.ruleId}`}
                    >
                      {rate(row.overrides, row.findings)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No findings yet.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-3">
        <Card data-testid="volume-by-status">
          <CardHeader>
            <CardTitle>Volume by status</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {Object.entries(STATUS_LABELS).map(([status, label]) => {
                const count = statusCounts.get(status) ?? 0
                if (count === 0) return null
                return (
                  <li key={status} className="flex justify-between" data-testid={`status-count-${status}`}>
                    <span>{label}</span>
                    <span className="font-medium">{count}</span>
                  </li>
                )
              })}
              {statusCounts.size === 0 ? (
                <li className="text-muted-foreground">No applications yet.</li>
              ) : null}
            </ul>
          </CardContent>
        </Card>

        <Card data-testid="deficiency-reasons">
          <CardHeader>
            <CardTitle>Top deficiency reasons</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {[...deficiencyCounts.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([docId, count]) => (
                  <li key={docId} className="flex justify-between gap-2">
                    <span className="truncate">{checklistLabel.get(docId) ?? docId}</span>
                    <span className="shrink-0 font-medium">{count}</span>
                  </li>
                ))}
              {deficiencyCounts.size === 0 ? (
                <li className="text-muted-foreground">No deficiency notices issued.</li>
              ) : null}
            </ul>
          </CardContent>
        </Card>

        <Card data-testid="decision-mix">
          <CardHeader>
            <CardTitle>Decision mix</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {[...decisionCounts.entries()].map(([outcome, count]) => (
                <li key={outcome} className="flex justify-between">
                  <span>{STATUS_LABELS[outcome as ApplicationStatus] ?? outcome}</span>
                  <span className="font-medium">{count}</span>
                </li>
              ))}
              {decisionCounts.size === 0 ? (
                <li className="text-muted-foreground">No decisions yet.</li>
              ) : null}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
