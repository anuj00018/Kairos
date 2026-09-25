import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, ShieldCheck, X, XCircle } from 'lucide-react'
import { feFetch } from './api'
import './intelligence.css'

// Two-step operational change: server-validated preview → explicit confirm → audited execution.
export default function ActionPreview({ actions, reason, signalKey, signalFingerprint, adminToken, initialPreview, onDone, onCancel, title }) {
  const [preview, setPreview] = useState(initialPreview || null)
  const [loading, setLoading] = useState(!initialPreview)
  const [executing, setExecuting] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const actionsKey = JSON.stringify(actions || [])
  useEffect(() => {
    if (initialPreview) return
    let alive = true
    feFetch('/api/intelligence/actions/preview', adminToken, { method: 'POST', body: { actions: JSON.parse(actionsKey), reason } })
      .then((p) => { if (alive) setPreview(p) })
      .catch((e) => { if (alive) setError(e.message) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [actionsKey, reason, adminToken, initialPreview])

  const confirm = async () => {
    setExecuting(true)
    setError('')
    try {
      const valid = preview.items.filter((i) => i.valid).map((i) => i.action)
      const r = await feFetch('/api/intelligence/actions/execute', adminToken, {
        method: 'POST',
        body: { actions: valid, reason: reason || preview.reason || undefined, signal_key: signalKey, signal_fingerprint: signalFingerprint }
      })
      setResult(r)
      onDone?.(r)
    } catch (e) {
      setError(e.message)
    } finally {
      setExecuting(false)
    }
  }

  return (
    <div className="fe-action-preview" role="region" aria-label="Action preview">
      <div className="fe-ap-head">
        <ShieldCheck size={15} />
        <strong>{result ? 'Actions executed' : 'Action preview'}</strong>
        <span className="fe-ap-sub">{title || (result ? 'Recorded in the audit trail' : 'Nothing changes until you confirm')}</span>
        {onCancel && !result && (
          <button type="button" className="fe-icon-btn" onClick={onCancel} aria-label="Cancel action preview"><X size={14} /></button>
        )}
      </div>

      {loading && <div className="fe-skel-lines"><span /><span /><span /></div>}
      {error && <p className="fe-error" role="alert"><AlertTriangle size={13} /> {error}</p>}

      {preview && !result && (
        <>
          {(reason || preview.reason) && <p className="fe-ap-reason"><strong>Reason:</strong> {reason || preview.reason}</p>}
          <ul className="fe-ap-list">
            {preview.items.map((i, n) => (
              <li key={n} className={i.valid ? '' : 'invalid'}>
                {i.valid ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                <span>{i.description}{!i.valid && <em> — {i.problem}</em>}</span>
              </li>
            ))}
          </ul>
          <div className="fe-ap-actions">
            <button type="button" className="fe-btn primary" onClick={confirm} disabled={executing || preview.executable === 0}>
              {executing ? 'Executing…' : `Confirm ${preview.executable} action${preview.executable === 1 ? '' : 's'}`}
            </button>
            {onCancel && <button type="button" className="fe-btn" onClick={onCancel} disabled={executing}>Cancel</button>}
          </div>
        </>
      )}

      {result && (
        <ul className="fe-ap-list">
          {result.results.map((r, n) => (
            <li key={n} className={r.ok ? 'done' : 'invalid'}>
              {r.ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
              <span>{r.description}{r.error && <em> — {r.error}</em>}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
