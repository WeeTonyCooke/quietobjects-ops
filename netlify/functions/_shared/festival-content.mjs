/**
 * Moville Festival content model helpers — programme only.
 * Mirrors the shape of content.mjs for Rosato's.
 *
 * JSON lives at src/content/programme.json in the festival repo so Vite
 * bundles it at build time — every publish triggers a Netlify rebuild.
 *
 * Schema matches ProgrammeEvent in ProgrammePage.tsx:
 *   { time, title, venue?, strapline?, headline?, admission?,
 *     registerUrl?, registerLabel? }
 *
 * Days array shape:
 *   { key, label, name, dateLabel, festivalDate, events[] }
 */

export const EDITABLE_FILES = Object.freeze(['src/content/programme.json'])

/** Day key → full day name mapping for fuzzy lookups */
const KEY_TO_NAME = {
  TUE: 'tuesday',
  WED: 'wednesday',
  THU: 'thursday',
  FRI: 'friday',
  SAT: 'saturday',
  SUN: 'sunday',
}

/** Full/short name → key mapping */
const NAME_TO_KEY = Object.fromEntries([
  ...Object.entries(KEY_TO_NAME).map(([k, v]) => [v, k]),
  // short forms
  ['tue', 'TUE'], ['wed', 'WED'], ['thu', 'THU'],
  ['fri', 'FRI'], ['sat', 'SAT'], ['sun', 'SUN'],
])

export function bundleFromFiles(files) {
  return { programme: files['src/content/programme.json'] ?? null }
}

export function filesFromBundle(bundle, { onlyChanged = null } = {}) {
  const files = {}
  if (bundle.programme && (!onlyChanged || onlyChanged.has('programme'))) {
    files['src/content/programme.json'] = bundle.programme
  }
  return files
}

/**
 * Return the day object from the programme array, or null.
 * Accepts the key (TUE), full name (Tuesday), or 3-char prefix (tue).
 */
export function findDay(programme, dayLabel) {
  if (!Array.isArray(programme?.days)) return null
  const cleaned = String(dayLabel || '').trim().toLowerCase()

  // Resolve to a canonical key first
  const key =
    NAME_TO_KEY[cleaned] ||
    NAME_TO_KEY[cleaned.slice(0, 3)] ||
    cleaned.toUpperCase()

  return (
    programme.days.find(
      (d) =>
        d.key === key ||
        String(d.key || '').toLowerCase() === cleaned ||
        String(d.name || '').toLowerCase() === cleaned ||
        String(d.name || '').toLowerCase().startsWith(cleaned.slice(0, 3)),
    ) || null
  )
}

/**
 * Find an event within a day by title (normalised fuzzy match).
 * Uses `title` (the field name in ProgrammePage.tsx / programme.json).
 */
export function findEvent(day, title) {
  if (!Array.isArray(day?.events)) return null
  const norm = normalizeName(title)
  return day.events.find((ev) => normalizeName(ev.title) === norm) || null
}

export function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Derive a stable slug from an event title. */
export function slugify(title) {
  return normalizeName(title).replace(/\s+/g, '-').slice(0, 64)
}
