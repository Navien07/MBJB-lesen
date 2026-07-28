import type { SupabaseClient } from '@supabase/supabase-js'

export interface AuditEntry {
  application_id: string | null
  actor_type: 'human' | 'agent' | 'system'
  actor_id: string | null
  action: string
  detail?: Record<string, unknown>
  model_version?: string | null
  rule_version?: string | null
  tokens?: { input: number; output: number } | null
}

/**
 * Appends to the audit log. The table is append-only at the database level;
 * a failed audit write is a hard error, never swallowed — an unauditable
 * action must not look like it succeeded.
 */
export async function writeAudit(client: SupabaseClient, entry: AuditEntry): Promise<void> {
  const { error } = await client.from('audit_log').insert({
    application_id: entry.application_id,
    actor_type: entry.actor_type,
    actor_id: entry.actor_id,
    action: entry.action,
    detail: entry.detail ?? {},
    model_version: entry.model_version ?? null,
    rule_version: entry.rule_version ?? null,
    tokens: entry.tokens ?? null,
  })
  if (error) throw new Error(`audit write failed for ${entry.action}: ${error.message}`)
}
