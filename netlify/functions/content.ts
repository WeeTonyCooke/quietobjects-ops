import type { Config, Context } from '@netlify/functions'
import { requireOpsUser, json, errorResponse } from './_shared/auth.mjs'
import { EDITABLE_FILES as ROSATOS_FILES, bundleFromFiles as rosatosBundleFromFiles } from './_shared/content.mjs'
import { EDITABLE_FILES as FESTIVAL_FILES, bundleFromFiles as festivalBundleFromFiles } from './_shared/festival-content.mjs'
import { readJsonFiles, venueContentConfig } from './_shared/github.mjs'

export default async (req: Request, context: Context) => {
  if (req.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    await requireOpsUser()
    const url = new URL(req.url)
    const venue = url.searchParams.get('venue') === 'festival' ? 'festival' : 'rosatos'
    const venueConfig = venueContentConfig(venue)
    const editableFiles = venue === 'festival' ? FESTIVAL_FILES : ROSATOS_FILES
    const bundleFromFiles = venue === 'festival' ? festivalBundleFromFiles : rosatosBundleFromFiles

    const { files, repo, branch } = await readJsonFiles(editableFiles, venueConfig)
    const bundle = bundleFromFiles(files)

    return json({
      ok: true,
      venue,
      repo,
      branch,
      ...(venue === 'festival'
        ? { programme: bundle.programme }
        : { programme: bundle.programme, menu: bundle.menu }),
    })
  } catch (error) {
    return errorResponse(error, error.status || 500)
  }
}

export const config: Config = {
  path: '/api/content',
  method: 'GET',
}
