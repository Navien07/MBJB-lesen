import type { ReactNode } from 'react'
import { CrestMark, Wordmark } from '@/components/brand'

export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <main className="console-backdrop flex min-h-dvh flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <CrestMark className="size-12" />
          <div>
            <Wordmark className="text-2xl" />
            <p className="mt-1 text-xs tracking-[0.18em] text-muted-foreground uppercase">
              Majlis Bandaraya Johor Bahru
            </p>
          </div>
        </div>
        {children}
        <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
          Sistem semakan Lesen Premis Perniagaan &amp; Iklan.
          <br />
          Automated checks assist; a licensing officer makes every decision.
        </p>
      </div>
    </main>
  )
}
