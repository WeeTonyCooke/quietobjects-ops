import OpenAI from 'openai'
import { createToolSession, openaiTools } from './tools.mjs'

const MAX_TOOL_ROUNDS = 6
const MAX_HISTORY = 12

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
 */
export async function runOpsChat({ message, bundle, history = [] }) {
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
  const prior = normalizeHistory(history)
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...prior,
    { role: 'user', content: trimmed },
  ]

  let finalText = ''

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const response = await client.chat.completions.create({
      model,
      temperature: 0,
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

  if (hasChanges) {
    finalText = [
      'Staged — nothing is live yet.',
      ...session.state.descriptions.map((line) => `• ${line}`),
      'Use Confirm & publish below to write into Rosato’s content JSON.',
    ].join('\n')
  } else if (!finalText) {
    finalText =
      'I checked Rosato’s content but did not stage any changes. Try a price or lineup update.'
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

const SYSTEM_PROMPT = `You are Quiet Objects ops for Rosato’s (Moville, Ireland).
Currency is euro (€), never pounds.

Your job: call tools to stage programme/menu updates. The web UI has a separate Confirm & publish button — you must NOT ask the human to type “confirm” in chat.

Tools:
- list_programme — inspect this week’s lineup / tonight override
- update_programme_event — upsert or remove a day’s event
- update_menu_price — change an existing item price
- set_tonight_override — set or clear tonight’s cue (empty string clears)

Rules:
- When the request is clear (e.g. “Steak Burger is 17.50”, “Saturday is Seán Óg at 22:00”), call the tool immediately. Do not ask permission first.
- If the human says “confirm”, “yes”, “do it”, or similar after you already proposed a change in chat history, call the matching tool now.
- Never invent menu items. Match existing names when pricing.
- Never touch venue chrome, booking, gift cards, colours, or layout.
- After a successful tool mutation, keep the reply short — the UI will show Confirm & publish.
- Only ask a clarifying question when the request is genuinely ambiguous and no tool can be called yet.`
