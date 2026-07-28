import Link from 'next/link'
import type { ReactNode } from 'react'
import { signOut } from '@/app/(auth)/actions'
import { Button } from '@/components/ui/button'
import type { SessionProfile } from '@/lib/auth'

export function AppShell({
  session,
  children,
}: {
  session: SessionProfile
  children: ReactNode
}) {
  const isOfficer = session.role === 'officer'
  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link href={isOfficer ? '/officer' : '/dashboard'} className="font-semibold">
              MBJB-lesen
            </Link>
            <nav className="flex items-center gap-4 text-sm text-muted-foreground">
              {isOfficer ? (
                <>
                  <Link href="/officer" className="hover:text-foreground">
                    Queue
                  </Link>
                  <Link href="/officer/dashboard" className="hover:text-foreground">
                    Dashboard
                  </Link>
                </>
              ) : (
                <Link href="/dashboard" className="hover:text-foreground">
                  My applications
                </Link>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {session.fullName || session.email}
              {isOfficer ? ' · Pegawai' : ''}
            </span>
            <form action={signOut}>
              <Button variant="outline" size="sm" type="submit">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-4">{children}</main>
    </div>
  )
}
