import OpenAI from 'openai'
import { applyPatches, DAY_LABELS } from './content.mjs'

/**
 * Turn a natural-language ops message into patches, then apply them.
 * Uses Netlify AI Gateway (OpenAI SDK) when available; falls back to
 * a small deterministic parser for common price / lineup phrases.
 */
export async function proposeFromMessage({ message, bundle }) {
  const trimmed = String(message || '').trim()
  if (!trimmed) {
    throw Object.assign(new Error('Message is empty'), { status: 400 })
  }

  let patches
  let source = 'deterministic'
  let assistantText = ''

  try {
    const ai = await proposeWithAi({ message: trimmed, bundle })
    patches = ai.patches
    assistantText = ai.assistantText
    source = 'ai'
  } catch (error) {
    const fallback = proposeDeterministic(trimmed, bundle)
    if (!fallback.patches.length) {
      const err = new Error(
        `Could not understand that update (${error.message}). Try: “Steak Burger is 17.50” or “Saturday is Seán Óg at 22:00”.`,
      )
      err.status = 422
      throw err
    }
    patches = fallback.patches
    assistantText = fallback.assistantText
    source = 'deterministic'
  }

  if (!patches.length) {
    const err = new Error('No content changes detected in that message')
    err.status = 422
    throw err
  }

  const { bundle: nextBundle, descriptions } = applyPatches(bundle, patches)
  return {
    patches,
    descriptions,
    bundle: nextBundle,
    source,
    assistantText:
      assistantText ||
      `Ready to publish:\n${descriptions.map((line) => `• ${line}`).join('\n')}`,
  }
}

async function proposeWithAi({ message, bundle }) {
  const openai = new OpenAI()
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.1,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You are Quiet Objects ops for Rosato's (Moville).
Convert the manager's chat into JSON patches for programme.json and menu.json only.
Never touch venue.json, booking, gift cards, colours, or layout.

Return JSON:
{
  "assistantText": "short confirmation in plain English",
  "patches": [ ... ]
}

Patch targets:
- {"target":"menu.price","sectionId":"optional","itemName":"...","price":"16.95"}
- {"target":"menu.item","action":"add"|"update"|"remove","sectionId":"optional","item":{"name":"...","description":"...","price":"..."}}
- {"target":"programme.lineup","action":"upsert"|"remove","entry":{"day":0-6,"dayLabel":"Saturday","name":"...","time":"22:00","kind":"music"|"quiz"|"poker"|"other","cue":"optional","detail":"optional"}}
- {"target":"programme.tonightOverride","value":"..."} 
- {"target":"programme.note","value":"..."}

Days: 0=Sunday … 6=Saturday.
If the request is unclear or would change venue chrome, return {"assistantText":"...","patches":[]}.
Only include patches you are confident about.`,
      },
      {
        role: 'user',
        content: JSON.stringify({
          message,
          programme: bundle.programme,
          menu: summarizeMenu(bundle.menu),
          dayLabels: DAY_LABELS,
        }),
      },
    ],
  })

  const raw = completion.choices[0]?.message?.content || '{}'
  const parsed = JSON.parse(raw)
  return {
    patches: Array.isArray(parsed.patches) ? parsed.patches : [],
    assistantText: parsed.assistantText || '',
  }
}

function summarizeMenu(menu) {
  if (!menu?.sections) return menu
  return {
    eyebrow: menu.eyebrow,
    title: menu.title,
    sections: menu.sections.map((section) => ({
      id: section.id,
      name: section.name,
      items: (section.items || []).map((item) => ({
        name: item.name,
        price: item.price,
        description: item.description,
      })),
    })),
  }
}

/**
 * Lightweight offline parser for the pilot's most common phrases.
 */
export function proposeDeterministic(message, bundle) {
  const text = message.trim()
  const patches = []
  const notes = []

  const priceMatch = text.match(
    /(.+?)\s+(?:is|to|at|=)\s*€?\s*(\d+(?:[.,]\d{1,2})?)\s*$/i,
  )
  if (priceMatch) {
    const itemName = cleanItemName(priceMatch[1])
    const price = priceMatch[2].replace(',', '.')
    if (itemName && bundle.menu) {
      patches.push({ target: 'menu.price', itemName, price })
      notes.push(`Update ${itemName} to €${price}`)
    }
  }

  const lineupMatch = text.match(
    /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|wed|thu|fri|sat)\b(?:'s)?\s+(?:is|band is|act is)?\s*(.+?)\s+at\s+(\d{1,2}[:.]\d{2}|\d{1,2}\s*(?:am|pm)?)/i,
  )
  if (lineupMatch) {
    const dayLabel = capitalize(lineupMatch[1])
    const name = lineupMatch[2].replace(/^(is|band is|act is)\s+/i, '').trim()
    const time = normalizeTime(lineupMatch[3])
    const kind = inferKind(name, text)
    patches.push({
      target: 'programme.lineup',
      action: 'upsert',
      entry: { dayLabel, name, time, kind },
    })
    notes.push(`${dayLabel}: ${name} · ${time}`)
  }

  const tonightMatch = text.match(
    /tonight(?:\s+override)?(?:\s+is|\s*[:=])\s+(.+)$/i,
  )
  if (tonightMatch) {
    const value = tonightMatch[1].trim()
    patches.push({
      target: 'programme.tonightOverride',
      value: /^clear|none|reset$/i.test(value) ? '' : value,
    })
    notes.push(
      /^clear|none|reset$/i.test(value)
        ? 'Clear tonight override'
        : `Tonight override: ${value}`,
    )
  }

  return {
    patches,
    assistantText: notes.length
      ? `I can update:\n${notes.map((n) => `• ${n}`).join('\n')}\nConfirm to publish into Rosato’s content JSON.`
      : '',
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
  const ampm = cleaned.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/)
  if (ampm) {
    let hour = Number(ampm[1])
    const minute = ampm[2] || '00'
    const meridiem = ampm[3]
    if (meridiem === 'pm' && hour < 12) hour += 12
    if (meridiem === 'am' && hour === 12) hour = 0
    return `${String(hour).padStart(2, '0')}:${minute}`
  }
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

function capitalize(value) {
  const map = {
    sun: 'Sunday',
    sunday: 'Sunday',
    mon: 'Monday',
    monday: 'Monday',
    tue: 'Tuesday',
    tuesday: 'Tuesday',
    wed: 'Wednesday',
    wednesday: 'Wednesday',
    thu: 'Thursday',
    thursday: 'Thursday',
    fri: 'Friday',
    friday: 'Friday',
    sat: 'Saturday',
    saturday: 'Saturday',
  }
  return map[String(value).toLowerCase()] || value
}
