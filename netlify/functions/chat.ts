import type { Config, Context } from '@netlify/functions'
import { requireOpsUser, json, errorResponse } from './_shared/auth.mjs'
import { readJsonFiles } from './_shared/github.mjs'
import { getVenue, isValidVenue } from './_shared/venue-registry.mjs'
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
    const venueSlug: string = body?.venue ?? 'rosatos'

    if (!isValidVenue(venueSlug)) {
      return json({ error: `Unknown venue: "${venueSlug}"` }, 400)
    }

    const venue = getVenue(venueSlug)

    // Attachments are opt-in per venue type
    const attachment =
      attachmentId && venue.supportsAttachments
        ? await loadAttachment(attachmentId)
        : null
    if (attachmentId && venue.supportsAttachments && !attachment) {
      throw Object.assign(new Error('Attachment not found — upload again'), {
        status: 404,
      })
    }

    const venueConfig = venue.contentConfig()
    const { files, meta, repo, branch } = await readJsonFiles(
      venue.editableFiles,
      venueConfig,
    )
    const bundle = venue.bundleFromFiles(files)

    // Stage: try deterministic fallback first, then AI
    let result: any
    let source = 'ai-tools'

    const deterministic =
      attachment || !venue.runDeterministicChat
        ? null
        : await venue.runDeterministicChat({ message, bundle })

    if (deterministic?.hasChanges) {
      result = deterministic
      source = 'deterministic-tools'
    } else {
      try {
        result = await venue.runOpsChat({ message, bundle, history, attachment })
        source = `${result.provider}:${result.model}`
      } catch (error) {
        if (attachment) throw error
        result =
          deterministic ||
          (venue.runDeterministicChat
            ? await venue.runDeterministicChat({ message, bundle })
            : null)
        if (!result) throw error
        source = 'deterministic-tools'
        result.reply = `${result.reply}\n\n(AI gateway unavailable: ${error.message})`
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
        venue: venueSlug,
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
    const proposalFiles = venue.filesFromBundle(result.bundle, {
      onlyChanged: changedSet,
    })

    const proposal = {
      venue: venueSlug,
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
      venue: venueSlug,
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
