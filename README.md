# Quiet Objects ops

Back-end ops for Quiet Objects venues. **Phase 1** pilots Rosato’s with an admin chat that stages content changes through Claude tools and only writes after an explicit confirm.

## Phase 1 — Rosato’s pilot

| Piece | Detail |
|---|---|
| UI | Admin chat at `/` |
| Claude tools | `list_programme`, `update_programme_event`, `update_menu_price`, `set_tonight_override` |
| Stage | `POST /api/chat` — tool loop, signed proposal, **no write** |
| Publish | `POST /api/publish` — confirm → **GitHub Contents API** |
| Target | `WeeTonyCooke/rosatos` → `content/programme.json`, `content/menu.json` |
| Audit | Stage/publish events via `GET /api/audit` (Netlify Blobs) |

`venue.json` is never written.

## Flow

1. Manager chats (“Steak Burger is 17.50”, “Saturday is Seán Óg at 22:00”).
2. Claude (Netlify AI Gateway) calls tools against an in-memory copy of programme/menu.
3. Ops returns a signed proposal + summary. UI asks for confirm.
4. Confirm publishes with the GitHub **Contents API** (`PUT /repos/.../contents/...`).
5. Audit log records `stage` and `publish` (and no-op `chat` looks).

If the AI Gateway is unavailable locally, the same four tools run through a deterministic phrase router.

## Local

```bash
npm install
OPS_AUTH_BYPASS=1 VITE_OPS_AUTH_BYPASS=1 npm run dev
```

Copy `.env.example` and set:

| Variable | Purpose |
|---|---|
| `CONTENT_GITHUB_TOKEN` | PAT with `contents:write` on `WeeTonyCooke/rosatos` |
| `CONTENT_REPO` | default `WeeTonyCooke/rosatos` |
| `CONTENT_BRANCH` | default `main` |
| `PROPOSAL_SIGNING_SECRET` | HMAC secret for confirm tokens |
| `OPS_AUTH_BYPASS` / `VITE_OPS_AUTH_BYPASS` | `1` for local only — never in production |

Claude uses `@anthropic-ai/sdk` with gateway-injected `ANTHROPIC_BASE_URL` / `ANTHROPIC_API_KEY` after the site has AI enabled and at least one production deploy.

## Netlify setup

1. Connect this repo and deploy
2. Enable **Identity** (invite only) and invite ops users
3. Enable **AI Gateway**
4. Set env vars above (no auth bypass)

## Scripts

```bash
npm run dev
npm run build
npm run test:unit
npm run lint
```

## Docs

- [`docs/PHASE1-ROSATOS.md`](./docs/PHASE1-ROSATOS.md)
