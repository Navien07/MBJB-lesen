import Anthropic from '@anthropic-ai/sdk'
import type { GatewayResponse, LiveTransport } from './gateway'

/**
 * The only construction site for the Anthropic client. Gateway retries wrap
 * this; the SDK's own retry stays off so backoff is accounted in one place.
 */
export function anthropicTransport(): LiveTransport {
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    maxRetries: 0,
  })

  return async ({ model, system, userText, images, maxTokens }): Promise<GatewayResponse> => {
    const content: Anthropic.ContentBlockParam[] = [
      ...images.map(
        (img): Anthropic.ImageBlockParam => ({
          type: 'image',
          source: { type: 'base64', media_type: img.mediaType, data: img.base64 },
        }),
      ),
      { type: 'text', text: userText },
    ]

    const message = await client.messages.create({
      model,
      system,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content }],
    })

    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n')

    return {
      text,
      model: message.model,
      tokens: {
        input: message.usage.input_tokens,
        output: message.usage.output_tokens,
      },
    }
  }
}
