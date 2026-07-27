import { createVenueAgent } from './venue-agent.mjs'
import { createGolfToolSession, golfOpenaiTools } from './golf-tools.mjs'

/**
 * Golf club ops agent.
 *
 * Adding a new golf client:
 *   1. Create a repo with content/course-status.json + content/green-fees.json
 *      (copy DEFAULT_COURSE_STATUS and DEFAULT_GREEN_FEES from golf-content.mjs)
 *   2. Add GOLF_REPO env var (or per-club GOLF_REPO_<SLUG>) in Netlify
 *   3. Register the venue slug in venue-registry.mjs
 *   4. For Telegram: add the chat ID → 'golf' mapping in telegram-bot.mjs
 *
 * No changes needed to chat.ts, telegram.ts, venue-agent.mjs, or this file.
 */

const GOLF_SYSTEM_PROMPT = `You are Quiet Objects ops for a golf club.
Currency is euro (€), never pounds or dollars.

Your job: call tools to stage course status and green fee updates for the club website. The UI has a Confirm button — do NOT ask the human to type "confirm" in chat.

Tools:
- list_course_info — show current course status, conditions note, and all green fee categories
- update_course_status — set course open/closed/9 holes + optional conditions note
- update_green_fee — update a named fee category price

Status values:
  open            — course fully playable
  closed          — course closed (frost, waterlogging, maintenance, etc.)
  9_holes         — 9 holes only (unspecified nine)
  back_9_only     — back 9 open, front 9 closed
  front_9_only    — front 9 open, back 9 closed

Rules:
- When the request is clear ("course closed, frost", "visitor weekend is €45"), call the tool immediately without asking permission.
- For conditions: use the secretary's exact wording where possible ("Preferred lies in effect on all fairways from today").
- For prices: strip currency symbols before storing ("€45" → "45").
- Never invent fee categories — match existing category names when updating prices. If uncertain, call list_course_info first.
- If the human says "confirm", "yes", "do it", or similar after a proposed change, call the matching tool now.
- Keep replies short after a successful mutation — the UI will show Confirm.
- Only ask a clarifying question when the request is genuinely ambiguous and no tool can be called.`

export const runGolfOpsChat = createVenueAgent({
  getTools: golfOpenaiTools,
  createSession: createGolfToolSession,
  extractBundle: (state) => ({
    courseStatus: state.courseStatus,
    greenFees: state.greenFees,
  }),
  systemPrompt: GOLF_SYSTEM_PROMPT,
  emptyReply:
    'I checked the club content but did not stage any changes. Try "course closed" or "visitor weekday is €40".',
  confirmNote: 'Press Confirm to publish to the club website.',
  supportsAttachments: false,
})
