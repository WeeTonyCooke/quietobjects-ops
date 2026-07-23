import {
  EVENT_KINDS,
  findDay,
  findEvent,
  slugify,
} from './festival-content.mjs'

/**
 * Provider-agnostic ops tool definitions for Moville Festival Phase 2.
 * Canonical shape uses JSON Schema in `parameters` (OpenAI tools format).
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
      'Create, update, or remove a festival event on a specific day. Use action=remove to delete.',
    parameters: {
      type: 'object',
      properties: {
        day: {
          type: 'string',
          description: 'Day label, e.g. Wednesday, Thursday, Friday, Saturday, Sunday',
        },
        name: { type: 'string', description: 'Event name' },
        time: { type: 'string', description: 'Local time, e.g. 19:00' },
        venue: { type: 'string', description: 'Venue name, e.g. Festival Square, Quay Street' },
        kind: {
          type: 'string',
          enum: EVENT_KINDS,
          description: 'Event kind',
        },
        detail: { type: 'string', description: 'One-line detail shown on the programme (optional)' },
        action: {
          type: 'string',
          enum: ['upsert', 'remove'],
          description: 'Default upsert',
        },
      },
      required: ['day', 'name'],
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
    note: state.programme.note || '',
    days: (state.programme.days || []).map((d) => ({
      label: d.label,
      date: d.date || null,
      events: (d.events || []).map((ev) => ({
        name: ev.name,
        time: ev.time || '',
        venue: ev.venue || '',
        kind: ev.kind || 'other',
        detail: ev.detail || '',
      })),
    })),
  }
}

function updateEvent(state, input) {
  if (!state.programme) return { ok: false, error: 'Programme content missing' }
  if (!Array.isArray(state.programme.days)) state.programme.days = []

  const dayLabel = String(input.day || '').trim()
  if (!dayLabel) return { ok: false, error: 'day is required' }

  const name = String(input.name || '').trim()
  if (!name) return { ok: false, error: 'name is required' }

  const action = input.action || 'upsert'

  let day = findDay(state.programme, dayLabel)

  if (action === 'remove') {
    if (!day) return { ok: false, error: `Day not found: ${dayLabel}` }
    const before = (day.events || []).length
    day.events = (day.events || []).filter((ev) => {
      const existingNorm = ev.name.toLowerCase().normalize('NFD').replace(/[^a-z0-9 ]/g, '').trim()
      const inputNorm = name.toLowerCase().normalize('NFD').replace(/[^a-z0-9 ]/g, '').trim()
      return existingNorm !== inputNorm
    })
    if (day.events.length === before) {
      return { ok: false, error: `Event not found on ${day.label}: ${name}` }
    }
    state.changed.add('programme')
    const description = `Programme · removed ${name} from ${day.label}`
    state.descriptions.push(description)
    return { ok: true, description }
  }

  // upsert
  if (!day) {
    // Auto-create the day if it doesn't exist
    const normalised = dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1).toLowerCase()
    day = { id: dayLabel.toLowerCase(), label: normalised, events: [] }
    state.programme.days.push(day)
  }

  if (!Array.isArray(day.events)) day.events = []

  const existing = findEvent(day, name)

  const entry = {
    id: slugify(name),
    name,
    time: String(input.time || existing?.time || '').trim(),
    venue: String(input.venue || existing?.venue || '').trim(),
    kind: input.kind || existing?.kind || 'other',
    detail: String(input.detail || existing?.detail || '').trim(),
  }

  if (existing) {
    Object.assign(existing, entry)
  } else {
    day.events.push(entry)
    // Sort events by time within the day
    day.events.sort((a, b) => (a.time || '').localeCompare(b.time || ''))
  }

  state.changed.add('programme')
  const timeStr = entry.time ? ` · ${entry.time}` : ''
  const venueStr = entry.venue ? ` at ${entry.venue}` : ''
  const description = `Programme · ${day.label}: ${name}${timeStr}${venueStr}`
  state.descriptions.push(description)
  return { ok: true, description, entry }
}
