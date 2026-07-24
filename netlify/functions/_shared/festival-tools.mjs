import {
  findDay,
  findEvent,
  slugify,
} from './festival-content.mjs'

/**
 * Provider-agnostic ops tool definitions for Moville Festival.
 * Fields match the ProgrammeEvent type in ProgrammePage.tsx exactly.
 */
export const FESTIVAL_TOOLS = [
  {
    name: 'list_programme',
    description:
      'List all days and events in the Moville Festival programme.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'update_event',
    description:
      'Create, update, or remove a festival event on a specific day. Use action=remove to delete. Day can be a key (WED), full name (Wednesday) or short form (wed).',
    parameters: {
      type: 'object',
      properties: {
        day: {
          type: 'string',
          description: 'Day key or name: TUE/WED/THU/FRI/SAT/SUN or Tuesday/Wednesday etc.',
        },
        title: {
          type: 'string',
          description: 'Event title, e.g. "Fancy Dress Opening Parade"',
        },
        time: {
          type: 'string',
          description: 'Local start time in HH:MM format, e.g. 19:00',
        },
        venue: {
          type: 'string',
          description: 'Venue name, e.g. Festival Square, Quay Street',
        },
        strapline: {
          type: 'string',
          description: 'One or two sentence description shown on the programme (optional)',
        },
        admission: {
          type: 'string',
          description: 'Admission price if charged, e.g. €10 (optional — omit for free events)',
        },
        headline: {
          type: 'boolean',
          description: 'Mark as a headliner event — shows a badge and bold styling (optional)',
        },
        registerUrl: {
          type: 'string',
          description: 'Internal path for a register/book CTA, e.g. /bed-push (optional)',
        },
        registerLabel: {
          type: 'string',
          description: 'Label for the register link, e.g. "Register your team" (optional)',
        },
        action: {
          type: 'string',
          enum: ['upsert', 'remove'],
          description: 'upsert (default) to add or update; remove to delete',
        },
      },
      required: ['day', 'title'],
      additionalProperties: false,
    },
  },
]

/** OpenAI chat-completions tools payload */
export function festivalOpenaiTools() {
  return FESTIVAL_TOOLS.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }))
}

/**
 * Mutable session that festival ops tools operate on.
 */
export function createFestivalToolSession(bundle) {
  const state = {
    programme: structuredClone(bundle.programme),
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
    case 'list_programme':
      return listProgramme(state)
    case 'update_event':
      return updateEvent(state, input)
    default:
      return { ok: false, error: `Unknown tool: ${name}` }
  }
}

function listProgramme(state) {
  if (!state.programme) return { ok: false, error: 'Programme content missing' }
  return {
    ok: true,
    year: state.programme.year,
    days: (state.programme.days || []).map((d) => ({
      key: d.key,
      name: d.name,
      label: d.label,
      events: (d.events || []).map((ev) => ({
        title: ev.title,
        time: ev.time || '',
        venue: ev.venue || '',
        strapline: ev.strapline || '',
        admission: ev.admission || '',
        headline: ev.headline || false,
      })),
    })),
  }
}

function updateEvent(state, input) {
  if (!state.programme) return { ok: false, error: 'Programme content missing' }
  if (!Array.isArray(state.programme.days)) state.programme.days = []

  const dayLabel = String(input.day || '').trim()
  if (!dayLabel) return { ok: false, error: 'day is required' }

  const title = String(input.title || '').trim()
  if (!title) return { ok: false, error: 'title is required' }

  const action = input.action || 'upsert'

  let day = findDay(state.programme, dayLabel)

  if (action === 'remove') {
    if (!day) return { ok: false, error: `Day not found: ${dayLabel}` }
    const before = (day.events || []).length
    const normTitle = title.toLowerCase().normalize('NFD').replace(/[^a-z0-9 ]/g, '').trim()
    day.events = (day.events || []).filter((ev) => {
      const evNorm = String(ev.title || '').toLowerCase().normalize('NFD').replace(/[^a-z0-9 ]/g, '').trim()
      return evNorm !== normTitle
    })
    if (day.events.length === before) {
      return { ok: false, error: `Event not found on ${day.name}: ${title}` }
    }
    state.changed.add('programme')
    const description = `Programme · removed "${title}" from ${day.name}`
    state.descriptions.push(description)
    return { ok: true, description }
  }

  // upsert — auto-create day if missing
  if (!day) {
    const upperKey = dayLabel.toUpperCase().slice(0, 3)
    const capitalized = dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1).toLowerCase()
    day = {
      key: upperKey,
      label: capitalized,
      name: capitalized,
      dateLabel: '',
      festivalDate: {},
      events: [],
    }
    state.programme.days.push(day)
  }

  if (!Array.isArray(day.events)) day.events = []

  const existing = findEvent(day, title)

  // Build the updated event — only overwrite fields explicitly provided
  const entry = {
    time: String(input.time ?? existing?.time ?? '').trim(),
    title,
    ...(input.venue !== undefined
      ? { venue: String(input.venue).trim() }
      : existing?.venue !== undefined
        ? { venue: existing.venue }
        : {}),
    ...(input.strapline !== undefined
      ? { strapline: String(input.strapline).trim() }
      : existing?.strapline !== undefined
        ? { strapline: existing.strapline }
        : {}),
    ...(input.admission !== undefined
      ? { admission: String(input.admission).trim() }
      : existing?.admission !== undefined
        ? { admission: existing.admission }
        : {}),
    ...(input.headline !== undefined
      ? { headline: Boolean(input.headline) }
      : existing?.headline !== undefined
        ? { headline: existing.headline }
        : {}),
    ...(input.registerUrl !== undefined
      ? { registerUrl: String(input.registerUrl).trim() }
      : existing?.registerUrl !== undefined
        ? { registerUrl: existing.registerUrl }
        : {}),
    ...(input.registerLabel !== undefined
      ? { registerLabel: String(input.registerLabel).trim() }
      : existing?.registerLabel !== undefined
        ? { registerLabel: existing.registerLabel }
        : {}),
  }

  // Remove falsy optional fields so the JSON stays clean
  for (const k of ['venue', 'strapline', 'admission', 'registerUrl', 'registerLabel']) {
    if (!entry[k]) delete entry[k]
  }
  if (!entry.headline) delete entry.headline

  if (existing) {
    Object.assign(existing, entry)
  } else {
    day.events.push(entry)
    // Sort by time within the day
    day.events.sort((a, b) => (a.time || '').localeCompare(b.time || ''))
  }

  state.changed.add('programme')
  const timeStr = entry.time ? ` at ${entry.time}` : ''
  const venueStr = entry.venue ? ` · ${entry.venue}` : ''
  const description = `Programme · ${day.name}: "${title}"${timeStr}${venueStr}`
  state.descriptions.push(description)
  return { ok: true, description, entry }
}
