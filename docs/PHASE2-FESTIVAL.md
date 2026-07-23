# Phase 2 — Moville Festival ops

Admin chat for Moville Summer Festival programme changes, running alongside the Rosato's Phase 1 pilot in the same deployment.

## Ops tools

| Tool | Purpose |
|---|---|
| `list_programme` | Read the full festival programme (all days and events) |
| `update_event` | Add, update, or remove an event on a specific day |

Mutations apply in memory only. The UI shows a **Confirm** button before publish.

## Data model

`content/programme.json` in `WeeTonyCooke/movillefestival`:

```json
{
  "year": 2027,
  "note": "",
  "days": [
    {
      "id": "wednesday",
      "label": "Wednesday",
      "date": "2027-07-XX",
      "events": [
        {
          "id": "fancy-dress-parade",
          "name": "Fancy Dress Opening Parade",
          "time": "19:00",
          "venue": "Festival Square",
          "kind": "parade",
          "detail": "Fancy Dress Opening Parade at Festival Square"
        }
      ]
    }
  ]
}
```

Event `kind` values: `parade` · `race` · `music` · `sport` · `family` · `other`

## Endpoints (same as Phase 1, venue-aware)

| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/chat` | Body: `{ message, venue: "festival", history }` |
| `GET` | `/api/content` | Query: `?venue=festival` |
| `POST` | `/api/publish` | Proposal carries venue; validates against festival file list |
| `GET` | `/api/audit` | Audit entries carry a `venue` field |

## Publish target

Repo: `WeeTonyCooke/movillefestival`
File: `content/programme.json`
API: GitHub Contents API (same PAT as Phase 1 — add `contents:write` on the festival repo)

## Website-side prerequisite

The festival website (`WeeTonyCooke/movillefestival`) currently has programme content hardcoded in `ProgrammePage.tsx`. Before the ops system can drive live updates, that page needs to read from `content/programme.json` at build time (or via a Netlify Function at request time). Steps:

1. Commit `content/programme.json` (see seed below) to the festival repo.
2. Update `ProgrammePage.tsx` to `fetch('/content/programme.json')` (or import via a Netlify Function) and render from that data.
3. Netlify auto-deploys on every ops publish commit → programme is live within ~30 seconds.

A starter `content/programme.json` is in `fixtures/festival-programme-seed.json` in this repo.

## Env vars (Netlify dashboard)

| Variable | Purpose |
|---|---|
| `FESTIVAL_REPO` | default `WeeTonyCooke/movillefestival` |
| `FESTIVAL_BRANCH` | default `main` |
| `CONTENT_GITHUB_TOKEN` | existing PAT — must also have `contents:write` on the festival repo |

## Out of scope (Phase 2)

- PDF attachment flow (festival has no menu; not needed)
- Registration open/closed flag (`REGISTRATIONS_OPEN` is an env var, not a content file — change via Netlify dashboard)
- Sponsor listings (static in code)
- `venue.json` / booking / ticketing
