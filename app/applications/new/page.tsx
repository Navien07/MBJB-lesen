import { AppShell } from '@/components/app-shell'
import { requireUser } from '@/lib/auth'
import { BorangForm } from './borang-form'

export default async function NewApplicationPage() {
  const session = await requireUser()
  return (
    <AppShell session={session}>
      <div className="mx-auto max-w-3xl space-y-4">
        <div>
          <h1 className="text-lg font-semibold">New licence application</h1>
          <p className="text-sm text-muted-foreground">
            Borang Permohonan Lesen Premis Perniagaan dan Iklan
          </p>
        </div>
        <BorangForm />
      </div>
    </AppShell>
  )
}
