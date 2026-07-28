import { execSync } from 'node:child_process'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import postgres from 'postgres'

export interface LocalStack {
  apiUrl: string
  anonKey: string
  serviceRoleKey: string
  dbUrl: string
}

let cached: LocalStack | null = null

/** Reads the running local stack's URLs and keys from the CLI. */
export function localStack(): LocalStack {
  if (cached) return cached
  const out = execSync('supabase status -o env', { encoding: 'utf8' })
  const get = (key: string): string => {
    const m = out.match(new RegExp(`^${key}="?([^"\n]+)"?$`, 'm'))
    if (!m) throw new Error(`supabase status did not report ${key}`)
    return m[1]
  }
  cached = {
    apiUrl: get('API_URL'),
    anonKey: get('ANON_KEY'),
    serviceRoleKey: get('SERVICE_ROLE_KEY'),
    dbUrl: get('DB_URL'),
  }
  return cached
}

export function serviceClient(): SupabaseClient {
  const s = localStack()
  return createClient(s.apiUrl, s.serviceRoleKey, { auth: { persistSession: false } })
}

export function anonClient(): SupabaseClient {
  const s = localStack()
  return createClient(s.apiUrl, s.anonKey, { auth: { persistSession: false } })
}

export function sql() {
  return postgres(localStack().dbUrl, { onnotice: () => {} })
}

let userSeq = 0

/** Creates a confirmed user with a profile row and returns a signed-in client. */
export async function createUser(
  role: 'applicant' | 'officer',
  fullName: string,
): Promise<{ client: SupabaseClient; id: string; email: string }> {
  const svc = serviceClient()
  const email = `${role}-${Date.now()}-${userSeq++}@test.mbjb.local`
  const password = 'test-password-1234'
  const { data: created, error } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !created.user) throw error ?? new Error('createUser returned no user')
  const { error: profileError } = await svc
    .from('profiles')
    .insert({ id: created.user.id, role, full_name: fullName })
  if (profileError) throw profileError

  const client = anonClient()
  const { error: signInError } = await client.auth.signInWithPassword({ email, password })
  if (signInError) throw signInError
  return { client, id: created.user.id, email }
}
