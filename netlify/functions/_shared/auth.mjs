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
