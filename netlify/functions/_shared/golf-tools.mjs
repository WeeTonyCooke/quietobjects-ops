import { findFee } from './golf-content.mjs'

/**
 * Provider-agnostic ops tool definitions for golf clubs.
 * Same pattern as tools.mjs (Rosato's) and festival-tools.mjs.
 *
 * V1 scope: course status + green fees only.
 * Announcements, competition draws, and tee-time links are out of scope.
 */
export const GOLF_TOOLS = [
  {
    name: 'list_course_info',
    description:
      'List the current course status, conditions note, and all green fee categories.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'update_course_status',
    description:
      'Set the course open/closed status and optional conditions note. Clears the note if omitted.',
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['open', 'closed', '9_holes', 'back_9_only', 'front_9_only'],
          description:
            'open — course fully open; closed — course closed; 9_holes — 9 holes only; back_9_only — back 9 only; front_9_only — front 9 only',
        },
        notes: {
          type: 'string',
          description:
            'Conditions note displayed on the website, e.g. "Preferred lies in effect on all fairways". Pass empty string to clear.',
        },
      },
      required: ['status'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_green_fee',
    description:
      'Update the price for a named green fee category. Category must match an existing entry.',
    parameters: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description:
            'Fee category name, e.g. "Visitor weekday", "Society", "Twilight"',
        },
        price: {
          type: 'string',
          description: 'New price as a number string, e.g. "45" or "€45"',
        },
        notes: {
          type: 'string',
          description: 'Optional note for this category (omit to leave unchanged)',
        },
      },
      required: ['category', 'price'],
      additionalProperties: false,
    },
  },
]

/** OpenAI chat-completions tools payload */
export function golfOpenaiTools() {
  return GOLF_TOOLS.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }))
}

/**
 * Mutable session that golf ops tools operate on.
 * State holds courseStatus and greenFees, mutated in-memory until /api/publish.
 */
export function createGolfToolSession(bundle) {
  const state = {
    courseStatus: structuredClone(bundle.courseStatus),
    greenFees: structuredClone(bundle.greenFees),
    changed: new Set(),
    descriptions: [],
    toolTrace: [],
  }

  return {
    state,
    async run(name, input = {}) {
      const result = await dispatchTool(state, name, input)
      state.toolTrace.push({ name, input, result })
      return result
    },
  }
}

function dispatchTool(state, name, input) {
  switch (name) {
    case 'list_course_info':
      return listCourseInfo(state)
    case 'update_course_status':
      return updateCourseStatus(state, input)
    case 'update_green_fee':
      return updateGreenFee(state, input)
    default:
      return { ok: false, error: `Unknown tool: ${name}` }
  }
}

function listCourseInfo(state) {
  return {
    ok: true,
    courseStatus: state.courseStatus
      ? {
          status: state.courseStatus.status,
          notes: state.courseStatus.notes || '',
          updatedAt: state.courseStatus.updatedAt || '',
        }
      : null,
    fees: state.greenFees?.fees ?? [],
  }
}

function updateCourseStatus(state, input) {
  if (!state.courseStatus) {
    return { ok: false, error: 'Course status content missing' }
  }

  const status = String(input.status || '').trim()
  const validStatuses = [
    'open',
    'closed',
    '9_holes',
    'back_9_only',
    'front_9_only',
  ]
  if (!validStatuses.includes(status)) {
    return {
      ok: false,
      error: `Invalid status "${status}". Use: ${validStatuses.join(', ')}`,
    }
  }

  const notes =
    input.notes !== undefined ? String(input.notes).trim() : state.courseStatus.notes || ''

  const before = state.courseStatus.status
  state.courseStatus.status = status
  state.courseStatus.notes = notes
  state.courseStatus.updatedAt = new Date().toISOString()

  state.changed.add('courseStatus')

  const statusLabel = {
    open: 'Open',
    closed: 'Closed',
    '9_holes': '9 holes only',
    back_9_only: 'Back 9 only',
    front_9_only: 'Front 9 only',
  }[status]

  const description = notes
    ? `Course status → ${statusLabel} · ${notes}`
    : `Course status → ${statusLabel}`

  state.descriptions.push(description)
  return { ok: true, description, before, after: status, notes }
}

function updateGreenFee(state, input) {
  if (!state.greenFees) {
    return { ok: false, error: 'Green fees content missing' }
  }

  const category = String(input.category || '').trim()
  const rawPrice = String(input.price || '').trim()
  const price = rawPrice.replace(/^€/, '').trim()

  if (!category || !price) {
    return { ok: false, error: 'category and price are required' }
  }

  const fee = findFee(state.greenFees, category)
  if (!fee) {
    const available = (state.greenFees.fees || [])
      .map((f) => f.category)
      .join(', ')
    return {
      ok: false,
      error: `Fee category not found: "${category}". Available: ${available}`,
    }
  }

  const before = fee.price
  fee.price = price
  if (input.notes !== undefined) {
    fee.notes = String(input.notes).trim()
  }

  state.changed.add('greenFees')

  const description = `Green fee · ${fee.category}: €${before || '—'} → €${price}`
  state.descriptions.push(description)
  return {
    ok: true,
    description,
    category: fee.category,
    before,
    after: price,
  }
}
