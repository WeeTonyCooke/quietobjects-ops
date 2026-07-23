async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
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

export function chat(message) {
  return request('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ message }),
  })
}

export function publish({ proposal, signature }) {
  return request('/api/publish', {
    method: 'POST',
    body: JSON.stringify({ proposal, signature }),
  })
}

export function fetchContent() {
  return request('/api/content')
}
