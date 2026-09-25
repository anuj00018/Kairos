import React, { useEffect } from 'react'
import { Settings, Palette, Check, Shield, Database, X, Sparkles, Moon, Sun, Briefcase } from 'lucide-react'

export const THEMES = [
  {
    id: 'black-white',
    name: 'Black & White',
    subtitle: 'High-Contrast Dark Monochrome',
    description: 'Current default Stark aesthetic. Pitch black surfaces with pure white typography and high-contrast indicators.',
    icon: Moon,
    previewBg: '#080808',
    previewBorder: '#ffffff',
    previewAccent: '#ffffff',
    previewText: '#ffffff'
  },
  {
    id: 'white-black',
    name: 'White & Black',
    subtitle: 'Crisp High-Contrast Light Mode',
    description: 'Inverted clean daylight aesthetic. Clean white cards, dark slate borders, and deep black typography for high-ambient lighting.',
    icon: Sun,
    previewBg: '#f8fafc',
    previewBorder: '#cbd5e1',
    previewAccent: '#0f172a',
    previewText: '#0f172a'
  },
  {
    id: 'professional-color',
    name: 'Professional Color',
    subtitle: 'Institutional Enterprise Palette',
    description: 'Restrained, serious palette tailored for universities and operations centers. Deep slate-navy surfaces with cobalt and teal highlights.',
    icon: Briefcase,
    previewBg: '#0f172a',
    previewBorder: '#3b82f6',
    previewAccent: '#2563eb',
    previewText: '#f8fafc'
  }
]

export default function SettingsModal({ isOpen, onClose, currentTheme, onSelectTheme, adminUser, dbStatus }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="settings-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="settings-modal-header">
          <div className="settings-header-title">
            <span className="settings-icon-mark">
              <Settings size={18} />
            </span>
            <div>
              <h3>System Settings & Appearance</h3>
              <p>Customize portal theme, display preferences, and view operational profile</p>
            </div>
          </div>
          <button className="settings-close-btn" onClick={onClose} title="Close Settings">
            <X size={16} />
          </button>
        </div>

        <div className="settings-modal-body">
          {/* User Identity Section */}
          <div className="settings-section">
            <div className="settings-section-header">
              <Shield size={14} />
              <h4>Identity & Role Context</h4>
            </div>
            <div className="settings-profile-card">
              <div className="settings-avatar-circle">
                {adminUser ? (adminUser.avatar_initials || 'AD') : 'ST'}
              </div>
              <div className="settings-profile-info">
                <strong>{adminUser ? adminUser.name : 'Student / Public User'}</strong>
                <span>{adminUser ? adminUser.role : 'Complainant Guest Mode'}</span>
                <small>{adminUser ? adminUser.department : 'General Campus Portal'}</small>
              </div>
              <div className="settings-profile-badge">
                {adminUser ? 'Full Administrative Access' : 'Read-Only Intake'}
              </div>
            </div>
          </div>

          {/* Theme Selection Section */}
          <div className="settings-section">
            <div className="settings-section-header">
              <Palette size={14} />
              <h4>Theme & Visual Styling</h4>
              <span className="section-badge">Applies Everywhere</span>
            </div>

            <div className="theme-grid">
              {THEMES.map((theme) => {
                const isSelected = currentTheme === theme.id
                const ThemeIcon = theme.icon

                return (
                  <button
                    key={theme.id}
                    type="button"
                    className={`theme-card-option ${isSelected ? 'selected' : ''}`}
                    onClick={() => onSelectTheme(theme.id)}
                  >
                    <div className="theme-card-top">
                      <div className="theme-swatch-box" style={{ background: theme.previewBg, borderColor: theme.previewBorder }}>
                        <div className="theme-swatch-bar" style={{ background: theme.previewAccent }} />
                        <div className="theme-swatch-dot" style={{ background: theme.previewText }} />
                      </div>
                      <div className="theme-name-group">
                        <div className="theme-title-row">
                          <ThemeIcon size={14} />
                          <strong>{theme.name}</strong>
                        </div>
                        <span className="theme-subtitle">{theme.subtitle}</span>
                      </div>
                      <div className="theme-select-indicator">
                        {isSelected && <Check size={14} />}
                      </div>
                    </div>
                    <p className="theme-description">{theme.description}</p>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Documentation & Downloads Section */}
          <div className="settings-section">
            <div className="settings-section-header">
              <Database size={14} />
              <h4>Official Platform Documentation</h4>
              <span className="section-badge" style={{ background: 'rgba(37,99,235,0.15)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)' }}>PDF Available</span>
            </div>
            <div style={{ marginTop: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong style={{ fontSize: '13px', display: 'block', marginBottom: '2px' }}>KAIROS Master PRD & TRD Specification</strong>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Complete 400KB+ PDF with product details, architecture, data contracts & security models</span>
              </div>
              <a
                href="/KAIROS_Complete_Product_and_Technical_Documentation.pdf"
                download="KAIROS_Complete_Product_and_Technical_Documentation.pdf"
                className="primary-button"
                style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '6px 12px' }}
              >
                <span>Download PDF</span>
              </a>
            </div>
          </div>

          {/* Database / Operational Status */}
          <div className="settings-section">
            <div className="settings-section-header">
              <Database size={14} />
              <h4>Active Infrastructure</h4>
            </div>
            <div className="settings-infra-row">
              <div className="infra-col">
                <small>Engine</small>
                <strong>{dbStatus?.engine?.toUpperCase() || 'POSTGRESQL'}</strong>
              </div>
              <div className="infra-col">
                <small>Connected Host</small>
                <span>{dbStatus?.is_postgres ? 'Render Managed Cloud DB' : 'Embedded DB'}</span>
              </div>
              <div className="infra-col">
                <small>Auto-Sync</small>
                <span className="status-live">● Real-time Polling (3s)</span>
              </div>
            </div>
          </div>
        </div>

        <div className="settings-modal-footer">
          <span className="settings-footer-hint">Settings are saved locally and persist across re-logins and reloads.</span>
          <button className="primary-button settings-done-btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
