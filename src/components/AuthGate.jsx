export default function AuthGate({ onLogin, error }) {
  return (
    <div className="gate">
      <div className="gate-card">
        <p className="eyebrow">Quiet Objects</p>
        <h1>Rosato’s ops</h1>
        <p className="lede">Sign in to stage and publish content updates.</p>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            const form = new FormData(event.currentTarget)
            onLogin({
              email: String(form.get('email') || ''),
              password: String(form.get('password') || ''),
            })
          }}
        >
          <label>
            Email
            <input name="email" type="email" autoComplete="username" required />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <button type="submit" className="primary">
            Sign in
          </button>
        </form>
      </div>
    </div>
  )
}
