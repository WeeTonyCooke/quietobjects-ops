import { getStore } from '@netlify/blobs'
import { extractText } from 'unpdf'

const STORE = 'ops-attachments'

function store() {
  return getStore({ name: STORE, consistency: 'strong' })
}

export async function storeAttachment({
  name,
  type,
  buffer,
  extractedText,
  uploadedBy,
}) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const s = store()

  await s.set(`rosatos/${id}.pdf`, buffer, {
    metadata: {
      contentType: type || 'application/pdf',
      name,
      uploadedBy: uploadedBy || '',
      uploadedAt: new Date().toISOString(),
    },
  })

  const meta = {
    id,
    venue: 'rosatos',
    name,
    type: type || 'application/pdf',
    uploadedBy: uploadedBy || '',
    uploadedAt: new Date().toISOString(),
    extractedText: String(extractedText || ''),
  }
  await s.setJSON(`rosatos/${id}.json`, meta)
  return meta
}

export async function loadAttachment(id) {
  if (!id) return null
  const s = store()
  const meta = await s.get(`rosatos/${id}.json`, { type: 'json' })
  return meta
}

/**
 * Extract plain text from a PDF buffer for menu-update staging.
 * unpdf rejects Node Buffer even though Buffer extends Uint8Array — copy first.
 */
export async function extractPdfText(buffer) {
  try {
    const bytes =
      buffer instanceof ArrayBuffer
        ? new Uint8Array(buffer)
        : Uint8Array.from(buffer)
    const result = await extractText(bytes)
    const text = Array.isArray(result.text)
      ? result.text.join('\n')
      : String(result.text || result || '')
    return text.split('\0').join('').trim()
  } catch (error) {
    throw Object.assign(
      new Error(`Could not read PDF text: ${error.message}`),
      { status: 422 },
    )
  }
}
