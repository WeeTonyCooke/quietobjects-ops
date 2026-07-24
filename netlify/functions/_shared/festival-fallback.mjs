import { createFestivalToolSession } from './festival-tools.mjs'

/**
 * Offline / gateway-down path for festival ops.
 * Handles the most common natural-language patterns without an AI model.
 */
export async function runFestivalDeterministicChat({ message, bundle }) {
  const text = String(message || '').trim()
  if (!text) {
    throw Object.assign(new Error('Message is empty'), { status: 400 })
  }

  const session = createFestivalToolSession(bundle)
  const lower = text.toLowerCase()

  const DAYS = 'tuesday|wednesday|thursday|friday|saturday|sunday'

  // list programme
  if (
    /^(list|show|what.?s on|programme|program)\b/.test(lower) ||
    lower === 'list_programme'
  ) {
    await session.run('list_programme', {})
    const days = session.state.programme?.days || []
    const lines = []
    for (const day of days) {
      if (!day.events?.length) continue
      lines.push(`${day.name} (${day.label}):`)
      for (const ev of day.events) {
        const time = ev.time ? ` · ${ev.time}` : ''
        const venue = ev.venue ? ` at ${ev.venue}` : ''
        lines.push(`  • ${ev.title}${time}${venue}`)
      }
    }
    return finish(
      session,
      lines.length ? lines.join('\n') : 'Programme is empty.',
    )
  }

  // remove event: "remove <title> from <day>"
  const removeMatch = text.match(
    new RegExp(`\\bremove\\s+(.+?)\\s+from\\s+(${DAYS})\\b`, 'i'),
  )
  if (removeMatch) {
    await session.run('update_event', {
      title: removeMatch[1].trim(),
      day: removeMatch[2].trim(),
      action: 'remove',
    })
    return finish(session)
  }

  // "<day> <time> <title> at <venue>"
  // e.g. "Wednesday 7pm Fancy Dress Parade at Festival Square"
  const fullMatch = text.match(
    new RegExp(
      `\\b(${DAYS})\\b\\s+(\\d{1,2}(?:[:.}]\\d{2})?(?:\\s*(?:am|pm))?)\\s+(.+?)\\s+at\\s+(.+)$`,
      'i',
    ),
  )
  if (fullMatch) {
    await session.run('update_event', {
      day: fullMatch[1],
      time: normalizeTime(fullMatch[2]),
      title: fullMatch[3].trim(),
      venue: fullMatch[4].trim(),
      action: 'upsert',
    })
    return finish(session)
  }

  // "<title> is <day> at <time>" or "<title> is <day> <time> at <venue>"
  const simpleMatch = text.match(
    new RegExp(
      `^(.+?)\\s+is\\s+(${DAYS})(?:\\s+at\\s+(\\d{1,2}(?:[:.}]\\d{2})?(?:\\s*(?:am|pm))?))?(?:\\s+at\\s+(.+))?$`,
      'i',
    ),
  )
  if (simpleMatch) {
    await session.run('update_event', {
      title: simpleMatch[1].trim(),
      day: simpleMatch[2].trim(),
      time: normalizeTime(simpleMatch[3] || ''),
      venue: (simpleMatch[4] || '').trim(),
      action: 'upsert',
    })
    return finish(session)
  }

  return {
    reply:
      'Could not map that to a tool. Try: "list programme", "Wednesday 7pm Fancy Dress Parade at Festival Square", or "Bed Push is Thursday at 7pm at Quay Street".',
    descriptions: [],
    toolTrace: session.state.toolTrace,
    changed: [],
    bundle: { programme: session.state.programme },
    hasChanges: false,
  }
}

function finish(session, reply) {
  const changed = [...session.state.changed]
  const hasChanges = changed.length > 0
  const failed = session.state.toolTrace.find((row) => row.result?.ok === false)
  if (failed) {
    throw Object.assign(new Error(failed.result.error || 'Tool failed'), {
      status: 422,
    })
  }
  return {
    reply:
      reply ||
      (hasChanges
        ? [
            'Staged — nothing is live yet.',
            ...session.state.descriptions.map((line) => `• ${line}`),
            'Press Confirm to publish into the festival programme.',
          ].join('\n')
        : 'No changes staged.'),
    descriptions: session.state.descriptions,
    toolTrace: session.state.toolTrace,
    changed,
    bundle: { programme: session.state.programme },
    hasChanges,
  }
}

function normalizeTime(raw) {
  if (!raw) return ''
  const cleaned = String(raw).trim().toLowerCase().replace('.', ':')
  // Convert 7pm → 19:00, 7am → 07:00
  const amPmMatch = cleaned.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/)
  if (amPmMatch) {
    let h = parseInt(amPmMatch[1], 10)
    const m = amPmMatch[2] ? parseInt(amPmMatch[2], 10) : 0
    if (amPmMatch[3] === 'pm' && h !== 12) h += 12
    if (amPmMatch[3] === 'am' && h === 12) h = 0
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }
  if (/^\d{1,2}:\d{2}$/.test(cleaned)) {
    const [h, m] = cleaned.split(':')
    return `${h.padStart(2, '0')}:${m}`
  }
  return cleaned
}
