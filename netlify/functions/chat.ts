import type { Config, Context } from '@netlify/functions'
import { requireOpsUser, json, errorResponse } from './_shared/auth.mjs'
import { EDITABLE_FILES, bundleFromFiles, filesFromBundle } from './_shared/content.mjs'
import { readJsonFiles } from './_shared/github.mjs'
import { proposeFromMessage } from './_shared/propose.mjs'
import { signProposal } from './_shared/proposals.mjs'

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
    const result = await proposeFromMessage({ message, bundle })

    const proposal = {
      venue: 'rosatos',
      repo,
      branch,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      message: String(message),
      summary: result.descriptions.join(' · '),
      descriptions: result.descriptions,
      patches: result.patches,
      files: filesFromBundle(result.bundle),
      baseMeta: meta,
      requestedBy: user.email || user.id,
    }

    const signed = signProposal(proposal)

    return json({
      ok: true,
      source: result.source,
      reply: result.assistantText,
      summary: proposal.summary,
      descriptions: proposal.descriptions,
      proposal: signed.proposal,
      signature: signed.signature,
      preview: {
        programme: result.bundle.programme,
        menu: result.bundle.menu,
      },
    })
  } catch (error) {
    return errorResponse(error, error.status || 500)
  }
}

export const config: Config = {
  path: '/api/chat',
  method: 'POST',
}
