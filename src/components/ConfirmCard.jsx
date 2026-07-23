export default function ConfirmCard({ pending, busy, onConfirm, onDiscard }) {
  return (
    <section className="confirm" aria-label="Confirm publish">
      <div>
        <p className="eyebrow">Confirm before publish</p>
        <h2>{pending.summary}</h2>
        <ul>
          {(pending.descriptions || []).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="confirm-note">
          Writes only <code>content/programme.json</code> and{' '}
          <code>content/menu.json</code> on WeeTonyCooke/rosatos. Nothing goes live
          until you confirm.
        </p>
      </div>
      <div className="confirm-actions">
        <button type="button" className="ghost" disabled={busy} onClick={onDiscard}>
          Discard
        </button>
        <button type="button" className="primary" disabled={busy} onClick={onConfirm}>
          {busy ? 'Publishing…' : 'Confirm & publish'}
        </button>
      </div>
    </section>
  )
}
