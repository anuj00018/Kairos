import { Check, CircleDot, Hourglass, RotateCcw, ShieldCheck, X } from 'lucide-react'
import './intelligence.css'
import './reverification.css'

const TONE = {
  reporter_confirmed: 'ok', admin_verified: 'ok',
  reporter_disputed: 'bad', reopened: 'bad',
  pending: 'pending',
}

function Icon({ kind }) {
  if (kind === 'reporter_confirmed' || kind === 'admin_verified') return <ShieldCheck size={11} />
  if (kind === 'reporter_disputed') return <X size={11} />
  if (kind === 'reopened') return <RotateCcw size={11} />
  if (kind === 'pending') return <Hourglass size={11} />
  if (kind === 'requested') return <CircleDot size={11} />
  return <Check size={11} />
}

function when(iso) {
  if (!iso) return null
  const d = new Date(iso)
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
}

// Lifecycle built entirely from backend events (audit log + verification records).
export default function ResolutionTimeline({ events }) {
  if (!events?.length) return null
  return (
    <ol className="rt-timeline" aria-label="Resolution lifecycle">
      {events.map((e, i) => (
        <li key={`${e.stage}-${e.at || i}`} className={`rt-step ${TONE[e.kind] || ''}`} style={{ animationDelay: `${Math.min(i, 10) * 50}ms` }}>
          <span className="rt-node" aria-hidden="true"><Icon kind={e.kind} /></span>
          <div className="rt-body">
            <strong>{e.stage}{e.kind === 'reporter_confirmed' ? ' ✓' : e.kind === 'reporter_disputed' ? ' ✕' : ''}</strong>
            <span>
              {e.at ? when(e.at) : 'Waiting for the reporter'}
              {e.actor ? ` · ${e.actor}` : ''}
              {e.detail ? ` · ${e.detail}` : ''}
            </span>
          </div>
        </li>
      ))}
    </ol>
  )
}
