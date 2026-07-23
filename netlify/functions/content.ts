import type { Config, Context } from '@netlify/functions'
import { requireOpsUser, json, errorResponse } from './_shared/auth.mjs'
import { EDITABLE_FILES, bundleFromFiles } from './_shared/content.mjs'
import { readJsonFiles, contentConfig } from './_shared/github.mjs'

export default async (req: Request, _context: Context) => {
  if (req.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    await requireOpsUser()
    const { files, repo, branch } = await readJsonFiles(EDITABLE_FILES)
    const bundle = bundleFromFiles(files)
    const { repo: configuredRepo, branch: configuredBranch } = contentConfig()

    return json({
      ok: true,
      repo: repo || configuredRepo,
      branch: branch || configuredBranch,
      programme: bundle.programme,
      menu: bundle.menu,
    })
  } catch (error) {
    return errorResponse(error, error.status || 500)
  }
}

export const config: Config = {
  path: '/api/content',
  method: 'GET',
}
