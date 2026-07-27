/**
 * Rosato's ops agent — thin wrapper around the generic venue agent.
 *
 * Exports runOpsChat and resolveAiConfig with the same signatures as before.
 * All logic lives in venue-agent.mjs; only the Rosato's config lives here.
 */

import { createVenueAgent, resolveAiConfig } from './venue-agent.mjs'
import { createToolSession, openaiTools } from './tools.mjs'

export { resolveAiConfig }

const SYSTEM_PROMPT = `You are Quiet Objects ops for Rosato's (Moville, Ireland).
Currency is euro (€), never pounds.

Your job: call tools to stage programme/menu updates. The web UI has a Confirm button — you must NOT ask the human to type "confirm" in chat.

Tools:
- list_programme — inspect this week's lineup / tonight override
- update_programme_event — upsert or remove a day's event
- update_menu_price — change an existing item price
- set_tonight_override — set or clear tonight's cue (empty string clears)

Rules:
- When the request is clear (e.g. "Steak Burger is 17.50", "Saturday is Seán Óg at 22:00"), call the tool immediately. Do not ask permission first.
- If a PDF menu attachment is present, extract concrete item/price updates and call update_menu_price for each clear match to the live menu.
- If the human says "confirm", "yes", "do it", or similar after you already proposed a change in chat history, call the matching tool now.
- Never invent menu items. Match existing names when pricing.
- Never touch venue chrome, booking, gift cards, colours, or layout.
- After a successful tool mutation, keep the reply short — the UI will show Confirm.
- Only ask a clarifying question when the request is genuinely ambiguous and no tool can be called yet.`

export const runOpsChat = createVenueAgent({
  getTools: openaiTools,
  createSession: createToolSession,
  extractBundle: (state) => ({
    programme: state.programme,
    menu: state.menu,
  }),
  systemPrompt: SYSTEM_PROMPT,
  emptyReply:
    'I checked Rosato’s content but did not stage any changes. Try a price or lineup update.',
  confirmNote: 'Press Confirm to publish into Rosato’s content JSON.',
  supportsAttachments: true,
})
