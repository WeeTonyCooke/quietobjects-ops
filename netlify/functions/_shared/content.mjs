/**
 * Rosato's content model helpers — programme + menu only.
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

export function bundleFromFiles(files) {
  return {
    programme: files['content/programme.json'] ?? null,
    menu: files['content/menu.json'] ?? null,
  }
}

export function filesFromBundle(bundle, { onlyChanged = null } = {}) {
  const files = {}
  if (bundle.programme && (!onlyChanged || onlyChanged.has('programme'))) {
    files['content/programme.json'] = bundle.programme
  }
  if (bundle.menu && (!onlyChanged || onlyChanged.has('menu'))) {
    files['content/menu.json'] = bundle.menu
  }
  return files
}

export function dayFromLabel(label) {
  if (typeof label === 'number') return label
  if (label == null) return null
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

export function namesMatch(a, b) {
  return normalizeName(a) === normalizeName(b)
}

export function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function findMenuItem(menu, itemName, sectionId) {
  if (!menu?.sections) return null
  const sections = sectionId
    ? menu.sections.filter(
        (section) =>
          section.id === sectionId || namesMatch(section.name, sectionId),
      )
    : menu.sections
  for (const section of sections) {
    const item = section.items?.find((row) => namesMatch(row.name, itemName))
    if (item) return { section, item }
  }
  return null
}

export function syncBoardFromLineup(programme) {
  if (!Array.isArray(programme?.lineup)) return
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
