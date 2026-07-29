import Link from 'next/link'
import { StatusBadge } from '@/components/status-badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { ApplicationStatus } from '@/lib/status'
import { supabaseServer } from '@/lib/supabase/server'

export default async function OfficerQueuePage() {
  const supabase = await supabaseServer()
  const { data: applications } = await supabase
    .from('applications')
    .select('id, company_name, premise_address, business_activity, status, risk_tier, created_at')
    .neq('status', 'DRAFT')
    .neq('status', 'CLOSED') // archived cases live on in the audit log only
    .order('created_at', { ascending: true })

  return (
    <Card>
      <CardHeader>
        <CardTitle data-testid="officer-queue-title">Licensing queue</CardTitle>
        <CardDescription>
          Applications awaiting intake, analysis or officer decision
        </CardDescription>
      </CardHeader>
      <CardContent>
        {applications && applications.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Business</TableHead>
                <TableHead>Activity</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Received</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {applications.map((app) => (
                <TableRow key={app.id} data-testid="queue-row">
                  <TableCell>
                    <Link
                      href={`/officer/cases/${app.id}`}
                      className="font-medium underline-offset-2 hover:underline"
                    >
                      {app.company_name || 'Untitled'}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{app.business_activity}</TableCell>
                  <TableCell className="text-muted-foreground">{app.risk_tier ?? '—'}</TableCell>
                  <TableCell>
                    <StatusBadge status={app.status as ApplicationStatus} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(app.created_at).toLocaleDateString('en-MY')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">The queue is empty.</p>
        )}
      </CardContent>
    </Card>
  )
}
