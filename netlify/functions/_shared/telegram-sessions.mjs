/**
 * Netlify Blobs store for pending Telegram proposals.
 * Key: pending:{chatId}  Value: { proposal, signature, savedAt }
 * Proposals expire after 15 minutes (enforced by verifySignedProposal on confirm).
 */
import { getStore } from '@netlify/blobs'

const STORE = 'tg-sessions'

function store() {
  return getStore({ name: STORE, consistency: 'strong' })
}

export async function savePendingProposal(chatId, { proposal, signature }) {
  const s = store()
  await s.setJSON(`pending:${chatId}`, {
    proposal,
    signature,
    savedAt: new Date().toISOString(),
  })
}

export async function loadPendingProposal(chatId) {
  try {
    const s = store()
    return await s.get(`pending:${chatId}`, { type: 'json' })
  } catch {
    return null
  }
}

export async function deletePendingProposal(chatId) {
  try {
    const s = store()
    await s.delete(`pending:${chatId}`)
  } catch {
    // Best-effort — if it's already gone, that's fine.
  }
}
