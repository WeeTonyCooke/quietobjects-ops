/**
 * Moville Festival content model helpers — programme only.
 * Mirrors the shape of content.mjs for Rosato's.
 */

export const EDITABLE_FILES = Object.freeze(['content/programme.json'])

export const EVENT_KINDS = Object.freeze([
  'parade',
  'race',
  'music',
  'sport',
  'family',
  'other',
])

export function bundleFromFiles(files) {
  return { programme: files['content/programme.json'] ?? null }
}

export function filesFromBundle(bundle, { onlyChanged = null } = {}) {
  const files = {}
  if (bundle.programme && (!onlyChanged || onlyChanged.has('programme'))) {
    files['content/programme.json'] = bundle.programme
  }
  return files
}

/** Return the day object (by label or id) from the programme, or null. */
export function findDay(programme, dayLabel) {
  if (!Array.isArray(programme?.days)) return null
  const cleaned = String(dayLabel || '').trim().toLowerCase()
  return (
    programme.days.find(
      (d) =>
        d.id === cleaned ||
        String(d.label || '').toLowerCase() === cleaned ||
        String(d.label || '').toLowerCase().startsWith(cleaned.slice(0, 3)),
    ) || null
  )
}

/** Find an event within a day by name (normalised fuzzy match). */
export function findEvent(day, name) {
  if (!Array.isArray(day?.events)) return null
  const norm = normalizeName(name)
  return day.events.find((ev) => normalizeName(ev.name) === norm) || null
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

/** Derive a stable slug id from an event name. */
export function slugify(name) {
  return normalizeName(name).replace(/\s+/g, '-').slice(0, 64)
}
