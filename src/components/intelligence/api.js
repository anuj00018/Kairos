// Authenticated JSON helper for Future Engine endpoints. Throws Error with a readable message.
export async function feFetch(path, token, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  let res
  try {
    res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined })
  } catch {
    throw new Error("Can't reach the KAIROS server.")
  }
  if (res.status === 401) {
    const err = new Error('Your administrator session has expired. Please sign in again.')
    err.status = 401
    throw err
  }
  if (res.status === 429) throw new Error('Too many requests — wait a moment and retry.')
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Request failed.')
  return data
}

export const LEVEL_ORDER = { Critical: 0, High: 1, Elevated: 2, Watch: 3 }

export function timeAgo(iso) {
  if (!iso) return ''
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export function formatHours(h) {
  if (h === null || h === undefined) return '—'
  const sign = h < 0 ? '-' : ''
  const a = Math.abs(h)
  if (a < 1) return `${sign}${Math.round(a * 60)}m`
  if (a < 48) return `${sign}${a.toFixed(a < 10 ? 1 : 0)}h`
  return `${sign}${Math.round(a / 24)}d`
}
