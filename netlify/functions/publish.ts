import type { Config, Context } from '@netlify/functions'
import { requireOpsUser, json, errorResponse } from './_shared/auth.mjs'
import { EDITABLE_FILES } from './_shared/content.mjs'
import { commitJsonFiles } from './_shared/github.mjs'
import { verifySignedProposal } from './_shared/proposals.mjs'

export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    const user = await requireOpsUser()
    const body = await req.json()
    const proposal = verifySignedProposal({
      proposal: body?.proposal,
      signature: body?.signature,
    })

    if (proposal.venue !== 'rosatos') {
      throw Object.assign(new Error('Unexpected venue in proposal'), { status: 400 })
    }

    const files = proposal.files || {}
    const paths = Object.keys(files)
    for (const path of paths) {
      if (!EDITABLE_FILES.includes(path)) {
        throw Object.assign(new Error(`Refusing to publish ${path}`), {
          status: 400,
        })
      }
    }
    if (!paths.length) {
      throw Object.assign(new Error('Proposal has no files to publish'), {
        status: 400,
      })
    }

    const message = [
      `ops(rosatos): ${proposal.summary}`,
      '',
      `Requested by ${user.email || user.id}`,
      `Chat: ${proposal.message}`,
    ].join('\n')

    const result = await commitJsonFiles({
      files,
      message,
      previousMeta: proposal.baseMeta || {},
    })

    return json({
      ok: true,
      published: true,
      commit: result,
      summary: proposal.summary,
      paths: result.paths,
    })
  } catch (error) {
    return errorResponse(error, error.status || 500)
  }
}

export const config: Config = {
  path: '/api/publish',
  method: 'POST',
}
