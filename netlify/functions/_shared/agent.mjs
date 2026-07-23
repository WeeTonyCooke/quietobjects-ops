import OpenAI from 'openai'
import { createToolSession, openaiTools } from './tools.mjs'

const MAX_TOOL_ROUNDS = 6

function env(name, fallback = '') {
  const value =
    typeof Netlify !== 'undefined' ? Netlify.env.get(name) : process.env[name]
  return value || fallback
}

/**
 * Default to a cheap gateway model. Override with OPS_AI_MODEL.
 * Examples on Netlify AI Gateway: gpt-4o-mini, gpt-5-nano, gemini-2.0-flash-lite
 */
export function resolveAiConfig() {
  return {
    model: env('OPS_AI_MODEL', 'gpt-4o-mini'),
    provider: env('OPS_AI_PROVIDER', 'openai'),
  }
}

/**
 * Run an ops tool-use loop against Rosato's content.
 * Mutations stay in-memory until /api/publish confirms.
 * Model is configurable — not tied to a single vendor brand.
 */
export async function runOpsChat({ message, bundle }) {
  const trimmed = String(message || '').trim()
  if (!trimmed) {
    throw Object.assign(new Error('Message is empty'), { status: 400 })
  }

  const { model, provider } = resolveAiConfig()
  if (provider !== 'openai') {
    throw Object.assign(
      new Error(
        `Unsupported OPS_AI_PROVIDER "${provider}". Phase 1 supports "openai" (Netlify AI Gateway).`,
      ),
      { status: 500 },
    )
  }

  const session = createToolSession(bundle)
  const client = new OpenAI()
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: trimmed },
  ]

  let finalText = ''

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const response = await client.chat.completions.create({
      model,
      temperature: 0.1,
      messages,
      tools: openaiTools(),
      tool_choice: 'auto',
    })

    const choice = response.choices[0]
    const assistantMessage = choice?.message
    if (!assistantMessage) break

    messages.push(assistantMessage)
    if (assistantMessage.content) {
      finalText = String(assistantMessage.content)
    }

    const toolCalls = assistantMessage.tool_calls || []
    if (!toolCalls.length || choice.finish_reason === 'stop') {
      break
    }

    for (const call of toolCalls) {
      const name = call.function?.name
      let input = {}
      try {
        input = call.function?.arguments
          ? JSON.parse(call.function.arguments)
          : {}
      } catch {
        input = {}
      }
      const result = await session.run(name, input)
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result),
      })
    }
  }

  const changed = session.state.changed
  const hasChanges = changed.size > 0

  if (!hasChanges && !finalText) {
    finalText =
      'I checked Rosato’s content but did not stage any changes. Try a price or lineup update.'
  }

  if (hasChanges && !finalText) {
    finalText = `Ready to publish:\n${session.state.descriptions
      .map((line) => `• ${line}`)
      .join('\n')}`
  }

  return {
    reply: finalText,
    descriptions: session.state.descriptions,
    toolTrace: session.state.toolTrace,
    changed: [...changed],
    bundle: {
      programme: session.state.programme,
      menu: session.state.menu,
    },
    hasChanges,
    model,
    provider,
  }
}

const SYSTEM_PROMPT = `You are Quiet Objects ops for Rosato’s (Moville).
Help the manager keep programme and menu prices honest via tools.

Tools:
- list_programme — inspect this week’s lineup / tonight override
- update_programme_event — upsert or remove a day’s event
- update_menu_price — change an existing item price
- set_tonight_override — set or clear tonight’s cue (empty string clears)

Rules:
- Only use tools for content changes. Do not invent menu items that are not being priced.
- Never touch venue chrome, booking, gift cards, colours, or layout.
- After mutations, briefly confirm what will be staged. The human must confirm before publish.
- If the request is unclear, ask a short clarifying question and call no mutating tools.`
