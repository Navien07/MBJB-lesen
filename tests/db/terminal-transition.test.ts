import { afterAll, beforeAll, expect, test } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createUser, serviceClient, sql } from './helpers'

const db = sql()
let applicant: { client: SupabaseClient; id: string }
let officer: { client: SupabaseClient; id: string }

async function applicationInReview(): Promise<string> {
  const svc = serviceClient()
  const { data, error } = await svc
    .from('applications')
    .insert({
      applicant_id: applicant.id,
      company_name: 'Terminal Test Sdn Bhd',
      status: 'OFFICER_REVIEW',
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

beforeAll(async () => {
  applicant = await createUser('applicant', 'Terminal Applicant')
  officer = await createUser('officer', 'Terminal Officer')
})

afterAll(async () => {
  await db.end()
})

test('the service role (an agent/worker) cannot write a terminal status', async () => {
  const id = await applicationInReview()
  const { error } = await serviceClient()
    .from('applications')
    .update({ status: 'APPROVED' })
    .eq('id', id)
  expect(error?.message).toMatch(/human officer/)
})

test('a direct database connection cannot write a terminal status', async () => {
  const id = await applicationInReview()
  await expect(
    db`update public.applications set status = 'REJECTED' where id = ${id}`,
  ).rejects.toThrow(/human officer/)
})

test('an applicant cannot write a terminal status on their own case', async () => {
  const id = await applicationInReview()
  const { data } = await applicant.client
    .from('applications')
    .update({ status: 'APPROVED' })
    .eq('id', id)
    .select('id')
  // RLS: not updatable by the applicant in OFFICER_REVIEW, so zero rows match
  expect(data).toEqual([])
})

test('a signed-in officer can write a terminal status', async () => {
  const id = await applicationInReview()
  const { data, error } = await officer.client
    .from('applications')
    .update({ status: 'APPROVED_WITH_CONDITIONS' })
    .eq('id', id)
    .select('status')
    .single()
  expect(error).toBeNull()
  expect(data?.status).toBe('APPROVED_WITH_CONDITIONS')
})

test('non-terminal transitions by the worker still work', async () => {
  const id = await applicationInReview()
  const { error } = await serviceClient()
    .from('applications')
    .update({ status: 'ASSESSED' })
    .eq('id', id)
  expect(error).toBeNull()
})

test('a finding with a model but no engine is rejected by the database', async () => {
  const id = await applicationInReview()
  const svc = serviceClient()
  const { error } = await svc.from('findings').insert({
    application_id: id,
    rule_id: 'SIGN-SIZE-002',
    rule_version: '2010.1-draft',
    status: 'non_compliant',
    severity: 'major',
    produced_by: { engine: null, model: 'claude-test' },
  })
  expect(error?.message).toMatch(/findings_engine_required/)

  const { error: okError } = await svc.from('findings').insert({
    application_id: id,
    rule_id: 'SIGN-SIZE-002',
    rule_version: '2010.1-draft',
    status: 'non_compliant',
    severity: 'major',
    produced_by: { engine: 'rules@1', model: null },
  })
  expect(okError).toBeNull()
})
