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
 */
export async function extractPdfText(buffer) {
  try {
    const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
    const result = await extractText(data)
    const text = Array.isArray(result.text)
      ? result.text.join('\n')
      : String(result.text || result || '')
    return text.replace(/\0/g, '').trim()
  } catch (error) {
    throw Object.assign(
      new Error(`Could not read PDF text: ${error.message}`),
      { status: 422 },
    )
  }
}
