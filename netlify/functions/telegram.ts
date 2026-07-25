import type { Config } from '@netlify/functions'
import {
  EDITABLE_FILES as ROSATOS_FILES,
  bundleFromFiles as rosatosBundleFromFiles,
  filesFromBundle as rosatosFilesFromBundle,
} from './_shared/content.mjs'
import {
  EDITABLE_FILES as FESTIVAL_FILES,
  bundleFromFiles as festivalBundleFromFiles,
  filesFromBundle as festivalFilesFromBundle,
} from './_shared/festival-content.mjs'
import {
  readJsonFiles,
  venueContentConfig,
  putJsonFilesViaContentsApi,
} from './_shared/github.mjs'
import { runOpsChat } from './_shared/agent.mjs'
import { runFestivalOpsChat } from './_shared/festival-agent.mjs'
import { runDeterministicOpsChat } from './_shared/fallback.mjs'
import { runFestivalDeterministicChat } from './_shared/festival-fallback.mjs'
import { signProposal, verifySignedProposal } from './_shared/proposals.mjs'
import { appendAudit } from './_shared/audit.mjs'
import {
  sendMessage,
  editMessageText,
  answerCallbackQuery,
  CONFIRM_KEYBOARD,
  venueForChatId,
  validateWebhookSecret,
} from './_shared/telegram-bot.mjs'
import {
  savePendingProposal,
  loadPendingProposal,
  deletePendingProposal,
} from './_shared/telegram-sessions.mjs'

// ── Entry point ──────────────────────────────────────────────────────────────

export default async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  if (!validateWebhookSecret(req)) {
    return new Response('Unauthorized', { status: 401 })
  }

  let update: any
  try {
    update = await req.json()
  } catch {
    return new Response('Bad request', { status: 400 })
  }

  // Always return 200 to Telegram — errors are handled internally so the
  // webhook is not retried with the same bad payload.
  try {
    if (update.message) {
      await handleMessage(update.message)
    } else if (update.callback_query) {
      await handleCallbackQuery(update.callback_query)
    }
  } catch (error) {
    console.error('[telegram] unhandled error:', error)
  }

  return new Response('OK', { status: 200 })
}

// ── Message handler ──────────────────────────────────────────────────────────

async function handleMessage(message: any) {
  const chatId = message.chat?.id
  const text: string = message.text || ''

  if (!chatId) return

  // Handle bot commands
  if (text.startsWith('/')) {
    await handleCommand(chatId, text)
    return
  }

  // Ignore empty / non-text messages
  if (!text.trim()) return

  const venue = venueForChatId(chatId)
  if (!venue) {
    console.warn(`[telegram] unauthorised chat: ${chatId}`)
    await sendMessage(
      chatId,
      'This chat is not authorised. Contact the site admin to add your chat ID.',
    )
    return
  }

  // Run the tool loop
  let result: any
  let source = 'ai-tools'

  try {
    const { bundle, meta, repo, branch } = await fetchBundle(venue)
    ;({ result, source } = await stage({ text, venue, bundle }))

    if (!result.hasChanges) {
      await appendAudit({
        action: 'chat',
        actor: `tg:${chatId}`,
        summary: 'No content changes staged',
        message: text,
        toolTrace: result.toolTrace,
        source,
        venue,
        channel: 'telegram',
      })
      await sendMessage(
        chatId,
        result.reply || 'No changes staged. Try: "list programme" or describe a change.',
      )
      return
    }

    // Build and sign the proposal
    const filesFromBundle =
      venue === 'festival' ? festivalFilesFromBundle : rosatosFilesFromBundle
    const changedSet = new Set(result.changed)
    const proposalFiles = filesFromBundle(result.bundle, { onlyChanged: changedSet })

    const proposal = {
      venue,
      repo,
      branch,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      message: text,
      summary: result.descriptions.join(' · '),
      descriptions: result.descriptions,
      toolTrace: result.toolTrace,
      files: proposalFiles,
      baseMeta: Object.fromEntries(
        Object.keys(proposalFiles).map((p) => [p, meta[p]]),
      ),
      requestedBy: `tg:${chatId}`,
      source,
    }

    const signed = signProposal(proposal)
    await savePendingProposal(chatId, signed)

    await appendAudit({
      action: 'stage',
      actor: `tg:${chatId}`,
      summary: proposal.summary,
      message: text,
      paths: Object.keys(proposalFiles),
      toolTrace: result.toolTrace,
      source,
      venue,
      channel: 'telegram',
    })

    const replyLines = [
      'Staged — nothing is live yet.',
      ...result.descriptions.map((d: string) => `• ${d}`),
      '',
      'Publish now?',
    ]

    await sendMessage(chatId, replyLines.join('\n'), {
      reply_markup: CONFIRM_KEYBOARD,
    })
  } catch (error) {
    console.error('[telegram] stage error:', error)
    await sendMessage(
      chatId,
      `Could not stage that change: ${error.message}\n\nCheck the wording and try again.`,
    )
  }
}

// ── Callback query handler (button taps) ────────────────────────────────────

async function handleCallbackQuery(callbackQuery: any) {
  const callbackQueryId = callbackQuery.id
  const chatId = callbackQuery.message?.chat?.id
  const messageId = callbackQuery.message?.message_id
  const action: string = callbackQuery.data || ''

  // Always answer immediately to clear the loading spinner
  await answerCallbackQuery(callbackQueryId).catch(() => {})

  if (!chatId) return

  const venue = venueForChatId(chatId)
  if (!venue) return

  const session = await loadPendingProposal(chatId)
  if (!session) {
    await editMessageText(
      chatId,
      messageId,
      'No pending change found — it may have expired (15 min limit). Please re-send your update.',
    ).catch(() => sendMessage(chatId, 'No pending change found — please re-send.'))
    return
  }

  if (action === 'discard') {
    await deletePendingProposal(chatId)
    await editMessageText(chatId, messageId, 'Discarded. Nothing was written.').catch(
      () => sendMessage(chatId, 'Discarded.'),
    )
    return
  }

  if (action === 'confirm') {
    try {
      const proposal = verifySignedProposal({
        proposal: session.proposal,
        signature: session.signature,
      })

      const venueConfig = venueContentConfig(proposal.venue)
      const venueName =
        proposal.venue === 'festival' ? 'moville-festival' : proposal.venue

      const commitMessage = [
        `ops(${venueName}): ${proposal.summary}`,
        '',
        `Via Telegram (chat ${chatId})`,
        `Chat: ${proposal.message}`,
      ].join('\n')

      const result = await putJsonFilesViaContentsApi({
        files: proposal.files,
        message: commitMessage,
        previousMeta: proposal.baseMeta || {},
        config: venueConfig,
      })

      await deletePendingProposal(chatId)

      await appendAudit({
        action: 'publish',
        actor: `tg:${chatId}`,
        summary: proposal.summary,
        message: proposal.message,
        paths: result.paths,
        commits: result.commits,
        repo: result.repo,
        branch: result.branch,
        toolTrace: proposal.toolTrace || [],
        venue: proposal.venue,
        channel: 'telegram',
      })

      const shortSha = (result.sha || '').slice(0, 7)
      const lines = [
        `Published ✓`,
        proposal.summary,
        '',
        `${result.repo} · ${result.branch}${shortSha ? ` · ${shortSha}` : ''}`,
        ...(result.url ? [result.url] : []),
      ]

      await editMessageText(chatId, messageId, lines.join('\n')).catch(
        () => sendMessage(chatId, lines.join('\n')),
      )
    } catch (error) {
      console.error('[telegram] publish error:', error)
      await sendMessage(
        chatId,
        `Publish failed: ${error.message}\n\nPlease re-send your update and try again.`,
      )
    }
  }
}

// ── Command handler ──────────────────────────────────────────────────────────

async function handleCommand(chatId: number, text: string) {
  const cmd = text.split(/\s/)[0].toLowerCase()

  if (cmd === '/start' || cmd === '/help') {
    const venue = venueForChatId(chatId)
    const venueNote = venue
      ? `This chat is configured for: ${venue === 'festival' ? 'Moville Festival' : "Rosato's"}`
      : 'This chat is not yet authorised — contact the admin.'

    const help = [
      'Quiet Objects ops bot',
      '',
      venueNote,
      '',
      'Just type a content change — I'll show you a preview and publish it live to movillefestival.com the moment you confirm.',
      '',
      'Examples:',
      '  list programme',
      '  Wednesday 7pm Fancy Dress Parade at Festival Square',
      '  Steak Burger is 17.50',
      '  Saturday is Seán Óg at 22:00',
    ].join('\n')

    await sendMessage(chatId, help)
    return
  }

  if (cmd === '/venue') {
    const venue = venueForChatId(chatId)
    await sendMessage(
      chatId,
      venue
        ? `Venue: ${venue === 'festival' ? 'Moville Festival' : "Rosato's"}`
        : 'Not authorised.',
    )
    return
  }
}

// ── Shared staging logic ─────────────────────────────────────────────────────

async function fetchBundle(venue: string) {
  const venueConfig = venueContentConfig(venue)
  const editableFiles = venue === 'festival' ? FESTIVAL_FILES : ROSATOS_FILES
  const bundleFromFiles =
    venue === 'festival' ? festivalBundleFromFiles : rosatosBundleFromFiles

  const { files, meta, repo, branch } = await readJsonFiles(
    editableFiles,
    venueConfig,
  )
  const bundle = bundleFromFiles(files)
  return { bundle, meta, repo, branch }
}

async function stage({
  text,
  venue,
  bundle,
}: {
  text: string
  venue: string
  bundle: any
}) {
  let result: any
  let source = 'ai-tools'

  if (venue === 'festival') {
    const deterministic = await runFestivalDeterministicChat({
      message: text,
      bundle,
    })
    if (deterministic?.hasChanges) {
      return { result: deterministic, source: 'deterministic-tools' }
    }
    try {
      result = await runFestivalOpsChat({ message: text, bundle, history: [] })
      source = `${result.provider}:${result.model}`
    } catch (error) {
      result =
        deterministic ||
        (await runFestivalDeterministicChat({ message: text, bundle }))
      source = 'deterministic-tools'
      result.reply = `${result.reply}\n\n(AI unavailable: ${error.message})`
    }
  } else {
    const deterministic = await runDeterministicOpsChat({
      message: text,
      bundle,
    })
    if (deterministic?.hasChanges) {
      return { result: deterministic, source: 'deterministic-tools' }
    }
    try {
      result = await runOpsChat({
        message: text,
        bundle,
        history: [],
        attachment: null,
      })
      source = `${result.provider}:${result.model}`
    } catch (error) {
      result =
        deterministic ||
        (await runDeterministicOpsChat({ message: text, bundle }))
      source = 'deterministic-tools'
      result.reply = `${result.reply}\n\n(AI unavailable: ${error.message})`
    }
  }

  return { result, source }
}

export const config: Config = {
  path: '/api/telegram',
  method: 'POST',
}
