'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { ShieldCheck, UserRound } from 'lucide-react'
import { demoSignIn, signIn, type AuthFormState } from '../actions'
import { AuthFrame } from '../auth-frame'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'

const initialState: AuthFormState = { error: null }

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(signIn, initialState)
  const [demoState, demoAction, demoPending] = useActionState(demoSignIn, initialState)

  return (
    <AuthFrame>
      <Card className="keyline-top border-border/70 bg-card/80 shadow-2xl shadow-black/40 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-base">Sign in</CardTitle>
          <CardDescription>
            Manage business premise and signboard licence applications
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            {state.error ? (
              <p role="alert" className="text-sm text-destructive">
                {state.error}
              </p>
            ) : null}
            <Button type="submit" className="w-full font-semibold" disabled={pending}>
              {pending ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            New applicant?{' '}
            <Link
              href="/register"
              className="text-foreground underline decoration-primary/60 underline-offset-4 hover:decoration-primary"
            >
              Create an account
            </Link>
          </p>

          <div className="mt-5">
            <div className="flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
                Demo access
              </span>
              <Separator className="flex-1" />
            </div>
            <form action={demoAction} className="mt-4 grid grid-cols-2 gap-2">
              <Button
                type="submit"
                name="role"
                value="officer"
                variant="outline"
                disabled={demoPending}
                data-testid="demo-login-officer"
                className="h-11 justify-start gap-2.5 border-primary/30 bg-primary/5 hover:bg-primary/15"
              >
                <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
                <span className="flex flex-col items-start leading-tight">
                  <span className="text-xs font-semibold">Pegawai</span>
                  <span className="text-[10px] font-normal text-muted-foreground">Officer console</span>
                </span>
              </Button>
              <Button
                type="submit"
                name="role"
                value="applicant"
                variant="outline"
                disabled={demoPending}
                data-testid="demo-login-applicant"
                className="h-11 justify-start gap-2.5 border-sky-500/30 bg-sky-500/5 hover:bg-sky-500/15"
              >
                <UserRound className="size-4 text-sky-400" aria-hidden="true" />
                <span className="flex flex-col items-start leading-tight">
                  <span className="text-xs font-semibold">Pemohon</span>
                  <span className="text-[10px] font-normal text-muted-foreground">Applicant portal</span>
                </span>
              </Button>
            </form>
            {demoState.error ? (
              <p role="alert" className="mt-2 text-center text-xs text-destructive">
                {demoState.error}
              </p>
            ) : null}
            {demoPending ? (
              <p className="mt-2 text-center text-xs text-muted-foreground">Signing in…</p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </AuthFrame>
  )
}
