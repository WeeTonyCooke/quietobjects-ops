export default function AuditLog({ entries }) {
  if (!entries?.length) {
    return (
      <section className="audit" aria-label="Audit log">
        <p className="eyebrow">Audit log</p>
        <p className="audit-empty">No staged or published actions yet.</p>
      </section>
    )
  }

  return (
    <section className="audit" aria-label="Audit log">
      <p className="eyebrow">Audit log</p>
      <ul>
        {entries.map((entry) => (
          <li key={entry.id}>
            <span className="audit-action">{entry.action}</span>
            <span className="audit-summary">{entry.summary}</span>
            <span className="audit-meta">
              {entry.actor || 'ops'} · {formatWhen(entry.at)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function formatWhen(value) {
  if (!value) return ''
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return value
  }
}
