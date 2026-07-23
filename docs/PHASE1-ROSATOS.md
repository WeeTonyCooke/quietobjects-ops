# Phase 1 — Rosato’s ops pilot

Quiet Objects ops console for day-to-day Rosato’s content updates via chat.

## Goal

Managers keep the week honest without opening Decap. They talk in plain language; ops stages a structured change against the shared Hybrid + Light content model; nothing is written until they confirm.

## In scope

- Web admin chat on `quietobjects-ops`
- Netlify Functions:
  - `POST /api/chat` — parse message → signed proposal (no write)
  - `POST /api/publish` — verify signature → commit JSON
  - `GET /api/content` — read current programme + menu
- Target repo: `WeeTonyCooke/rosatos`
- Editable files only:
  - `content/programme.json`
  - `content/menu.json`

## Out of scope (Phase 1)

- Telegram / WhatsApp (later TemplateBot path)
- PDF / image menu extraction
- Edits to `venue.json`, booking, gift cards, colours, layout
- Silent auto-publish

## Confirm-then-publish

1. Chat message is parsed (AI Gateway when available, deterministic fallback otherwise)
2. Patches apply in memory; a signed proposal returns to the browser
3. UI shows the staged summary with **Confirm & publish** / **Discard**
4. Confirm verifies HMAC + expiry, then commits via GitHub Git Data API

## Auth

Production: Netlify Identity (`@netlify/identity`), invite-only.

Local scaffolding may set `OPS_AUTH_BYPASS=1` and `VITE_OPS_AUTH_BYPASS=1` — never in production.

## Example phrases

- `Steak Burger is 17.50`
- `Saturday is Seán Óg at 22:00`
- `Tonight override is Quiz night · 22:00`
- `Tonight override is clear`
