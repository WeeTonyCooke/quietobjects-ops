import { useEffect, useRef, useState } from 'react'
import {
  getUser,
  handleAuthCallback,
  login,
  logout,
  onAuthChange,
} from '@netlify/identity'
import { chat, fetchContent, publish } from './lib/api.js'
import AuthGate from './components/AuthGate.jsx'
import ChatThread from './components/ChatThread.jsx'
import ConfirmCard from './components/ConfirmCard.jsx'

const SUGGESTIONS = [
  'Steak Burger is 17.50',
  'Saturday is Seán Óg at 22:00',
  'Tonight override is Quiz night · 22:00',
]

export default function App() {
  const [user, setUser] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [authError, setAuthError] = useState('')
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Keep the week honest. Tell me a menu price or this week’s act — I’ll stage it, you confirm, then it publishes into Rosato’s content JSON.',
    },
  ])
  const [pending, setPending] = useState(null)
  const [contentMeta, setContentMeta] = useState(null)
  const [lastPublish, setLastPublish] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        await handleAuthCallback()
        const current = await getUser()
        if (alive) setUser(current)
      } catch {
        if (alive) setUser(null)
      } finally {
        if (alive) setAuthReady(true)
      }
    })()

    const unsubscribe = onAuthChange((_event, next) => setUser(next))
    return () => {
      alive = false
      unsubscribe?.()
    }
  }, [])

  useEffect(() => {
    if (!user && import.meta.env.VITE_OPS_AUTH_BYPASS !== '1') return
    let alive = true
    ;(async () => {
      try {
        const data = await fetchContent()
        if (alive) setContentMeta({ repo: data.repo, branch: data.branch })
      } catch {
        // Content load is best-effort until GitHub token is configured.
      }
    })()
    return () => {
      alive = false
    }
  }, [user])

  async function handleLogin({ email, password }) {
    setAuthError('')
    try {
      const next = await login(email, password)
      setUser(next)
    } catch (error) {
      setAuthError(error.message || 'Could not sign in')
    }
  }

  async function handleLogout() {
    await logout()
    setUser(null)
    setPending(null)
  }

  function pushMessage(message) {
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), ...message }])
  }

  async function submitMessage(text) {
    const message = text.trim()
    if (!message || busy) return
    setBusy(true)
    setDraft('')
    setPending(null)
    pushMessage({ role: 'user', text: message })

    try {
      const result = await chat(message)
      pushMessage({
        role: 'assistant',
        text: result.reply || result.summary,
        meta: result.source,
      })
      setPending({
        proposal: result.proposal,
        signature: result.signature,
        descriptions: result.descriptions,
        summary: result.summary,
      })
    } catch (error) {
      pushMessage({
        role: 'assistant',
        text: error.message || 'That update could not be staged.',
        tone: 'error',
      })
    } finally {
      setBusy(false)
      inputRef.current?.focus()
    }
  }

  async function confirmPublish() {
    if (!pending || busy) return
    setBusy(true)
    try {
      const result = await publish({
        proposal: pending.proposal,
        signature: pending.signature,
      })
      setLastPublish(result)
      setPending(null)
      pushMessage({
        role: 'assistant',
        text: `Published to ${result.commit.repo}@${result.commit.branch}.\n${result.summary}`,
        meta: 'published',
      })
    } catch (error) {
      pushMessage({
        role: 'assistant',
        text: error.message || 'Publish failed',
        tone: 'error',
      })
    } finally {
      setBusy(false)
    }
  }

  function discardPending() {
    setPending(null)
    pushMessage({
      role: 'assistant',
      text: 'Discarded. Nothing was written.',
    })
  }

  const bypass = import.meta.env.VITE_OPS_AUTH_BYPASS === '1'
  const signedIn = Boolean(user) || bypass

  if (!authReady) {
    return <div className="boot">Loading Quiet Objects ops…</div>
  }

  if (!signedIn) {
    return <AuthGate onLogin={handleLogin} error={authError} />
  }

  return (
    <div className="shell">
      <header className="top">
        <div className="brand-block">
          <p className="eyebrow">Quiet Objects</p>
          <h1>Rosato’s ops</h1>
          <p className="lede">
            Confirm-then-publish into programme + menu JSON. Venue chrome stays ours.
          </p>
        </div>
        <div className="top-meta">
          <p>
            {contentMeta
              ? `${contentMeta.repo} · ${contentMeta.branch}`
              : 'WeeTonyCooke/rosatos'}
          </p>
          <button type="button" className="ghost" onClick={handleLogout} disabled={bypass}>
            {bypass ? 'Dev bypass' : 'Sign out'}
          </button>
        </div>
      </header>

      <main className="stage">
        <ChatThread messages={messages} />

        {pending ? (
          <ConfirmCard
            pending={pending}
            busy={busy}
            onConfirm={confirmPublish}
            onDiscard={discardPending}
          />
        ) : null}

        <form
          className="composer"
          onSubmit={(event) => {
            event.preventDefault()
            submitMessage(draft)
          }}
        >
          <label className="sr-only" htmlFor="ops-message">
            Message
          </label>
          <textarea
            id="ops-message"
            ref={inputRef}
            rows={2}
            value={draft}
            disabled={busy}
            placeholder="e.g. Steak Burger is 17.50"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                submitMessage(draft)
              }
            }}
          />
          <div className="composer-row">
            <div className="suggestions">
              {SUGGESTIONS.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="chip"
                  disabled={busy}
                  onClick={() => submitMessage(item)}
                >
                  {item}
                </button>
              ))}
            </div>
            <button type="submit" className="primary" disabled={busy || !draft.trim()}>
              {busy ? 'Working…' : 'Stage'}
            </button>
          </div>
        </form>

        {lastPublish?.commit?.url ? (
          <p className="publish-note">
            Last publish:{' '}
            <a href={lastPublish.commit.url} target="_blank" rel="noreferrer">
              {lastPublish.commit.sha.slice(0, 7)}
            </a>
          </p>
        ) : null}
      </main>
    </div>
  )
}
