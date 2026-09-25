import { useRef, useState } from 'react'
import { BellRing, Camera, CheckCircle2, CircleX, Loader2, ShieldCheck, X, XCircle } from 'lucide-react'
import { tokenFor } from './reporterStore'
import './intelligence.css'
import './reverification.css'

const REASONS = [
  ['unresolved', 'Completely unresolved', 'Nothing has changed.'],
  ['partial', 'Partially resolved', 'Better, but not fully fixed.'],
  ['returned', 'Problem returned', 'It was fixed, then came back.'],
  ['different', 'Different issue remains', 'The original fix revealed another problem.'],
]
const ALLOWED = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']

function formatTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
}

// The reporter's decision that actually closes (or reopens) the operational loop.
export default function ReverificationCard({ item, onResponded, compact = false }) {
  const [step, setStep] = useState('ask') // ask | dispute | verified | disputed
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [photo, setPhoto] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef(null)
  const headingId = `rv-${item.ticket_id}`

  const submit = async (confirmed) => {
    if (!confirmed && !reason) { setError('Please choose what is still wrong.'); return }
    setBusy(true)
    setError('')
    try {
      const token = tokenFor(item.ticket_id)
      const res = await fetch(`/api/tickets/${encodeURIComponent(item.ticket_id)}/confirm-resolution`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Reporter-Token': token || '' },
        body: JSON.stringify(confirmed ? { confirmed: true } : { confirmed: false, reason, note: note.trim() || undefined, image: photo || undefined })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Could not record your response.')
      setStep(confirmed ? 'verified' : 'disputed')
      onResponded?.(item.ticket_id, data)
    } catch (e) {
      setError(e.message || "Can't reach the KAIROS server.")
    } finally {
      setBusy(false)
    }
  }

  const pickPhoto = (file) => {
    if (!file) return
    if (!ALLOWED.includes(file.type.toLowerCase())) { setError('Photo must be PNG, JPEG or WebP.'); return }
    if (file.size > 5 * 1024 * 1024) { setError('Photo must be under 5MB.'); return }
    const reader = new FileReader()
    reader.onload = () => { setPhoto(reader.result); setError('') }
    reader.onerror = () => setError('Could not read that photo.')
    reader.readAsDataURL(file)
  }

  if (step === 'verified') {
    return (
      <section className="rv-card rv-done ok" role="status" aria-live="polite">
        <span className="rv-done-icon"><CheckCircle2 size={28} /></span>
        <div>
          <h3>Resolution verified</h3>
          <p>Thanks. Your confirmation for <strong>{item.ticket_id}</strong> has been recorded — the loop is closed.</p>
        </div>
      </section>
    )
  }
  if (step === 'disputed') {
    return (
      <section className="rv-card rv-done bad" role="status" aria-live="polite">
        <span className="rv-done-icon"><CircleX size={28} /></span>
        <div>
          <h3>Resolution disputed</h3>
          <p>Your report has been sent back for review. <strong>{item.ticket_id}</strong> is back in the operations queue.</p>
        </div>
      </section>
    )
  }

  return (
    <section className={`rv-card${compact ? ' compact' : ''}`} aria-labelledby={headingId}>
      <header className="rv-head">
        <span className="rv-bell" aria-hidden="true"><BellRing size={16} /></span>
        <div>
          <p className="rv-eyebrow">Your issue has been marked as resolved{item.demo ? ' · Demo record' : ''}</p>
          <h3 id={headingId}>Is the issue actually resolved?</h3>
        </div>
      </header>

      <dl className="rv-facts">
        <div><dt>Ticket</dt><dd className="mono">{item.ticket_id}</dd></div>
        <div><dt>Issue</dt><dd>{item.title}</dd></div>
        <div><dt>Resolved by</dt><dd>{item.resolved_by?.team ? `${item.resolved_by.team} team` : 'Operations team'}</dd></div>
        <div><dt>Resolved at</dt><dd>{formatTime(item.resolved_at)}</dd></div>
      </dl>
      {item.policy?.level === 'required' && <p className="rv-policy"><ShieldCheck size={12} /> {item.policy.label}</p>}

      {step === 'ask' && (
        <div className="rv-choices">
          <button type="button" className="rv-yes" onClick={() => submit(true)} disabled={busy}>
            {busy ? <Loader2 size={18} className="spin-icon" /> : <CheckCircle2 size={18} />} Yes, it's fixed
          </button>
          <button type="button" className="rv-no" onClick={() => { setStep('dispute'); setError('') }} disabled={busy}>
            <XCircle size={18} /> No, problem still exists
          </button>
        </div>
      )}

      {step === 'dispute' && (
        <div className="rv-dispute">
          <fieldset>
            <legend>Tell us what's still wrong</legend>
            <div className="rv-reasons" role="radiogroup">
              {REASONS.map(([value, label, hint]) => (
                <label key={value} className={reason === value ? 'active' : ''}>
                  <input type="radio" name={`reason-${item.ticket_id}`} value={value} checked={reason === value} onChange={() => { setReason(value); setError('') }} />
                  <span><strong>{label}</strong><small>{hint}</small></span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="rv-note">
            <span>Explanation <em>(optional)</em></span>
            <textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Water is still leaking near the same spot." />
          </label>
          <div className="rv-photo">
            {photo ? (
              <div className="rv-photo-preview">
                <img src={photo} alt="Evidence to attach" />
                <button type="button" onClick={() => setPhoto('')} aria-label="Remove photo"><X size={13} /></button>
              </div>
            ) : (
              <button type="button" className="fe-btn sm ghost" onClick={() => fileRef.current?.click()}><Camera size={13} /> Add photo (optional)</button>
            )}
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { pickPhoto(e.target.files?.[0]); e.target.value = '' }} />
          </div>
          <div className="rv-choices">
            <button type="button" className="rv-no solid" onClick={() => submit(false)} disabled={busy || !reason}>
              {busy ? <Loader2 size={16} className="spin-icon" /> : null} Submit reverification
            </button>
            <button type="button" className="fe-btn ghost" onClick={() => setStep('ask')} disabled={busy}>Back</button>
          </div>
        </div>
      )}
      {error && <p className="fe-error" role="alert">{error}</p>}
    </section>
  )
}
