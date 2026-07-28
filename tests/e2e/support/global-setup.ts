import { createClient } from '@supabase/supabase-js'
import { localStack, TEST_USERS } from './stack'

/** Idempotently provisions the fixed E2E users against the local stack. */
export default async function globalSetup() {
  const stack = localStack()
  const svc = createClient(stack.apiUrl, stack.serviceRoleKey, {
    auth: { persistSession: false },
  })

  for (const user of Object.values(TEST_USERS)) {
    const { data: created, error } = await svc.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
      user_metadata: { full_name: user.fullName },
    })
    if (error) {
      if (/already been registered/i.test(error.message)) continue
      throw error
    }
    // the signup trigger defaults everyone to applicant; promote via service role
    if (user.role === 'officer' && created.user) {
      const { error: roleError } = await svc
        .from('profiles')
        .update({ role: 'officer' })
        .eq('id', created.user.id)
      if (roleError) throw roleError
    }
  }
}
