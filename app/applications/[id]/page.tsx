import { notFound } from 'next/navigation'
import { submitApplication, uploadDocument } from '../actions'
import { AppShell } from '@/components/app-shell'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { DOCUMENT_CHECKLIST, MANDATORY_DOC_IDS } from '@/lib/applications/schema'
import { requireUser } from '@/lib/auth'
import type { ApplicationStatus } from '@/lib/status'
import { supabaseServer } from '@/lib/supabase/server'

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await requireUser()
  const { id } = await params
  const supabase = await supabaseServer()

  const { data: application } = await supabase
    .from('applications')
    .select('*')
    .eq('id', id)
    .single()
  if (!application) notFound()

  const { data: documents } = await supabase
    .from('documents')
    .select('doc_type, filename, uploaded_at')
    .eq('application_id', id)
    .order('uploaded_at', { ascending: true })

  const uploadedByType = new Map<string, { filename: string }>()
  for (const doc of documents ?? []) {
    uploadedByType.set(doc.doc_type, { filename: doc.filename })
  }
  const missingMandatory = MANDATORY_DOC_IDS.filter((d) => !uploadedByType.has(d))
  const editable = application.status === 'DRAFT' || application.status === 'DEFICIENT'
  const status = application.status as ApplicationStatus

  const borangRows: Array<[string, string]> = [
    ['Applicant', application.applicant_name],
    ['MyKad / passport', application.ic_or_passport],
    ['Citizenship', application.citizenship === 'warganegara' ? 'Warganegara' : 'Bukan warganegara'],
    ['Phone', application.phone],
    ['Correspondence address', application.correspondence_address],
    ['Company / business', application.company_name],
    ['SSM registration no', application.ssm_registration_no],
    ['Business activity', application.business_activity],
    ['Property tax account', application.property_tax_account_no],
    ['Premise address', application.premise_address],
    ['Floor area', `${application.floor_area_m2} m²`],
    [
      'Signboard size',
      `${application.signboard_width_m} m × ${application.signboard_height_m} m`,
    ],
  ]

  return (
    <AppShell session={session}>
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">{application.company_name}</h1>
            <p className="text-sm text-muted-foreground">Application {id.slice(0, 8)}</p>
          </div>
          <StatusBadge status={status} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Application particulars</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
              {borangRows.map(([label, value]) => (
                <div key={label} className="flex flex-col">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="text-sm">{value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Supporting documents</CardTitle>
            <CardDescription>
              Senarai semak dokumen — all mandatory documents must be uploaded before submission
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {DOCUMENT_CHECKLIST.map((doc) => {
              const uploaded = uploadedByType.get(doc.docId)
              return (
                <div key={doc.docId} data-testid={`doc-slot-${doc.docId}`}>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">
                        {doc.label}{' '}
                        {doc.mandatory ? (
                          <span className="text-destructive">*</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">(optional)</span>
                        )}
                      </p>
                      {uploaded ? (
                        <Badge variant="outline" className="mt-1 bg-green-100 text-green-900" data-testid={`uploaded-${doc.docId}`}>
                          {uploaded.filename}
                        </Badge>
                      ) : (
                        <p className="text-xs text-muted-foreground">Not uploaded</p>
                      )}
                    </div>
                    {editable ? (
                      <form action={uploadDocument} className="flex items-center gap-2">
                        <input type="hidden" name="applicationId" value={id} />
                        <input type="hidden" name="docType" value={doc.docId} />
                        <input
                          type="file"
                          name="file"
                          required
                          accept=".pdf,.png,.jpg,.jpeg"
                          className="max-w-48 text-xs"
                          data-testid={`file-${doc.docId}`}
                        />
                        <Button type="submit" variant="outline" size="sm" data-testid={`upload-${doc.docId}`}>
                          Upload
                        </Button>
                      </form>
                    ) : null}
                  </div>
                  <Separator className="mt-3" />
                </div>
              )
            })}
          </CardContent>
        </Card>

        {editable ? (
          <div className="flex items-center justify-between rounded-lg border bg-background p-4">
            <p className="text-sm text-muted-foreground" data-testid="submit-hint">
              {missingMandatory.length > 0
                ? `${missingMandatory.length} mandatory document(s) still required`
                : 'All mandatory documents uploaded — ready to submit'}
            </p>
            <form action={submitApplication}>
              <input type="hidden" name="applicationId" value={id} />
              <Button type="submit" disabled={missingMandatory.length > 0} data-testid="submit-application">
                {application.status === 'DEFICIENT' ? 'Resubmit application' : 'Submit application'}
              </Button>
            </form>
          </div>
        ) : null}
      </div>
    </AppShell>
  )
}
