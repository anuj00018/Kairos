import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, BadgeCheck, CircleAlert, Clock3, Hourglass, ShieldQuestion } from 'lucide-react'
import ResolutionTimeline from './ResolutionTimeline'
import ReverificationCard from './ReverificationCard'
import { tokenFor } from './reporterStore'
import './intelligence.css'
import './reverification.css'

const STATE_META = {
  verified_reporter: { icon: BadgeCheck, tone: 'ok', title: 'Verified by reporter' },
  verified_admin: { icon: BadgeCheck, tone: 'ok', title: 'Verified by administrator' },
  disputed: { icon: CircleAlert, tone: 'bad', title: 'Resolution disputed' },
  disputed_returned: { icon: CircleAlert, tone: 'bad', title: 'Reverification required — returned for review' },
  awaiting_reporter: { icon: Hourglass, tone: 'pending', title: 'Awaiting reverification' },
  awaiting_admin: { icon: ShieldQuestion, tone: 'pending', title: 'Resolved — not yet verified' },
}

// "Resolved" (someone said done) vs "Verified" (the affected person confirmed). Everything shown comes from the backend.
export default function ResolutionProof({ ticketId, status, adminToken, mode = 'admin', onNotice, onChanged, refreshKey }) {
  const [data, setData] = useState(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const reporterToken = mode === 'public' ? tokenFor(ticketId) : null

  const load = useCallback(async () => {
    const headers = {}
    if (mode === 'admin' && adminToken) headers.Authorization = `Bearer ${adminToken}`
    if (reporterToken) headers['X-Reporter-Token'] = reporterToken
    try {
      const res = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}/verification`, { headers })
      setData(res.ok ? await res.json() : null)
    } catch { setData(null) }
  }, [ticketId, mode, adminToken, reporterToken])

  useEffect(() => { load() }, [load, status, refreshKey])

  if (!data) return null
  const hasResolution = data.lifecycle?.some((e) => e.kind === 'resolved')
  if (!hasResolution) return null
  const meta = STATE_META[data.state]

  const adminVerify = async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}/verify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ note: note.trim() || undefined })
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.detail || 'Verification failed')
      setData(d); setNote('')
      onNotice?.(`${ticketId} verified by administrator`)
      onChanged?.()
    } catch (e) { onNotice?.(e.message) } finally { setBusy(false) }
  }

  const d = data.last_dispute
  const showDispute = d && (data.state === 'disputed' || data.state === 'disputed_returned')
  const Icon = meta?.icon || Clock3

  return (
    <section className={`fe-proof-card ${meta?.tone || ''}`} aria-label="Resolution verification">
      <header>
        <Icon size={15} />
        <strong>{meta?.title || data.status}</strong>
        {data.verified_at && data.state?.startsWith('verified') && <span className="fe-muted"><Clock3 size={11} /> {new Date(data.verified_at).toLocaleString()}</span>}
        {data.reopen_count > 0 && <span className="rv-chip">Reopened {data.reopen_count}×</span>}
      </header>

      {showDispute && (
        <div className="rv-admin-dispute">
          <p><strong>Reporter response:</strong> {d.reason_label} · {new Date(d.at).toLocaleString()}</p>
          {d.note && <blockquote>“{d.note}”</blockquote>}
          {d.image ? <img src={d.image} alt="Photo uploaded by the reporter with the dispute" /> : d.has_image ? <p className="fe-muted">Photo attached (visible to the reporter and administrators).</p> : null}
        </div>
      )}

      {mode === 'public' && reporterToken && data.reporter_can_respond && (
        <ReverificationCard compact item={{ ticket_id: ticketId, title: data.title, resolved_at: data.resolved_at, resolved_by: data.resolved_by, policy: data.policy }}
          onResponded={() => window.setTimeout(load, 600)} />
      )}
      {mode === 'public' && !reporterToken && data.state === 'awaiting_reporter' && (
        <p className="fe-muted">Waiting for the person who reported this issue to confirm the fix.</p>
      )}

      <ResolutionTimeline events={data.lifecycle} />

      {data.possible_recurrence?.length > 0 && (
        <p className="fe-note warn"><AlertTriangle size={12} /> {data.possible_recurrence.map((r) => r.label).join(' · ')}. This is a possible recurrence, not proof that the earlier fix failed.</p>
      )}

      <details className="fe-assumptions">
        <summary>Resolution evidence ({data.evidence.length})</summary>
        <ul className="fe-proof-evidence">
          {data.evidence.map((e, i) => <li key={i} className={e.negative ? 'neg' : ''}>{e.label}</li>)}
        </ul>
      </details>

      {mode === 'admin' && (data.state === 'awaiting_reporter' || data.state === 'awaiting_admin') && (
        <div className="fe-proof-actions">
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="What you checked on site" aria-label="Administrator verification note" />
          <button type="button" className="fe-btn sm" onClick={adminVerify} disabled={busy}><BadgeCheck size={12} /> Record admin verification</button>
          <span className="fe-muted fe-small">Admin verification is recorded separately and does not replace the reporter's confirmation.</span>
        </div>
      )}
    </section>
  )
}
