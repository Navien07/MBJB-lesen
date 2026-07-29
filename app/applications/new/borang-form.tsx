'use client'

import { useActionState } from 'react'
import { createApplication } from '../actions'
import { EMPTY_FORM_STATE, type FormState } from '@/lib/applications/form-state'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface FieldProps {
  name: string
  label: string
  state: FormState
  type?: string
  step?: string
  autoComplete?: string
}

function Field({ name, label, state, type = 'text', step, autoComplete }: FieldProps) {
  const error = state.fieldErrors[name]
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} step={step} autoComplete={autoComplete} aria-invalid={Boolean(error)} />
      {error ? (
        <p className="text-xs text-destructive" data-testid={`error-${name}`}>
          {error}
        </p>
      ) : null}
    </div>
  )
}

function AddressField({ name, label, state }: FieldProps) {
  const error = state.fieldErrors[name]
  return (
    <div className="space-y-1.5 sm:col-span-2">
      <Label htmlFor={name}>{label}</Label>
      <Textarea id={name} name={name} rows={2} aria-invalid={Boolean(error)} />
      {error ? (
        <p className="text-xs text-destructive" data-testid={`error-${name}`}>
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function BorangForm() {
  const [state, formAction, pending] = useActionState(createApplication, EMPTY_FORM_STATE)

  return (
    <form action={formAction}>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle><span className="mr-2 font-mono text-xs text-primary">01</span>Applicant particulars</CardTitle>
            <CardDescription>Butir-butir pemohon</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field name="applicant_name" label="Applicant full name" state={state} autoComplete="name" />
            <Field name="ic_or_passport" label="MyKad / passport number" state={state} />
            <div className="space-y-1.5">
              <Label htmlFor="citizenship">Citizenship</Label>
              <select
                id="citizenship"
                name="citizenship"
                className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs"
                defaultValue=""
                aria-invalid={Boolean(state.fieldErrors.citizenship)}
              >
                <option value="" disabled>
                  Select…
                </option>
                <option value="warganegara">Warganegara (citizen)</option>
                <option value="bukan_warganegara">Bukan warganegara (non-citizen)</option>
              </select>
              {state.fieldErrors.citizenship ? (
                <p className="text-xs text-destructive" data-testid="error-citizenship">
                  {state.fieldErrors.citizenship}
                </p>
              ) : null}
            </div>
            <Field name="phone" label="Phone number" state={state} autoComplete="tel" />
            <AddressField name="correspondence_address" label="Correspondence address" state={state} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle><span className="mr-2 font-mono text-xs text-primary">02</span>Business &amp; premise</CardTitle>
            <CardDescription>Butir-butir perniagaan dan premis</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field name="company_name" label="Company / business name" state={state} />
            <Field name="ssm_registration_no" label="SSM registration number" state={state} />
            <Field name="business_activity" label="Business activity" state={state} />
            <Field name="property_tax_account_no" label="Property tax account number" state={state} />
            <AddressField name="premise_address" label="Premise address" state={state} />
            <Field name="floor_area_m2" label="Floor area (m²)" state={state} type="number" step="0.01" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle><span className="mr-2 font-mono text-xs text-primary">03</span>Signboard</CardTitle>
            <CardDescription>Ukuran papan iklan</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field name="signboard_width_m" label="Signboard width (m)" state={state} type="number" step="0.001" />
            <Field name="signboard_height_m" label="Signboard height (m)" state={state} type="number" step="0.001" />
          </CardContent>
        </Card>

        {state.error ? (
          <p role="alert" className="text-sm text-destructive" data-testid="form-error">
            {state.error}
          </p>
        ) : null}

        <Button type="submit" disabled={pending} data-testid="save-draft">
          {pending ? 'Saving…' : 'Save and continue to documents'}
        </Button>
      </div>
    </form>
  )
}
