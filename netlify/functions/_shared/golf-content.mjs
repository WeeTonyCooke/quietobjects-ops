/**
 * Golf club content model helpers.
 *
 * Two JSON files live in the club's repo:
 *   content/course-status.json  — current open/closed status + conditions
 *   content/green-fees.json     — fee categories with prices
 *
 * The website reads these at build time (Vite/Netlify static build),
 * so every publish triggers a site rebuild — same pattern as Rosato's.
 *
 * course-status.json shape:
 *   { status: "open"|"closed"|"9_holes"|"back_9_only"|"front_9_only",
 *     notes: string,
 *     updatedAt: ISO string }
 *
 * green-fees.json shape:
 *   { fees: [{ category: string, price: string, notes?: string }] }
 */

export const EDITABLE_FILES = Object.freeze([
  'content/course-status.json',
  'content/green-fees.json',
])

export function bundleFromFiles(files) {
  return {
    courseStatus: files['content/course-status.json'] ?? null,
    greenFees: files['content/green-fees.json'] ?? null,
  }
}

export function filesFromBundle(bundle, { onlyChanged = null } = {}) {
  const files = {}
  if (
    bundle.courseStatus &&
    (!onlyChanged || onlyChanged.has('courseStatus'))
  ) {
    files['content/course-status.json'] = bundle.courseStatus
  }
  if (bundle.greenFees && (!onlyChanged || onlyChanged.has('greenFees'))) {
    files['content/green-fees.json'] = bundle.greenFees
  }
  return files
}

/**
 * Find a fee entry by category name (case-insensitive, trimmed).
 */
export function findFee(greenFees, category) {
  if (!Array.isArray(greenFees?.fees)) return null
  const norm = String(category || '').trim().toLowerCase()
  return (
    greenFees.fees.find(
      (f) => String(f.category || '').trim().toLowerCase() === norm,
    ) || null
  )
}

/**
 * Starter content for a new golf club repo.
 * Copy these into content/ when onboarding a new client.
 */
export const DEFAULT_COURSE_STATUS = {
  status: 'open',
  notes: '',
  updatedAt: new Date().toISOString(),
}

export const DEFAULT_GREEN_FEES = {
  fees: [
    { category: 'Visitor weekday', price: '40', notes: '' },
    { category: 'Visitor weekend', price: '50', notes: '' },
    { category: 'Society', price: '35', notes: 'Min 20 players' },
    { category: 'Twilight', price: '25', notes: 'After 4pm' },
  ],
}
