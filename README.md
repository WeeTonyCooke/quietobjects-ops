# Quiet Objects ops

Back-end ops for Quiet Objects venues. **Phase 1** pilots Rosato’s with an admin chat that stages content changes through cheap, swappable AI tools and only writes after an explicit confirm.

## Phase 1 — Rosato’s pilot

| Piece | Detail |
|---|---|
| UI | Admin chat at `/` |
| Ops tools | `list_programme`, `update_programme_event`, `update_menu_price`, `set_tonight_override` |
| Stage | `POST /api/chat` — tool loop, signed proposal, **no write** |
| Publish | `POST /api/publish` — confirm → **GitHub Contents API** |
| Target | `WeeTonyCooke/rosatos` → `content/programme.json`, `content/menu.json` |
| Audit | Stage/publish events via `GET /api/audit` (Netlify Blobs) |

`venue.json` is never written.

## AI (low-cost, swappable)

Not tied to Claude. Default is **`gpt-4o-mini`** via Netlify AI Gateway (OpenAI SDK). Change with env:

| Variable | Default | Purpose |
|---|---|---|
| `OPS_AI_PROVIDER` | `openai` | Gateway provider path (Phase 1: `openai`) |
| `OPS_AI_MODEL` | `gpt-4o-mini` | Any gateway chat model that supports tools |

The durable contract is the **ops tools + confirm-then-publish**, not a vendor model.

## Flow

1. Manager chats (“Steak Burger is 17.50”) or attaches a PDF menu.
2. Tools stage programme/menu changes in memory.
3. UI shows **Confirm**. Nothing writes until then.
4. Confirm publishes with the GitHub **Contents API**.
5. Audit log records attach / stage / publish.

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
| `OPS_AI_MODEL` | optional; default `gpt-4o-mini` |
| `OPS_AUTH_BYPASS` / `VITE_OPS_AUTH_BYPASS` | `1` for local only — never leave on for real Identity |

## Netlify setup

1. Connect this repo and deploy
2. Enable **Identity** (invite only) when ready; until then auth bypass is for scaffolding only
3. Enable **AI Gateway**
4. Set content token + signing secret

Live pilot site: https://quietobjects-ops.netlify.app

## Scripts

```bash
npm run dev
npm run build
npm run test:unit
npm run lint
```

## Docs

- [`docs/PHASE1-ROSATOS.md`](./docs/PHASE1-ROSATOS.md)
