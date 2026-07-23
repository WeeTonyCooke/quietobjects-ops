import type { Config, Context } from '@netlify/functions'
import { requireOpsUser, json, errorResponse } from './_shared/auth.mjs'
import {
  EDITABLE_FILES,
  bundleFromFiles,
  filesFromBundle,
} from './_shared/content.mjs'
import { readJsonFiles } from './_shared/github.mjs'
import { runOpsChat } from './_shared/agent.mjs'
import { runDeterministicOpsChat } from './_shared/fallback.mjs'
import { signProposal } from './_shared/proposals.mjs'
import { appendAudit } from './_shared/audit.mjs'

export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    const user = await requireOpsUser()
    const body = await req.json()
    const message = body?.message

    const { files, meta, repo, branch } = await readJsonFiles(EDITABLE_FILES)
    const bundle = bundleFromFiles(files)

    let result
    let source = 'ai-tools'
    try {
      result = await runOpsChat({ message, bundle })
      source = `${result.provider}:${result.model}`
    } catch (error) {
      // Gateway / key unavailable in fresh local envs — same tools via fallback.
      result = await runDeterministicOpsChat({ message, bundle })
      source = 'deterministic-tools'
      result.reply = `${result.reply}\n\n(AI gateway unavailable: ${error.message})`
    }

    if (!result.hasChanges) {
      await appendAudit({
        action: 'chat',
        actor: user.email || user.id,
        summary: 'No content changes staged',
        message: String(message || ''),
        toolTrace: result.toolTrace,
        source,
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
      venue: 'rosatos',
      repo,
      branch,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      message: String(message),
      summary: result.descriptions.join(' · '),
      descriptions: result.descriptions,
      toolTrace: result.toolTrace,
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
    })
  } catch (error) {
    return errorResponse(error, error.status || 500)
  }
}

export const config: Config = {
  path: '/api/chat',
  method: 'POST',
}
