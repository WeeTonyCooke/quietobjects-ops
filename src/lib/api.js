async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { 'Content-Type': 'application/json' }),
      ...(options.headers || {}),
    },
    ...options,
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`)
  }
  return data
}

export function chat(message, history = [], attachmentId = null, venue = 'rosatos') {
  return request('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ message, history, attachmentId, venue }),
  })
}

export function publish({ proposal, signature }) {
  return request('/api/publish', {
    method: 'POST',
    body: JSON.stringify({ proposal, signature }),
  })
}

export function fetchContent(venue = 'rosatos') {
  return request(`/api/content?venue=${encodeURIComponent(venue)}`)
}

export function fetchAudit(limit = 20) {
  return request(`/api/audit?limit=${limit}`)
}

export function uploadAttachment(file) {
  const body = new FormData()
  body.append('file', file)
  return request('/api/attach', {
    method: 'POST',
    body,
  })
}
