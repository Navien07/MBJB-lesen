import { createClient } from '@supabase/supabase-js'
import { anthropicTransport } from '@/lib/ai/anthropic'
import { Gateway, gatewayModeFromEnv } from '@/lib/ai/gateway'
import type { WorkerDeps } from './worker'

/** Builds worker dependencies from the environment (server-side only). */
export function workerDepsFromEnv(): WorkerDeps {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
  const mode = gatewayModeFromEnv()
  const gateway = new Gateway({
    db,
    mode,
    transport: mode === 'live' ? anthropicTransport() : undefined,
  })
  return { db, gateway }
}
