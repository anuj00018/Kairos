import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Activity,
  AlertCircle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  History,
  Layers,
  MapPin,
  RefreshCw,
  Search,
  ShieldCheck,
  Tag,
  User,
  UserCheck,
  X
} from 'lucide-react'

export default function AuditExplorer({ onRefresh, adminToken }) {
  const [logs, setLogs] = useState([])
  const [viewMode, setViewMode] = useState('grouped') // 'grouped' (default - no repetition!) or 'timeline'
  const [filterActor, setFilterActor] = useState('All')
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState('')
  const [expandedTickets, setExpandedTickets] = useState({})

  const showNotice = (msg) => {
    setNotice(msg)
    setTimeout(() => setNotice(''), 3500)
  }

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const headers = adminToken ? { 'Authorization': `Bearer ${adminToken}` } : {}
      const res = await fetch('/api/audit-logs?limit=100', { headers })
      if (res.ok) {
        const data = await res.json()
        setLogs(data)
        // Default all tickets expanded in grouped view
        const initialExpand = {}
        data.forEach(l => { initialExpand[l.ticket_id] = true })
        setExpandedTickets(initialExpand)
      }
    } catch (e) {
      console.warn('Audit logs fetch failed:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const toggleExpand = (ticketId) => {
    setExpandedTickets(prev => ({ ...prev, [ticketId]: !prev[ticketId] }))
  }

  // Filter actors
  const actors = useMemo(() => {
    const actSet = new Set(['All'])
    logs.forEach(l => { if (l.actor) actSet.add(l.actor) })
    return Array.from(actSet)
  }, [logs])

  // Filtered raw logs
  const filteredLogs = useMemo(() => {
    return logs.filter(l => {
      const matchActor = filterActor === 'All' || l.actor === filterActor
      const matchSearch =
        !searchTerm ||
        l.ticket_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.action?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.ticket_title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.location?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.actor?.toLowerCase().includes(searchTerm.toLowerCase())
      return matchActor && matchSearch
    })
  }, [logs, filterActor, searchTerm])

  // Grouped logs by ticket ID (Eliminates issue repetition!)
  const groupedByTicket = useMemo(() => {
    const groups = {}
    filteredLogs.forEach(l => {
      const id = l.ticket_id || 'General'
      if (!groups[id]) {
        groups[id] = {
          ticket_id: id,
          title: l.ticket_title || `Ticket ${id}`,
          location: l.location || 'Campus',
          category: l.category || 'General',
          latest_activity: l.created_at,
          events: []
        }
      }
      groups[id].events.push(l)
    })
    return Object.values(groups)
  }, [filteredLogs])

  // Export CSV
  const handleExportCSV = () => {
    if (!logs || logs.length === 0) {
      showNotice('No audit logs to export.')
      return
    }

    const headers = ['Log ID', 'Ticket ID', 'Issue Title', 'Action Taken', 'Actor', 'Timestamp', 'Location', 'Category', 'Notes']
    const rows = logs.map(l => [
      l.id || '',
      l.ticket_id || '',
      `"${(l.ticket_title || '').replace(/"/g, '""')}"`,
      `"${(l.action || '').replace(/"/g, '""')}"`,
      `"${(l.actor || '').replace(/"/g, '""')}"`,
      `"${l.created_at || ''}"`,
      `"${(l.location || '').replace(/"/g, '""')}"`,
      `"${(l.category || '').replace(/"/g, '""')}"`,
      `"${(l.notes || '').replace(/"/g, '""')}"`
    ])

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `kairos_audit_trail_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    showNotice(`Exported ${logs.length} audit entries to CSV`)
  }

  // Export JSON
  const handleExportJSON = () => {
    if (!logs || logs.length === 0) {
      showNotice('No audit logs to export.')
      return
    }

    const exportData = {
      exported_at: new Date().toISOString(),
      database_type: 'PostgreSQL 18',
      total_records: logs.length,
      audit_stream: logs
    }

    const jsonContent = JSON.stringify(exportData, null, 2)
    const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `kairos_audit_trail_${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    showNotice(`Exported ${logs.length} audit entries to JSON`)
  }

  return (
    <div className="audit-clean-page">
      {/* Top Header */}
      <div className="audit-clean-header">
        <div>
          <p className="eyebrow">Governance & Accountability</p>
          <h1>System Audit Trail</h1>
          <p className="intro">
            Chronological audit log tracking grievance submissions, AI classifications, technician dispatches, and status updates.
          </p>
        </div>

        <div className="audit-actions-row">
          <button className="export-action-btn" onClick={handleExportCSV}>
            <FileSpreadsheet size={14} />
            Export CSV
          </button>
          <button className="export-action-btn" onClick={handleExportJSON}>
            <FileText size={14} />
            Export JSON
          </button>
          <button className="refresh-action-btn" onClick={fetchLogs} disabled={loading}>
            <RefreshCw size={13} className={loading ? 'spin-icon' : ''} />
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {notice && (
        <div className="analytics-toast">
          <CheckCircle2 size={15} />
          <span>{notice}</span>
        </div>
      )}

      {/* Filter and View Mode Strip */}
      <div className="audit-filter-strip">
        <div className="audit-search-input">
          <Search size={14} />
          <input
            type="text"
            placeholder="Search ticket ID, action, facility, actor..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')}>
              <X size={13} />
            </button>
          )}
        </div>

        <div className="audit-actor-select">
          <label>
            <UserCheck size={13} />
            Actor:
          </label>
          <select value={filterActor} onChange={(e) => setFilterActor(e.target.value)}>
            {actors.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>

        {/* View Mode Toggle: Grouped by Issue vs Raw Timeline */}
        <div className="audit-view-toggle">
          <button
            className={viewMode === 'grouped' ? 'active' : ''}
            onClick={() => setViewMode('grouped')}
            title="Group events under their specific issue to eliminate repetition"
          >
            <Layers size={13} />
            Grouped by Issue ({groupedByTicket.length})
          </button>
          <button
            className={viewMode === 'timeline' ? 'active' : ''}
            onClick={() => setViewMode('timeline')}
            title="View every single event in chronological sequence"
          >
            <History size={13} />
            Timeline Feed ({filteredLogs.length})
          </button>
        </div>
      </div>

      {/* Audit Log Content */}
      {viewMode === 'grouped' ? (
        /* --- GROUPED VIEW (EACH ISSUE APPEARS EXACTLY ONCE WITH FULL EVENT TIMELINE!) --- */
        <div className="audit-grouped-container">
          {groupedByTicket.length === 0 ? (
            <div className="empty-audit-state">
              <History size={32} />
              <p>No audit activity found matching your search filters.</p>
            </div>
          ) : (
            groupedByTicket.map((group) => {
              const isExpanded = expandedTickets[group.ticket_id] !== false
              return (
                <div key={group.ticket_id} className="audit-issue-card">
                  {/* Issue Header - Displays Once per Issue */}
                  <div
                    className="issue-header-row"
                    onClick={() => toggleExpand(group.ticket_id)}
                  >
                    <div className="issue-header-left">
                      <button className="expand-chevron">
                        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>
                      <span className="issue-ticket-badge">{group.ticket_id}</span>
                      <strong className="issue-headline">{group.title}</strong>
                    </div>

                    <div className="issue-header-meta">
                      <span className="issue-location-tag">
                        <MapPin size={11} /> {group.location}
                      </span>
                      <span className="issue-category-tag">{group.category}</span>
                      <span className="issue-count-pill">{group.events.length} Event{group.events.length === 1 ? '' : 's'}</span>
                    </div>
                  </div>

                  {/* Expanded Event Timeline for this specific issue */}
                  {isExpanded && (
                    <div className="issue-timeline-body">
                      <div className="issue-events-list">
                        {group.events.map((evt, idx) => (
                          <div key={evt.id || idx} className="issue-event-row">
                            <span className="event-bullet" />
                            <div className="event-content">
                              <div className="event-top-line">
                                <strong className="event-action-text">{evt.action}</strong>
                                <span className="event-timestamp">{evt.created_at}</span>
                              </div>
                              {evt.notes && (
                                <div className="event-note-box">
                                  <strong>Directive Note:</strong> {evt.notes}
                                </div>
                              )}
                              <div className="event-actor-row">
                                <span className="event-actor-tag">
                                  <User size={11} />
                                  {evt.actor}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      ) : (
        /* --- TIMELINE VIEW (Action-first chronological stream) --- */
        <div className="audit-timeline-container">
          {filteredLogs.length === 0 ? (
            <div className="empty-audit-state">
              <History size={32} />
              <p>No audit activity found matching your search filters.</p>
            </div>
          ) : (
            filteredLogs.map((entry) => (
              <div key={entry.id} className="audit-timeline-card">
                <div className="timeline-action-header">
                  <div className="action-title-group">
                    <span className="timeline-ticket-pill">{entry.ticket_id}</span>
                    <strong className="timeline-action-title">{entry.action}</strong>
                  </div>
                  <span className="timeline-time">{entry.created_at}</span>
                </div>

                <div className="timeline-issue-ref">
                  <span className="issue-ref-label">Regarding:</span>
                  <span className="issue-ref-name">{entry.ticket_title}</span>
                </div>

                {entry.notes && (
                  <div className="event-note-box" style={{ marginTop: '8px' }}>
                    <strong>Note:</strong> {entry.notes}
                  </div>
                )}

                <div className="timeline-footer-row">
                  <span className="event-actor-tag">
                    <User size={11} /> {entry.actor}
                  </span>
                  {entry.location && (
                    <span className="event-loc-tag">
                      <MapPin size={11} /> {entry.location}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

