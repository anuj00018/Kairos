import { AlertTriangle, ArrowRight, Building2, CheckCircle2, GitBranch, Layers, ShieldCheck, Zap } from 'lucide-react'
import useCountUp from '../../hooks/useCountUp'
import './intelligence.css'

function HealthBar({ label, value, from, tone }) {
  const shown = useCountUp(value ?? 0, 900)
  return (
    <div className={`fe-sim-health ${tone}`}>
      <div className="fe-sim-health-top"><span>{label}</span><strong>{value ?? '—'}</strong></div>
      <div className="fe-bar big">
        <span className="ghost" style={{ width: `${from ?? 0}%` }} />
        <span className={tone} style={{ width: `${shown}%` }} />
      </div>
    </div>
  )
}

export default function ScenarioComparison({ result }) {
  if (!result) return null
  const flow = [
    { icon: Layers, label: 'Current state', body: result.current_state },
    { icon: Zap, label: 'Scenario', body: result.title },
    { icon: Building2, label: 'Affected buildings', body: result.affected_buildings.join(', ') || '—' },
    { icon: GitBranch, label: 'Affected services', body: result.affected_services.join(', ') || '—' },
    { icon: AlertTriangle, label: 'Potential impact', body: result.potential_impact.join(' · ') },
    { icon: GitBranch, label: 'Dependencies', body: result.dependencies.join(' · ') || 'No configured dependencies' },
  ]

  return (
    <div className="fe-sim">
      <div className="fe-sim-label"><ShieldCheck size={12} /> {result.label} · horizon {result.horizon_hours}h</div>

      <ol className="fe-sim-flow">
        {flow.map((f, i) => (
          <li key={f.label} style={{ animationDelay: `${i * 90}ms` }}>
            <span className="fe-sim-flow-icon"><f.icon size={13} /></span>
            <div><span className="fe-eyebrow">{f.label}</span><p>{f.body}</p></div>
          </li>
        ))}
      </ol>

      <div className="fe-sim-compare">
        <div className="fe-sim-col bad">
          <div className="fe-sim-col-head"><AlertTriangle size={14} /> If we do nothing</div>
          <div className="fe-sim-stat"><strong>{result.no_action.sla_breaches}</strong><span>SLA breaches within {result.horizon_hours}h</span></div>
          {result.no_action.new_breaches?.length > 0 && <p className="fe-muted">New breaches: {result.no_action.new_breaches.join(', ')}</p>}
          {result.no_action.blocked_incidents?.length > 0 && <p className="fe-muted">Blocked work: {result.no_action.blocked_incidents.join(', ')}</p>}
          <HealthBar label="Projected campus health" value={result.no_action.health} from={result.health_now} tone="bad" />
          <p className="fe-sim-summary">{result.no_action.summary}</p>
        </div>
        <div className="fe-sim-vs"><ArrowRight size={16} /></div>
        <div className="fe-sim-col good">
          <div className="fe-sim-col-head"><CheckCircle2 size={14} /> If we intervene now</div>
          <div className="fe-sim-stat"><strong>{result.with_action.breaches_avoided}</strong><span>breaches avoided</span></div>
          <HealthBar label="Projected campus health" value={result.with_action.health} from={result.health_now} tone="good" />
          <p className="fe-sim-summary">{result.with_action.summary}</p>
          <div className="fe-eyebrow">Recommended response</div>
          <ol className="fe-sim-steps">{result.recommended_response.map((r) => <li key={r}>{r}</li>)}</ol>
        </div>
      </div>

      <details className="fe-assumptions">
        <summary>Assumptions & data sources</summary>
        <ul>
          {result.assumptions.map((a) => <li key={a}>{a}</li>)}
          <li>{result.historical_precedents} resolved incident(s) on record for the affected buildings.</li>
        </ul>
      </details>
    </div>
  )
}
