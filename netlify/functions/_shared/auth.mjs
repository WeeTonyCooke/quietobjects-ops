import { getUser } from '@netlify/identity'

function env(name) {
  return typeof Netlify !== 'undefined'
    ? Netlify.env.get(name)
    : process.env[name]
}

/**
 * Require a signed-in Netlify Identity user, unless OPS_AUTH_BYPASS=1
 * (local / preview scaffolding only).
 */
export async function requireOpsUser() {
  if (env('OPS_AUTH_BYPASS') === '1') {
    return {
      id: 'dev-bypass',
      email: 'ops-dev@quietobjects.local',
      bypass: true,
    }
  }

  const user = await getUser()
  if (!user) {
    const error = new Error('Sign in required')
    error.status = 401
    throw error
  }
  return user
}

/**
 * Return the venues this user is allowed to access.
 * null = all venues (admin or bypass).
 * string[] = explicit list from venue:* roles.
 *
 * Roles are stored in app_metadata.roles on the Netlify Identity user:
 *   admin          → all venues
 *   venue:rosatos  → Rosato's only
 *   venue:festival → Moville Festival only
 *   venue:golf     → golf venue only
 */
export function getUserVenues(user) {
  if (user.bypass) return null // dev bypass — all venues
  const roles = user.app_metadata?.roles || []
  if (roles.includes('admin')) return null // admin — all venues
  const venueRoles = roles
    .filter((r) => r.startsWith('venue:'))
    .map((r) => r.slice('venue:'.length))
  return venueRoles.length ? venueRoles : null // no venue roles = no restriction yet
}

/**
 * Throw 403 if the user does not have access to the given venue.
 */
export function requireVenueAccess(user, venueSlug) {
  const allowed = getUserVenues(user)
  if (allowed === null) return // unrestricted
  if (!allowed.includes(venueSlug)) {
    throw Object.assign(
      new Error(`Access denied for venue: ${venueSlug}`),
      { status: 403 },
    )
  }
}

export function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
    },
  })
}

export function errorResponse(error, fallbackStatus = 500) {
  const status = error.status || fallbackStatus
  return json(
    {
      error: error.message || 'Unexpected error',
    },
    status,
  )
}
