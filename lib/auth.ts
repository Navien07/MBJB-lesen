import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'

export interface SessionProfile {
  userId: string
  role: 'applicant' | 'officer'
  fullName: string
  email: string
}

export async function getSessionProfile(): Promise<SessionProfile | null> {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()
  if (!profile) return null
  return {
    userId: user.id,
    role: profile.role,
    fullName: profile.full_name,
    email: user.email ?? '',
  }
}

export async function requireUser(): Promise<SessionProfile> {
  const session = await getSessionProfile()
  if (!session) redirect('/login')
  return session
}

export async function requireOfficer(): Promise<SessionProfile> {
  const session = await requireUser()
  if (session.role !== 'officer') redirect('/dashboard?denied=officer')
  return session
}
