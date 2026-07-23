import Anthropic from '@anthropic-ai/sdk'
import { CLAUDE_TOOLS, createToolSession } from './tools.mjs'

const MODEL = 'claude-sonnet-4-5-20250929'
const MAX_TOOL_ROUNDS = 6

/**
 * Run a Claude tool-use loop against Rosato's content.
 * Mutations stay in-memory until /api/publish confirms.
 */
export async function runClaudeOpsChat({ message, bundle }) {
  const trimmed = String(message || '').trim()
  if (!trimmed) {
    throw Object.assign(new Error('Message is empty'), { status: 400 })
  }

  const session = createToolSession(bundle)
  const client = new Anthropic({
    baseURL:
      (typeof Netlify !== 'undefined'
        ? Netlify.env.get('ANTHROPIC_BASE_URL')
        : process.env.ANTHROPIC_BASE_URL) || undefined,
  })

  const messages = [
    {
      role: 'user',
      content: trimmed,
    },
  ]

  let finalText = ''

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1200,
      system: SYSTEM_PROMPT,
      tools: CLAUDE_TOOLS,
      messages,
    })

    messages.push({ role: 'assistant', content: response.content })

    const toolUses = response.content.filter((block) => block.type === 'tool_use')
    const textParts = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .filter(Boolean)

    if (textParts.length) {
      finalText = textParts.join('\n')
    }

    if (response.stop_reason === 'end_turn' || toolUses.length === 0) {
      break
    }

    const toolResults = []
    for (const use of toolUses) {
      const result = await session.run(use.name, use.input || {})
      toolResults.push({
        type: 'tool_result',
        tool_use_id: use.id,
        content: JSON.stringify(result),
        is_error: result?.ok === false,
      })
    }
    messages.push({ role: 'user', content: toolResults })
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
- Only use tools. Do not invent menu items that are not being priced.
- Never touch venue chrome, booking, gift cards, colours, or layout.
- After mutations, briefly confirm what will be staged. The human must confirm before publish.
- If the request is unclear, ask a short clarifying question and call no mutating tools.`
