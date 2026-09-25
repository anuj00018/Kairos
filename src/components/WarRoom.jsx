import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Activity, AlertTriangle, ArrowRight, BellRing, Check, Clock3, Cpu, Eye, EyeOff, FlaskConical,
  Globe, Hourglass, Radar, RefreshCw, ShieldAlert, ShieldCheck, Sparkles, Users, Wrench, X
} from 'lucide-react'
import HealthIndex from './intelligence/HealthIndex'
import IncidentGraph from './intelligence/IncidentGraph'
import ActionPreview from './intelligence/ActionPreview'
import { feFetch, formatHours, timeAgo } from './intelligence/api'
import useCountUp from '../hooks/useCountUp'
import { addReports, removeReports } from './intelligence/reporterStore'
import './intelligence/reverification.css'
import './intelligence/intelligence.css'

const POLL_MS = 20000

function Kpi({ icon: Icon, label, value, tone, hint }) {
  const v = useCountUp(value ?? 0, 700)
  return (
    <div className={`wr-kpi ${tone || ''}`} title={hint}>
      <span className="wr-kpi-icon"><Icon size={15} /></span>
      <div><strong>{v}</strong><span>{label}</span></div>
    </div>
  )
}

function LevelChip({ level }) {
  return <span className={`fe-level lvl-${(level || 'watch').toLowerCase()}`}>{level}</span>
}

function WarningCard({ w, fresh, adminToken, onState, onAnalyze, onActioned, onOpenTicket }) {
  const [showEvidence, setShowEvidence] = useState(false)
  const [previewRec, setPreviewRec] = useState(null)
  const actionable = w.recommendations?.find((r) => r.actions?.length)
  const inactive = w.state !== 'active'
  return (
    <article className={`wr-warning lvl-${w.level.toLowerCase()}${fresh ? ' fresh' : ''}${inactive ? ' inactive' : ''}`}>
      <header>
        <LevelChip level={w.level} />
        <span className="wr-score" title="Deterministic evidence score (0–95), not a probability">{w.score}</span>
        {fresh && <span className="wr-new">New signal</span>}
        {w.resurfaced && <span className="wr-new">New evidence</span>}
        {inactive && <span className="wr-state">{w.state}{w.actor ? ` · ${w.actor.split(' ·')[0]}` : ''}</span>}
      </header>
      <h4>{w.what}</h4>
      {w.kind === 'dispute' && w.dispute && (
        <div className="rv-admin-dispute">
          <p><strong>Reporter response:</strong> {w.dispute.reason_label}{w.dispute.has_image ? ' · photo uploaded' : ''} · {timeAgo(w.dispute.at)}</p>
          <p className="fe-muted">Issue: {w.ticket_title}</p>
        </div>
      )}
      <dl className="wr-wdl">
        <div><dt>Where</dt><dd>{w.where}</dd></div>
        <div><dt>Why</dt><dd>{w.why}</dd></div>
        <div><dt>Potential impact</dt><dd>{w.potential_impact}</dd></div>
        <div><dt>Recommended</dt><dd>{w.recommended_action}</dd></div>
      </dl>
      {showEvidence && (
        <ul className="wr-evidence">
          {w.evidence.map((e, i) => (
            <li key={i} className={e.present === false ? 'absent' : ''}>
              {e.present === false ? <X size={11} /> : <Check size={11} />} {e.label}{e.points !== undefined && e.present ? <span className="fe-muted"> · +{e.points}</span> : null}
            </li>
          ))}
          <li className="wr-evidence-ids">Tickets: {w.ticket_ids.join(', ')}</li>
        </ul>
      )}
      <div className="wr-warning-actions">
        {w.state === 'active' && <button type="button" className="fe-btn sm" onClick={() => onState(w, 'acknowledged')}><Check size={12} /> Acknowledge</button>}
        {w.state === 'active' && <button type="button" className="fe-btn sm ghost" onClick={() => onState(w, 'dismissed')}><EyeOff size={12} /> Dismiss</button>}
        {inactive && <button type="button" className="fe-btn sm ghost" onClick={() => onState(w, 'active')}>Reopen</button>}
        {actionable && <button type="button" className="fe-btn sm" onClick={() => setPreviewRec(actionable)}><Wrench size={12} /> Create action</button>}
        <button type="button" className="fe-btn sm ghost" onClick={() => setShowEvidence((v) => !v)} aria-expanded={showEvidence}><Eye size={12} /> {showEvidence ? 'Hide' : 'View'} evidence</button>
        {w.kind === 'dispute' && onOpenTicket && (
          <button type="button" className="fe-btn sm primary" onClick={() => onOpenTicket(w.ticket_ids[0])}>Review incident <ArrowRight size={12} /></button>
        )}
        {w.kind !== 'sla' && w.kind !== 'dispute' && (
          <button type="button" className="fe-btn sm primary" onClick={() => onAnalyze(w.id)}>Analyze & simulate <ArrowRight size={12} /></button>
        )}
      </div>
      {previewRec && (
        <ActionPreview
          actions={previewRec.actions}
          reason={`${previewRec.title} — ${w.what}`}
          signalKey={w.id}
          signalFingerprint={w.fingerprint}
          adminToken={adminToken}
          title={previewRec.title}
          onCancel={() => setPreviewRec(null)}
          onDone={onActioned}
        />
      )}
    </article>
  )
}

export default function WarRoom({ adminToken, onOpenSignal, onOpenTwin, onOpenTicket, onSessionExpired, onNotice }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [demoBusy, setDemoBusy] = useState(false)
  const [fresh, setFresh] = useState(() => new Set())
  const [showInactive, setShowInactive] = useState(false)
  const seen = useRef(null)

  const load = useCallback(async () => {
    try {
      const d = await feFetch('/api/intelligence/overview', adminToken)
      const ids = d.warnings.map((w) => w.id)
      if (seen.current) {
        const added = ids.filter((id) => !seen.current.has(id))
        if (added.length) {
          setFresh(new Set(added))
          window.setTimeout(() => setFresh(new Set()), 12000)
        }
      }
      seen.current = new Set(ids)
      setData(d)
      setError('')
    } catch (e) {
      if (e.status === 401) onSessionExpired?.()
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [adminToken, onSessionExpired])

  useEffect(() => {
    load()
    const tick = () => { if (document.visibilityState === 'visible') load() }
    const id = window.setInterval(tick, POLL_MS)
    return () => window.clearInterval(id)
  }, [load])

  const setState = async (w, state) => {
    try {
      await feFetch(`/api/intelligence/signal-state?signal_id=${encodeURIComponent(w.id)}`, adminToken, {
        method: 'POST', body: { state, fingerprint: w.fingerprint }
      })
      onNotice?.(`Signal ${state === 'active' ? 'reopened' : state}`)
      load()
    } catch (e) { onNotice?.(e.message) }
  }

  const demo = async (action) => {
    setDemoBusy(true)
    try {
      const r = await feFetch('/api/intelligence/demo', adminToken, { method: 'POST', body: { action } })
      // Demo reporter credentials let the reporter view work on demo tickets exactly like real ones
      if (action === 'load') {
        removeReports((x) => x.demo)
        addReports((r.demo_reporter_tickets || []).map((x) => ({ ...x, demo: true })))
      } else {
        removeReports((x) => x.demo)
      }
      onNotice?.(action === 'load' ? `Loaded ${r.tickets} demo scenario tickets` : `Removed ${r.tickets} demo tickets`)
      seen.current = null
      await load()
    } catch (e) { onNotice?.(e.message) } finally { setDemoBusy(false) }
  }

  if (loading && !data) {
    return (
      <div className="wr-page">
        <div className="wr-skeleton"><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div>
      </div>
    )
  }
  if (error && !data) {
    return (
      <div className="wr-page">
        <div className="fe-empty-panel error" role="alert">
          <AlertTriangle size={20} /><p>{error}</p>
          <button type="button" className="fe-btn" onClick={load}><RefreshCw size={13} /> Retry</button>
        </div>
      </div>
    )
  }

  const k = data.kpis
  const active = data.warnings.filter((w) => w.state === 'active')
  const inactive = data.warnings.filter((w) => w.state !== 'active')
  const seenRec = new Set()
  const topRecs = active.flatMap((w) => w.recommendations.filter((r) => r.actions.length).map((r) => ({ ...r, w })))
    .filter((r) => {
      const key = r.actions.map((a) => `${a.type}:${a.ticket_id || a.title}`).sort().join('|')
      if (seenRec.has(r.title) || seenRec.has(key)) return false
      seenRec.add(r.title); seenRec.add(key)
      return true
    }).slice(0, 4)
  const hasDemo = data.demo_ticket_ids?.length > 0
  const rv = data.reverification || { awaiting: [], disputed: [], verified_by_reporter: 0 }

  return (
    <div className="wr-page">
      <header className="wr-header">
        <div>
          <p className="eyebrow">AI Campus Operating System</p>
          <h1>KAIROS War Room</h1>
          <p className="wr-sub">What is happening, what could happen next, and what to do about it.</p>
        </div>
        <div className="wr-header-meta">
          <span className={`wr-live${error ? ' stale' : ''}`}><i /> {error ? 'Connection issue — showing last data' : `Live · updated ${timeAgo(data.generated_at)}`}</span>
          <button type="button" className="fe-btn sm ghost" onClick={load} aria-label="Refresh"><RefreshCw size={12} /> Refresh</button>
          {hasDemo ? (
            <button type="button" className="fe-btn sm ghost" onClick={() => demo('clear')} disabled={demoBusy}><FlaskConical size={12} /> Remove demo data ({data.demo_ticket_ids.length})</button>
          ) : (
            <button type="button" className="fe-btn sm ghost" onClick={() => demo('load')} disabled={demoBusy}><FlaskConical size={12} /> Load demo scenario</button>
          )}
        </div>
      </header>

      {hasDemo && (
        <p className="wr-demo-banner" title={data.demo_ticket_ids.join(', ')}><FlaskConical size={12} /> {data.demo_ticket_ids.length} demo scenario tickets are loaded (GRV-9001–9013). The analysis is real; these inputs are labeled demo records.</p>
      )}

      <section className="wr-top">
        <div className="wr-panel wr-health-panel"><HealthIndex health={data.health} /></div>
        <div className="wr-kpis">
          <Kpi icon={Activity} label="Active incidents" value={k.active} />
          <Kpi icon={ShieldAlert} label="Critical" value={k.critical} tone={k.critical ? 'alert' : ''} />
          <Kpi icon={Clock3} label="Overdue (SLA breached)" value={k.overdue} tone={k.overdue ? 'alert' : ''} />
          <Kpi icon={BellRing} label="Approaching SLA" value={k.approaching_sla} tone={k.approaching_sla ? 'warn' : ''} />
          <Kpi icon={Radar} label="Emerging risks" value={k.emerging_risks} tone={k.emerging_risks ? 'warn' : ''} />
          <Kpi icon={Users} label="Unassigned" value={k.unassigned} hint={`${k.response_load.staff_engaged} staff engaged · avg ${k.response_load.avg_per_staff} per person`} />
        </div>
      </section>

      <section className="wr-grid">
        <div className="wr-panel wr-warnings">
          <div className="wr-panel-head">
            <h3><Radar size={15} /> Early Warnings</h3>
            <span className="fe-muted">{active.length} active</span>
          </div>
          {active.length === 0 ? (
            <div className="fe-empty-panel"><Check size={18} /><p>No active warnings. KAIROS re-evaluates every report automatically.</p></div>
          ) : (
            <div className="wr-warning-list">
              {active.map((w) => (
                <WarningCard key={w.id} w={w} fresh={fresh.has(w.id)} adminToken={adminToken} onState={setState} onAnalyze={onOpenSignal} onOpenTicket={onOpenTicket}
                  onActioned={() => { onNotice?.('Actions executed and audit-logged'); window.setTimeout(load, 4000) }} />
              ))}
            </div>
          )}
          {inactive.length > 0 && (
            <>
              <button type="button" className="fe-link" onClick={() => setShowInactive((v) => !v)}>{showInactive ? 'Hide' : 'Show'} {inactive.length} acknowledged / dismissed</button>
              {showInactive && inactive.map((w) => (
                <WarningCard key={w.id} w={w} adminToken={adminToken} onState={setState} onAnalyze={onOpenSignal} onOpenTicket={onOpenTicket} onActioned={load} />
              ))}
            </>
          )}
        </div>

        <div className="wr-side">
          <div className="wr-panel">
            <div className="wr-panel-head"><h3><ShieldCheck size={15} /> Resolution Reverification</h3></div>
            <div className="wr-rv-stats">
              <div><strong>{rv.awaiting.length}</strong><span>awaiting reporter</span></div>
              <div><strong>{rv.disputed.length}</strong><span>disputed</span></div>
              <div><strong>{rv.verified_by_reporter}</strong><span>verified by reporter</span></div>
            </div>
            {rv.disputed.length === 0 && rv.awaiting.length === 0 ? (
              <p className="fe-muted">No resolutions waiting on reporters.</p>
            ) : (
              <ul className="wr-rv-list">
                {rv.disputed.map((d) => (
                  <li key={d.ticket_id} className="bad">
                    <div><strong className="mono">{d.ticket_id}</strong> {d.title}<span>Disputed: {d.reason} · {timeAgo(d.at)} · now {d.status}</span></div>
                    <button type="button" className="fe-btn sm" onClick={() => onOpenTicket?.(d.ticket_id)}>Review</button>
                  </li>
                ))}
                {rv.awaiting.slice(0, 5).map((a) => (
                  <li key={a.ticket_id}>
                    <div><strong className="mono">{a.ticket_id}</strong> {a.title}<span><Hourglass size={10} /> Resolved {timeAgo(a.resolved_at)} · {a.policy === 'required' ? 'reporter verification required' : 'awaiting reporter'}</span></div>
                    <button type="button" className="fe-btn sm ghost" onClick={() => onOpenTicket?.(a.ticket_id)}>Open</button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="wr-panel">
            <div className="wr-panel-head"><h3><Sparkles size={15} /> AI Recommendations</h3></div>
            {topRecs.length === 0 ? <p className="fe-muted">No interventions recommended right now.</p> : (
              <ol className="wr-recs">
                {topRecs.map((r) => (
                  <li key={`${r.w.id}-${r.title}`}>
                    <strong>{r.title}</strong>
                    <span>{r.why}</span>
                    <button type="button" className="fe-link" onClick={() => onOpenSignal(r.w.id)}>For: {r.w.what} <ArrowRight size={11} /></button>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="wr-panel">
            <div className="wr-panel-head">
              <h3><Globe size={15} /> Campus Risk Map</h3>
              <button type="button" className="fe-link" onClick={() => onOpenTwin?.()}>Open 3D twin <ArrowRight size={11} /></button>
            </div>
            <div className="wr-map">
              {data.buildings.map((b) => (
                <button key={b.building} type="button"
                  className={`wr-bldg ${b.risk_level ? `lvl-${b.risk_level.toLowerCase()}` : b.open ? 'active' : 'calm'}`}
                  onClick={() => (b.signal_ids[0] ? onOpenSignal(b.signal_ids[0]) : onOpenTwin?.(b.building))}
                  title={`${b.building}: ${b.open} open, ${b.critical} critical, ${b.breached} past SLA${b.risk_level ? ` · ${b.risk_level} risk` : ''}`}>
                  <span className="wr-bldg-zone">{b.zone}</span>
                  <strong>{b.building}</strong>
                  <span className="wr-bldg-meta">{b.open} open{b.breached ? ` · ${b.breached} overdue` : ''}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="wr-grid two">
        <div className="wr-panel">
          <div className="wr-panel-head"><h3><Activity size={15} /> Live Incidents</h3><span className="fe-muted">newest first</span></div>
          <ul className="wr-live-list">
            {data.live_incidents.length === 0 && <li className="fe-muted">No open incidents.</li>}
            {data.live_incidents.map((t) => (
              <li key={t.id} className={t.is_breached ? 'breached' : ''}>
                <span className={`fe-dot pri-${t.priority.toLowerCase()}`} />
                <div>
                  <strong>{t.id}</strong> {t.title}
                  <span className="fe-muted">{t.building} · {t.status} · {t.owner}</span>
                </div>
                <span className={`wr-sla${t.is_breached ? ' breached' : ''}`}>{t.is_breached ? `${formatHours(-t.sla_remaining_hours)} over` : `${formatHours(t.sla_remaining_hours)} left`}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="wr-panel">
          <div className="wr-panel-head"><h3><Cpu size={15} /> Recent Operational Changes</h3><span className="fe-muted">last 24h</span></div>
          <ul className="wr-changes">
            {data.recent_changes.length === 0 && <li className="fe-muted">No changes in the last 24 hours.</li>}
            {data.recent_changes.map((c, i) => (
              <li key={i}>
                <span className="wr-change-time">{timeAgo(c.at)}</span>
                <div><strong>{c.ticket_id}</strong> {c.action}<span className="fe-muted"> — {c.actor}</span></div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="wr-panel">
        <div className="wr-panel-head">
          <h3><Radar size={15} /> Incident Relationships</h3>
          <span className="fe-muted">Hover a node to trace the chain</span>
        </div>
        <IncidentGraph graph={data.graph} />
      </section>

      <p className="fe-muted wr-footnote">{data.data_note} Topology: {data.topology}.</p>
    </div>
  )
}
