# Quiet Objects ops

Back-end ops console for Quiet Objects venues. Phase 1 pilots **Rosato’s** with an admin chat that stages content changes and only writes after an explicit confirm.

## Phase 1 — Rosato’s pilot

- Admin chat UI (this site)
- Netlify Functions: `/api/chat`, `/api/publish`, `/api/content`
- Confirm-then-publish into [`WeeTonyCooke/rosatos`](https://github.com/WeeTonyCooke/rosatos) `content/programme.json` and `content/menu.json`
- Never writes `venue.json` (Quiet Objects–owned chrome)

See [`docs/PHASE1-ROSATOS.md`](./docs/PHASE1-ROSATOS.md).

## Local

```bash
npm install
OPS_AUTH_BYPASS=1 VITE_OPS_AUTH_BYPASS=1 npm run dev
```

Set these for real GitHub reads/writes:

| Variable | Purpose |
|---|---|
| `CONTENT_GITHUB_TOKEN` | PAT with `contents:write` on `WeeTonyCooke/rosatos` |
| `CONTENT_REPO` | default `WeeTonyCooke/rosatos` |
| `CONTENT_BRANCH` | default `main` |
| `PROPOSAL_SIGNING_SECRET` | HMAC secret for confirm tokens |
| `OPS_AUTH_BYPASS` | `1` to skip Identity in local/dev only |

AI staging uses Netlify AI Gateway (`openai` SDK / `gpt-4o-mini`) after the site has a production deploy with AI enabled. Without the gateway, a deterministic parser still handles common price and lineup phrases.

## Netlify

1. Connect this repo and deploy
2. Enable **Identity** (invite only) and invite ops users
3. Enable **AI Gateway**
4. Set the env vars above (no bypass in production)

## Scripts

```bash
npm run dev
npm run build
npm run test:unit
```
