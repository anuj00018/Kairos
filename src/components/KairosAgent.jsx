import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowDown,
  Bot,
  Clock3,
  Database,
  MapPin,
  Pause,
  Play,
  RotateCcw,
  Send,
  Sparkles,
  Square,
  Trash2,
  User,
  Volume2,
  VolumeX
} from 'lucide-react'
import MarkdownMessage from './MarkdownMessage'
import ActionPreview from './intelligence/ActionPreview'
import useSpeech from '../hooks/useSpeech'
import './KairosAgent.css'

const HISTORY_KEY = 'kairos_agent_history'
const AUTOREAD_KEY = 'kairos_agent_autoread'
const CONTEXT_TURNS = 12

const TOOL_LABELS = {
  get_ticket: 'Ticket lookup',
  list_tickets: 'Ticket search',
  get_analytics: 'Live analytics',
  get_audit_logs: 'Audit log',
  get_broadcasts: 'Campus broadcasts',
  get_policy: 'SLA policy',
  get_operational_risks: 'Future Engine risks',
  get_campus_health: 'Campus health',
  get_related_incidents: 'Incident correlation',
  get_incident_history: 'Campus memory',
  simulate_scenario: 'Scenario simulation',
  propose_actions: 'Action preview'
}

const GUEST_SUGGESTIONS = [
  'What is the SLA for a critical issue?',
  'How does KAIROS route a complaint?',
  'Are there any active campus broadcasts?',
  'What is the status of ticket '
]
const ADMIN_SUGGESTIONS = [
  'Show open critical tickets',
  'Summarize current operations',
  'Which department has the most workload?',
  'What changed recently in the audit log?'
]

const newId = () => `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

function loadHistory() {
  try {
    const raw = sessionStorage.getItem(HISTORY_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function loadAutoRead() {
  try {
    return localStorage.getItem(AUTOREAD_KEY) !== 'off'
  } catch {
    return true
  }
}

function TicketCard({ t }) {
  return (
    <div className={`agent-ticket-card${t.is_breached ? ' breached' : ''}`}>
      <div className="agent-ticket-top">
        <span className="agent-ticket-id">{t.id}</span>
        <span className={`tag priority-${String(t.priority).toLowerCase()}`}>{t.priority}</span>
        <span className={`tag status-${String(t.status).toLowerCase().replaceAll(' ', '-')}`}>{t.status}</span>
      </div>
      <strong className="agent-ticket-title">{t.title}</strong>
      <div className="agent-ticket-meta">
        <span>{t.department}</span>
        {t.location && <span><MapPin size={11} /> {t.location}</span>}
        {t.due && <span className={t.is_breached ? 'breach-text' : ''}><Clock3 size={11} /> {t.due}</span>}
      </div>
    </div>
  )
}

function VoiceBars() {
  return (
    <span className="voice-bars" aria-hidden="true">
      <i /><i /><i /><i /><i />
    </span>
  )
}

export default function KairosAgent({ adminToken, adminUser, onSessionExpired, onRequestLogin }) {
  const [messages, setMessages] = useState(loadHistory)
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const [autoRead, setAutoRead] = useState(loadAutoRead)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const speech = useSpeech()
  const scrollRef = useRef(null)
  const inputRef = useRef(null)
  const stickToBottom = useRef(true)
  const generationRef = useRef(0) // bumps on clear so in-flight replies are discarded

  useEffect(() => {
    try {
      // Records are re-derivable; keep the persisted session history small
      sessionStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-40)))
    } catch { /* storage unavailable — history is in-memory only */ }
  }, [messages])

  useEffect(() => {
    try { localStorage.setItem(AUTOREAD_KEY, autoRead ? 'on' : 'off') } catch { /* ignore */ }
  }, [autoRead])

  const scrollToBottom = useCallback((smooth = true) => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
  }, [])

  useEffect(() => {
    if (stickToBottom.current) scrollToBottom()
  }, [messages, pending, scrollToBottom])

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    stickToBottom.current = distance < 120
    setShowScrollBtn(distance > 240)
  }

  const request = useCallback(async (history) => {
    const gen = generationRef.current
    setPending(true)
    stickToBottom.current = true
    const headers = { 'Content-Type': 'application/json' }
    if (adminToken) headers.Authorization = `Bearer ${adminToken}`
    const payload = history
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-CONTEXT_TURNS)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 6000) }))

    const pushError = (content, kind = 'error') => {
      if (gen !== generationRef.current) return
      setMessages((prev) => [...prev, { id: newId(), role: 'error', kind, content }])
    }

    try {
      const res = await fetch('/api/agent/chat', { method: 'POST', headers, body: JSON.stringify({ messages: payload }) })
      if (res.status === 401) {
        onSessionExpired?.()
        pushError('Your administrator session has expired. Sign in again to use admin data — you can keep chatting as a guest.', 'auth')
        return
      }
      if (res.status === 429) {
        pushError('Too many requests in a short time. Please wait a moment and retry.')
        return
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        pushError(typeof err.detail === 'string' ? err.detail : 'KAIROS AI could not process that request.')
        return
      }
      const data = await res.json()
      if (gen !== generationRef.current) return
      const reply = (data.reply || '').trim()
      if (!reply) {
        pushError('KAIROS AI returned an empty response. Please retry.')
        return
      }
      const msg = {
        id: newId(),
        role: 'assistant',
        content: reply,
        tools: [...new Set(data.tools_used || [])],
        records: data.records || [],
        engine: data.engine,
        notice: data.notice || '',
        actionPreview: data.action_preview || null
      }
      setMessages((prev) => [...prev, msg])
      if (autoRead) speech.speak(msg.id, reply)
    } catch {
      pushError("Can't reach the KAIROS server. Check your connection and retry.")
    } finally {
      if (gen === generationRef.current) setPending(false)
    }
  }, [adminToken, autoRead, onSessionExpired, speech])

  const send = (text) => {
    const clean = (text ?? input).trim()
    if (!clean || pending) return
    const userMsg = { id: newId(), role: 'user', content: clean.slice(0, 2000) }
    const next = [...messages.filter((m) => m.role !== 'error'), userMsg]
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    request(next)
  }

  const retry = (errorId) => {
    const history = messages.filter((m) => m.role !== 'error')
    setMessages((prev) => prev.filter((m) => m.id !== errorId))
    if (history.length && history[history.length - 1].role === 'user') request(history)
  }

  const clearConversation = () => {
    generationRef.current += 1
    setPending(false)
    speech.stop()
    speech.releaseCache()
    setMessages([])
    inputRef.current?.focus()
  }

  const applySuggestion = (s) => {
    if (s.endsWith(' ')) {
      setInput(s)
      inputRef.current?.focus()
    } else {
      send(s)
    }
  }

  const lastAssistantId = [...messages].reverse().find((m) => m.role === 'assistant')?.id
  const speakingNow = speech.status === 'playing'
  const suggestions = adminUser ? ADMIN_SUGGESTIONS : GUEST_SUGGESTIONS

  return (
    <div className="agent-page">
      <div className="agent-shell">
        <header className="agent-header">
          <div className="agent-identity">
            <span className={`agent-orb${speakingNow ? ' speaking' : ''}${pending ? ' thinking' : ''}`} aria-hidden="true">
              <Bot size={18} />
            </span>
            <div>
              <h1>KAIROS AI</h1>
              <p>
                {pending ? 'Understanding your request…' : speakingNow ? 'Reading response aloud' : adminUser ? 'Operational assistant · Admin access' : 'Operational assistant · Guest access'}
              </p>
            </div>
          </div>
          <div className="agent-header-actions">
            <label className="agent-toggle" title="Automatically read every new answer aloud">
              <input type="checkbox" checked={autoRead} onChange={(e) => setAutoRead(e.target.checked)} />
              <span className="agent-toggle-track" aria-hidden="true"><span /></span>
              <span className="agent-toggle-label">{autoRead ? <Volume2 size={14} /> : <VolumeX size={14} />} Auto read aloud</span>
            </label>
            <button type="button" className="agent-icon-btn" onClick={clearConversation} disabled={!messages.length && !pending} aria-label="Clear conversation" title="Clear conversation">
              <Trash2 size={15} />
            </button>
          </div>
        </header>

        {speech.needsUnlock && (
          <button type="button" className="agent-unlock-banner" onClick={speech.unlock}>
            <Volume2 size={14} /> Your browser blocked automatic audio. Tap here to enable voice.
          </button>
        )}

        <div className="agent-messages" ref={scrollRef} onScroll={handleScroll} role="log" aria-live="polite" aria-relevant="additions">
          {messages.length === 0 && !pending && (
            <div className="agent-empty">
              <span className="agent-empty-mark"><Sparkles size={22} /></span>
              <h2>Ask KAIROS anything</h2>
              <p>
                Answers about tickets, SLAs, departments and operations come from live KAIROS data.
                {!adminUser && (
                  <> Ticket lists and analytics need an <button type="button" className="agent-inline-link" onClick={onRequestLogin}>admin sign-in</button>.</>
                )}
              </p>
              <div className="agent-suggestions">
                {suggestions.map((s) => (
                  <button key={s} type="button" onClick={() => applySuggestion(s)}>{s.trim()}{s.endsWith(' ') ? '…' : ''}</button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => {
            if (m.role === 'user') {
              return (
                <div key={m.id} className="agent-msg user">
                  <div className="agent-bubble"><p>{m.content}</p></div>
                  <span className="agent-avatar" aria-hidden="true"><User size={14} /></span>
                </div>
              )
            }
            if (m.role === 'error') {
              return (
                <div key={m.id} className="agent-msg error" role="alert">
                  <span className="agent-avatar" aria-hidden="true"><AlertTriangle size={14} /></span>
                  <div className="agent-bubble">
                    <p>{m.content}</p>
                    <div className="agent-error-actions">
                      {m.kind === 'auth' ? (
                        <button type="button" onClick={onRequestLogin}>Sign in</button>
                      ) : (
                        <button type="button" onClick={() => retry(m.id)}><RotateCcw size={12} /> Retry</button>
                      )}
                    </div>
                  </div>
                </div>
              )
            }

            const isActive = speech.activeId === m.id
            const voiceError = speech.errors[m.id]
            return (
              <div key={m.id} className={`agent-msg assistant${isActive && speech.status !== 'idle' ? ' speaking' : ''}`}>
                <span className="agent-avatar ai" aria-hidden="true"><Bot size={14} /></span>
                <div className="agent-bubble">
                  {m.tools?.length > 0 && (
                    <div className="agent-tools">
                      <Database size={11} />
                      {m.tools.map((t) => <span key={t}>{TOOL_LABELS[t] || t}</span>)}
                    </div>
                  )}
                  <MarkdownMessage text={m.content} />
                  {m.records?.length > 0 && (
                    <div className="agent-records">
                      {m.records.map((t) => <TicketCard key={t.id} t={t} />)}
                    </div>
                  )}
                  {m.actionPreview && !m.actionResult && (
                    adminToken ? (
                      <ActionPreview
                        initialPreview={m.actionPreview}
                        actions={[]}
                        reason={m.actionPreview.reason}
                        adminToken={adminToken}
                        onDone={(r) => setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, actionResult: { executed: r.executed, failed: r.failed } } : x)))}
                      />
                    ) : <p className="agent-notice">Sign in as an administrator to confirm this action preview.</p>
                  )}
                  {m.actionResult && <p className="agent-notice">Action preview confirmed: {m.actionResult.executed} executed{m.actionResult.failed ? `, ${m.actionResult.failed} rejected` : ''} (audit-logged).</p>}
                  {m.notice && <p className="agent-notice">{m.notice}</p>}

                  <div className="agent-voice-row">
                    {isActive && speech.status === 'loading' && (
                      <span className="agent-voice-status"><span className="agent-spinner" /> Preparing voice…</span>
                    )}
                    {isActive && (speech.status === 'playing' || speech.status === 'paused') && (
                      <>
                        {speech.status === 'playing' ? <VoiceBars /> : <span className="agent-voice-status">Paused</span>}
                        <div className="agent-voice-progress" aria-hidden="true"><span style={{ width: `${Math.round(speech.progress * 100)}%` }} /></div>
                        {speech.status === 'playing' ? (
                          <button type="button" className="agent-voice-btn" onClick={speech.pause} aria-label="Pause reading"><Pause size={13} /></button>
                        ) : (
                          <button type="button" className="agent-voice-btn" onClick={speech.resume} aria-label="Resume reading"><Play size={13} /></button>
                        )}
                        <button type="button" className="agent-voice-btn" onClick={speech.stop} aria-label="Stop reading"><Square size={12} /></button>
                        <span className="agent-voice-engine">{speech.engine === 'gemini' ? 'Gemini voice' : 'Browser voice'}</span>
                      </>
                    )}
                    {!(isActive && speech.status !== 'idle') && (
                      <button type="button" className="agent-voice-btn labeled" onClick={() => speech.speak(m.id, m.content)} aria-label="Read this answer aloud">
                        {m.id === lastAssistantId && !voiceError ? <RotateCcw size={12} /> : <Volume2 size={13} />}
                        {m.id === lastAssistantId ? 'Replay' : 'Read aloud'}
                      </button>
                    )}
                    {voiceError && !isActive && <span className="agent-voice-error">{voiceError}</span>}
                  </div>
                </div>
              </div>
            )
          })}

          {pending && (
            <div className="agent-msg assistant pending" aria-label="KAIROS AI is thinking">
              <span className="agent-avatar ai" aria-hidden="true"><Bot size={14} /></span>
              <div className="agent-bubble">
                <span className="agent-thinking"><i /><i /><i /></span>
                <span className="agent-thinking-label">Understanding your request…</span>
              </div>
            </div>
          )}
        </div>

        {showScrollBtn && (
          <button type="button" className="agent-scroll-btn" onClick={() => { stickToBottom.current = true; scrollToBottom() }} aria-label="Scroll to latest message">
            <ArrowDown size={15} />
          </button>
        )}

        <form className="agent-composer" onSubmit={(e) => { e.preventDefault(); send() }}>
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            maxLength={2000}
            placeholder={adminUser ? 'Ask about tickets, SLAs, workload, audit history…' : 'Ask a question or a ticket ID like GRV-1042…'}
            aria-label="Message KAIROS AI"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                send()
              }
            }}
          />
          {input.length > 1800 && <span className="agent-char-count">{input.length}/2000</span>}
          <button type="submit" className="agent-send-btn" disabled={!input.trim() || pending} aria-label="Send message">
            <Send size={16} />
          </button>
        </form>
        <p className="agent-disclaimer">KAIROS AI answers from live campus data and never invents ticket records. Voice reads the exact answer shown.</p>
      </div>
    </div>
  )
}
