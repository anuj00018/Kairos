import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Cpu,
  Database,
  Download,
  Edit3,
  Eye,
  FileImage,
  Filter,
  Flame,
  Globe,
  Grid,
  History,
  Info,
  KeyRound,
  Layers,
  LayoutDashboard,
  LogOut,
  MapPin,
  MessageSquare,
  Palette,
  Plus,
  Radio,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Truck,
  User,
  UserCheck,
  Users,
  Wrench,
  X,
  Zap
} from 'lucide-react'
import AdminLoginModal from './components/AdminLoginModal'
import SettingsModal from './components/SettingsModal'
import BroadcastBanner from './components/BroadcastBanner'
import AnalyticsStudio from './components/AnalyticsStudio'
import AuditExplorer from './components/AuditExplorer'
import waterLeakImage from './assets/water-leak.png'
import './App.css'

const STAFF_MEMBERS = [
  'R. Mahesh (Facilities)',
  'S. Ramesh (Electrical)',
  'K. Srilatha (Housekeeping)',
  'A. Sharma (IT Infrastructure)',
  'P. Kumar (Security)',
  'K. Anand (Facilities)',
  'V. Murugan (Hostel Admin)',
  'Unassigned'
]

const LOCATIONS = [
  'CSE Block, Ground Floor',
  'CSE Block, 2nd Floor Labs',
  'Mechanical Workshop, Bay 2',
  'North Hostel Walkway',
  'South Hostel Block B, Floor 1',
  'Central Cafeteria',
  'Central Library, Reading Room',
  'Main Gate & Security Post',
  'Sports Complex & Gymnasium',
  'Admin Block, Dean Office Corridor'
]

const CATEGORIES = ['Water', 'Electrical', 'Security', 'Sanitation', 'Infrastructure', 'Network']
const PRIORITIES = ['Critical', 'High', 'Medium', 'Low']
const DEPARTMENTS = ['Facilities', 'Electrical Maintenance', 'Security', 'Housekeeping', 'IT Infrastructure', 'Hostel Administration']

function Tag({ type, children }) {
  if (!children) return null
  return <span className={`tag ${type}-${String(children).toLowerCase().replaceAll(' ', '-')}`}>{children}</span>
}

export default function App() {
  const [adminToken, setAdminToken] = useState(() => localStorage.getItem('kairos_admin_token') || '')
  const [adminUser, setAdminUser] = useState(() => {
    try {
      const stored = localStorage.getItem('kairos_admin_user')
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  })
  const [page, setPage] = useState(() => (localStorage.getItem('kairos_admin_token') ? 'operations' : 'report'))
  const [tickets, setTickets] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [filters, setFilters] = useState({ status: 'All', priority: 'All', department: 'All', location: 'All', search: '' })
  const [form, setForm] = useState({
    title: '',
    description: '',
    location: LOCATIONS[0],
    category: 'Infrastructure',
    priority: 'Medium',
    department: 'Facilities',
    recommended_action: 'Inspect on-site'
  })
  const [manualLocation, setManualLocation] = useState(false)
  const [showManualSection, setShowManualSection] = useState(false)
  const [manualOverrides, setManualOverrides] = useState({
    title: false,
    category: false,
    priority: false,
    department: false,
    location: false,
    recommended_action: false
  })
  const [preview, setPreview] = useState('')
  const [notice, setNotice] = useState('')
  const [analytics, setAnalytics] = useState(null)
  const [broadcasts, setBroadcasts] = useState([])
  const [isTriaging, setIsTriaging] = useState(false)
  const [triagePreview, setTriagePreview] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [adminNote, setAdminNote] = useState('')
  const [backendOnline, setBackendOnline] = useState(true)
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false)

  // 3 Professional Themes: 'black-white', 'white-black', 'professional-color'
  const [currentTheme, setCurrentTheme] = useState(() => {
    return localStorage.getItem('kairos_theme') || 'black-white'
  })

  // Set of newly arrived ticket IDs for subtle professional highlight
  const [newTicketIds, setNewTicketIds] = useState(() => new Set())

  // Persist and apply theme globally
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', currentTheme)
    localStorage.setItem('kairos_theme', currentTheme)
  }, [currentTheme])

  // Student Public Grievance Tracking State
  const [trackIdInput, setTrackIdInput] = useState('')
  const [trackedTicket, setTrackedTicket] = useState(null)
  const [trackLoading, setTrackLoading] = useState(false)
  const [trackError, setTrackError] = useState('')

  // Bulk Selection State
  const [selectedTicketIds, setSelectedTicketIds] = useState([])
  const [bulkStatus, setBulkStatus] = useState('In Progress')
  const [bulkOwner, setBulkOwner] = useState(STAFF_MEMBERS[0])

  const showNotice = (msg) => {
    setNotice(msg)
    window.setTimeout(() => setNotice(''), 4000)
  }

  const handleLoginSuccess = (data) => {
    setAdminToken(data.token)
    setAdminUser(data.user)
    localStorage.setItem('kairos_admin_token', data.token)
    localStorage.setItem('kairos_admin_user', JSON.stringify(data.user))
    setPage('operations')
    showNotice(`Administrator session established: ${data.user.name}`)
  }

  const handleLogout = async () => {
    if (adminToken) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${adminToken}` }
        })
      } catch {}
    }
    setAdminToken('')
    setAdminUser(null)
    setTickets([])
    setAnalytics(null)
    localStorage.removeItem('kairos_admin_token')
    localStorage.removeItem('kairos_admin_user')
    setPage('report')
    showNotice('Administrator session terminated. Switched to public student view.')
  }

  // Load analytics (Protected)
  const fetchAnalytics = useCallback(async () => {
    if (!adminToken) {
      setAnalytics(null)
      return
    }
    try {
      const res = await fetch('/api/analytics/pulse', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      })
      if (res.ok) {
        const data = await res.json()
        setAnalytics(data)
      }
    } catch (err) {
      console.warn('Analytics endpoint offline:', err)
    }
  }, [adminToken])

  // Load tickets from FastAPI backend (Protected: requires admin token)
  const fetchTickets = useCallback(async () => {
    if (!adminToken) {
      setTickets([])
      return
    }
    try {
      const res = await fetch('/api/tickets', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      })
      if (res.ok) {
        const data = await res.json()
        setTickets((curr) => {
          if (curr && curr.length > 0) {
            const existingIds = new Set(curr.map((t) => t.id))
            const incomingNew = data.filter((t) => !existingIds.has(t.id)).map((t) => t.id)
            if (incomingNew.length > 0) {
              setNewTicketIds((prev) => {
                const next = new Set(prev)
                incomingNew.forEach((id) => next.add(id))
                return next
              })
              setSelectedId(incomingNew[0])
              fetchAnalytics()
            }
          }
          return data
        })
        if (data.length > 0) {
          setSelectedId((curr) => (!curr || !data.find(t => t.id === curr) ? data[0].id : curr))
        }
        setBackendOnline(true)
      } else if (res.status === 401) {
        // Token invalid or expired
        setAdminToken('')
        setAdminUser(null)
        localStorage.removeItem('kairos_admin_token')
        localStorage.removeItem('kairos_admin_user')
        showNotice('Admin session expired. Please sign in again.')
      } else {
        throw new Error('Backend returned status ' + res.status)
      }
    } catch (err) {
      console.warn('Backend API unavailable:', err)
      setBackendOnline(false)
    }
  }, [adminToken, fetchAnalytics])

  // Load broadcasts (Public emergency alerts)
  const fetchBroadcasts = useCallback(async () => {
    try {
      const res = await fetch('/api/broadcasts')
      if (res.ok) {
        const data = await res.json()
        setBroadcasts(data)
      }
    } catch (err) {
      console.warn('Broadcasts endpoint offline:', err)
    }
  }, [])

  // Load database engine status
  const [dbStatus, setDbStatus] = useState(null)
  const fetchDbStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/database/status')
      if (res.ok) {
        const data = await res.json()
        setDbStatus(data)
      }
    } catch (e) {
      console.warn('Database status offline:', e)
    }
  }, [])

  useEffect(() => {
    if (adminToken) {
      fetchTickets()
      fetchAnalytics()
    }
    fetchBroadcasts()
    fetchDbStatus()
  }, [fetchTickets, fetchAnalytics, fetchBroadcasts, fetchDbStatus, adminToken])

  // Real-time Operations Hub auto-sync polling: pulls new tickets automatically
  useEffect(() => {
    if (!adminToken) return
    const interval = setInterval(() => {
      fetchTickets()
      fetchAnalytics()
    }, 3000)
    return () => clearInterval(interval)
  }, [adminToken, fetchTickets, fetchAnalytics])

  // Public Student Ticket Tracking Handler
  const handleTrackTicket = async (e) => {
    if (e) e.preventDefault()
    const cleanId = trackIdInput.trim().toUpperCase()
    if (!cleanId) return

    setTrackLoading(true)
    setTrackError('')
    setTrackedTicket(null)

    try {
      const res = await fetch(`/api/tickets/${cleanId}`)
      if (res.ok) {
        const data = await res.json()
        setTrackedTicket(data)
      } else {
        setTrackError(`Grievance ticket "${cleanId}" was not found. Please verify the ID.`)
      }
    } catch (err) {
      setTrackError('Failed to connect to server. Please try again.')
    } finally {
      setTrackLoading(false)
    }
  }

  const selected = tickets.find((ticket) => ticket.id === selectedId) || tickets[0] || null

  const shown = useMemo(() => {
    const filtered = tickets.filter((ticket) => {
      const matchStatus = filters.status === 'All' || ticket.status === filters.status
      const matchPriority = filters.priority === 'All' || ticket.priority === filters.priority
      const matchDept = filters.department === 'All' || ticket.department === filters.department
      const matchLoc = filters.location === 'All' || ticket.location === filters.location
      const matchSearch = !filters.search || 
        ticket.title.toLowerCase().includes(filters.search.toLowerCase()) ||
        ticket.id.toLowerCase().includes(filters.search.toLowerCase()) ||
        ticket.location.toLowerCase().includes(filters.search.toLowerCase()) ||
        ticket.description.toLowerCase().includes(filters.search.toLowerCase())
      return matchStatus && matchPriority && matchDept && matchLoc && matchSearch
    })

    // Float newly created/arrived tickets to the very top, while preserving relative order
    return [...filtered].sort((a, b) => {
      const aIsNew = newTicketIds.has(a.id) ? 1 : 0
      const bIsNew = newTicketIds.has(b.id) ? 1 : 0
      if (aIsNew !== bIsNew) return bIsNew - aIsNew
      return 0
    })
  }, [tickets, filters, newTicketIds])

  // Metrics summary
  const metrics = useMemo(() => {
    if (analytics?.metrics) return analytics.metrics
    const open = tickets.filter((t) => !['Resolved', 'Closed'].includes(t.status)).length
    const critical = tickets.filter((t) => t.priority === 'Critical' && !['Resolved', 'Closed'].includes(t.status)).length
    const breached = tickets.filter((t) => t.is_breached || (t.due && t.due.includes('breached'))).length
    const resolved = tickets.filter((t) => ['Resolved', 'Closed'].includes(t.status)).length
    return { open_tickets: open, critical_action: critical, sla_breached: breached, resolved_today: resolved }
  }, [tickets, analytics])

  // Single Ticket Status Change (Protected)
  const handleStatusChange = async (ticketId, nextStatus) => {
    if (!adminToken) {
      showNotice('Admin authentication required to change status.')
      setShowLoginModal(true)
      return
    }
    try {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({ status: nextStatus })
      })
      if (res.ok) {
        const updated = await res.json()
        setTickets((curr) => curr.map((t) => (t.id === ticketId ? updated : t)))
        showNotice(`${ticketId} status updated to ${nextStatus}`)
        fetchAnalytics()
        return
      } else {
        const err = await res.json().catch(() => ({}))
        showNotice(err.detail || 'Status transition rejected.')
      }
    } catch (e) {
      console.warn('Backend update failed:', e)
      showNotice('Update failed. Check connection.')
    }
  }

  // Single Owner Reassignment (Protected)
  const handleOwnerChange = async (ticketId, nextOwner) => {
    if (!adminToken) {
      showNotice('Admin authentication required to assign staff.')
      setShowLoginModal(true)
      return
    }
    try {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({ owner: nextOwner })
      })
      if (res.ok) {
        const updated = await res.json()
        setTickets((curr) => curr.map((t) => (t.id === ticketId ? updated : t)))
        showNotice(`Assigned ${ticketId} to ${nextOwner}`)
        fetchAnalytics()
        return
      }
    } catch (e) {
      console.warn('Backend update failed:', e)
    }
  }

  // Add Operational Note (Protected)
  const handleAddNote = async (ticketId) => {
    if (!adminNote.trim()) return
    if (!adminToken) {
      showNotice('Admin authentication required.')
      setShowLoginModal(true)
      return
    }
    const noteText = adminNote.trim()

    try {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({ comment: noteText })
      })
      if (res.ok) {
        const updated = await res.json()
        setTickets((curr) => curr.map((t) => (t.id === ticketId ? updated : t)))
        setAdminNote('')
        showNotice(`Directive appended to ${ticketId}`)
        return
      }
    } catch (e) {
      console.warn('Backend note submission failed:', e)
    }
  }

  // Bulk Update (Protected)
  const handleBulkUpdate = async () => {
    if (selectedTicketIds.length === 0) return
    if (!adminToken) {
      showNotice('Admin authentication required for bulk actions.')
      setShowLoginModal(true)
      return
    }
    try {
      const res = await fetch('/api/tickets/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          ticket_ids: selectedTicketIds,
          status: bulkStatus,
          owner: bulkOwner,
          comment: `Batch updated by ${adminUser?.name || 'Admin'}`
        })
      })
      if (res.ok) {
        showNotice(`Bulk updated ${selectedTicketIds.length} tickets`)
        fetchTickets()
        fetchAnalytics()
        setSelectedTicketIds([])
        return
      }
    } catch (e) {
      console.warn('Bulk update failed:', e)
    }
  }

  // Broadcast Actions (Protected)
  const handleDismissBroadcast = async (alertId) => {
    if (!adminToken) return
    try {
      await fetch(`/api/broadcasts/${alertId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      })
      setBroadcasts(prev => prev.filter(b => b.id !== alertId))
      showNotice(`Broadcast ${alertId} dismissed`)
    } catch (e) {
      setBroadcasts(prev => prev.filter(b => b.id !== alertId))
    }
  }

  const handleCreateBroadcast = async (data) => {
    if (!adminToken) {
      showNotice('Admin authentication required to post emergency alerts.')
      setShowLoginModal(true)
      return
    }
    try {
      const res = await fetch('/api/broadcasts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify(data)
      })
      if (res.ok) {
        fetchBroadcasts()
        showNotice('Emergency broadcast published campus-wide')
      }
    } catch (e) {
      showNotice('Failed to publish broadcast')
    }
  }

  // AI Triage Simulation (Public)
  const handleRunTriage = async () => {
    if (!form.description || form.description.length < 5) {
      showNotice('Please enter a detailed description first.')
      return
    }
    setIsTriaging(true)
    try {
      const res = await fetch('/api/tickets/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: form.description,
          location: form.location,
          image: preview || null
        })
      })
      if (res.ok) {
        const triageData = await res.json()
        setTriagePreview(triageData)
        setForm((prev) => ({
          ...prev,
          title: prev.title || triageData.title,
          category: triageData.category,
          priority: triageData.priority,
          department: triageData.department,
          recommended_action: triageData.recommended_action || prev.recommended_action
        }))
        setShowManualSection(true)
        showNotice(`AI classified as ${triageData.category} (${triageData.priority}) — review or edit manually below!`)
        setIsTriaging(false)
        return
      }
    } catch (e) {
      console.warn('AI Triage endpoint fallback:', e)
      showNotice('AI triage unavailable. Manual classification enabled.')
      setShowManualSection(true)
    }

    // Client Heuristic Fallback
    const text = form.description.toLowerCase()
    let cat = 'Infrastructure'
    let pri = 'Medium'
    let dept = 'Facilities'
    let sla = 24
    let action = 'Dispatch field technician for on-site assessment.'
    let rationale = 'Routine maintenance workflow.'

    if (text.includes('leak') || text.includes('water') || text.includes('washroom') || text.includes('pipe')) {
      cat = 'Water'
      pri = 'High'
      dept = 'Facilities'
      sla = 12
      action = 'Isolate water supply line and deploy plumbing crew.'
      rationale = 'Water leakage presents slip hazard and property damage.'
    } else if (text.includes('fire') || text.includes('hazard') || text.includes('spark') || text.includes('smoke')) {
      cat = 'Security'
      pri = 'Critical'
      dept = 'Security'
      sla = 2
      action = 'Isolate sector and dispatch emergency safety unit.'
      rationale = 'Immediate safety hazard requires rapid 2-hour containment.'
    } else if (text.includes('wifi') || text.includes('internet') || text.includes('network')) {
      cat = 'Network'
      pri = 'Medium'
      dept = 'IT Infrastructure'
      sla = 24
      action = 'Run diagnostic on sector wireless access points.'
      rationale = 'Campus connectivity disruption.'
    }

    const previewResult = {
      title: form.description.slice(0, 50) + '...',
      category: cat,
      priority: pri,
      department: dept,
      summary: `Automated classification for ${form.location}.`,
      recommended_action: action,
      priority_rationale: rationale,
      sla_hours: sla,
      triage_source: 'heuristic_engine'
    }

    setTriagePreview(previewResult)
    setForm((prev) => ({
      ...prev,
      title: prev.title || previewResult.title,
      category: cat,
      priority: pri,
      department: dept,
      recommended_action: action
    }))
    setShowManualSection(true)
    showNotice(`Classified as ${cat} (${pri}) — review or edit manually below!`)
    setIsTriaging(false)
  }

  // Handle Photo Upload (Secure File Validation)
  const handlePhotoUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    // 1. MIME Type Validation
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (!allowedMimeTypes.includes(file.type.toLowerCase())) {
      showNotice('Security Warning: Only valid PNG, JPEG, and WebP images are allowed.')
      e.target.value = ''
      return
    }

    // 2. File Size Limit (5MB)
    const maxSizeBytes = 5 * 1024 * 1024
    if (file.size > maxSizeBytes) {
      showNotice('File size limit exceeded: Photo must be under 5MB.')
      e.target.value = ''
      return
    }

    // 3. Read securely as data URL
    const reader = new FileReader()
    reader.onload = () => {
      setPreview(reader.result)
      showNotice('Grievance photo attached securely')
    }
    reader.onerror = () => {
      showNotice('Failed to read selected image file.')
    }
    reader.readAsDataURL(file)
  }

  // Submit Complaint
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.description || form.description.length < 5) return

    setIsSubmitting(true)
    const finalTitle = form.title?.trim() || triagePreview?.title || form.description.slice(0, 55)
    const finalLocation = form.location?.trim() || LOCATIONS[0]
    const finalCategory = form.category || triagePreview?.category || 'Infrastructure'
    const finalPriority = form.priority || triagePreview?.priority || 'Medium'
    const finalDepartment = form.department || triagePreview?.department || 'Facilities'
    const finalAction = form.recommended_action?.trim() || triagePreview?.recommended_action || 'Inspect on-site'
    const finalSummary = triagePreview?.summary || `Reported at ${finalLocation}`

    const payload = {
      description: form.description,
      location: finalLocation,
      image: preview || null,
      title: finalTitle,
      category: finalCategory,
      priority: finalPriority,
      department: finalDepartment,
      summary: finalSummary,
      recommended_action: finalAction,
      priority_rationale: triagePreview?.priority_rationale || (manualOverrides.priority ? 'Manual priority override by user' : 'Standard campus triage specification')
    }

    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (res.ok) {
        const created = await res.json()
        setTickets((curr) => [created, ...curr.filter(t => t.id !== created.id)])
        setNewTicketIds((prev) => new Set([...prev, created.id]))
        setSelectedId(created.id)
        showNotice(`${created.id} submitted and routed to ${created.department}!`)
        return
      }
    } catch (err) {
      console.warn('Backend ticket creation fallback:', err)
      const mockId = `GRV-${1001 + tickets.length}`
      const fallbackTicket = {
        id: mockId,
        title: payload.title,
        description: payload.description,
        location: payload.location,
        category: payload.category,
        priority: payload.priority,
        department: payload.department,
        status: 'New',
        owner: 'Unassigned',
        sla_hours: payload.priority === 'Critical' ? 2 : payload.priority === 'High' ? 12 : 24,
        created_at: 'Just now',
        resolved_at: null,
        image: payload.image,
        summary: payload.summary,
        action: payload.recommended_action,
        priority_rationale: payload.priority_rationale,
        due: payload.priority === 'Critical' ? 'Due in 2h' : 'Due in 24h',
        is_breached: false,
        activity: [
          {
            id: Date.now(),
            ticket_id: mockId,
            action: 'Complaint submitted through KAIROS portal',
            actor: 'Student / Complainant',
            created_at: 'Just now'
          },
          {
            id: Date.now() + 1,
            ticket_id: mockId,
            action: `Classified as ${payload.category} (${payload.priority}) and routed to ${payload.department}`,
            actor: 'KAIROS Triage',
            created_at: 'Just now'
          }
        ]
      }
      setTickets((curr) => [fallbackTicket, ...curr.filter(t => t.id !== fallbackTicket.id)])
      setNewTicketIds((prev) => new Set([...prev, fallbackTicket.id]))
      setSelectedId(mockId)
      showNotice(`${mockId} submitted and routed to ${payload.department}`)
    } finally {
      setIsSubmitting(false)
      setForm({
        title: '',
        description: '',
        location: LOCATIONS[0],
        category: 'Infrastructure',
        priority: 'Medium',
        department: 'Facilities',
        recommended_action: 'Inspect on-site'
      })
      setPreview('')
      setTriagePreview(null)
      setManualLocation(false)
      setShowManualSection(false)
      setManualOverrides({
        title: false,
        category: false,
        priority: false,
        department: false,
        location: false,
        recommended_action: false
      })
      setPage('operations')
      fetchAnalytics()
    }
  }

  // Clear all tickets (Protected: Admin Only)
  const handleClearTickets = async () => {
    if (!adminToken) {
      showNotice('Admin authentication required.')
      setShowLoginModal(true)
      return
    }
    if (!window.confirm('Are you sure you want to clear all complaints?')) return
    try {
      const res = await fetch('/api/tickets/clear', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      })
      if (res.ok) {
        setTickets([])
        setSelectedId(null)
        fetchAnalytics()
        showNotice('All complaints cleared. Ready for new reports.')
      } else {
        showNotice('Failed to clear complaints: Unauthorized')
      }
    } catch (e) {
      showNotice('Failed to clear complaints.')
    }
  }

  const toggleSelectTicket = (id) => {
    setSelectedTicketIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  const toggleSelectAll = () => {
    if (selectedTicketIds.length === shown.length) {
      setSelectedTicketIds([])
    } else {
      setSelectedTicketIds(shown.map(t => t.id))
    }
  }

  return (
    <main className="app-shell">
      {/* High-Contrast Black & White Sidebar */}
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Sparkles size={18} />
          </span>
          KAI<span className="brand-accent">ROS</span>
        </div>

        {/* User Profile / Settings & Appearance Area */}
        <div className="sidebar-auth-card">
          {adminUser ? (
            <div className="user-profile-badge">
              <div className="user-avatar-initials">{adminUser.avatar_initials || 'AD'}</div>
              <div className="user-badge-meta">
                <strong>{adminUser.name}</strong>
                <span>{adminUser.role}</span>
                <small className="badge-dept">{adminUser.department}</small>
              </div>
              <button className="sidebar-settings-btn" onClick={() => setShowSettingsModal(true)} title="Settings & Appearance">
                <Settings size={14} />
              </button>
              <button className="auth-logout-btn" onClick={handleLogout} title="Sign Out">
                <LogOut size={13} />
              </button>
            </div>
          ) : (
            <div className="guest-auth-prompt">
              <div className="guest-info">
                <Shield size={14} />
                <span>Guest / Student Mode</span>
                <button className="sidebar-settings-btn" onClick={() => setShowSettingsModal(true)} title="Settings & Appearance">
                  <Settings size={14} />
                </button>
              </div>
              <button className="sidebar-login-btn" onClick={() => setShowLoginModal(true)}>
                <KeyRound size={12} />
                Admin Portal Login
              </button>
            </div>
          )}
        </div>

        <p className="workspace-label">Navigation</p>
        <nav>
          <button
            className={page === 'report' ? 'nav-item active' : 'nav-item'}
            onClick={() => setPage('report')}
          >
            <Plus size={17} />
            Student Grievance Intake
          </button>
          <button
            className={page === 'operations' ? 'nav-item active' : 'nav-item'}
            onClick={() => {
              if (!adminUser) setShowLoginModal(true)
              setPage('operations')
            }}
          >
            <LayoutDashboard size={17} />
            Operations Hub
            {!adminUser && <small style={{ marginLeft: 'auto', fontSize: '10px', opacity: 0.6 }}>Restricted</small>}
          </button>
          <button
            className={page === 'analytics' ? 'nav-item active' : 'nav-item'}
            onClick={() => {
              if (!adminUser) setShowLoginModal(true)
              setPage('analytics')
            }}
          >
            <BarChart3 size={17} />
            Analytics Studio
            {!adminUser && <small style={{ marginLeft: 'auto', fontSize: '10px', opacity: 0.6 }}>Restricted</small>}
          </button>
          <button
            className={page === 'audit' ? 'nav-item active' : 'nav-item'}
            onClick={() => {
              if (!adminUser) setShowLoginModal(true)
              setPage('audit')
            }}
          >
            <History size={17} />
            Audit Logs
            {!adminUser && <small style={{ marginLeft: 'auto', fontSize: '10px', opacity: 0.6 }}>Restricted</small>}
          </button>
        </nav>

        <div className="sidebar-3d-stats">
          <div className="sidebar-stat-row">
            <span>SLA Adherence Rate</span>
            <strong>{metrics.sla_compliance_rate || 94.2}%</strong>
          </div>
          <div className="sidebar-meter">
            <b style={{ width: `${metrics.sla_compliance_rate || 94.2}%` }} />
          </div>

          {/* Theme Selector placed directly near SLA Adherence Rate */}
          <div className="sidebar-theme-quick-bar near-sla">
            <div className="sidebar-theme-header">
              <span>Theme Selector</span>
              <button type="button" onClick={() => setShowSettingsModal(true)} title="Open Full Settings & Profile Modal">
                <Palette size={11} />
                <span>Settings</span>
              </button>
            </div>
            <div className="sidebar-theme-chips">
              <button
                type="button"
                className={`theme-chip-btn ${currentTheme === 'black-white' ? 'active' : ''}`}
                onClick={() => setCurrentTheme('black-white')}
                title="Black & White (Current Default Theme)"
              >
                <span className="theme-dot-indicator" style={{ background: '#ffffff' }} />
                <span>B&W</span>
              </button>
              <button
                type="button"
                className={`theme-chip-btn ${currentTheme === 'white-black' ? 'active' : ''}`}
                onClick={() => setCurrentTheme('white-black')}
                title="White & Black (Light / Inverted Theme)"
              >
                <span className="theme-dot-indicator" style={{ background: '#09090b' }} />
                <span>W&B</span>
              </button>
              <button
                type="button"
                className={`theme-chip-btn ${currentTheme === 'professional-color' ? 'active' : ''}`}
                onClick={() => setCurrentTheme('professional-color')}
                title="Professional Color (Enterprise Navy & Slate)"
              >
                <span className="theme-dot-indicator" style={{ background: '#3b82f6' }} />
                <span>Color</span>
              </button>
            </div>
          </div>
        </div>

        <div className="sidebar-footer">
          <div className="service-state">
            <i className={backendOnline ? '' : 'offline'} />
            <span>{backendOnline ? 'Neural Engine Online' : 'Offline Mode'}</span>
          </div>

          <div className="db-engine-badge" title={dbStatus?.url || 'Database Engine'}>
            <Database size={11} />
            <span>{dbStatus?.is_postgres ? 'PostgreSQL 18 (:5432)' : 'SQLite Engine'}</span>
          </div>

          {adminUser && (
            <button className="reset-button" onClick={handleClearTickets} title="Wipe all complaints">
              <Trash2 size={12} />
              Clear All Complaints
            </button>
          )}
        </div>
      </aside>

      {/* Main Workspace Area */}
      <div className="workspace">
        {/* Topbar Header */}
        <header className="topbar">
          <div className="breadcrumb">
            <span>KAIROS</span>
            <ChevronRight size={14} />
            <strong>
              {page === 'operations' && 'Campus Grievance Operations Hub'}
              {page === 'analytics' && 'Executive Operational Analytics'}
              {page === 'audit' && 'System Audit Trail & Cryptographic Logs'}
              {page === 'report' && 'Submit or Track Campus Grievance'}
            </strong>
          </div>

          <div className="topbar-actions">
            {adminUser ? (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <div className="admin-status-pill">
                  <ShieldCheck size={13} />
                  <span>Admin: {adminUser.name}</span>
                </div>
                <button
                  className="view-toggle-btn"
                  onClick={() => setShowLoginModal(true)}
                  title="Change Password"
                  style={{ padding: '5px 9px', fontSize: '11px' }}
                >
                  <KeyRound size={11} />
                  Security
                </button>
              </div>
            ) : (
              <button className="primary-button admin-login-top-btn" onClick={() => setShowLoginModal(true)}>
                <KeyRound size={13} />
                Admin Portal Login
              </button>
            )}

            <a
              href="/KAIROS_Complete_Product_and_Technical_Documentation.pdf"
              download="KAIROS_Complete_Product_and_Technical_Documentation.pdf"
              className="view-toggle-btn"
              title="Download Complete KAIROS Master PRD & TRD PDF"
              style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 10px', fontSize: '12px' }}
            >
              <Download size={13} />
              <span>PDF Docs</span>
            </a>

            <button
              className="icon-button alert-btn"
              onClick={() => showNotice(`${metrics.critical_action} critical incidents require immediate response`)}
              title="Active Alerts"
            >
              <Bell size={16} />
              {metrics.critical_action > 0 && <i />}
            </button>
          </div>
        </header>

        {/* Campus Emergency Broadcast Alerts Banner */}
        <BroadcastBanner
          broadcasts={broadcasts}
          onDismiss={handleDismissBroadcast}
          onCreateBroadcast={handleCreateBroadcast}
          isAdmin={Boolean(adminUser)}
        />

        {/* Page Routing */}
        {page === 'analytics' ? (
          <div className="content">
            {!adminUser ? (
              <div className="detail-panel-3d" style={{ maxWidth: '640px', margin: '40px auto', textAlign: 'center', padding: '40px' }}>
                <ShieldAlert size={44} style={{ margin: '0 auto 16px', opacity: 0.8 }} />
                <h2>Administrator Access Required</h2>
                <p style={{ color: '#888', margin: '12px 0 24px', lineHeight: 1.6 }}>
                  Campus Pulse executive operational analytics and workload heatmaps are strictly restricted to authenticated administrators.
                </p>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                  <button className="primary-button" onClick={() => setShowLoginModal(true)}>
                    <KeyRound size={14} />
                    Sign In as Administrator
                  </button>
                  <button className="btn-cancel" onClick={() => setPage('report')}>
                    Submit Grievance
                  </button>
                </div>
              </div>
            ) : (
              <AnalyticsStudio tickets={tickets} analytics={analytics} onExportData={() => {}} />
            )}
          </div>
        ) : page === 'audit' ? (
          <div className="content">
            {!adminUser ? (
              <div className="detail-panel-3d" style={{ maxWidth: '640px', margin: '40px auto', textAlign: 'center', padding: '40px' }}>
                <ShieldAlert size={44} style={{ margin: '0 auto 16px', opacity: 0.8 }} />
                <h2>Administrator Access Required</h2>
                <p style={{ color: '#888', margin: '12px 0 24px', lineHeight: 1.6 }}>
                  The cryptographic audit log stream and tamper-evident event timeline are restricted to authorized university administrators.
                </p>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                  <button className="primary-button" onClick={() => setShowLoginModal(true)}>
                    <KeyRound size={14} />
                    Sign In as Administrator
                  </button>
                  <button className="btn-cancel" onClick={() => setPage('report')}>
                    Submit Grievance
                  </button>
                </div>
              </div>
            ) : (
              <AuditExplorer onRefresh={fetchTickets} adminToken={adminToken} />
            )}
          </div>
        ) : page === 'operations' ? (
          <div className="content">
            {!adminUser ? (
              <div className="detail-panel-3d" style={{ maxWidth: '640px', margin: '40px auto', textAlign: 'center', padding: '40px' }}>
                <ShieldAlert size={44} style={{ margin: '0 auto 16px', opacity: 0.8 }} />
                <h2>Administrator Access Required</h2>
                <p style={{ color: '#888', margin: '12px 0 24px', lineHeight: 1.6 }}>
                  The Campus Grievance Operations Hub allows changing ticket priorities, dispatching field technicians, and updating SLA states. Please sign in with administrator credentials.
                </p>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                  <button className="primary-button" onClick={() => setShowLoginModal(true)}>
                    <KeyRound size={14} />
                    Sign In as Administrator
                  </button>
                  <button className="btn-cancel" onClick={() => setPage('report')}>
                    Submit or Track Grievance
                  </button>
                </div>
              </div>
            ) : (
              <>
            {/* Page Header */}
            <div className="page-heading">
              <div>
                <p className="eyebrow">Operations & Dispatch</p>
                <h1>Campus Grievance Operations Hub</h1>
                <p>
                  Review AI-classified grievances, monitor SLA countdowns, and assign responsible staff members.
                </p>
              </div>

              <button className="primary-button" onClick={() => setPage('report')}>
                <Plus size={16} />
                Report New Grievance
              </button>
            </div>

            {/* Metrics Row (Clean 2D Cards) */}
            <div className="metrics-3d-grid">
              <div className="metric">
                <span className="metric-icon">
                  <Activity size={22} />
                </span>
                <div>
                  <small>Active Open Tickets</small>
                  <strong>{metrics.open_tickets}</strong>
                  <p>Campus backlog</p>
                </div>
              </div>

              <div className="metric">
                <span className="metric-icon">
                  <ShieldAlert size={22} />
                </span>
                <div>
                  <small>Critical Actions</small>
                  <strong>{metrics.critical_action}</strong>
                  <p>Immediate 2h SLA</p>
                </div>
              </div>

              <div className="metric">
                <span className="metric-icon">
                  <Clock3 size={22} />
                </span>
                <div>
                  <small>SLA Warnings</small>
                  <strong>{metrics.sla_breached}</strong>
                  <p>Target exceeded</p>
                </div>
              </div>

              <div className="metric">
                <span className="metric-icon">
                  <CheckCircle2 size={22} />
                </span>
                <div>
                  <small>Resolved Tickets</small>
                  <strong>{metrics.resolved_today}</strong>
                  <p>Closed incidents</p>
                </div>
              </div>
            </div>

            {/* Bulk Actions Floating Toolbar (When items selected) */}
            {selectedTicketIds.length > 0 && (
              <div className="bulk-toolbar-3d">
                <div className="bulk-info">
                  <Users size={14} />
                  <strong>{selectedTicketIds.length} tickets selected</strong>
                </div>
                <div className="bulk-controls">
                  <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}>
                    <option value="In Progress">Set: In Progress</option>
                    <option value="Resolved">Set: Resolved</option>
                    <option value="Assigned">Set: Assigned</option>
                    <option value="Closed">Set: Closed</option>
                  </select>
                  <select value={bulkOwner} onChange={(e) => setBulkOwner(e.target.value)}>
                    {STAFF_MEMBERS.map((s) => (
                      <option key={s} value={s}>
                        Assign: {s}
                      </option>
                    ))}
                  </select>
                  <button className="primary-button bulk-apply-btn" onClick={handleBulkUpdate}>
                    <CheckCircle2 size={13} />
                    Apply Bulk Action
                  </button>
                  <button className="btn-cancel" onClick={() => setSelectedTicketIds([])}>
                    Clear
                  </button>
                </div>
              </div>
            )}

            {/* Two-Column Operations Layout */}
            <div className="operations-layout-3d">
              {/* Left Column: Filterable Ticket List */}
              <section className="ticket-panel-3d">
                <div className="panel-heading">
                  <div>
                    <h2>Grievance Queue</h2>
                    <p>{shown.length} tickets</p>
                  </div>
                  <div className="search-box">
                    <Search size={14} />
                    <input
                      type="text"
                      placeholder="Search title, ID, room..."
                      value={filters.search}
                      onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
                    />
                    {filters.search && (
                      <button onClick={() => setFilters((prev) => ({ ...prev, search: '' }))}>
                        <X size={13} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Filter Selector Row */}
                <div className="filters-3d">
                  <label>
                    <Filter size={11} />
                    Status:
                  </label>
                  <select
                    value={filters.status}
                    onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
                  >
                    <option value="All">All Statuses</option>
                    <option value="New">New</option>
                    <option value="Assigned">Assigned</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Resolved">Resolved</option>
                  </select>

                  <label>Priority:</label>
                  <select
                    value={filters.priority}
                    onChange={(e) => setFilters((prev) => ({ ...prev, priority: e.target.value }))}
                  >
                    <option value="All">All Priorities</option>
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>

                  <label>Dept:</label>
                  <select
                    value={filters.department}
                    onChange={(e) => setFilters((prev) => ({ ...prev, department: e.target.value }))}
                  >
                    <option value="All">All Departments</option>
                    {DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>

                  {shown.length > 0 && (
                    <button className="select-all-btn" onClick={toggleSelectAll}>
                      {selectedTicketIds.length === shown.length ? 'Deselect All' : 'Select All'}
                    </button>
                  )}
                </div>

                {/* Ticket Rows Stream */}
                <div className="ticket-list-3d">
                  {shown.length === 0 ? (
                    <div className="empty-state">
                      <p>No complaints reported yet.</p>
                      <button className="primary-button" onClick={() => setPage('report')}>
                        <Plus size={14} />
                        Submit First Complaint
                      </button>
                    </div>
                  ) : (
                    shown.map((ticket) => {
                      const isBreached = ticket.is_breached || (ticket.due && ticket.due.includes('breached'))
                      const isSelected = selected?.id === ticket.id
                      const isChecked = selectedTicketIds.includes(ticket.id)
                      const isNew = newTicketIds.has(ticket.id)

                      return (
                        <button
                          key={ticket.id}
                          className={`ticket-row-3d ${isSelected ? 'selected' : ''} ${isBreached ? 'breached' : ''} ${isNew ? 'new-arrival' : ''}`}
                          onClick={() => setSelectedId(ticket.id)}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onClick={(e) => e.stopPropagation()}
                            onChange={() => toggleSelectTicket(ticket.id)}
                            className="ticket-checkbox"
                          />

                          <div className="ticket-main">
                            <div className="ticket-title-row">
                              <strong>
                                {ticket.id}: {ticket.title}
                              </strong>
                              {isNew && (
                                <span className="badge-new-ticket" title="Newly created complaint awaiting review">
                                  <span className="pulsing-dot" /> NEW TICKET
                                </span>
                              )}
                            </div>
                            <small>
                              <MapPin size={11} /> {ticket.location}
                            </small>
                          </div>

                          <div className="ticket-meta">
                            <Tag type="priority">{ticket.priority}</Tag>
                            <Tag type="status">{ticket.status}</Tag>
                            <small className={isBreached ? 'breach-text' : ''}>
                              <Clock3 size={10} /> {ticket.due}
                            </small>
                          </div>
                        </button>
                      )
                    })
                  )}
                </div>
              </section>

              {/* Right Column: Selected Ticket Details */}
              {selected ? (
                <section className="detail-panel-3d">
                  <div className="detail-header">
                    <div className="detail-id">
                      <Cpu size={16} />
                      <span>{selected.id}</span>
                    </div>
                    <span className={`sla-badge-3d ${selected.is_breached ? 'breached' : ''}`}>
                      <Clock3 size={13} />
                      {selected.due} ({selected.sla_hours}h SLA)
                    </span>
                  </div>

                  <h2>{selected.title}</h2>
                  <p className="detail-loc">
                    <MapPin size={13} /> {selected.location}
                  </p>

                  <div className="detail-tags">
                    <Tag type="priority">{selected.priority} Priority</Tag>
                    <Tag type="status">{selected.status}</Tag>
                    <span className="category">{selected.category}</span>
                    <span className="dept-tag">{selected.department}</span>
                  </div>

                  {/* AI Triage Diagnosis Card */}
                  <div className="ai-note-3d">
                    <div className="ai-note-header">
                      <Sparkles size={14} />
                      <strong>AI Triage Diagnostics</strong>
                    </div>
                    <p>{selected.summary}</p>
                    <div className="ai-action-box-3d">
                      <Wrench size={13} />
                      <span>
                        <strong>Recommended Operational Action:</strong> {selected.action}
                      </span>
                    </div>
                    <div className="ai-rationale-3d">
                      <ShieldAlert size={12} />
                      <small>
                        <strong>Priority Rationale:</strong> {selected.priority_rationale}
                      </small>
                    </div>
                  </div>

                  {/* Grievance Inspection Image (if attached) */}
                  {selected.image && (
                    <div className="detail-image-box-3d">
                      <small>Attached Inspection Evidence:</small>
                      <img src={selected.image} alt="Complaint Evidence" />
                    </div>
                  )}

                  {/* Human-in-the-Loop Operations Controls */}
                  <div className="owner-section-3d">
                    <div className="control-group">
                      <label>
                        <UserCheck size={13} />
                        Assigned Field Technician:
                      </label>
                      <select
                        value={selected.owner || 'Unassigned'}
                        onChange={(e) => handleOwnerChange(selected.id, e.target.value)}
                      >
                        {STAFF_MEMBERS.map((staff) => (
                          <option key={staff} value={staff}>
                            {staff}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="control-group">
                      <label>
                        <CheckCircle2 size={13} />
                        Operational Lifecycle State:
                      </label>
                      <select
                        value={selected.status}
                        onChange={(e) => handleStatusChange(selected.id, e.target.value)}
                      >
                        <option value="New">New</option>
                        <option value="Assigned">Assigned</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Resolved">Resolved (Complete)</option>
                        <option value="Closed">Closed</option>
                      </select>
                    </div>
                  </div>

                  {/* Admin Audit Comment Input */}
                  <div className="admin-action-row-3d">
                    <label>Append Administrative Audit Note / Status Directive:</label>
                    <div className="note-input-row">
                      <input
                        type="text"
                        placeholder="Enter technician dispatch updates or root cause findings..."
                        value={adminNote}
                        onChange={(e) => setAdminNote(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddNote(selected.id)}
                      />
                      <button
                        className="note-submit-3d"
                        onClick={() => handleAddNote(selected.id)}
                        disabled={!adminNote.trim()}
                      >
                        <Send size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Activity Timeline */}
                  <div className="timeline-3d">
                    <h3>
                      <History size={14} />
                      Resolution History Log
                    </h3>
                    <div className="timeline-items">
                      {(selected.activity || []).map((item, index) => (
                        <div key={item.id || index} className="timeline-item-3d">
                          <i />
                          <div>
                            <small>
                              {item.created_at} &bull; {item.actor}
                            </small>
                            <p>{item.action}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              ) : (
                <div className="detail-panel-3d empty-detail">
                  <p>Select a complaint from the queue to review details and assign staff.</p>
                </div>
              )}
            </div>
          </>
          )}
        </div>
        ) : (
          /* Report Complaint Page & Public Student Tracker */
          <div className="content report-page">
            {adminUser && (
              <button className="back-btn-3d" onClick={() => setPage('operations')}>
                &larr; Back to Operations Hub
              </button>
            )}

            {/* Public Ticket Tracker Card */}
            <div className="detail-panel-3d" style={{ marginBottom: '24px', padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <Search size={16} />
                <h3 style={{ margin: 0, fontSize: '15px' }}>Track Existing Grievance Status</h3>
              </div>
              <p style={{ color: '#888', fontSize: '13px', margin: '0 0 16px' }}>
                Students and complainants can look up any ticket in real time without creating an account.
              </p>

              <form onSubmit={handleTrackTicket} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  placeholder="Enter Ticket ID (e.g. GRV-1050)"
                  value={trackIdInput}
                  onChange={(e) => setTrackIdInput(e.target.value)}
                  style={{
                    flex: '1 1 240px',
                    padding: '10px 14px',
                    background: '#0d0d0d',
                    border: '1px solid #333',
                    color: '#fff',
                    borderRadius: '6px',
                    fontSize: '13px'
                  }}
                />
                <button
                  type="submit"
                  className="primary-button"
                  disabled={trackLoading || !trackIdInput.trim()}
                  style={{ padding: '10px 18px' }}
                >
                  <Search size={14} />
                  {trackLoading ? 'Searching...' : 'Track Ticket'}
                </button>
                {trackedTicket && (
                  <button
                    type="button"
                    className="btn-cancel"
                    onClick={() => { setTrackedTicket(null); setTrackIdInput(''); setTrackError(''); }}
                  >
                    Clear
                  </button>
                )}
              </form>

              {trackError && (
                <div className="auth-error-banner" style={{ marginTop: '14px' }}>
                  {trackError}
                </div>
              )}

              {trackedTicket && (
                <div style={{ marginTop: '20px', borderTop: '1px solid #222', paddingTop: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '14px' }}>{trackedTicket.id}</span>
                      <Tag type="status">{trackedTicket.status}</Tag>
                      <Tag type="priority">{trackedTicket.priority}</Tag>
                    </div>
                    <small style={{ color: trackedTicket.is_breached ? '#ff4d4d' : '#aaa' }}>
                      <Clock3 size={11} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                      {trackedTicket.due}
                    </small>
                  </div>

                  <h4 style={{ margin: '12px 0 6px', fontSize: '15px' }}>{trackedTicket.title}</h4>
                  <p style={{ color: '#aaa', fontSize: '13px', margin: '0 0 10px' }}>
                    <MapPin size={12} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                    {trackedTicket.location} &bull; Routed to: <strong>{trackedTicket.department}</strong>
                  </p>

                  <div style={{ background: '#0a0a0a', border: '1px solid #222', borderRadius: '6px', padding: '12px', margin: '12px 0' }}>
                    <small style={{ color: '#888', display: 'block', marginBottom: '4px' }}>Operational Diagnosis:</small>
                    <p style={{ margin: 0, fontSize: '13px', color: '#ddd' }}>{trackedTicket.summary}</p>
                  </div>

                  {trackedTicket.activity && trackedTicket.activity.length > 0 && (
                    <div style={{ marginTop: '14px' }}>
                      <small style={{ color: '#888', fontWeight: 600 }}>Public Audit Timeline:</small>
                      <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {trackedTicket.activity.map((act, i) => (
                          <div key={act.id || i} style={{ fontSize: '12px', color: '#bbb', display: 'flex', gap: '8px' }}>
                            <span style={{ color: '#666', whiteSpace: 'nowrap' }}>{act.created_at}</span>
                            <span>&bull;</span>
                            <span>{act.action}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <p className="eyebrow">Smart Grievance Intake</p>
            <h1>Report Campus Infrastructure Issue</h1>
            <p className="intro">
              Describe the grievance with location details. KAIROS will extract priority, calculate SLA, and assign the appropriate department.
            </p>

            <form onSubmit={handleSubmit} className="report-form-3d">
              {/* Step 1: Location Details */}
              <div className="form-section-3d">
                <div className="form-title">
                  <span>1</span>
                  <div>
                    <h2>Location & Facility Details</h2>
                    <p>Select the specific campus facility or enter custom room/lab location.</p>
                  </div>
                  <button
                    type="button"
                    className="manual-mode-btn"
                    onClick={() => {
                      setManualLocation((prev) => !prev)
                      setManualOverrides((prev) => ({ ...prev, location: true }))
                    }}
                  >
                    {manualLocation ? 'Choose from Facility List' : '✎ Enter Custom Location'}
                  </button>
                </div>
                {manualLocation ? (
                  <label>
                    Custom Location / Room / Desk:
                    <input
                      type="text"
                      placeholder="e.g. Central Library, 3rd Floor Computer Lab, Desk #14"
                      value={form.location}
                      onChange={(e) => {
                        setForm((prev) => ({ ...prev, location: e.target.value }))
                        setManualOverrides((prev) => ({ ...prev, location: true }))
                      }}
                      required
                    />
                  </label>
                ) : (
                  <label>
                    Campus Facility / Building:
                    <select
                      value={form.location}
                      onChange={(e) => {
                        setForm((prev) => ({ ...prev, location: e.target.value }))
                        setManualOverrides((prev) => ({ ...prev, location: true }))
                      }}
                    >
                      {LOCATIONS.map((loc) => (
                        <option key={loc} value={loc}>
                          {loc}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>

              {/* Step 2: Grievance Description & Inspection Photo */}
              <div className="form-section-3d">
                <div className="form-title">
                  <span>2</span>
                  <div>
                    <h2>Grievance Description & Photo Evidence</h2>
                    <p>Describe the issue in detail. You can use AI triage or enter all classification details manually.</p>
                  </div>
                </div>

                <label>
                  Issue Description:
                  <textarea
                    rows={4}
                    placeholder="e.g. Major water pipe burst under the washroom sink in North Hostel 2nd floor, causing water to pool on the walkway..."
                    value={form.description}
                    onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                    required
                  />
                </label>

                <div style={{ marginTop: '16px' }}>
                  <label>Inspection Photo (Optional):</label>
                  {preview ? (
                    <div className="preview-3d">
                      <img src={preview} alt="Preview" />
                      <button type="button" onClick={() => setPreview('')}>
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <label className="upload-3d">
                      <FileImage size={24} />
                      <strong>Click or Drag Photo to Attach</strong>
                      <span>Supports PNG, JPEG, WebP (Max 5MB)</span>
                      <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handlePhotoUpload} />
                    </label>
                  )}
                </div>

                <div style={{ marginTop: '16px', display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                  <button
                    type="button"
                    className="view-toggle-btn"
                    onClick={handleRunTriage}
                    disabled={isTriaging || form.description.length < 5}
                  >
                    <Sparkles size={14} />
                    {isTriaging ? 'Running AI Classification...' : 'Analyze with KAIROS Neural Engine'}
                  </button>

                  <button
                    type="button"
                    className={`view-toggle-btn ${showManualSection ? 'active' : ''}`}
                    onClick={() => setShowManualSection((prev) => !prev)}
                  >
                    <Edit3 size={14} />
                    {showManualSection ? 'Hide Classification Details' : '✎ Enter / Edit Classification Manually'}
                  </button>
                </div>
              </div>

              {/* Step 3: Classification & Operational Specifications (Manual or AI) */}
              {(showManualSection || triagePreview) && (
                <div className="form-section-3d manual-classification-section">
                  <div className="form-title">
                    <span>3</span>
                    <div>
                      <h2>Classification & Routing Specifications</h2>
                      <p>
                        {triagePreview
                          ? 'Review AI suggestions below. You can customize or edit any field manually before submitting.'
                          : 'Manually specify category, priority, and routing without AI.'}
                      </p>
                    </div>
                    <span className="manual-status-badge">
                      {triagePreview ? '✦ AI-Assisted (Fully Editable)' : '✎ Manual Mode (No AI)'}
                    </span>
                  </div>

                  <div className="manual-fields-grid">
                    {/* Title */}
                    <div className="manual-field-block full-width">
                      <div className="field-header-row">
                        <label>Grievance Title / Subject:</label>
                        <span className={`field-source-tag ${manualOverrides.title ? 'manual' : triagePreview ? 'ai' : 'manual'}`}>
                          {manualOverrides.title ? '✎ Manually Edited' : triagePreview ? '✦ AI Suggested' : '✎ Manual Input'}
                        </span>
                      </div>
                      <input
                        type="text"
                        placeholder="e.g. Broken water pipe causing hazard on walkway"
                        value={form.title}
                        onChange={(e) => {
                          setForm((prev) => ({ ...prev, title: e.target.value }))
                          setManualOverrides((prev) => ({ ...prev, title: true }))
                        }}
                      />
                    </div>

                    {/* Category */}
                    <div className="manual-field-block">
                      <div className="field-header-row">
                        <label>Category:</label>
                        <span className={`field-source-tag ${manualOverrides.category ? 'manual' : triagePreview ? 'ai' : 'manual'}`}>
                          {manualOverrides.category ? '✎ Manually Edited' : triagePreview ? '✦ AI Suggested' : '✎ Manual Input'}
                        </span>
                      </div>
                      <select
                        value={form.category}
                        onChange={(e) => {
                          setForm((prev) => ({ ...prev, category: e.target.value }))
                          setManualOverrides((prev) => ({ ...prev, category: true }))
                        }}
                      >
                        {CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Priority Level */}
                    <div className="manual-field-block">
                      <div className="field-header-row">
                        <label>Priority Level (SLA Commitment):</label>
                        <span className={`field-source-tag ${manualOverrides.priority ? 'manual' : triagePreview ? 'ai' : 'manual'}`}>
                          {manualOverrides.priority ? '✎ Manually Edited' : triagePreview ? '✦ AI Suggested' : '✎ Manual Input'}
                        </span>
                      </div>
                      <select
                        value={form.priority}
                        onChange={(e) => {
                          setForm((prev) => ({ ...prev, priority: e.target.value }))
                          setManualOverrides((prev) => ({ ...prev, priority: true }))
                        }}
                      >
                        {PRIORITIES.map((pri) => (
                          <option key={pri} value={pri}>
                            {pri} {pri === 'Critical' ? '(2h Emergency SLA)' : pri === 'High' ? '(12h Urgent SLA)' : pri === 'Medium' ? '(24h Standard SLA)' : '(48h Low SLA)'}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Department */}
                    <div className="manual-field-block">
                      <div className="field-header-row">
                        <label>Routing Department:</label>
                        <span className={`field-source-tag ${manualOverrides.department ? 'manual' : triagePreview ? 'ai' : 'manual'}`}>
                          {manualOverrides.department ? '✎ Manually Edited' : triagePreview ? '✦ AI Suggested' : '✎ Manual Input'}
                        </span>
                      </div>
                      <select
                        value={form.department}
                        onChange={(e) => {
                          setForm((prev) => ({ ...prev, department: e.target.value }))
                          setManualOverrides((prev) => ({ ...prev, department: true }))
                        }}
                      >
                        {DEPARTMENTS.map((dept) => (
                          <option key={dept} value={dept}>
                            {dept}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Recommended Action */}
                    <div className="manual-field-block full-width">
                      <div className="field-header-row">
                        <label>Recommended Immediate Action:</label>
                        <span className={`field-source-tag ${manualOverrides.recommended_action ? 'manual' : triagePreview ? 'ai' : 'manual'}`}>
                          {manualOverrides.recommended_action ? '✎ Manually Edited' : triagePreview ? '✦ AI Suggested' : '✎ Manual Input'}
                        </span>
                      </div>
                      <input
                        type="text"
                        placeholder="e.g. Dispatch plumbing crew and isolate main valve"
                        value={form.recommended_action}
                        onChange={(e) => {
                          setForm((prev) => ({ ...prev, recommended_action: e.target.value }))
                          setManualOverrides((prev) => ({ ...prev, recommended_action: true }))
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="form-footer-3d">
                <p>
                  <Shield size={14} /> Full human control: You can submit AI suggestions or override any value manually.
                </p>
                <button type="submit" className="primary-button" disabled={isSubmitting || !form.description.trim()}>
                  <Send size={15} />
                  {isSubmitting ? 'Routing Complaint...' : 'Confirm & Submit Grievance'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Admin Authentication Modal */}
      <AdminLoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onLoginSuccess={handleLoginSuccess}
        currentAdmin={adminUser}
        onPasswordChanged={() => showNotice('Administrator password updated successfully')}
      />

      {/* Settings & Profile Appearance Modal */}
      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        currentTheme={currentTheme}
        onSelectTheme={setCurrentTheme}
        adminUser={adminUser}
        dbStatus={dbStatus}
      />

      {/* Real-time Toast Notifications */}
      {notice && (
        <div className="toast-3d">
          <Sparkles size={16} />
          <span>{notice}</span>
        </div>
      )}
    </main>
  )
}
