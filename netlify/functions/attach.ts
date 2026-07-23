import type { Config, Context } from '@netlify/functions'
import { requireOpsUser, json, errorResponse } from './_shared/auth.mjs'
import { storeAttachment, extractPdfText } from './_shared/attachments.mjs'
import { appendAudit } from './_shared/audit.mjs'

const MAX_BYTES = 8 * 1024 * 1024

export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    const user = await requireOpsUser()
    const form = await req.formData()
    const file = form.get('file')

    if (!file || typeof file === 'string') {
      throw Object.assign(new Error('Attach a PDF file'), { status: 400 })
    }

    const name = file.name || 'menu.pdf'
    const type = file.type || 'application/pdf'
    if (!/\.pdf$/i.test(name) && type !== 'application/pdf') {
      throw Object.assign(new Error('Only PDF attachments are supported in Phase 1'), {
        status: 400,
      })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    if (!buffer.length) {
      throw Object.assign(new Error('Attachment is empty'), { status: 400 })
    }
    if (buffer.length > MAX_BYTES) {
      throw Object.assign(new Error('PDF must be under 8MB'), { status: 400 })
    }

    const extractedText = await extractPdfText(buffer)
    const saved = await storeAttachment({
      name,
      type: 'application/pdf',
      buffer,
      extractedText,
      uploadedBy: user.email || user.id,
    })

    await appendAudit({
      action: 'attach',
      actor: user.email || user.id,
      summary: `Attached ${name}`,
      attachmentId: saved.id,
      chars: extractedText.length,
    })

    return json({
      ok: true,
      attachment: {
        id: saved.id,
        name: saved.name,
        size: buffer.length,
        extractedChars: extractedText.length,
        preview: extractedText.slice(0, 400),
      },
    })
  } catch (error) {
    return errorResponse(error, error.status || 500)
  }
}

export const config: Config = {
  path: '/api/attach',
  method: 'POST',
}
