// Backend API helpers for OpenGym Platform
export async function api(path, opts) {
  const r = await fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts))
  const data = await r.json().catch(() => ({}))
  if (!r.ok) { const e = new Error(data.error || ('HTTP ' + r.status)); e.status = r.status; throw e }
  return data
}

export async function authLogin(username, password, expectedRole) {
  const body = { username, password }
  if (expectedRole) body.expectedRole = expectedRole
  const res = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(body)
  })
  return res.user
}

export async function authActivate(code, username, password, email) {
  const res = await api('/api/auth/client-activate', {
    method: 'POST',
    body: JSON.stringify({ code, username, password, email })
  })
  return res.user
}

export async function authLogout() {
  await api('/api/auth/logout', { method: 'POST', body: '{}' })
}

