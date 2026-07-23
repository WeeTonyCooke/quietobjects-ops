import { getStore } from '@netlify/blobs'

const STORE = 'ops-audit'
const INDEX_KEY = 'rosatos/index.json'

function store() {
  return getStore({ name: STORE, consistency: 'strong' })
}

/**
 * Append a publish/stage audit entry for the Rosato's pilot.
 * Stored as JSON audit files in Netlify Blobs (export-style artifacts).
 */
export async function appendAudit(entry) {
  try {
    const id =
      entry.id ||
      `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const record = {
      id,
      venue: 'rosatos',
      at: entry.at || new Date().toISOString(),
      ...entry,
    }

    const s = store()
    await s.setJSON(`rosatos/${id}.json`, record)

    const index = (await s.get(INDEX_KEY, { type: 'json' })) || { entries: [] }
    index.entries = [
      {
        id: record.id,
        at: record.at,
        action: record.action,
        summary: record.summary,
        actor: record.actor,
      },
      ...index.entries,
    ].slice(0, 200)
    await s.setJSON(INDEX_KEY, index)

    return record
  } catch (error) {
    console.warn('audit append skipped:', error.message)
    return {
      id: 'audit-skipped',
      skipped: true,
      reason: error.message,
      ...entry,
      at: entry.at || new Date().toISOString(),
    }
  }
}

export async function listAudit({ limit = 30 } = {}) {
  try {
    const s = store()
    const index = (await s.get(INDEX_KEY, { type: 'json' })) || { entries: [] }
    return (index.entries || []).slice(0, limit)
  } catch (error) {
    console.warn('audit list skipped:', error.message)
    return []
  }
}

export async function getAuditEntry(id) {
  try {
    const s = store()
    return s.get(`rosatos/${id}.json`, { type: 'json' })
  } catch {
    return null
  }
}
