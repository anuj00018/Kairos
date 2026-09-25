import { useState } from 'react'
import { ArrowDownRight, ArrowUpRight, Info, Minus } from 'lucide-react'
import useCountUp from '../../hooks/useCountUp'
import './intelligence.css'

const LABELS = { safety: 'Safety', response: 'Response', infrastructure: 'Infrastructure', maintenance: 'Maintenance', network: 'Network' }

function Delta({ value }) {
  if (value === null || value === undefined) return null
  if (value === 0) return <span className="fe-delta flat"><Minus size={11} /> 0</span>
  return (
    <span className={`fe-delta ${value > 0 ? 'up' : 'down'}`}>
      {value > 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}{Math.abs(value)}
    </span>
  )
}

export default function HealthIndex({ health, compact = false }) {
  const [open, setOpen] = useState(false)
  const score = useCountUp(health?.score ?? 0, 900)
  if (!health || health.score === null || health.score === undefined) {
    return <div className="fe-health empty"><p>{health?.message || 'Not enough operational data to compute campus health.'}</p></div>
  }
  const change = health.change
  const band = health.score >= 80 ? 'good' : health.score >= 60 ? 'fair' : 'poor'

  return (
    <div className={`fe-health ${compact ? 'compact' : ''}`}>
      <button type="button" className={`fe-health-ring ${band}`} style={{ '--pct': health.score }} onClick={() => setOpen((v) => !v)}
        aria-expanded={open} aria-label={`Campus health ${health.score} out of 100. Show why it changed.`}>
        <span className="fe-health-value"><strong>{score}</strong><small>/100</small></span>
      </button>
      <div className="fe-health-body">
        <div className="fe-health-title">
          <span className="fe-eyebrow">Campus Health Index</span>
          {change && <Delta value={change.delta} />}
          {change && <span className="fe-muted">vs {change.window} ago ({change.previous})</span>}
        </div>
        <div className="fe-dims">
          {Object.entries(health.dimensions).map(([k, d]) => (
            <div key={k} className="fe-dim" title={d.detail}>
              <div className="fe-dim-top"><span>{LABELS[k] || k}</span><strong>{d.score ?? '—'}</strong>{change && <Delta value={change.dimension_deltas?.[k]} />}</div>
              <div className="fe-bar"><span style={{ width: `${d.score ?? 0}%` }} className={d.score >= 80 ? 'good' : d.score >= 60 ? 'fair' : 'poor'} /></div>
            </div>
          ))}
        </div>
        <button type="button" className="fe-link" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <Info size={12} /> {open ? 'Hide explanation' : 'Why did this score change?'}
        </button>
      </div>
      {open && (
        <div className="fe-health-why">
          {change ? (
            <>
              <strong>Campus health {change.delta > 0 ? 'increased' : change.delta < 0 ? 'decreased' : 'held steady'} because:</strong>
              <ul>{change.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
            </>
          ) : <p>{health.note}</p>}
          <div className="fe-why-dims">
            {Object.entries(health.dimensions).map(([k, d]) => (
              <p key={k}><strong>{LABELS[k]}:</strong> {d.detail} {d.formula && <span className="fe-muted">({d.formula})</span>}</p>
            ))}
          </div>
          {change?.method && <p className="fe-muted">{change.method}</p>}
        </div>
      )}
    </div>
  )
}
