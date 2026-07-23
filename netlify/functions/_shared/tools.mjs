import {
  DAY_LABELS,
  dayFromLabel,
  findMenuItem,
  namesMatch,
  syncBoardFromLineup,
} from './content.mjs'

/**
 * Claude tool definitions for Rosato's Phase 1 ops.
 */
export const CLAUDE_TOOLS = [
  {
    name: 'list_programme',
    description:
      'List the current weekly programme lineup and tonight override for Rosato’s.',
    input_schema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'update_programme_event',
    description:
      'Create or update a weekly programme event (music, quiz, poker, etc.) for a given day. Use action=remove to delete it.',
    input_schema: {
      type: 'object',
      properties: {
        day: {
          type: 'integer',
          minimum: 0,
          maximum: 6,
          description: '0=Sunday … 6=Saturday',
        },
        dayLabel: {
          type: 'string',
          description: 'Optional day name (Saturday, Fri, etc.) if day is omitted',
        },
        name: { type: 'string', description: 'Artist or event name' },
        time: { type: 'string', description: 'Local time, e.g. 22:00' },
        kind: {
          type: 'string',
          enum: ['music', 'quiz', 'poker', 'other'],
          description: 'Event kind',
        },
        cue: { type: 'string', description: 'Short header cue (optional)' },
        detail: { type: 'string', description: 'Longer board line (optional)' },
        action: {
          type: 'string',
          enum: ['upsert', 'remove'],
          description: 'Default upsert',
        },
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_menu_price',
    description: 'Update the price of an existing menu item by name.',
    input_schema: {
      type: 'object',
      properties: {
        itemName: { type: 'string' },
        price: { type: 'string', description: 'New price, e.g. 17.50' },
        sectionId: {
          type: 'string',
          description: 'Optional section id or name to disambiguate',
        },
      },
      required: ['itemName', 'price'],
      additionalProperties: false,
    },
  },
  {
    name: 'set_tonight_override',
    description:
      'Set or clear the tonight override cue. Pass an empty string to clear.',
    input_schema: {
      type: 'object',
      properties: {
        value: {
          type: 'string',
          description: 'Tonight cue text, or empty to clear',
        },
      },
      required: ['value'],
      additionalProperties: false,
    },
  },
]

/**
 * Mutable session that Claude tools operate on.
 */
export function createToolSession(bundle) {
  const state = {
    programme: structuredClone(bundle.programme),
    menu: structuredClone(bundle.menu),
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
    case 'update_programme_event':
      return updateProgrammeEvent(state, input)
    case 'update_menu_price':
      return updateMenuPrice(state, input)
    case 'set_tonight_override':
      return setTonightOverride(state, input)
    default:
      return { ok: false, error: `Unknown tool: ${name}` }
  }
}

function listProgramme(state) {
  if (!state.programme) {
    return { ok: false, error: 'Programme content missing' }
  }
  return {
    ok: true,
    tonightOverride: state.programme.tonightOverride || '',
    note: state.programme.note || '',
    lineup: state.programme.lineup || [],
  }
}

function updateProgrammeEvent(state, input) {
  if (!state.programme) {
    return { ok: false, error: 'Programme content missing' }
  }
  if (!Array.isArray(state.programme.lineup)) state.programme.lineup = []

  const day =
    typeof input.day === 'number' ? input.day : dayFromLabel(input.dayLabel)
  if (day == null || day < 0 || day > 6) {
    return { ok: false, error: 'Provide day (0–6) or dayLabel' }
  }

  const name = String(input.name || '').trim()
  if (!name) return { ok: false, error: 'name is required' }

  const action = input.action || 'upsert'
  const dayLabel = input.dayLabel || DAY_LABELS[day]

  if (action === 'remove') {
    const before = state.programme.lineup.length
    state.programme.lineup = state.programme.lineup.filter(
      (row) => !(row.day === day && namesMatch(row.name, name)),
    )
    if (state.programme.lineup.length === before) {
      return { ok: false, error: `No lineup row for ${dayLabel} · ${name}` }
    }
    syncBoardFromLineup(state.programme)
    state.changed.add('programme')
    const description = `Programme · removed ${dayLabel} · ${name}`
    state.descriptions.push(description)
    return { ok: true, description }
  }

  const time = String(input.time || '').trim()
  const kind = input.kind || 'music'
  const cue = input.cue || (time ? `${name} · ${time}` : name)
  const detail = input.detail || cue
  const entry = { day, dayLabel, name, time, kind, cue, detail }

  const idx = state.programme.lineup.findIndex((row) => row.day === day)
  if (idx >= 0) {
    state.programme.lineup[idx] = { ...state.programme.lineup[idx], ...entry }
  } else {
    state.programme.lineup.push(entry)
    state.programme.lineup.sort((a, b) => a.day - b.day)
  }
  syncBoardFromLineup(state.programme)
  state.changed.add('programme')
  const description = `Programme · ${dayLabel}: ${name}${time ? ` · ${time}` : ''}`
  state.descriptions.push(description)
  return { ok: true, description, entry }
}

function updateMenuPrice(state, input) {
  if (!state.menu) return { ok: false, error: 'Menu content missing' }
  const itemName = String(input.itemName || '').trim()
  const price = String(input.price || '').trim()
  if (!itemName || !price) {
    return { ok: false, error: 'itemName and price are required' }
  }

  const hit = findMenuItem(state.menu, itemName, input.sectionId)
  if (!hit) return { ok: false, error: `Menu item not found: ${itemName}` }

  const before = hit.item.price
  hit.item.price = price.replace(/^€/, '')
  state.changed.add('menu')
  const description = `Menu · ${hit.item.name}: €${before || '—'} → €${hit.item.price}`
  state.descriptions.push(description)
  return {
    ok: true,
    description,
    itemName: hit.item.name,
    sectionId: hit.section.id,
    before,
    after: hit.item.price,
  }
}

function setTonightOverride(state, input) {
  if (!state.programme) {
    return { ok: false, error: 'Programme content missing' }
  }
  const raw = input.value == null ? '' : String(input.value)
  const value = /^(clear|none|reset)$/i.test(raw.trim()) ? '' : raw
  state.programme.tonightOverride = value
  state.changed.add('programme')
  const description = value
    ? `Tonight override → ${value}`
    : 'Tonight override cleared'
  state.descriptions.push(description)
  return { ok: true, description, value }
}
