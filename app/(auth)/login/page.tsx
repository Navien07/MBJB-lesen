'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { signIn, type AuthFormState } from '../actions'
import { AuthFrame } from '../auth-frame'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const initialState: AuthFormState = { error: null }

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(signIn, initialState)

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
        </CardContent>
      </Card>
    </AuthFrame>
  )
}
