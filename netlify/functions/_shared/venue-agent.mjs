import OpenAI from 'openai'

const MAX_TOOL_ROUNDS = 6
const MAX_HISTORY = 12

function env(name, fallback = '') {
  const value =
    typeof Netlify !== 'undefined' ? Netlify.env.get(name) : process.env[name]
  return value || fallback
}

export function resolveAiConfig() {
  return {
    model: env('OPS_AI_MODEL', 'gpt-4o-mini'),
    provider: env('OPS_AI_PROVIDER', 'openai'),
  }
}

/**
 * Create a venue-specific ops chat runner.
 *
 * This is the single generic agent that replaces per-venue agent files.
 * Adding a new venue type means: new tools file + new agent file that calls
 * createVenueAgent — no changes to chat.ts, telegram.ts, or this file.
 *
 * @param {object} opts
 * @param {Function} opts.getTools          () => OpenAI tools array
 * @param {Function} opts.createSession     (bundle) => { state, run(name, input) }
 * @param {Function} opts.extractBundle     (state) => bundle object for proposal
 * @param {string}   opts.systemPrompt      System prompt for this venue type
 * @param {string}   opts.emptyReply        Reply when no changes are staged
 * @param {string}   opts.confirmNote       Line appended after staged change list
 * @param {boolean}  [opts.supportsAttachments=false]
 */
export function createVenueAgent({
  getTools,
  createSession,
  extractBundle,
  systemPrompt,
  emptyReply,
  confirmNote,
  supportsAttachments = false,
}) {
  return async function runOpsChat({
    message,
    bundle,
    history = [],
    attachment = null,
  }) {
    const trimmed = String(message || '').trim()
    const hasAttachment =
      supportsAttachments && Boolean(attachment?.extractedText)

    if (!trimmed && !hasAttachment) {
      throw Object.assign(new Error('Message is empty'), { status: 400 })
    }

    const { model, provider } = resolveAiConfig()

    // Provider switch — currently only openai (Netlify AI Gateway) is wired.
    // To add Claude or Gemini: remove this check and add a provider adapter
    // that converts OPS_TOOLS + messages to the target SDK format.
    if (provider !== 'openai') {
      throw Object.assign(
        new Error(
          `Unsupported OPS_AI_PROVIDER "${provider}". Supported: openai`,
        ),
        { status: 500 },
      )
    }

    const session = createSession(bundle)
    const client = new OpenAI()
    const prior = normalizeHistory(history)
    const userContent = buildUserContent(
      trimmed,
      supportsAttachments ? attachment : null,
    )

    const messages = [
      { role: 'system', content: systemPrompt },
      ...prior,
      { role: 'user', content: userContent },
    ]

    let finalText = ''

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const response = await client.chat.completions.create({
        model,
        temperature: 0,
        messages,
        tools: getTools(),
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
      if (!toolCalls.length || choice.finish_reason === 'stop') break

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
        confirmNote,
      ].join('\n')
    } else if (!finalText) {
      finalText = emptyReply
    }

    return {
      reply: finalText,
      descriptions: session.state.descriptions,
      toolTrace: session.state.toolTrace,
      changed: [...changed],
      bundle: extractBundle(session.state),
      hasChanges,
      model,
      provider,
    }
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

function buildUserContent(message, attachment) {
  const parts = []
  if (message) parts.push(message)
  if (attachment?.extractedText) {
    parts.push(
      [
        `Attached PDF: ${attachment.name || 'menu.pdf'}`,
        'Extracted text follows. Use update_menu_price (and related tools) for clear price/item changes found in it. Prefer exact existing menu item names.',
        '--- PDF TEXT ---',
        attachment.extractedText.slice(0, 12000),
      ].join('\n'),
    )
  }
  return parts.join('\n\n')
}
