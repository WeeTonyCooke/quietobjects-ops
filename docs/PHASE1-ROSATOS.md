# Phase 1 — Rosato’s ops pilot

Admin chat + Netlify Functions for day-to-day Rosato’s content updates.

## Claude tools

| Tool | Purpose |
|---|---|
| `list_programme` | Read weekly lineup + tonight override |
| `update_programme_event` | Upsert/remove a day’s event |
| `update_menu_price` | Change an existing menu item price |
| `set_tonight_override` | Set or clear tonight’s cue |

Mutations apply in memory only. Publish requires a second, explicit confirm.

## Endpoints

| Method | Path | Role |
|---|---|---|
| `POST` | `/api/chat` | Claude tool loop → signed proposal |
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
