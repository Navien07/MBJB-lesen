import { beforeAll, expect, test } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createUser } from './helpers'

let alice: { client: SupabaseClient; id: string }
let bob: { client: SupabaseClient; id: string }
let officer: { client: SupabaseClient; id: string }
let aliceApplicationId: string

beforeAll(async () => {
  alice = await createUser('applicant', 'Alice Applicant')
  bob = await createUser('applicant', 'Bob Applicant')
  officer = await createUser('officer', 'Olivia Officer')

  const { data, error } = await alice.client
    .from('applications')
    .insert({ applicant_id: alice.id, company_name: 'Kedai Alice' })
    .select('id')
    .single()
  if (error) throw error
  aliceApplicationId = data.id
})

test('an applicant reads only their own applications', async () => {
  const { data: mine } = await alice.client.from('applications').select('id')
  expect(mine?.map((r) => r.id)).toContain(aliceApplicationId)

  const { data: others } = await bob.client
    .from('applications')
    .select('id')
    .eq('id', aliceApplicationId)
  expect(others).toEqual([])
})

test('an applicant cannot update another applicant’s application', async () => {
  const { data } = await bob.client
    .from('applications')
    .update({ company_name: 'Hijacked' })
    .eq('id', aliceApplicationId)
    .select('id')
  expect(data).toEqual([])
})

test('an applicant cannot insert an application for someone else', async () => {
  const { error } = await bob.client
    .from('applications')
    .insert({ applicant_id: alice.id, company_name: 'Forged' })
  expect(error).not.toBeNull()
})

test('an officer reads all applications', async () => {
  const { data, error } = await officer.client
    .from('applications')
    .select('id')
    .eq('id', aliceApplicationId)
  expect(error).toBeNull()
  expect(data?.length).toBe(1)
})
