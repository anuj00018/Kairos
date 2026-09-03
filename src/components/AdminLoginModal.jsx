import React, { useState } from 'react'
import { KeyRound, Lock, Shield, User, X, ArrowRight, ShieldCheck, RefreshCw } from 'lucide-react'

export default function AdminLoginModal({ isOpen, onClose, onLoginSuccess, currentAdmin, onPasswordChanged }) {
  const [mode, setMode] = useState('login') // 'login' or 'change_password'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  if (!isOpen) return null

  const handleLogin = async (e) => {
    if (e) e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password: password.trim() })
      })

      if (res.ok) {
        const data = await res.json()
        onLoginSuccess(data)
        setPassword('')
        onClose()
      } else {
        const err = await res.json().catch(() => ({}))
        setError(err.detail || 'Authentication failed. Please verify credentials.')
      }
    } catch (err) {
      setError('Unable to reach server. Please check network connectivity.')
    } finally {
      setLoading(false)
    }
  }

  const handleChangePassword = async (e) => {
    if (e) e.preventDefault()
    setError('')
    setSuccess('')

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long.')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.')
      return
    }

    setLoading(true)
    try {
      const token = localStorage.getItem('kairos_admin_token')
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          old_password: oldPassword,
          new_password: newPassword
        })
      })

      if (res.ok) {
        setSuccess('Password updated successfully!')
        setOldPassword('')
        setNewPassword('')
        setConfirmPassword('')
        if (onPasswordChanged) onPasswordChanged()
        setTimeout(() => {
          setMode('login')
          onClose()
        }, 1500)
      } else {
        const err = await res.json().catch(() => ({}))
        setError(err.detail || 'Failed to update password. Verify your current password.')
      }
    } catch (err) {
      setError('Network error updating password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="admin-login-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header-3d">
          <div className="header-badge-row">
            <span className="auth-lock-badge">
              <ShieldCheck size={14} />
              {mode === 'login' ? 'Administrator Authentication' : 'Account Security'}
            </span>
            <button className="close-modal-btn" onClick={onClose} aria-label="Close modal">
              <X size={16} />
            </button>
          </div>
          <h2>{mode === 'login' ? 'Admin Portal Sign-In' : 'Change Admin Password'}</h2>
          <p>
            {mode === 'login'
              ? 'Authorized campus operations staff only. Credentials are authenticated with server-side bcrypt verification.'
              : 'Update your administrator password securely. Must contain at least 8 characters.'}
          </p>
        </div>

        {currentAdmin && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <button
              type="button"
              className={mode === 'login' ? 'view-toggle-btn active' : 'view-toggle-btn'}
              onClick={() => { setMode('login'); setError(''); setSuccess(''); }}
              style={{ flex: 1, padding: '8px', fontSize: '12px' }}
            >
              Session Info
            </button>
            <button
              type="button"
              className={mode === 'change_password' ? 'view-toggle-btn active' : 'view-toggle-btn'}
              onClick={() => { setMode('change_password'); setError(''); setSuccess(''); }}
              style={{ flex: 1, padding: '8px', fontSize: '12px' }}
            >
              Change Password
            </button>
          </div>
        )}

        {error && <div className="auth-error-banner">{error}</div>}
        {success && <div className="auth-error-banner" style={{ background: '#1c1c1c', borderColor: '#444', color: '#fff' }}>{success}</div>}

        {mode === 'login' ? (
          <form onSubmit={handleLogin} className="login-form-3d">
            <div className="input-group-3d">
              <label>
                <User size={13} />
                Admin Username
              </label>
              <input
                type="text"
                placeholder="Enter administrator ID"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </div>

            <div className="input-group-3d">
              <label>
                <Lock size={13} />
                Password
              </label>
              <input
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            <button type="submit" className="login-submit-btn" disabled={loading || !username || !password}>
              {loading ? 'Verifying Credentials...' : 'Authenticate as Administrator'}
              <ArrowRight size={15} />
            </button>
          </form>
        ) : (
          <form onSubmit={handleChangePassword} className="login-form-3d">
            <div className="input-group-3d">
              <label>
                <Lock size={13} />
                Current Password
              </label>
              <input
                type="password"
                placeholder="Current administrator password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                required
              />
            </div>

            <div className="input-group-3d">
              <label>
                <KeyRound size={13} />
                New Password (min 8 chars)
              </label>
              <input
                type="password"
                placeholder="New strong password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>

            <div className="input-group-3d">
              <label>
                <ShieldCheck size={13} />
                Confirm New Password
              </label>
              <input
                type="password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="login-submit-btn" disabled={loading || !oldPassword || !newPassword}>
              {loading ? 'Updating Password...' : 'Save New Password'}
              <ArrowRight size={15} />
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
