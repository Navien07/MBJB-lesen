import { NextResponse } from 'next/server'
import { workerDepsFromEnv } from '@/lib/pipeline/factory'
import { advanceOnce } from '@/lib/pipeline/worker'
import { getSessionProfile } from '@/lib/auth'
import { supabaseServer } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
// One stage per invocation bounds the work; a live multimodal stage can still
// take tens of seconds. Default plan limit is 300s — set our own ceiling.
export const maxDuration = 120

/**
 * Pipeline progress for one application. Each poll also advances the worker
 * by at most one stage — job rows plus polling, per CLAUDE.md §5. The RLS on
 * applications/jobs scopes what the caller may see; the tick itself runs
 * with the service role and touches only the oldest queued job.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionProfile()
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  const { id } = await params

  try {
    await advanceOnce(workerDepsFromEnv())
  } catch (error) {
    // a worker fault must not break the applicant's progress view
    console.error('worker tick failed', error)
  }

  const supabase = await supabaseServer()
  const { data: application } = await supabase
    .from('applications')
    .select('id, status, deficiency_notice, readiness_score')
    .eq('id', id)
    .single()
  if (!application) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const { data: jobs } = await supabase
    .from('jobs')
    .select('stage, status, attempts, last_error, created_at, updated_at')
    .eq('application_id', id)
    .order('created_at', { ascending: true })

  return NextResponse.json({
    status: application.status,
    deficiency_notice: application.deficiency_notice,
    readiness_score: application.readiness_score,
    jobs: jobs ?? [],
  })
}
