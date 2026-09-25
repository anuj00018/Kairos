import React, { useState } from 'react'
import { AlertCircle, AlertTriangle, Bell, Plus, Radio, Trash2, X } from 'lucide-react'
import useModalA11y from '../hooks/useModalA11y'

export default function BroadcastBanner({ broadcasts = [], onDismiss, onCreateBroadcast, isAdmin }) {
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [level, setLevel] = useState('warning')
  const [sector, setSector] = useState('Campus-Wide')
  const modalRef = useModalA11y(showCreateModal, () => setShowCreateModal(false))

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!title.trim() || !message.trim()) return
    onCreateBroadcast({ title, message, level, sector })
    setTitle('')
    setMessage('')
    setShowCreateModal(false)
  }

  if (broadcasts.length === 0 && !isAdmin) return null

  return (
    <div className="broadcast-wrapper">
      {broadcasts.map((b) => (
        <div key={b.id} className={`broadcast-banner-3d ${b.level}`}>
          <div className="broadcast-content">
            <span className="broadcast-icon">
              <Radio size={14} className="pulse-radio" />
            </span>
            <div className="broadcast-text">
              <strong>{b.title}</strong>
              <span className="broadcast-sector">&bull; {b.sector}</span>
              <p>{b.message}</p>
            </div>
          </div>
          <div className="broadcast-actions">
            <small>{b.created_at}</small>
            {isAdmin && (
              <button
                className="dismiss-broadcast-btn"
                onClick={() => onDismiss(b.id)}
                title="Dismiss Broadcast"
                aria-label={`Dismiss broadcast: ${b.title}`}
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      ))}

      {/* Admin Broadcast Trigger Toolbar */}
      {isAdmin && (
        <div className="admin-broadcast-toolbar">
          <button
            className="new-broadcast-btn"
            onClick={() => setShowCreateModal(true)}
          >
            <Plus size={12} />
            Post Emergency Campus Broadcast
          </button>
        </div>
      )}

      {/* Create Broadcast Modal */}
      {showCreateModal && (
        <div className="modal-backdrop" onClick={() => setShowCreateModal(false)}>
          <div
            className="admin-login-modal"
            onClick={(e) => e.stopPropagation()}
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="broadcast-modal-title"
          >
            <div className="modal-header-3d">
              <div className="header-badge-row">
                <span className="auth-lock-badge">
                  <Radio size={14} />
                  Emergency Broadcast Transceiver
                </span>
                <button className="close-modal-btn" onClick={() => setShowCreateModal(false)} aria-label="Close modal">
                  <X size={16} />
                </button>
              </div>
              <h2 id="broadcast-modal-title">Publish Campus-Wide Advisory</h2>
              <p>Broadcasts will pin immediately to all student portals and executive operations dashboards.</p>
            </div>

            <form onSubmit={handleSubmit} className="login-form-3d">
              <div className="input-group-3d">
                <label>Advisory Title</label>
                <input
                  type="text"
                  placeholder="e.g. Power Grid Maintenance in CSE Block"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              <div className="input-group-3d">
                <label>Affected Sector / Location</label>
                <input
                  type="text"
                  placeholder="e.g. North Hostel Walkway or Campus-Wide"
                  value={sector}
                  onChange={(e) => setSector(e.target.value)}
                  required
                />
              </div>

              <div className="input-group-3d">
                <label>Advisory Severity Level</label>
                <select value={level} onChange={(e) => setLevel(e.target.value)}>
                  <option value="warning">Maintenance Advisory (High Visibility)</option>
                  <option value="critical">Critical Safety Warning (Immediate Action)</option>
                  <option value="info">General Informational Notice</option>
                </select>
              </div>

              <div className="input-group-3d">
                <label>Broadcast Message Details</label>
                <textarea
                  rows={3}
                  placeholder="Provide brief instructions and estimated duration..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                />
              </div>

              <div className="modal-actions-row">
                <button type="button" className="btn-cancel" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="login-submit-btn">
                  Publish Broadcast
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

