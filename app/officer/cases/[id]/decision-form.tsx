'use client'

import { useActionState } from 'react'
import { decide, type OfficerActionState } from '../actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

const OUTCOMES = [
  ['APPROVED', 'Approve'],
  ['APPROVED_WITH_CONDITIONS', 'Approve with conditions'],
  ['AMENDMENT_REQUESTED', 'Request amendment'],
  ['REJECTED', 'Reject'],
] as const

export function DecisionForm({
  applicationId,
  draftLetter,
  draftConditions,
}: {
  applicationId: string
  draftLetter: string
  draftConditions: string
}) {
  const [state, formAction, pending] = useActionState<OfficerActionState, FormData>(decide, {
    error: null,
  })

  return (
    <Card data-testid="decision-form">
      <CardHeader>
        <CardTitle>Decision</CardTitle>
        <CardDescription>
          The decision and letter are yours; the draft below was generated from the findings and
          may be edited freely.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="applicationId" value={applicationId} />

          <div className="space-y-1.5">
            <Label htmlFor="outcome">Outcome</Label>
            <select
              id="outcome"
              name="outcome"
              required
              defaultValue=""
              className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs"
              data-testid="decision-outcome"
            >
              <option value="" disabled>
                Select an outcome…
              </option>
              {OUTCOMES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="conditions">
              Conditions — one per line as <code>RULE-ID :: condition</code>
            </Label>
            <Textarea
              id="conditions"
              name="conditions"
              rows={3}
              defaultValue={draftConditions}
              data-testid="decision-conditions"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="letter">Decision letter (Bahasa Melayu &amp; English)</Label>
            <Textarea
              id="letter"
              name="letter"
              rows={12}
              defaultValue={draftLetter}
              data-testid="decision-letter"
            />
          </div>

          {state.error ? (
            <p role="alert" className="text-sm text-destructive" data-testid="decision-error">
              {state.error}
            </p>
          ) : null}

          <Button type="submit" disabled={pending} data-testid="decision-submit">
            {pending ? 'Recording…' : 'Record decision'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
