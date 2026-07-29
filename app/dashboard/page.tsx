import Link from 'next/link'
import { AppShell } from '@/components/app-shell'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { requireUser } from '@/lib/auth'
import type { ApplicationStatus } from '@/lib/status'
import { supabaseServer } from '@/lib/supabase/server'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>
}) {
  const session = await requireUser()
  const { denied } = await searchParams
  const supabase = await supabaseServer()
  const { data: applications } = await supabase
    .from('applications')
    .select('id, company_name, premise_address, status, created_at')
    .neq('status', 'CLOSED') // archived demo cases stay out of the list
    .order('created_at', { ascending: false })

  return (
    <AppShell session={session}>
      {denied === 'officer' ? (
        <p
          role="alert"
          data-testid="denied-officer"
          className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
        >
          The officer console is restricted to MBJB licensing officers.
        </p>
      ) : null}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>My applications</CardTitle>
            <CardDescription>
              Lesen Premis Perniagaan &amp; Iklan — Majlis Bandaraya Johor Bahru
            </CardDescription>
          </div>
          <Button asChild>
            <Link href="/applications/new" data-testid="new-application">
              New application
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {applications && applications.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Business</TableHead>
                  <TableHead>Premise</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submitted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {applications.map((app) => (
                  <TableRow key={app.id} data-testid="application-row">
                    <TableCell>
                      <Link href={`/applications/${app.id}`} className="font-medium underline-offset-2 hover:underline">
                        {app.company_name || 'Untitled application'}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{app.premise_address}</TableCell>
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
            <p className="py-8 text-center text-sm text-muted-foreground" data-testid="empty-state">
              No applications yet. Start a new application to apply for a licence.
            </p>
          )}
        </CardContent>
      </Card>
    </AppShell>
  )
}
