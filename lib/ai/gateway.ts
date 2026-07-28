import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { writeAudit } from '@/lib/audit'
import { redactValue } from './redact'
import { simulate } from './replay'

/**
 * The single outbound path to the Anthropic API (CLAUDE.md §3). Every model
 * call in the product goes through here: model id from env, retry with
 * backoff, token accounting to the audit log, PII redaction before anything
 * leaves the machine. No other file may import the Anthropic SDK.
 */

export type AgentName = 'intake' | 'signboard' | 'copilot'

const MODEL_ENV: Record<AgentName, string> = {
  intake: 'AI_MODEL_INTAKE',
  signboard: 'AI_MODEL_SIGNBOARD',
  copilot: 'AI_MODEL_COPILOT',
}

export interface ImageAttachment {
  mediaType: 'image/png' | 'image/jpeg'
  base64: string
}

export interface GatewayRequest {
  agent: AgentName
  applicationId: string | null
  system: string
  /** JSON-serialisable payload; redacted, then sent as the user message. */
  payload: unknown
  images?: ImageAttachment[]
  maxTokens?: number
  /** Names the recorded fixture used in replay mode. */
  fixtureKey: string
}

export const GatewayResponse = z.object({
  text: z.string(),
  model: z.string(),
  tokens: z.object({ input: z.number(), output: z.number() }),
})
export type GatewayResponse = z.infer<typeof GatewayResponse>

/** Transport over the wire — injected so tests never touch the network. */
export type LiveTransport = (args: {
  model: string
  system: string
  userText: string
  images: ImageAttachment[]
  maxTokens: number
}) => Promise<GatewayResponse>

export interface GatewayDeps {
  db: SupabaseClient
  mode: 'live' | 'replay'
  transport?: LiveTransport
  fixtureDir?: string
  retries?: number
  backoffMs?: number
}

export class Gateway {
  constructor(private readonly deps: GatewayDeps) {}

  async call(request: GatewayRequest): Promise<GatewayResponse> {
    const model = process.env[MODEL_ENV[request.agent]]
    if (this.deps.mode === 'live' && !model) {
      throw new Error(`${MODEL_ENV[request.agent]} is not set`)
    }

    // §1 no secrets, no PII: redaction happens before either mode sees it
    const redactedPayload = redactValue(request.payload)
    const userText = JSON.stringify(redactedPayload)

    const response =
      this.deps.mode === 'replay'
        ? await this.replay(request, redactedPayload)
        : await this.live(request, model!, userText)

    const parsed = GatewayResponse.parse(response)

    await writeAudit(this.deps.db, {
      application_id: request.applicationId,
      actor_type: 'agent',
      actor_id: request.agent,
      action: `ai.call.${request.agent}`,
      detail: { mode: this.deps.mode, fixture_key: request.fixtureKey },
      model_version: parsed.model,
      tokens: parsed.tokens,
    })

    return parsed
  }

  private async replay(
    request: GatewayRequest,
    redactedPayload: unknown,
  ): Promise<GatewayResponse> {
    const dir = this.deps.fixtureDir ?? path.join(process.cwd(), 'tests', 'fixtures', 'ai')
    const file = path.join(dir, `${request.fixtureKey}.json`)
    try {
      const raw = await readFile(file, 'utf8')
      return GatewayResponse.parse(JSON.parse(raw))
    } catch {
      // no recorded fixture: fall back to the deterministic simulator so the
      // full pipeline stays walkable in E2E without fixture-per-scenario files
      return simulate(request.agent, redactedPayload)
    }
  }

  private async live(
    request: GatewayRequest,
    model: string,
    userText: string,
  ): Promise<GatewayResponse> {
    const transport = this.deps.transport
    if (!transport) throw new Error('live mode requires a transport')
    const retries = this.deps.retries ?? 2
    const backoffMs = this.deps.backoffMs ?? 1_000

    let lastError: unknown
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await transport({
          model,
          system: request.system,
          userText,
          images: request.images ?? [],
          maxTokens: request.maxTokens ?? 4_096,
        })
      } catch (error) {
        lastError = error
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, backoffMs * (attempt + 1)))
        }
      }
    }
    throw lastError
  }
}

export function gatewayModeFromEnv(): 'live' | 'replay' {
  const mode = process.env.AI_GATEWAY_MODE ?? 'replay'
  if (mode !== 'live' && mode !== 'replay') {
    throw new Error(`AI_GATEWAY_MODE must be live or replay, got ${mode}`)
  }
  return mode
}
