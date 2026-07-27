/**
 * Moville Festival ops agent — thin wrapper around the generic venue agent.
 *
 * Exports runFestivalOpsChat and resolveFestivalAiConfig with the same
 * signatures as before. All logic lives in venue-agent.mjs.
 */

import { createVenueAgent, resolveAiConfig } from './venue-agent.mjs'
import {
  createFestivalToolSession,
  festivalOpenaiTools,
} from './festival-tools.mjs'

/** @deprecated Use resolveAiConfig from venue-agent.mjs directly */
export function resolveFestivalAiConfig() {
  return resolveAiConfig()
}

const FESTIVAL_SYSTEM_PROMPT = `You are Quiet Objects ops for Moville Summer Festival (Moville, Co. Donegal, Ireland).

Your job: call tools to stage programme changes for the festival website. The UI has a Confirm button — you must NOT ask the human to type "confirm" in chat.

Tools:
- list_programme — show all festival days and events
- update_event — add, update, or remove a festival event on a specific day (action: upsert or remove)

Rules:
- Days are: Wednesday, Thursday, Friday, Saturday, Sunday (or whatever days are in the programme).
- When the request is clear (e.g. "Bed Push is Thursday 7pm at Quay Street"), call update_event immediately.
- If the human says "confirm", "yes", "do it", or similar after a proposed change, call the matching tool now.
- Never invent events. Only mutate events the manager explicitly describes.
- Keep the reply short after a successful mutation — the UI will show Confirm.
- Only ask a clarifying question when the request is genuinely ambiguous and no tool can be called yet.`

export const runFestivalOpsChat = createVenueAgent({
  getTools: festivalOpenaiTools,
  createSession: createFestivalToolSession,
  extractBundle: (state) => ({
    programme: state.programme,
  }),
  systemPrompt: FESTIVAL_SYSTEM_PROMPT,
  emptyReply:
    'I checked the festival programme but did not stage any changes. Try "add Wednesday 7pm Fancy Dress Parade at Festival Square" or "list programme".',
  confirmNote: 'Press Confirm to publish into the festival programme.',
  supportsAttachments: false,
})
