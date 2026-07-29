'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { supabaseServer } from '@/lib/supabase/server'

const Credentials = z.object({
  email: z.email(),
  password: z.string().min(8, 'password must be at least 8 characters'),
})

const Registration = Credentials.extend({
  fullName: z.string().min(2, 'name is required'),
})

export interface AuthFormState {
  error: string | null
}

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = Credentials.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'invalid input' }
  }

  const supabase = await supabaseServer()
  const { data: auth, error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error) return { error: error.message }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', auth.user.id)
    .single()
  redirect(profile?.role === 'officer' ? '/officer' : '/dashboard')
}

export async function register(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = Registration.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    fullName: formData.get('fullName'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'invalid input' }
  }

  const supabase = await supabaseServer()
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { full_name: parsed.data.fullName } },
  })
  if (error) return { error: error.message }

  redirect('/dashboard')
}

export async function signOut(): Promise<void> {
  const supabase = await supabaseServer()
  await supabase.auth.signOut()
  redirect('/login')
}

/**
 * One-click demo access (POC only). Credentials live in server env vars —
 * DEMO_OFFICER_EMAIL/PASSWORD and DEMO_APPLICANT_EMAIL/PASSWORD — so nothing
 * ships in the client bundle. Remove for any production rollout.
 */
export async function demoSignIn(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const role = String(formData.get('role') ?? '')
  const creds =
    role === 'officer'
      ? { email: process.env.DEMO_OFFICER_EMAIL, password: process.env.DEMO_OFFICER_PASSWORD }
      : role === 'applicant'
        ? { email: process.env.DEMO_APPLICANT_EMAIL, password: process.env.DEMO_APPLICANT_PASSWORD }
        : null
  if (!creds?.email || !creds.password) {
    return { error: 'Demo accounts are not configured in this environment.' }
  }

  const supabase = await supabaseServer()
  const { error } = await supabase.auth.signInWithPassword({
    email: creds.email,
    password: creds.password,
  })
  if (error) return { error: `Demo sign-in failed: ${error.message}` }

  redirect(role === 'officer' ? '/officer' : '/dashboard')
}
