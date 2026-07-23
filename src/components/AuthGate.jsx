export default function AuthGate({
  mode = 'login',
  onLogin,
  onAcceptInvite,
  onResetPassword,
  error,
}) {
  if (mode === 'invite') {
    return (
      <div className="gate">
        <div className="gate-card">
          <p className="eyebrow">Quiet Objects</p>
          <h1>Rosato’s ops</h1>
          <p className="lede">Accept your invite and choose a password.</p>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              const form = new FormData(event.currentTarget)
              onAcceptInvite({
                password: String(form.get('password') || ''),
              })
            }}
          >
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>
            {error ? <p className="form-error">{error}</p> : null}
            <button type="submit" className="primary">
              Set password & continue
            </button>
          </form>
        </div>
      </div>
    )
  }

  if (mode === 'recovery') {
    return (
      <div className="gate">
        <div className="gate-card">
          <p className="eyebrow">Quiet Objects</p>
          <h1>Rosato’s ops</h1>
          <p className="lede">Choose a new password to finish recovery.</p>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              const form = new FormData(event.currentTarget)
              onResetPassword({
                password: String(form.get('password') || ''),
              })
            }}
          >
            <label>
              New password
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>
            {error ? <p className="form-error">{error}</p> : null}
            <button type="submit" className="primary">
              Update password
            </button>
          </form>
        </div>
      </div>
    )
  }

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
