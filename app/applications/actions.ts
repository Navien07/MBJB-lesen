'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import {
  ACCEPTED_UPLOAD_TYPES,
  BorangSchema,
  DOCUMENT_CHECKLIST,
  MANDATORY_DOC_IDS,
  MAX_UPLOAD_BYTES,
} from '@/lib/applications/schema'
import type { FormState } from '@/lib/applications/form-state'
import { writeAudit } from '@/lib/audit'
import { requireUser } from '@/lib/auth'
import { supabaseServer, supabaseService } from '@/lib/supabase/server'

export async function createApplication(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireUser()
  const raw = Object.fromEntries(
    [...formData.entries()].filter(([key]) => !key.startsWith('$')),
  )
  const parsed = BorangSchema.safeParse(raw)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '')
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message
    }
    return { error: 'Please correct the highlighted fields.', fieldErrors }
  }

  const supabase = await supabaseServer()
  const { data, error } = await supabase
    .from('applications')
    .insert({ ...parsed.data, applicant_id: session.userId, status: 'DRAFT' })
    .select('id')
    .single()
  if (error) return { error: error.message, fieldErrors: {} }

  await writeAudit(supabase, {
    application_id: data.id,
    actor_type: 'human',
    actor_id: session.userId,
    action: 'application.draft_created',
    detail: { company_name: parsed.data.company_name },
  })

  redirect(`/applications/${data.id}`)
}

export async function uploadDocument(formData: FormData): Promise<void> {
  const session = await requireUser()
  const applicationId = String(formData.get('applicationId') ?? '')
  const docType = String(formData.get('docType') ?? '')
  const file = formData.get('file')

  if (!applicationId || !DOCUMENT_CHECKLIST.some((d) => d.docId === docType)) {
    throw new Error('unknown application or document type')
  }
  if (!(file instanceof File) || file.size === 0) {
    throw new Error('no file supplied')
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('file exceeds the 10 MB limit')
  }
  if (!ACCEPTED_UPLOAD_TYPES.includes(file.type)) {
    throw new Error('only PDF, PNG or JPEG uploads are accepted')
  }

  const supabase = await supabaseServer()
  const path = `${session.userId}/${applicationId}/${docType}/${Date.now()}-${file.name}`
  const { error: storageError } = await supabase.storage
    .from('documents')
    .upload(path, file, { contentType: file.type })
  if (storageError) throw new Error(`upload failed: ${storageError.message}`)

  const { error: rowError } = await supabase.from('documents').insert({
    application_id: applicationId,
    doc_type: docType,
    storage_path: path,
    filename: file.name,
    mime_type: file.type,
  })
  if (rowError) throw new Error(`document record failed: ${rowError.message}`)

  await writeAudit(supabase, {
    application_id: applicationId,
    actor_type: 'human',
    actor_id: session.userId,
    action: 'document.uploaded',
    detail: { doc_type: docType, filename: file.name },
  })

  revalidatePath(`/applications/${applicationId}`)
}

export async function submitApplication(formData: FormData): Promise<void> {
  const session = await requireUser()
  const applicationId = String(formData.get('applicationId') ?? '')

  const supabase = await supabaseServer()
  const { data: application, error: appError } = await supabase
    .from('applications')
    .select('id, status')
    .eq('id', applicationId)
    .single()
  if (appError || !application) throw new Error('application not found')
  if (application.status !== 'DRAFT' && application.status !== 'DEFICIENT') {
    throw new Error(`cannot submit from status ${application.status}`)
  }

  const { data: documents } = await supabase
    .from('documents')
    .select('doc_type')
    .eq('application_id', applicationId)
  const uploaded = new Set((documents ?? []).map((d) => d.doc_type))
  const missing = MANDATORY_DOC_IDS.filter((id) => !uploaded.has(id))
  if (missing.length > 0) {
    throw new Error(`missing mandatory documents: ${missing.join(', ')}`)
  }

  const resubmission = application.status === 'DEFICIENT'
  const { error: statusError } = await supabase
    .from('applications')
    .update({ status: 'SUBMITTED' })
    .eq('id', applicationId)
  if (statusError) throw new Error(`submission failed: ${statusError.message}`)

  await writeAudit(supabase, {
    application_id: applicationId,
    actor_type: 'human',
    actor_id: session.userId,
    action: resubmission ? 'application.resubmitted' : 'application.submitted',
    detail: { document_count: documents?.length ?? 0 },
  })

  // enqueueing the pipeline is a system act, not an applicant one
  const { error: jobError } = await supabaseService().from('jobs').insert({
    application_id: applicationId,
    stage: 'intake',
    status: 'queued',
  })
  if (jobError) throw new Error(`pipeline enqueue failed: ${jobError.message}`)

  revalidatePath(`/applications/${applicationId}`)
}
