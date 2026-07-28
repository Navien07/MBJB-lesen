import { afterAll, beforeAll, expect, test } from 'vitest'
import { createUser, serviceClient, sql } from './helpers'

const db = sql()
let entryId: number

beforeAll(async () => {
  const svc = serviceClient()
  const { data, error } = await svc
    .from('audit_log')
    .insert({ actor_type: 'system', action: 'test.append_only_probe' })
    .select('id')
    .single()
  if (error) throw error
  entryId = data.id
})

afterAll(async () => {
  await db.end()
})

test('service role cannot update an audit entry', async () => {
  const { error } = await serviceClient()
    .from('audit_log')
    .update({ action: 'tampered' })
    .eq('id', entryId)
  expect(error?.message).toMatch(/append-only/)
})

test('service role cannot delete an audit entry', async () => {
  const { error } = await serviceClient().from('audit_log').delete().eq('id', entryId)
  expect(error?.message).toMatch(/append-only/)
})

test('even a direct database connection cannot update or delete audit entries', async () => {
  await expect(db`update public.audit_log set action = 'tampered' where id = ${entryId}`)
    .rejects.toThrow(/append-only/)
  await expect(db`delete from public.audit_log where id = ${entryId}`)
    .rejects.toThrow(/append-only/)
})

test('an authenticated user cannot update or delete audit entries', async () => {
  const user = await createUser('officer', 'Auditor Test')
  const { error: updateError } = await user.client
    .from('audit_log')
    .update({ action: 'tampered' })
    .eq('id', entryId)
  expect(updateError).not.toBeNull()

  const { error: deleteError } = await user.client
    .from('audit_log')
    .delete()
    .eq('id', entryId)
  expect(deleteError).not.toBeNull()
})

test('rule versions are immutable once written', async () => {
  const svc = serviceClient()
  const { data, error } = await svc
    .from('rules')
    .insert({ rule_set_id: 'TEST-IMMUTABLE', version: '1', pack: { rules: [] } })
    .select('id')
    .single()
  if (error) throw error

  const { error: updateError } = await svc
    .from('rules')
    .update({ pack: { rules: ['changed'] } })
    .eq('id', data.id)
  expect(updateError?.message).toMatch(/append-only/)

  const { error: deleteError } = await svc.from('rules').delete().eq('id', data.id)
  expect(deleteError?.message).toMatch(/append-only/)
})
