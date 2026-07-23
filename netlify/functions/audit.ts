import type { Config, Context } from '@netlify/functions'
import { requireOpsUser, json, errorResponse } from './_shared/auth.mjs'
import { listAudit } from './_shared/audit.mjs'

export default async (req: Request, _context: Context) => {
  if (req.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    await requireOpsUser()
    const url = new URL(req.url)
    const limit = Number(url.searchParams.get('limit') || 20)
    const entries = await listAudit({
      limit: Number.isFinite(limit) ? Math.min(limit, 100) : 20,
    })
    return json({ ok: true, entries })
  } catch (error) {
    return errorResponse(error, error.status || 500)
  }
}

export const config: Config = {
  path: '/api/audit',
  method: 'GET',
}
