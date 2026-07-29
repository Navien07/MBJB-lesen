import Link from 'next/link'
import type { ReactNode } from 'react'
import { signOut } from '@/app/(auth)/actions'
import { CrestMark, Wordmark } from '@/components/brand'
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
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="keyline-top sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link
              href={isOfficer ? '/officer' : '/dashboard'}
              className="flex items-center gap-2.5"
            >
              <CrestMark className="size-6" />
              <Wordmark className="text-sm" />
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              {isOfficer ? (
                <>
                  <Link
                    href="/officer"
                    className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    Queue
                  </Link>
                  <Link
                    href="/officer/dashboard"
                    className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    Dashboard
                  </Link>
                </>
              ) : (
                <Link
                  href="/dashboard"
                  className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  My applications
                </Link>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex">
              {isOfficer ? (
                <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 font-mono text-[11px] tracking-wide text-primary uppercase">
                  Pegawai
                </span>
              ) : null}
              {session.fullName || session.email}
            </span>
            <form action={signOut}>
              <Button variant="outline" size="sm" type="submit">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 p-4 py-6">{children}</main>
      <footer className="border-t border-border/60 py-4">
        <p className="mx-auto max-w-6xl px-4 text-xs text-muted-foreground">
          Majlis Bandaraya Johor Bahru · Lesen Premis Perniagaan &amp; Iklan · automated checks
          assist, an officer decides
        </p>
      </footer>
    </div>
  )
}
