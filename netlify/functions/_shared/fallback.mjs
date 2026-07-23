import { createToolSession } from './tools.mjs'
import { dayFromLabel, DAY_LABELS } from './content.mjs'

/**
 * Offline / gateway-down path that exercises the same ops tools.
 */
export async function runDeterministicOpsChat({ message, bundle }) {
  const text = String(message || '').trim()
  if (!text) {
    throw Object.assign(new Error('Message is empty'), { status: 400 })
  }

  const session = createToolSession(bundle)
  const lower = text.toLowerCase()

  if (
    /^(list|show|what.?s on|programme|program)\b/.test(lower) ||
    lower === 'list_programme'
  ) {
    await session.run('list_programme', {})
    const lineup = session.state.programme?.lineup || []
    const lines = lineup.map(
      (row) =>
        `• ${row.dayLabel || DAY_LABELS[row.day]}: ${row.name}${row.time ? ` · ${row.time}` : ''}`,
    )
    return finish(
      session,
      lines.length
        ? `This week:\n${lines.join('\n')}`
        : 'Programme is empty.',
    )
  }

  const priceMatch = text.match(
    /(.+?)\s+(?:is|to|at|=)\s*€?\s*(\d+(?:[.,]\d{1,2})?)\s*$/i,
  )
  if (priceMatch && !/\b(saturday|sunday|monday|friday|at\s+\d)/i.test(text)) {
    await session.run('update_menu_price', {
      itemName: cleanItemName(priceMatch[1]),
      price: priceMatch[2].replace(',', '.'),
    })
    return finish(session)
  }

  const lineupMatch = text.match(
    /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|wed|thu|fri|sat)\b(?:'s)?\s+(?:is|band is|act is)?\s*(.+?)\s+at\s+(\d{1,2}[:.]\d{2}|\d{1,2}\s*(?:am|pm)?)/i,
  )
  if (lineupMatch) {
    await session.run('update_programme_event', {
      dayLabel: lineupMatch[1],
      name: lineupMatch[2].replace(/^(is|band is|act is)\s+/i, '').trim(),
      time: normalizeTime(lineupMatch[3]),
      kind: inferKind(lineupMatch[2], text),
      action: 'upsert',
    })
    return finish(session)
  }

  const tonightMatch = text.match(
    /tonight(?:\s+override)?(?:\s+is|\s*[:=])\s+(.+)$/i,
  )
  if (tonightMatch) {
    await session.run('set_tonight_override', { value: tonightMatch[1].trim() })
    return finish(session)
  }

  // Ensure dayFromLabel is referenced for tree-shaking clarity in tests
  void dayFromLabel

  return {
    reply:
      'Could not map that to a tool. Try: “Steak Burger is 17.50”, “Saturday is Seán Óg at 22:00”, or “list programme”.',
    descriptions: [],
    toolTrace: session.state.toolTrace,
    changed: [],
    bundle: {
      programme: session.state.programme,
      menu: session.state.menu,
    },
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
            'Press Confirm to publish into Rosato’s content JSON.',
          ].join('\n')
        : 'No changes staged.'),
    descriptions: session.state.descriptions,
    toolTrace: session.state.toolTrace,
    changed,
    bundle: {
      programme: session.state.programme,
      menu: session.state.menu,
    },
    hasChanges,
  }
}

function cleanItemName(raw) {
  return String(raw)
    .replace(/^(set|update|change|make)\s+/i, '')
    .replace(/\s+price$/i, '')
    .trim()
}

function normalizeTime(raw) {
  const cleaned = String(raw).trim().toLowerCase().replace('.', ':')
  if (/^\d{1,2}:\d{2}$/.test(cleaned)) {
    const [h, m] = cleaned.split(':')
    return `${h.padStart(2, '0')}:${m}`
  }
  return cleaned
}

function inferKind(name, fullText) {
  const hay = `${name} ${fullText}`.toLowerCase()
  if (hay.includes('quiz')) return 'quiz'
  if (hay.includes('poker') || hay.includes('hold’em') || hay.includes("hold'em"))
    return 'poker'
  return 'music'
}
