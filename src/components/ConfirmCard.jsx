export default function ConfirmCard({ pending, busy, onConfirm, onDiscard }) {
  return (
    <section className="confirm" aria-label="Confirm changes">
      <div>
        <p className="eyebrow">Ready to publish</p>
        <h2>{pending.summary}</h2>
        <ul>
          {(pending.descriptions || []).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {pending.attachmentName ? (
          <p className="confirm-note">From attachment: {pending.attachmentName}</p>
        ) : null}
        <p className="confirm-note">
          Writes into Rosato’s <code>programme.json</code> / <code>menu.json</code>.
          Nothing goes live until you confirm.
        </p>
      </div>
      <div className="confirm-actions">
        <button type="button" className="ghost" disabled={busy} onClick={onDiscard}>
          Discard
        </button>
        <button
          type="button"
          className="primary confirm-primary"
          disabled={busy}
          onClick={onConfirm}
        >
          {busy ? 'Publishing…' : 'Confirm'}
        </button>
      </div>
    </section>
  )
}
