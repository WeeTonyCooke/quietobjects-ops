/**
 * Telegram Bot API helpers for quietobjects-ops.
 */

function env(name, fallback = '') {
  const value =
    typeof Netlify !== 'undefined' ? Netlify.env.get(name) : process.env[name]
  return value || fallback
}

function botToken() {
  const token = env('TELEGRAM_BOT_TOKEN')
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not configured')
  return token
}

async function callTg(method, body) {
  const res = await fetch(
    `https://api.telegram.org/bot${botToken()}/${method}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Telegram ${method} failed: ${res.status} ${text}`)
  }
  return res.json()
}

/** Send a plain-text message. options can include reply_markup. */
export async function sendMessage(chatId, text, options = {}) {
  return callTg('sendMessage', { chat_id: chatId, text, ...options })
}

/** Edit the text of an existing message (removes inline keyboard too). */
export async function editMessageText(chatId, messageId, text) {
  return callTg('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
  })
}

/** Acknowledge a button tap — required or Telegram shows a spinner forever. */
export async function answerCallbackQuery(callbackQueryId, text = '') {
  return callTg('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text,
    show_alert: false,
  })
}

/** Inline keyboard shown after a successful stage. */
export const CONFIRM_KEYBOARD = {
  inline_keyboard: [
    [
      { text: '✓ Publish now', callback_data: 'confirm' },
      { text: '✗ Discard', callback_data: 'discard' },
    ],
  ],
}

/** Determine which venue a chat ID is authorised for.
 *  Returns 'rosatos', 'festival', or null (not authorised). */
export function venueForChatId(chatId) {
  const id = String(chatId)
  const festivalIds = env('TELEGRAM_FESTIVAL_CHAT_IDS')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const rosatosIds = env('TELEGRAM_ROSATOS_CHAT_IDS')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (festivalIds.includes(id)) return 'festival'
  if (rosatosIds.includes(id)) return 'rosatos'
  return null
}

/** Validate the Telegram webhook secret header. Returns true if OK. */
export function validateWebhookSecret(req) {
  const expected = env('TELEGRAM_WEBHOOK_SECRET')
  if (!expected) return true // not configured — skip check in dev
  const incoming =
    req.headers.get('x-telegram-bot-api-secret-token') || ''
  return incoming === expected
}
