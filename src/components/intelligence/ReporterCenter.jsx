import { useCallback, useEffect, useRef, useState } from 'react'
import { BadgeCheck, BellRing, CircleAlert, Clock3, Inbox } from 'lucide-react'
import ReverificationCard from './ReverificationCard'
import { getReports } from './reporterStore'
import './intelligence.css'
import './reverification.css'

const POLL_MS = 30000

const STATE_LABEL = {
  open: ['In progress', Clock3, ''],
  awaiting_reporter: ['Awaiting your verification', BellRing, 'attn'],
  awaiting_admin: ['Resolved', BadgeCheck, ''],
  verified_reporter: ['Verified by you', BadgeCheck, 'ok'],
  verified_admin: ['Verified by operations', BadgeCheck, 'ok'],
  disputed: ['Disputed', CircleAlert, 'bad'],
  disputed_returned: ['Disputed · back in review', CircleAlert, 'bad'],
}

// In-app notifications for the reporter: driven by the tickets this device submitted.
export default function ReporterCenter({ onAwaitingChange, onNotice, onTrack }) {
  const [items, setItems] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [answered, setAnswered] = useState(() => new Set())
  const prevAwaiting = useRef(null)

  const load = useCallback(async () => {
    const reports = getReports()
    if (!reports.length) { setItems([]); setLoaded(true); onAwaitingChange?.(0); return }
    try {
      const res = await fetch('/api/reporter/tickets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickets: reports.map(({ ticket_id, token }) => ({ ticket_id, token })) })
      })
      if (!res.ok) return
      const data = await res.json()
      const demoIds = new Set(reports.filter((r) => r.demo).map((r) => r.ticket_id))
      const list = data.tickets.map((t) => ({ ...t, demo: demoIds.has(t.ticket_id) }))
      setItems(list)
      const awaiting = list.filter((t) => t.reporter_can_respond).map((t) => t.ticket_id)
      onAwaitingChange?.(awaiting.length)
      if (prevAwaiting.current) {
        const fresh = awaiting.filter((id) => !prevAwaiting.current.includes(id))
        if (fresh.length) onNotice?.(`Ticket ${fresh[0]} has been marked resolved. Please verify whether the issue is actually fixed.`)
      }
      prevAwaiting.current = awaiting
    } catch { /* offline — keep last known state */ } finally {
      setLoaded(true)
    }
  }, [onAwaitingChange, onNotice])

  useEffect(() => {
    load()
    const id = window.setInterval(() => { if (document.visibilityState === 'visible') load() }, POLL_MS)
    const onChange = () => load()
    window.addEventListener('kairos-reports-changed', onChange)
    return () => { window.clearInterval(id); window.removeEventListener('kairos-reports-changed', onChange) }
  }, [load])

  if (!loaded || items.length === 0) return null
  const awaiting = items.filter((t) => t.reporter_can_respond || answered.has(t.ticket_id))
  const rest = items.filter((t) => !awaiting.includes(t))

  return (
    <div className="rc-center">
      {awaiting.map((t) => (
        <ReverificationCard key={t.ticket_id} item={t} onResponded={(id) => {
          setAnswered((s) => new Set(s).add(id))
          window.setTimeout(load, 1500)
        }} />
      ))}
      {rest.length > 0 && (
        <section className="rc-list" aria-label="Your reports">
          <h3><Inbox size={14} /> Your reports</h3>
          <ul>
            {rest.map((t) => {
              const [label, Icon, tone] = STATE_LABEL[t.state] || [t.verification_status, Clock3, '']
              return (
                <li key={t.ticket_id}>
                  <button type="button" onClick={() => onTrack?.(t.ticket_id)}>
                    <span className="mono">{t.ticket_id}</span>
                    <span className="rc-title">{t.title}{t.demo ? <em className="rc-demo">Demo</em> : null}</span>
                    <span className={`rc-state ${tone}`}><Icon size={12} /> {label}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}
