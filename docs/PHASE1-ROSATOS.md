# Phase 1 — Rosato’s ops pilot

Admin chat + Netlify Functions for day-to-day Rosato’s content updates.

## Ops tools

| Tool | Purpose |
|---|---|
| `list_programme` | Read weekly lineup + tonight override |
| `update_programme_event` | Upsert/remove a day’s event |
| `update_menu_price` | Change an existing menu item price |
| `set_tonight_override` | Set or clear tonight’s cue |

Mutations apply in memory only. The UI shows a **Confirm** button before publish.

## Attachments

PDF menu uploads via `POST /api/attach` (stored in Netlify Blobs). Extracted text feeds the chat tool loop so price/item updates can be staged, then confirmed.

## Model policy

Provider-agnostic tooling with a **cheap default** (`gpt-4o-mini` on Netlify AI Gateway). Override with `OPS_AI_MODEL` / `OPS_AI_PROVIDER`. Do not hard-wire the product to Claude or any single vendor.

## Endpoints

| Method | Path | Role |
|---|---|---|
| `POST` | `/api/chat` | AI/deterministic tool loop → signed proposal |
| `POST` | `/api/attach` | Upload PDF menu attachment |
| `POST` | `/api/publish` | Verify proposal → GitHub Contents API writes |
| `GET` | `/api/content` | Read current programme + menu |
| `GET` | `/api/audit` | Recent stage/publish audit entries |

## Publish target

Repo: `WeeTonyCooke/rosatos`  
Files: `content/programme.json`, `content/menu.json`  
API: GitHub Contents API (`GET` + `PUT` per file)

## Audit log

Each stage/publish (and empty chat) appends a JSON audit artifact under the Netlify Blobs store `ops-audit`. The admin UI lists recent entries.

## Out of scope

- Telegram / WhatsApp
- PDF menu extraction
- `venue.json` / booking / gift cards / design chrome
- Silent auto-publish
