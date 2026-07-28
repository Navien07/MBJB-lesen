import { afterAll, expect, test } from 'vitest'
import { sql } from './helpers'

const db = sql()

afterAll(async () => {
  await db.end()
})

test('every public table has row level security enabled', async () => {
  const rows = await db`
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
    order by c.relname
  `
  expect(rows.map((r) => r.relname)).toEqual([])
})

test('audit_log and rules have no update or delete grants for API roles', async () => {
  const rows = await db`
    select table_name, grantee, privilege_type
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in ('audit_log', 'rules')
      and grantee in ('anon', 'authenticated')
      and privilege_type in ('UPDATE', 'DELETE')
  `
  expect(rows).toEqual([])
})
