/**
 * Rosato's content helpers — programme + menu only.
 * venue.json stays Quiet Objects–owned and is never written by Phase 1.
 */

export const EDITABLE_FILES = Object.freeze([
  'content/programme.json',
  'content/menu.json',
])

export const DAY_LABELS = Object.freeze([
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
])

export function emptyContentBundle() {
  return {
    programme: null,
    menu: null,
  }
}

/**
 * Apply a structured patch list to a content bundle.
 * Patch shapes:
 *   { target: "menu.price", sectionId?, itemName, price }
 *   { target: "menu.item", sectionId?, action: "add"|"update"|"remove", item }
 *   { target: "programme.lineup", action: "upsert"|"remove", entry }
 *   { target: "programme.tonightOverride", value }
 *   { target: "programme.note", value }
 */
export function applyPatches(bundle, patches = []) {
  const next = {
    programme: structuredClone(bundle.programme),
    menu: structuredClone(bundle.menu),
  }
  const descriptions = []

  for (const patch of patches) {
    if (!patch || typeof patch !== 'object') continue

    switch (patch.target) {
      case 'menu.price': {
        const hit = findMenuItem(next.menu, patch.sectionId, patch.itemName)
        if (!hit) throw new Error(`Menu item not found: ${patch.itemName}`)
        const before = hit.item.price
        hit.item.price = String(patch.price)
        descriptions.push(
          `Menu · ${hit.item.name}: €${before || '—'} → €${hit.item.price}`,
        )
        break
      }
      case 'menu.item': {
        if (!next.menu?.sections?.length) {
          throw new Error('Menu has no sections to edit')
        }
        const section =
          findSection(next.menu, patch.sectionId) || next.menu.sections[0]
        if (patch.action === 'remove') {
          const before = section.items.length
          section.items = section.items.filter(
            (item) => !namesMatch(item.name, patch.item?.name || patch.itemName),
          )
          if (section.items.length === before) {
            throw new Error(`Menu item not found: ${patch.item?.name || patch.itemName}`)
          }
          descriptions.push(`Menu · removed ${patch.item?.name || patch.itemName}`)
          break
        }
        const incoming = normalizeMenuItem(patch.item)
        const existing = section.items.find((item) =>
          namesMatch(item.name, incoming.name),
        )
        if (existing && (patch.action === 'update' || !patch.action)) {
          Object.assign(existing, incoming)
          descriptions.push(`Menu · updated ${incoming.name}`)
        } else if (!existing && (patch.action === 'add' || !patch.action)) {
          section.items.push(incoming)
          descriptions.push(`Menu · added ${incoming.name}`)
        } else if (existing && patch.action === 'add') {
          Object.assign(existing, incoming)
          descriptions.push(`Menu · updated ${incoming.name} (already present)`)
        } else {
          section.items.push(incoming)
          descriptions.push(`Menu · added ${incoming.name}`)
        }
        break
      }
      case 'programme.lineup': {
        if (!next.programme) throw new Error('Programme content missing')
        if (!Array.isArray(next.programme.lineup)) next.programme.lineup = []
        const entry = normalizeLineupEntry(patch.entry)
        if (patch.action === 'remove') {
          const before = next.programme.lineup.length
          next.programme.lineup = next.programme.lineup.filter(
            (row) => !(row.day === entry.day && namesMatch(row.name, entry.name)),
          )
          if (next.programme.lineup.length === before) {
            throw new Error(`Lineup not found: ${entry.dayLabel || entry.day} ${entry.name}`)
          }
          descriptions.push(
            `Programme · removed ${entry.dayLabel || DAY_LABELS[entry.day]} · ${entry.name}`,
          )
          break
        }
        const idx = next.programme.lineup.findIndex((row) => row.day === entry.day)
        if (idx >= 0) {
          next.programme.lineup[idx] = { ...next.programme.lineup[idx], ...entry }
          descriptions.push(
            `Programme · ${entry.dayLabel}: ${entry.name} · ${entry.time}`,
          )
        } else {
          next.programme.lineup.push(entry)
          next.programme.lineup.sort((a, b) => a.day - b.day)
          descriptions.push(
            `Programme · added ${entry.dayLabel}: ${entry.name} · ${entry.time}`,
          )
        }
        syncBoardFromLineup(next.programme)
        break
      }
      case 'programme.tonightOverride': {
        if (!next.programme) throw new Error('Programme content missing')
        next.programme.tonightOverride = String(patch.value || '')
        descriptions.push(
          patch.value
            ? `Tonight override → ${patch.value}`
            : 'Tonight override cleared',
        )
        break
      }
      case 'programme.note': {
        if (!next.programme) throw new Error('Programme content missing')
        next.programme.note = String(patch.value || '')
        descriptions.push('Programme note updated')
        break
      }
      default:
        throw new Error(`Unsupported patch target: ${patch.target}`)
    }
  }

  return { bundle: next, descriptions }
}

export function filesFromBundle(bundle) {
  const files = {}
  if (bundle.programme) {
    files['content/programme.json'] = bundle.programme
  }
  if (bundle.menu) {
    files['content/menu.json'] = bundle.menu
  }
  return files
}

export function bundleFromFiles(files) {
  return {
    programme: files['content/programme.json'] ?? null,
    menu: files['content/menu.json'] ?? null,
  }
}

function findSection(menu, sectionId) {
  if (!menu?.sections) return null
  if (sectionId) {
    return (
      menu.sections.find((section) => section.id === sectionId) ||
      menu.sections.find((section) => namesMatch(section.name, sectionId)) ||
      null
    )
  }
  return null
}

function findMenuItem(menu, sectionId, itemName) {
  if (!menu?.sections) return null
  const sections = sectionId
    ? [findSection(menu, sectionId)].filter(Boolean)
    : menu.sections
  for (const section of sections) {
    const item = section.items?.find((row) => namesMatch(row.name, itemName))
    if (item) return { section, item }
  }
  return null
}

function normalizeMenuItem(item = {}) {
  if (!item.name) throw new Error('Menu item requires a name')
  return {
    name: String(item.name).trim(),
    description: item.description == null ? '' : String(item.description),
    price: item.price == null ? '' : String(item.price),
  }
}

function normalizeLineupEntry(entry = {}) {
  const day =
    typeof entry.day === 'number'
      ? entry.day
      : dayFromLabel(entry.dayLabel || entry.day)
  if (day == null || day < 0 || day > 6) {
    throw new Error('Lineup entry needs a valid day (0–6 or day label)')
  }
  const name = String(entry.name || '').trim()
  if (!name) throw new Error('Lineup entry requires a name')
  const time = String(entry.time || '').trim()
  const dayLabel = entry.dayLabel || DAY_LABELS[day]
  const cue = entry.cue || (time ? `${name} · ${time}` : name)
  const detail = entry.detail || cue
  return {
    day,
    dayLabel,
    name,
    time,
    kind: entry.kind || 'music',
    cue,
    detail,
  }
}

function dayFromLabel(label) {
  if (typeof label === 'number') return label
  if (!label) return null
  const cleaned = String(label).trim().toLowerCase()
  const aliases = {
    sun: 0,
    sunday: 0,
    mon: 1,
    monday: 1,
    tue: 2,
    tues: 2,
    tuesday: 2,
    wed: 3,
    wednesday: 3,
    thu: 4,
    thur: 4,
    thurs: 4,
    thursday: 4,
    fri: 5,
    friday: 5,
    sat: 6,
    saturday: 6,
  }
  return aliases[cleaned] ?? null
}

function syncBoardFromLineup(programme) {
  if (!Array.isArray(programme.lineup)) return
  programme.board = programme.lineup.map((row) => ({
    id: `${row.kind || 'event'}-${row.day}`,
    days: String(row.day),
    label: kindLabel(row.kind),
    title: row.dayLabel || DAY_LABELS[row.day],
    detail: row.cue || `${row.name}${row.time ? ` · ${row.time}` : ''}`,
    href: '#whats-on',
  }))
}

function kindLabel(kind) {
  switch (kind) {
    case 'quiz':
      return 'Quiz'
    case 'poker':
      return 'Poker'
    case 'music':
      return 'Music'
    default:
      return 'On'
  }
}

function namesMatch(a, b) {
  return normalizeName(a) === normalizeName(b)
}

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}
