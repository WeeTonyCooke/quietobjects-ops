# Phase 3 — Telegram Bot

Chat-to-publish for both venues over Telegram. Send a change, get a Confirm button, tap it — live in ~30 seconds. Same tool loop and signed-proposal flow as the web UI.

## How it works

```
You → "Wednesday 7pm Fancy Dress Parade at Festival Square"
Bot → "Staged — nothing live yet.
        • Programme · Wednesday: Fancy Dress Opening Parade · 19:00 at Festival Square
        Publish now?  [✓ Publish now]  [✗ Discard]"
You → tap ✓ Publish now
Bot → "Published ✓
        Programme · Wednesday: Fancy Dress Opening Parade · 19:00 at Festival Square
        WeeTonyCooke/movillefestival · main · a3f9b12
        https://github.com/WeeTonyCooke/movillefestival/commit/..."
```

Venue is determined by which chat you message from — no prefix needed.

## Setup (one-off, ~10 minutes)

### 1. Create the bot

1. Open Telegram → search **@BotFather** → `/start`
2. `/newbot`
3. Name: `Quiet Objects ops` (or anything)
4. Username: `quietobjects_ops_bot` (must end in `bot`, must be unique)
5. BotFather replies with: `Done! Token: 7xxxxxxxxx:AAF...`
6. Copy the token — this is `TELEGRAM_BOT_TOKEN`

### 2. Get your chat ID(s)

**For personal chats:**
1. Start a chat with your new bot (search its username, press Start)
2. Send any message
3. Open: `https://api.telegram.org/bot{YOUR_TOKEN}/getUpdates`
4. Find `"chat":{"id": 123456789}` — that number is your chat ID

**For group chats (recommended for committee):**
1. Create a Telegram group (or use an existing one)
2. Add your bot to the group
3. Send a message in the group
4. Open the same `getUpdates` URL — group chat IDs are negative numbers, e.g. `-1001234567890`

### 3. Generate a webhook secret

Run in Terminal:
```bash
openssl rand -hex 32
```
Copy the output — this is `TELEGRAM_WEBHOOK_SECRET`.

### 4. Set env vars in Netlify

Go to **quietobjects-ops → Site configuration → Environment variables** and add:

| Variable | Value |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Token from BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | Random hex from step 3 |
| `TELEGRAM_FESTIVAL_CHAT_IDS` | Comma-separated chat IDs for festival (e.g. `123456789,-1001234567890`) |
| `TELEGRAM_ROSATOS_CHAT_IDS` | Comma-separated chat IDs for Rosato's |

### 5. Register the webhook

Run once from your Terminal (replace the placeholders):

```bash
curl -X POST "https://api.telegram.org/bot{YOUR_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://quietobjects-ops.netlify.app/api/telegram",
    "secret_token": "{YOUR_WEBHOOK_SECRET}",
    "allowed_updates": ["message", "callback_query"]
  }'
```

Expected response: `{"ok":true,"result":true,"description":"Webhook was set"}`

### 6. Verify

```bash
curl "https://api.telegram.org/bot{YOUR_TOKEN}/getWebhookInfo"
```

Should show `"url": "https://quietobjects-ops.netlify.app/api/telegram"` and `"pending_update_count": 0`.

## Commands

| Command | Effect |
|---|---|
| `/start` or `/help` | Shows help and which venue this chat is for |
| `/venue` | Shows the venue for this chat |
| Any other text | Staged as a content change |

## Usage examples

**Festival:**
```
list programme
Wednesday 7pm Fancy Dress Parade at Festival Square
Bed Push is Thursday at 19:00 at Quay Street
remove Bed Push from Thursday
Saturday 21:00 Live Music at The Square
```

**Rosato's:**
```
list programme
Steak Burger is 17.50
Saturday is Seán Óg at 22:00
Tonight override is Quiz night · 22:00
```

## Notes

- Proposals expire after **15 minutes** — if you tap Confirm after that, the bot asks you to re-send.
- Sending a new change while a Confirm is pending **overwrites** the pending proposal.
- PDF menu attachments via Telegram are **not yet supported** (web UI only for now).
- Audit log entries include `"channel": "telegram"` and `"actor": "tg:{chatId}"`.
- One bot handles both venues — venue is set per chat ID via the env vars above.

## Env vars summary

| Variable | Purpose |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Bot token from BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | Webhook security token (optional but recommended) |
| `TELEGRAM_FESTIVAL_CHAT_IDS` | Comma-separated chat IDs for Moville Festival |
| `TELEGRAM_ROSATOS_CHAT_IDS` | Comma-separated chat IDs for Rosato's |
