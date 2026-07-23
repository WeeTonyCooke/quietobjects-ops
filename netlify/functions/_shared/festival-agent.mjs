import OpenAI from 'openai'
import { createFestivalToolSession, festivalOpenaiTools } from './festival-tools.mjs'

const MAX_TOOL_ROUNDS = 6
const MAX_HISTORY = 12

function env(name, fallback = '') {
  const value =
    typeof Netlify !== 'undefined' ? Netlify.env.get(name) : process.env[name]
  return value || fallback
}

export function resolveFestivalAiConfig() {
  return {
    model: env('OPS_AI_MODEL', 'gpt-4o-mini'),
    provider: env('OPS_AI_PROVIDER', 'openai'),
  }
}

/**
 * Run an ops tool-use loop against Moville Festival programme content.
 * Mutations stay in-memory until /api/publish confirms.
 */
export async function runFestivalOpsChat({ message, bundle, history = [] }) {
  const trimmed = String(message || '').trim()
  if (!trimmed) {
    throw Object.assign(new Error('Message is empty'), { status: 400 })
  }

  const { model, provider } = resolveFestivalAiConfig()
  if (provider !== 'openai') {
    throw Object.assign(
      new Error(
        `Unsupported OPS_AI_PROVIDER "${provider}". Phase 2 supports "openai" (Netlify AI Gateway).`,
      ),
      { status: 500 },
    )
  }

  const session = createFestivalToolSession(bundle)
  const client = new OpenAI()
  const prior = normalizeHistory(history)
  const messages = [
    { role: 'system', content: FESTIVAL_SYSTEM_PROMPT },
    ...prior,
    { role: 'user', content: trimmed },
  ]

  let finalText = ''

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const response = await client.chat.completions.create({
      model,
      temperature: 0,
      messages,
      tools: festivalOpenaiTools(),
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
        input = call.function?.arguments ? JSON.parse(call.function.arguments) : {}
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

  if (hasChanges) {
    finalText = [
      'Staged — nothing is live yet.',
      ...session.state.descriptions.map((line) => `• ${line}`),
      'Press Confirm to publish into the festival programme.',
    ].join('\n')
  } else if (!finalText) {
    finalText =
      'I checked the festival programme but did not stage any changes. Try "add Wednesday 7pm Fancy Dress Parade at Festival Square" or "list programme".'
  }

  return {
    reply: finalText,
    descriptions: session.state.descriptions,
    toolTrace: session.state.toolTrace,
    changed: [...changed],
    bundle: { programme: session.state.programme },
    hasChanges,
    model,
    provider,
  }
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return []
  return history
    .filter(
      (row) =>
        row &&
        (row.role === 'user' || row.role === 'assistant') &&
        typeof row.content === 'string' &&
        row.content.trim(),
    )
    .slice(-MAX_HISTORY)
    .map((row) => ({
      role: row.role,
      content: row.content.trim().slice(0, 2000),
    }))
}

const FESTIVAL_SYSTEM_PROMPT = `You are Quiet Objects ops for Moville Summer Festival (Moville, Co. Donegal, Ireland).

Your job: call tools to stage programme changes for the festival website. The UI has a Confirm button — you must NOT ask the human to type "confirm" in chat.

Tools:
- list_programme — show all festival days and events
- update_event — add, update, or remove an event on a specific day (action: upsert or remove)

Rules:
- Days are: Wednesday, Thursday, Friday, Saturday, Sunday (or whatever days are in the programme).
- When the request is clear (e.g. "Bed Push is Thursday 7pm at Quay Street"), call update_event immediately.
- If the human says "confirm", "yes", "do it", or similar after a proposed change, call the matching tool now.
- Never invent events. Only mutate events the manager explicitly describes.
- Keep the reply short after a successful mutation — the UI will show Confirm.
- Only ask a clarifying question when the request is genuinely ambiguous and no tool can be called yet.`
