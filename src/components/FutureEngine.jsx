import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, ArrowRight, BookOpen, Check, Cpu, FlaskConical, History, Info, Play, Radar, RefreshCw, Search, Sparkles, Wrench
} from 'lucide-react'
import IncidentGraph from './intelligence/IncidentGraph'
import ScenarioComparison from './intelligence/ScenarioComparison'
import ActionPreview from './intelligence/ActionPreview'
import { feFetch, formatHours, timeAgo } from './intelligence/api'
import './intelligence/intelligence.css'

const CATEGORIES = ['Water', 'Electrical', 'Security', 'Sanitation', 'Infrastructure', 'Network']
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function LevelChip({ level }) {
  return <span className={`fe-level lvl-${(level || 'watch').toLowerCase()}`}>{level}</span>
}

function AnalysisSequence({ stages, signalId }) {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    if (reducedMotion()) { setShown(stages.length); return }
    setShown(0)
    let i = 0
    const id = window.setInterval(() => {
      i += 1
      setShown(i)
      if (i >= stages.length) window.clearInterval(id)
    }, 420)
    return () => window.clearInterval(id)
  }, [signalId, stages.length])
  return (
    <ol className="fe-sequence" aria-live="polite">
      {stages.map((s, i) => (
        <li key={s.stage} className={i < shown ? 'done' : i === shown ? 'running' : 'pending'}>
          <span className="fe-seq-node">{i < shown ? <Check size={11} /> : i + 1}</span>
          <div>
            <span className="fe-seq-stage">{s.stage}</span>
            {i < shown && <p>{s.detail}</p>}
            {i === shown && <p className="fe-muted">Analyzing…</p>}
          </div>
        </li>
      ))}
    </ol>
  )
}

function SignalDetail({ signalId, adminToken, onSessionExpired, onNotice, onChanged }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [sim, setSim] = useState(null)
  const [simBusy, setSimBusy] = useState(false)
  const [horizon, setHorizon] = useState(24)
  const [rec, setRec] = useState(null)

  useEffect(() => {
    let alive = true
    setData(null); setSim(null); setRec(null); setError('')
    feFetch(`/api/intelligence/signal?signal_id=${encodeURIComponent(signalId)}`, adminToken)
      .then((d) => { if (alive) setData(d) })
      .catch((e) => { if (e.status === 401) onSessionExpired?.(); if (alive) setError(e.message) })
    return () => { alive = false }
  }, [signalId, adminToken, onSessionExpired])

  const simulate = async () => {
    setSimBusy(true)
    try {
      setSim(await feFetch('/api/intelligence/simulate', adminToken, { method: 'POST', body: { type: 'ignore_signal', signal_id: signalId, hours: horizon } }))
    } catch (e) { onNotice?.(e.message) } finally { setSimBusy(false) }
  }

  if (error) return <div className="fe-empty-panel error"><AlertTriangle size={18} /><p>{error}</p></div>
  if (!data) return <div className="fe-skel-lines tall"><span /><span /><span /><span /></div>
  const s = data.signal
  if (!s) {
    const w = data.warning
    return (
      <div className="fe-detail">
        <h2>{w.what}</h2>
        <p className="fe-muted">{w.why}</p>
        {w.recommendations.map((r) => r.actions.length > 0 && (
          <ActionPreview key={r.title} actions={r.actions} reason={`${r.title} — ${w.what}`} signalKey={w.id} signalFingerprint={w.fingerprint}
            adminToken={adminToken} title={r.title} onDone={onChanged} />
        ))}
      </div>
    )
  }

  return (
    <div className="fe-detail">
      <header className="fe-detail-head">
        <div>
          <div className="fe-detail-tags"><LevelChip level={s.level} /><span className="fe-kind">{s.kind === 'shared_line' ? 'Cross-building correlation' : s.kind === 'cluster' ? 'Location cluster' : 'Multi-system stress'}</span></div>
          <h2>{s.title}</h2>
          <p className="fe-muted">First seen {timeAgo(s.first_seen)} · latest {timeAgo(s.last_seen)} · {s.ticket_ids.length} linked reports</p>
        </div>
        <div className="fe-score-block" title="Deterministic evidence score (0–95). Not a probability.">
          <strong>{s.score}</strong><span>evidence score</span>
          <em>{s.evidence_strength.label} · {s.evidence_strength.indicators_present}/{s.evidence_strength.indicators_total} indicators</em>
        </div>
      </header>

      <AnalysisSequence stages={s.analysis_stages} signalId={s.id} />

      <div className="fe-detail-grid">
        <section className="fe-card">
          <h3>Evidence</h3>
          <ul className="fe-indicators">
            {s.indicators.map((i) => (
              <li key={i.key} className={i.present ? '' : 'absent'}>
                <span>{i.label}</span>
                <span className="fe-ind-bar"><span style={{ width: `${Math.min(100, (i.points / 30) * 100)}%` }} /></span>
                <strong>{i.present ? `+${i.points}` : '—'}</strong>
              </li>
            ))}
          </ul>
          {s.notes.map((n) => <p key={n} className="fe-note"><Info size={12} /> {n}</p>)}
        </section>
        <section className="fe-card">
          <h3>Potential impact</h3>
          <p>{s.potential_impact.summary}</p>
          <div className="fe-impact-stats">
            <div><strong>{s.potential_impact.open_incidents}</strong><span>open</span></div>
            <div><strong>{s.potential_impact.sla_breached}</strong><span>past SLA</span></div>
            <div><strong>{s.potential_impact.sla_at_risk}</strong><span>at risk</span></div>
          </div>
          <p className="fe-note"><Info size={12} /> {s.potential_impact.population_note}</p>
          {s.recurrence.length > 0 && (
            <p className="fe-note warn"><History size={12} /> Recurred after a fix: {s.recurrence.map((r) => `${r.ticket} (after ${r.after})`).join(', ')}</p>
          )}
        </section>
      </div>

      <section className="fe-card">
        <div className="fe-card-head">
          <h3><FlaskConical size={14} /> Simulate: what if we do nothing?</h3>
          <div className="fe-inline">
            <label htmlFor="fe-horizon" className="fe-muted">Horizon</label>
            <select id="fe-horizon" value={horizon} onChange={(e) => setHorizon(Number(e.target.value))}>
              {[6, 24, 72].map((h) => <option key={h} value={h}>{h}h</option>)}
            </select>
            <button type="button" className="fe-btn primary" onClick={simulate} disabled={simBusy}><Play size={12} /> {simBusy ? 'Simulating…' : 'Simulate'}</button>
          </div>
        </div>
        {sim ? <ScenarioComparison result={sim} /> : <p className="fe-muted">Compare the projected outcome of doing nothing against intervening now, using live SLA deadlines and the configured campus topology.</p>}
      </section>

      <section className="fe-card">
        <h3><Wrench size={14} /> Recommended interventions</h3>
        <ol className="fe-recs">
          {s.recommendations.map((r) => (
            <li key={r.title}>
              <div><strong>{r.title}</strong><span className="fe-muted">{r.why}</span></div>
              {r.actions.length > 0 && <button type="button" className="fe-btn sm" onClick={() => setRec(r)}>Prepare action <ArrowRight size={11} /></button>}
            </li>
          ))}
        </ol>
        {rec && (
          <ActionPreview actions={rec.actions} reason={`${rec.title} — ${s.title}`} signalKey={s.id} signalFingerprint={s.fingerprint}
            adminToken={adminToken} title={rec.title} onCancel={() => setRec(null)}
            onDone={() => { onNotice?.('Intervention executed and audit-logged'); onChanged?.() }} />
        )}
      </section>

      <section className="fe-card">
        <h3><Radar size={14} /> Signal → pattern → possible cause</h3>
        <IncidentGraph graph={data.graph} />
      </section>

      <div className="fe-detail-grid">
        <section className="fe-card">
          <h3>Linked reports</h3>
          <ul className="fe-ticket-list">
            {s.tickets.map((t) => (
              <li key={t.id}>
                <span className={`fe-dot pri-${t.priority.toLowerCase()}`} />
                <div><strong>{t.id}</strong> {t.title}<span className="fe-muted">{t.location} · {t.status} · {t.owner}</span></div>
                {t.sla_remaining_hours !== null && <span className={`wr-sla${t.is_breached ? ' breached' : ''}`}>{t.is_breached ? `${formatHours(-t.sla_remaining_hours)} over` : `${formatHours(t.sla_remaining_hours)} left`}</span>}
              </li>
            ))}
          </ul>
        </section>
        <section className="fe-card">
          <h3><BookOpen size={14} /> Campus memory</h3>
          {s.history.length === 0 ? <p className="fe-muted">Not enough historical data for this location and category.</p> : (
            <ul className="fe-ticket-list">
              {s.history.map((h) => <li key={h.id}><History size={12} /><div><strong>{h.id}</strong> {h.title}<span className="fe-muted">{new Date(h.created_at).toLocaleDateString()} · {h.status}</span></div></li>)}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

function WhatIf({ adminToken, signals, onNotice }) {
  const [topo, setTopo] = useState(null)
  const [form, setForm] = useState({ type: 'service_outage', building: '', service: 'Power', scope: 'building', hours: 2, ticket_id: '', signal_id: '' })
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    feFetch('/api/intelligence/topology', adminToken).then((t) => {
      setTopo(t)
      setForm((f) => ({ ...f, building: f.building || t.buildings[0]?.name || '' }))
    }).catch((e) => setError(e.message))
  }, [adminToken])

  const run = async (e) => {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      setResult(await feFetch('/api/intelligence/simulate', adminToken, { method: 'POST', body: { ...form, hours: Number(form.hours) } }))
    } catch (err) { setError(err.message); onNotice?.(err.message) } finally { setBusy(false) }
  }
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  return (
    <div className="fe-whatif">
      <form className="fe-card fe-whatif-form" onSubmit={run}>
        <h3><FlaskConical size={14} /> Build a scenario</h3>
        <div className="fe-seg" role="radiogroup" aria-label="Scenario type">
          {[['service_outage', 'Service outage'], ['delay_ticket', 'Delay maintenance'], ['ignore_signal', 'Ignore a risk']].map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={form.type === v} className={form.type === v ? 'active' : ''} onClick={() => setForm((f) => ({ ...f, type: v }))}>{l}</button>
          ))}
        </div>
        {form.type === 'service_outage' && (
          <div className="fe-fields">
            <label>Building<select value={form.building} onChange={set('building')}>{topo?.buildings.map((b) => <option key={b.name} value={b.name}>{b.name}</option>)}</select></label>
            <label>Service<select value={form.service} onChange={set('service')}>{topo?.services.map((s) => <option key={s}>{s}</option>)}</select></label>
            <label>Scope<select value={form.scope} onChange={set('scope')}><option value="building">This building only</option><option value="line">Entire supply line</option></select></label>
            <label>Duration (hours)<input type="number" min="1" max="168" value={form.hours} onChange={set('hours')} /></label>
          </div>
        )}
        {form.type === 'delay_ticket' && (
          <div className="fe-fields">
            <label>Ticket ID<input value={form.ticket_id} onChange={set('ticket_id')} placeholder="GRV-1042" required /></label>
            <label>Delay (hours)<input type="number" min="1" max="168" value={form.hours} onChange={set('hours')} /></label>
          </div>
        )}
        {form.type === 'ignore_signal' && (
          <div className="fe-fields">
            <label>Risk signal<select value={form.signal_id} onChange={set('signal_id')} required>
              <option value="">Choose…</option>
              {signals.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select></label>
            <label>Horizon (hours)<input type="number" min="1" max="168" value={form.hours} onChange={set('hours')} /></label>
          </div>
        )}
        <button type="submit" className="fe-btn primary" disabled={busy}><Play size={12} /> {busy ? 'Simulating…' : 'Run simulation'}</button>
        {error && <p className="fe-error" role="alert"><AlertTriangle size={12} /> {error}</p>}
        {topo && <p className="fe-muted fe-small">Dependencies from {topo.version}. Edit backend/campus_graph.py to match your campus.</p>}
      </form>
      <div className="fe-card">{result ? <ScenarioComparison result={result} /> : <div className="fe-empty-panel"><FlaskConical size={18} /><p>Choose a scenario and run it to compare doing nothing against intervening now.</p></div>}</div>
    </div>
  )
}

function CampusMemory({ adminToken }) {
  const [q, setQ] = useState({ ticket_id: '', building: '', category: '', q: '' })
  const [res, setRes] = useState(null)
  const [busy, setBusy] = useState(false)
  const [topo, setTopo] = useState(null)
  useEffect(() => { feFetch('/api/intelligence/topology', adminToken).then(setTopo).catch(() => {}) }, [adminToken])

  const search = async (e) => {
    e?.preventDefault()
    setBusy(true)
    const params = new URLSearchParams(Object.entries(q).filter(([, v]) => v.trim()))
    try { setRes(await feFetch(`/api/intelligence/memory?${params}`, adminToken)) } catch (err) { setRes({ found: false, message: err.message, incidents: [] }) } finally { setBusy(false) }
  }
  const set = (k) => (e) => setQ((p) => ({ ...p, [k]: e.target.value }))

  return (
    <div className="fe-memory">
      <form className="fe-card fe-memory-form" onSubmit={search}>
        <h3><BookOpen size={14} /> Has this happened before?</h3>
        <div className="fe-fields">
          <label>Ticket ID<input value={q.ticket_id} onChange={set('ticket_id')} placeholder="GRV-1042" /></label>
          <label>Building<select value={q.building} onChange={set('building')}><option value="">Any</option>{topo?.buildings.map((b) => <option key={b.name}>{b.name}</option>)}</select></label>
          <label>Category<select value={q.category} onChange={set('category')}><option value="">Any</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
          <label>Keyword<input value={q.q} onChange={set('q')} placeholder="leak, wifi, latch…" /></label>
        </div>
        <button type="submit" className="fe-btn primary" disabled={busy}><Search size={12} /> {busy ? 'Searching…' : 'Search campus memory'}</button>
      </form>
      {res && (
        <div className="fe-card">
          {!res.found ? <div className="fe-empty-panel"><History size={18} /><p>{res.message}</p></div> : (
            <>
              <div className="fe-memory-summary">
                <div><strong>{res.summary.count}</strong><span>past incidents</span></div>
                <div><strong>{res.summary.median_resolution_hours !== null ? formatHours(res.summary.median_resolution_hours) : '—'}</strong><span>median time to resolve</span></div>
                <div><strong>{res.summary.within_sla}/{res.incidents.length}</strong><span>resolved within SLA</span></div>
                <div><strong>{Object.keys(res.summary.departments).join(', ')}</strong><span>responsible</span></div>
              </div>
              {res.message && <p className="fe-note"><Info size={12} /> {res.message}</p>}
              <div className="fe-table-wrap">
                <table className="fe-table">
                  <thead><tr><th>Date</th><th>Incident</th><th>Location</th><th>Resolution</th><th>Duration</th><th>Dept</th><th>Proof</th></tr></thead>
                  <tbody>
                    {res.incidents.map((i) => (
                      <tr key={i.id}>
                        <td>{new Date(i.date).toLocaleDateString()}</td>
                        <td><strong>{i.id}</strong> {i.title}</td>
                        <td>{i.location}</td>
                        <td>{i.resolution}</td>
                        <td>{i.duration_hours !== null ? formatHours(i.duration_hours) : '—'}{i.within_sla === false && <span className="fe-muted"> (late)</span>}</td>
                        <td>{i.department}</td>
                        <td><span className={`fe-proof ${i.verification.startsWith('Verified') ? 'ok' : i.verification === 'Disputed' ? 'bad' : ''}`}>{i.verification}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function FutureEngine({ adminToken, initialSignalId, onSessionExpired, onNotice }) {
  const [tab, setTab] = useState('signals')
  const [overview, setOverview] = useState(null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(initialSignalId || null)
  const [refreshKey, setRefreshKey] = useState(0)

  const load = useCallback(async () => {
    try {
      const d = await feFetch('/api/intelligence/overview', adminToken)
      setOverview(d)
      setError('')
      setSelected((cur) => cur || d.signals[0]?.id || null)
    } catch (e) {
      if (e.status === 401) onSessionExpired?.()
      setError(e.message)
    }
  }, [adminToken, onSessionExpired])

  useEffect(() => { load() }, [load, refreshKey])
  useEffect(() => { if (initialSignalId) { setSelected(initialSignalId); setTab('signals') } }, [initialSignalId])

  const signals = useMemo(() => overview?.signals || [], [overview])
  const warningState = useMemo(() => Object.fromEntries((overview?.warnings || []).map((w) => [w.id, w.state])), [overview])

  return (
    <div className="fe-page">
      <header className="fe-header">
        <div>
          <p className="eyebrow">Future Engine</p>
          <h1>See the consequences before they happen.</h1>
          <p className="wr-sub">Emerging patterns, evidence, scenario simulation and campus memory — computed from live KAIROS data.</p>
        </div>
        <button type="button" className="fe-btn sm ghost" onClick={() => setRefreshKey((k) => k + 1)}><RefreshCw size={12} /> Refresh</button>
      </header>

      <div className="fe-tabs" role="tablist">
        {[['signals', Radar, 'Risk Signals'], ['whatif', FlaskConical, 'What-If'], ['memory', BookOpen, 'Campus Memory']].map(([id, Icon, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><Icon size={13} /> {label}</button>
        ))}
      </div>

      {error && !overview && <div className="fe-empty-panel error" role="alert"><AlertTriangle size={18} /><p>{error}</p><button type="button" className="fe-btn" onClick={load}>Retry</button></div>}
      {!overview && !error && <div className="fe-skel-lines tall"><span /><span /><span /></div>}

      {overview && tab === 'signals' && (
        signals.length === 0 ? (
          <div className="fe-empty-panel"><Sparkles size={20} /><p>No emerging patterns detected. KAIROS needs at least two related open reports to form a signal — isolated incidents are handled in the Operations Hub.</p></div>
        ) : (
          <div className="fe-signals-layout">
            <nav className="fe-signal-list" aria-label="Risk signals">
              {signals.map((s) => (
                <button key={s.id} type="button" className={`fe-signal-item${selected === s.id ? ' active' : ''}`} onClick={() => setSelected(s.id)} aria-current={selected === s.id}>
                  <div className="fe-signal-top"><LevelChip level={s.level} /><strong>{s.score}</strong></div>
                  <span className="fe-signal-title">{s.title}</span>
                  <span className="fe-muted">{s.ticket_ids.length} reports · {s.evidence_strength.label} evidence{warningState[s.id] && warningState[s.id] !== 'active' ? ` · ${warningState[s.id]}` : ''}</span>
                </button>
              ))}
              <p className="fe-muted fe-small"><Cpu size={11} /> Scores are deterministic evidence scores, not probabilities.</p>
            </nav>
            {selected && <SignalDetail key={`${selected}-${refreshKey}`} signalId={selected} adminToken={adminToken} onSessionExpired={onSessionExpired}
              onNotice={onNotice} onChanged={() => setRefreshKey((k) => k + 1)} />}
          </div>
        )
      )}
      {overview && tab === 'whatif' && <WhatIf adminToken={adminToken} signals={signals} onNotice={onNotice} />}
      {overview && tab === 'memory' && <CampusMemory adminToken={adminToken} />}
    </div>
  )
}
