import type { Config, Context } from '@netlify/functions'
import { requireOpsUser, requireVenueAccess, json, errorResponse } from './_shared/auth.mjs'
import { getVenue, isValidVenue } from './_shared/venue-registry.mjs'
import { putJsonFilesViaContentsApi } from './_shared/github.mjs'
import { verifySignedProposal } from './_shared/proposals.mjs'
import { appendAudit } from './_shared/audit.mjs'

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

    const venueSlug = proposal.venue
    if (!isValidVenue(venueSlug)) {
      throw Object.assign(new Error(`Unexpected venue in proposal: ${venueSlug}`), {
        status: 400,
      })
    }

    requireVenueAccess(user, venueSlug)

    const venue = getVenue(venueSlug)
    const files = proposal.files || {}
    const paths = Object.keys(files)

    for (const path of paths) {
      if (!venue.editableFiles.includes(path)) {
        throw Object.assign(
          new Error(`Refusing to publish ${path} for venue ${venueSlug}`),
          { status: 400 },
        )
      }
    }
    if (!paths.length) {
      throw Object.assign(new Error('Proposal has no files to publish'), {
        status: 400,
      })
    }

    const venueName = venueSlug === 'festival' ? 'moville-festival' : venueSlug
    const message = [
      `ops(${venueName}): ${proposal.summary}`,
      '',
      `Requested by ${user.email || user.id}`,
      `Chat: ${proposal.message}`,
    ].join('\n')

    const venueConfig = venue.contentConfig()
    const result = await putJsonFilesViaContentsApi({
      files,
      message,
      previousMeta: proposal.baseMeta || {},
      config: venueConfig,
    })

    const audit = await appendAudit({
      action: 'publish',
      actor: user.email || user.id,
      summary: proposal.summary,
      message: proposal.message,
      paths: result.paths,
      commits: result.commits,
      repo: result.repo,
      branch: result.branch,
      toolTrace: proposal.toolTrace || [],
      venue: venueSlug,
    })

    return json({
      ok: true,
      published: true,
      commit: result,
      summary: proposal.summary,
      paths: result.paths,
      auditId: audit.id,
    })
  } catch (error) {
    return errorResponse(error, error.status || 500)
  }
}

export const config: Config = {
  path: '/api/publish',
  method: 'POST',
}
