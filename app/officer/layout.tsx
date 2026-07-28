import type { ReactNode } from 'react'
import { AppShell } from '@/components/app-shell'
import { requireOfficer } from '@/lib/auth'

export default async function OfficerLayout({ children }: { children: ReactNode }) {
  const session = await requireOfficer()
  return <AppShell session={session}>{children}</AppShell>
}
