import { execSync } from 'node:child_process'

export interface LocalStack {
  apiUrl: string
  anonKey: string
  serviceRoleKey: string
}

let cached: LocalStack | null = null

export function localStack(): LocalStack {
  if (cached) return cached
  const out = execSync('supabase status -o env', { encoding: 'utf8' })
  const get = (key: string): string => {
    const m = out.match(new RegExp(`^${key}="?([^"\n]+)"?$`, 'm'))
    if (!m) throw new Error(`supabase status did not report ${key}; is the local stack running?`)
    return m[1]
  }
  cached = {
    apiUrl: get('API_URL'),
    anonKey: get('ANON_KEY'),
    serviceRoleKey: get('SERVICE_ROLE_KEY'),
  }
  return cached
}

export const TEST_USERS = {
  applicant: {
    email: 'applicant.e2e@mbjb.local',
    password: 'e2e-password-1234',
    fullName: 'E2E Applicant',
    role: 'applicant' as const,
  },
  applicantTwo: {
    email: 'applicant2.e2e@mbjb.local',
    password: 'e2e-password-1234',
    fullName: 'E2E Applicant Two',
    role: 'applicant' as const,
  },
  officer: {
    email: 'officer.e2e@mbjb.local',
    password: 'e2e-password-1234',
    fullName: 'E2E Officer',
    role: 'officer' as const,
  },
}
