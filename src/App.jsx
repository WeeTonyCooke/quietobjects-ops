import { useEffect, useRef, useState } from 'react'
import {
  acceptInvite,
  getUser,
  handleAuthCallback,
  login,
  logout,
  onAuthChange,
  updateUser,
} from '@netlify/identity'
import {
  chat,
  fetchAudit,
  fetchContent,
  publish,
  uploadAttachment,
} from './lib/api.js'
import AuthGate from './components/AuthGate.jsx'
import ChatThread from './components/ChatThread.jsx'
import ConfirmCard from './components/ConfirmCard.jsx'
import AuditLog from './components/AuditLog.jsx'

const SUGGESTIONS = [
  'list programme',
  'Steak Burger is 17.50',
  'Saturday is Seán Óg at 22:00',
  'Tonight override is Quiz night · 22:00',
]

export default function App() {
  const [user, setUser] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [authMode, setAuthMode] = useState('login')
  const [inviteToken, setInviteToken] = useState(null)
  const [authError, setAuthError] = useState('')
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState('')
  const [attachment, setAttachment] = useState(null)
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Rosato’s Phase 1 ops. Type a change, or attach a PDF menu update — then press Confirm before anything publishes.',
    },
  ])
  const [pending, setPending] = useState(null)
  const [contentMeta, setContentMeta] = useState(null)
  const [lastPublish, setLastPublish] = useState(null)
  const [auditEntries, setAuditEntries] = useState([])
  const inputRef = useRef(null)
  const fileRef = useRef(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const callback = await handleAuthCallback()
        if (!alive) return

        if (callback?.type === 'invite' && callback.token) {
          setInviteToken(callback.token)
          setAuthMode('invite')
          setUser(null)
        } else if (callback?.type === 'recovery') {
          setAuthMode('recovery')
          setUser(callback.user || (await getUser()))
        } else {
          const current = await getUser()
          setUser(current)
          setAuthMode('login')
        }
      } catch (error) {
        if (alive) {
          setUser(null)
          setAuthError(error.message || 'Could not process sign-in link')
        }
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

  async function refreshMeta() {
    try {
      const [content, audit] = await Promise.all([
        fetchContent().catch(() => null),
        fetchAudit(12).catch(() => ({ entries: [] })),
      ])
      if (content) setContentMeta({ repo: content.repo, branch: content.branch })
      setAuditEntries(audit?.entries || [])
    } catch {
      // Best-effort until token / blobs are configured.
    }
  }

  useEffect(() => {
    if (!user && import.meta.env.VITE_OPS_AUTH_BYPASS !== '1') return
    refreshMeta()
  }, [user])

  async function handleLogin({ email, password }) {
    setAuthError('')
    try {
      const next = await login(email, password)
      setUser(next)
      setAuthMode('login')
    } catch (error) {
      setAuthError(error.message || 'Could not sign in')
    }
  }

  async function handleAcceptInvite({ password }) {
    setAuthError('')
    if (!inviteToken) {
      setAuthError('Invite link is missing or expired. Request a new invite.')
      return
    }
    try {
      const next = await acceptInvite(inviteToken, password)
      setUser(next)
      setInviteToken(null)
      setAuthMode('login')
      window.history.replaceState({}, document.title, window.location.pathname)
    } catch (error) {
      setAuthError(error.message || 'Could not accept invite')
    }
  }

  async function handleResetPassword({ password }) {
    setAuthError('')
    try {
      const next = await updateUser({ password })
      setUser(next)
      setAuthMode('login')
      window.history.replaceState({}, document.title, window.location.pathname)
    } catch (error) {
      setAuthError(error.message || 'Could not update password')
    }
  }

  async function handleLogout() {
    await logout()
    setUser(null)
    setPending(null)
    setAuthMode('login')
  }

  function pushMessage(message) {
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), ...message }])
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || busy) return
    setBusy(true)
    try {
      const result = await uploadAttachment(file)
      setAttachment(result.attachment)
      pushMessage({
        role: 'assistant',
        text: `Attached ${result.attachment.name} (${result.attachment.extractedChars} characters read). Add a note if you want, then Stage.`,
        meta: 'attachment',
      })
    } catch (error) {
      pushMessage({
        role: 'assistant',
        text: error.message || 'Could not attach PDF',
        tone: 'error',
      })
    } finally {
      setBusy(false)
      inputRef.current?.focus()
    }
  }

  async function submitMessage(text) {
    const message = text.trim()
    if ((!message && !attachment) || busy) return
    setBusy(true)
    setDraft('')
    setPending(null)

    const history = messages
      .filter((row) => row.role === 'user' || row.role === 'assistant')
      .filter((row) => row.id !== 'welcome')
      .map((row) => ({ role: row.role, content: row.text }))

    const userLine = message
      ? attachment
        ? `${message}\n(with ${attachment.name})`
        : message
      : `Update menu from attached PDF: ${attachment.name}`

    pushMessage({ role: 'user', text: userLine })

    try {
      const result = await chat(message, history, attachment?.id || null)
      pushMessage({
        role: 'assistant',
        text: result.reply || result.summary || 'Staged.',
        meta: result.source,
      })
      if (result.staged) {
        setPending({
          proposal: result.proposal,
          signature: result.signature,
          descriptions: result.descriptions,
          summary: result.summary,
          toolTrace: result.toolTrace,
          attachmentName: result.attachmentName || attachment?.name,
        })
        setAttachment(null)
      }
      refreshMeta()
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
      refreshMeta()
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
  const signedIn = Boolean(user) && authMode !== 'recovery'
  const showGate =
    !bypass && (!signedIn || authMode === 'invite' || authMode === 'recovery')
  const canStage = Boolean(draft.trim() || attachment)

  if (!authReady) {
    return <div className="boot">Loading Quiet Objects ops…</div>
  }

  if (showGate) {
    return (
      <AuthGate
        mode={authMode}
        onLogin={handleLogin}
        onAcceptInvite={handleAcceptInvite}
        onResetPassword={handleResetPassword}
        error={authError}
      />
    )
  }

  return (
    <div className="shell">
      <header className="top">
        <div className="brand-block">
          <p className="eyebrow">Quiet Objects</p>
          <h1>Rosato’s ops</h1>
          <p className="lede">
            Stage programme or menu changes from chat or a PDF. Confirm before
            anything publishes.
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
            placeholder="e.g. Steak Burger is 17.50 — or attach a PDF menu"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                submitMessage(draft)
              }
            }}
          />

          {attachment ? (
            <div className="attachment-chip">
              <span>{attachment.name}</span>
              <button
                type="button"
                className="ghost"
                disabled={busy}
                onClick={() => setAttachment(null)}
              >
                Remove
              </button>
            </div>
          ) : null}

          <div className="composer-row">
            <div className="composer-left">
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                onChange={handleFileChange}
              />
              <button
                type="button"
                className="ghost"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
              >
                Attach PDF
              </button>
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
            </div>
            <button type="submit" className="primary" disabled={busy || !canStage}>
              {busy ? 'Working…' : 'Stage'}
            </button>
          </div>
        </form>

        {lastPublish?.commit?.url ? (
          <p className="publish-note">
            Last publish:{' '}
            <a href={lastPublish.commit.url} target="_blank" rel="noreferrer">
              {(lastPublish.commit.sha || '').slice(0, 7) || 'commit'}
            </a>
          </p>
        ) : null}

        <AuditLog entries={auditEntries} />
      </main>
    </div>
  )
}
