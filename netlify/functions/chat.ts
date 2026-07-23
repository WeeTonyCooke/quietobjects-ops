import type { Config, Context } from '@netlify/functions'
import { requireOpsUser, json, errorResponse } from './_shared/auth.mjs'
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
import { readJsonFiles, venueContentConfig } from './_shared/github.mjs'
import { runOpsChat } from './_shared/agent.mjs'
import { runFestivalOpsChat } from './_shared/festival-agent.mjs'
import { runDeterministicOpsChat } from './_shared/fallback.mjs'
import { runFestivalDeterministicChat } from './_shared/festival-fallback.mjs'
import { signProposal } from './_shared/proposals.mjs'
import { appendAudit } from './_shared/audit.mjs'
import { loadAttachment } from './_shared/attachments.mjs'

export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    const user = await requireOpsUser()
    const body = await req.json()
    const message = body?.message
    const history = Array.isArray(body?.history) ? body.history : []
    const attachmentId = body?.attachmentId || null
    const venue = body?.venue === 'festival' ? 'festival' : 'rosatos'

    // Attachments are Rosato's-only in Phase 1; festival has no PDF attachment flow yet.
    const attachment =
      attachmentId && venue === 'rosatos'
        ? await loadAttachment(attachmentId)
        : null
    if (attachmentId && venue === 'rosatos' && !attachment) {
      throw Object.assign(new Error('Attachment not found — upload again'), {
        status: 404,
      })
    }

    const venueConfig = venueContentConfig(venue)
    const editableFiles = venue === 'festival' ? FESTIVAL_FILES : ROSATOS_FILES
    const bundleFromFiles =
      venue === 'festival' ? festivalBundleFromFiles : rosatosBundleFromFiles
    const filesFromBundle =
      venue === 'festival' ? festivalFilesFromBundle : rosatosFilesFromBundle

    const { files, meta, repo, branch } = await readJsonFiles(
      editableFiles,
      venueConfig,
    )
    const bundle = bundleFromFiles(files)

    let result
    let source = 'ai-tools'

    if (venue === 'festival') {
      const deterministic = await runFestivalDeterministicChat({ message, bundle })
      if (deterministic?.hasChanges) {
        result = deterministic
        source = 'deterministic-tools'
      } else {
        try {
          result = await runFestivalOpsChat({ message, bundle, history })
          source = `${result.provider}:${result.model}`
        } catch (error) {
          result = deterministic || (await runFestivalDeterministicChat({ message, bundle }))
          source = 'deterministic-tools'
          result.reply = `${result.reply}\n\n(AI gateway unavailable: ${error.message})`
        }
      }
    } else {
      // Rosato's path — unchanged logic
      const deterministic = attachment
        ? null
        : await runDeterministicOpsChat({ message, bundle })
      if (deterministic?.hasChanges) {
        result = deterministic
        source = 'deterministic-tools'
      } else {
        try {
          result = await runOpsChat({ message, bundle, history, attachment })
          source = `${result.provider}:${result.model}`
        } catch (error) {
          if (attachment) throw error
          result = deterministic || (await runDeterministicOpsChat({ message, bundle }))
          source = 'deterministic-tools'
          result.reply = `${result.reply}\n\n(AI gateway unavailable: ${error.message})`
        }
      }
    }

    if (!result.hasChanges) {
      await appendAudit({
        action: 'chat',
        actor: user.email || user.id,
        summary: 'No content changes staged',
        message: String(message || ''),
        toolTrace: result.toolTrace,
        source,
        venue,
      })
      return json({
        ok: true,
        staged: false,
        source,
        reply: result.reply,
        toolTrace: result.toolTrace,
      })
    }

    const changedSet = new Set(result.changed)
    const proposalFiles = filesFromBundle(result.bundle, {
      onlyChanged: changedSet,
    })

    const proposal = {
      venue,
      repo,
      branch,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      message: String(message || (attachment ? `PDF: ${attachment?.name}` : '')),
      summary: result.descriptions.join(' · '),
      descriptions: result.descriptions,
      toolTrace: result.toolTrace,
      attachmentId: attachment?.id || null,
      attachmentName: attachment?.name || null,
      files: proposalFiles,
      baseMeta: Object.fromEntries(
        Object.keys(proposalFiles).map((path) => [path, meta[path]]),
      ),
      requestedBy: user.email || user.id,
      source,
    }

    const signed = signProposal(proposal)

    await appendAudit({
      action: 'stage',
      actor: user.email || user.id,
      summary: proposal.summary,
      message: proposal.message,
      paths: Object.keys(proposalFiles),
      toolTrace: result.toolTrace,
      source,
      venue,
    })

    return json({
      ok: true,
      staged: true,
      source,
      reply: result.reply,
      summary: proposal.summary,
      descriptions: proposal.descriptions,
      toolTrace: result.toolTrace,
      proposal: signed.proposal,
      signature: signed.signature,
      attachmentName: attachment?.name || null,
    })
  } catch (error) {
    return errorResponse(error, error.status || 500)
  }
}

export const config: Config = {
  path: '/api/chat',
  method: 'POST',
}
