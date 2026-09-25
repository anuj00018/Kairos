// Tickets this device reported, with the one-time reporter credential issued at submission.
// The credential is what lets this person (and only this person) verify the resolution.
const KEY = 'kairos_my_reports'

export function getReports() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(list) ? list.filter((r) => r && r.ticket_id && r.token) : []
  } catch {
    return []
  }
}

export function addReports(items) {
  const byId = Object.fromEntries(getReports().map((r) => [r.ticket_id, r]))
  items.forEach((r) => { if (r?.ticket_id && r?.token) byId[r.ticket_id] = { ...byId[r.ticket_id], ...r } })
  try { localStorage.setItem(KEY, JSON.stringify(Object.values(byId).slice(-100))) } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event('kairos-reports-changed'))
}

export function removeReports(predicate) {
  try { localStorage.setItem(KEY, JSON.stringify(getReports().filter((r) => !predicate(r)))) } catch { /* ignore */ }
  window.dispatchEvent(new Event('kairos-reports-changed'))
}

export function tokenFor(ticketId) {
  return getReports().find((r) => r.ticket_id === ticketId)?.token || null
}
