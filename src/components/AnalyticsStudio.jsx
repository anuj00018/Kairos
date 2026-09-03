import React, { useState, useMemo } from 'react'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  Download,
  FileSpreadsheet,
  FileText,
  PieChart as PieIcon,
  ShieldAlert,
  Sparkles,
  Users
} from 'lucide-react'

// Monochrome grayscale palette for pie chart segments
const SLICE_COLORS = [
  '#ffffff', // Pure White
  '#d4d4d4', // Silver / Light Gray
  '#a3a3a3', // Medium Gray
  '#737373', // Charcoal
  '#525252', // Dark Charcoal
  '#333333'  // Deep Gray
]

export default function AnalyticsStudio({ tickets = [], analytics = null }) {
  const [chartMode, setChartMode] = useState('category') // 'category' or 'priority' or 'status'
  const [hoveredSlice, setHoveredSlice] = useState(null)
  const [downloadNotice, setDownloadNotice] = useState('')

  const triggerNotice = (msg) => {
    setDownloadNotice(msg)
    setTimeout(() => setDownloadNotice(''), 3500)
  }

  // Live aggregated KPI metrics from real tickets
  const metrics = useMemo(() => {
    const total = tickets.length
    const resolved = tickets.filter(t => ['Resolved', 'Closed'].includes(t.status)).length
    const open = tickets.filter(t => !['Resolved', 'Closed'].includes(t.status)).length
    const critical = tickets.filter(t => t.priority === 'Critical' && !['Resolved', 'Closed'].includes(t.status)).length
    const inProgress = tickets.filter(t => t.status === 'In Progress').length
    const complianceRate = total > 0
      ? Math.round(((total - tickets.filter(t => t.is_breached).length) / total) * 100)
      : 100
    const resolutionRate = total > 0 ? Math.round((resolved / total) * 100) : 0

    return {
      total,
      resolved,
      open,
      critical,
      inProgress,
      complianceRate,
      resolutionRate
    }
  }, [tickets])

  // Pie chart data based on active chartMode
  const pieData = useMemo(() => {
    const counts = {}
    if (chartMode === 'category') {
      tickets.forEach(t => {
        const key = t.category || 'General'
        counts[key] = (counts[key] || 0) + 1
      })
    } else if (chartMode === 'priority') {
      ;['Critical', 'High', 'Medium', 'Low'].forEach(p => { counts[p] = 0 })
      tickets.forEach(t => {
        const key = t.priority || 'Medium'
        counts[key] = (counts[key] || 0) + 1
      })
    } else {
      // Status
      ;['New', 'Assigned', 'In Progress', 'Resolved', 'Closed'].forEach(s => { counts[s] = 0 })
      tickets.forEach(t => {
        const key = t.status || 'New'
        counts[key] = (counts[key] || 0) + 1
      })
    }

    const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1
    const entries = Object.entries(counts).filter(([_, count]) => count > 0 || chartMode !== 'category')

    return entries.map(([label, count], index) => {
      const percentage = Math.round((count / total) * 100)
      return {
        label,
        count,
        percentage,
        color: SLICE_COLORS[index % SLICE_COLORS.length]
      }
    })
  }, [tickets, chartMode])

  // Department workload distribution
  const deptData = useMemo(() => {
    const counts = {}
    tickets.forEach(t => {
      const d = t.department || 'Unassigned'
      counts[d] = (counts[d] || 0) + 1
    })
    const maxVal = Math.max(...Object.values(counts), 1)
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({
        label,
        count,
        pct: Math.round((count / maxVal) * 100)
      }))
  }, [tickets])

  // Fixed Export CSV function
  const handleExportCSV = () => {
    if (!tickets || tickets.length === 0) {
      triggerNotice('No complaints to export.')
      return
    }

    const headers = ['ID', 'Title', 'Location', 'Category', 'Priority', 'Department', 'Status', 'Owner', 'SLA Hours', 'Created At', 'Resolved At']
    const rows = tickets.map(t => [
      t.id || '',
      `"${(t.title || '').replace(/"/g, '""')}"`,
      `"${(t.location || '').replace(/"/g, '""')}"`,
      t.category || '',
      t.priority || '',
      `"${(t.department || '').replace(/"/g, '""')}"`,
      t.status || '',
      `"${(t.owner || 'Unassigned').replace(/"/g, '""')}"`,
      t.sla_hours || '',
      `"${t.created_at || ''}"`,
      `"${t.resolved_at || 'Pending'}"`
    ])

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `kairos_grievances_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    triggerNotice(`Exported ${tickets.length} complaints to CSV`)
  }

  // Fixed Export JSON function
  const handleExportJSON = () => {
    if (!tickets || tickets.length === 0) {
      triggerNotice('No complaints to export.')
      return
    }

    const exportPayload = {
      exported_at: new Date().toISOString(),
      database_type: 'PostgreSQL 18',
      summary: metrics,
      total_records: tickets.length,
      complaints: tickets
    }

    const jsonContent = JSON.stringify(exportPayload, null, 2)
    const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `kairos_grievances_${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    triggerNotice(`Exported ${tickets.length} complaints to JSON`)
  }

  // SVG Pie Chart Geometry
  const radius = 70
  const circumference = 2 * Math.PI * radius
  let accumulatedPercent = 0

  return (
    <div className="analytics-simple-page">
      {/* Clean Header with Export Actions */}
      <div className="analytics-simple-header">
        <div>
          <p className="eyebrow">Operational Intelligence</p>
          <h1>Analytics Studio</h1>
          <p className="intro">Clean overview of campus grievances, SLA performance, and departmental distribution.</p>
        </div>

        <div className="analytics-actions-row">
          <button className="export-action-btn" onClick={handleExportCSV}>
            <FileSpreadsheet size={14} />
            Export CSV
          </button>
          <button className="export-action-btn" onClick={handleExportJSON}>
            <FileText size={14} />
            Export JSON
          </button>
        </div>
      </div>

      {downloadNotice && (
        <div className="analytics-toast">
          <CheckCircle2 size={15} />
          <span>{downloadNotice}</span>
        </div>
      )}

      {/* 4 Clean Top KPI Cards */}
      <div className="simple-kpi-grid">
        <div className="simple-kpi-card">
          <div className="kpi-label-row">
            <span>Total Complaints</span>
            <Activity size={16} />
          </div>
          <strong>{metrics.total}</strong>
          <small>Campus-wide complaints logged</small>
        </div>

        <div className="simple-kpi-card">
          <div className="kpi-label-row">
            <span>Resolved</span>
            <CheckCircle2 size={16} />
          </div>
          <strong>{metrics.resolved}</strong>
          <small>{metrics.resolutionRate}% resolution efficiency</small>
        </div>

        <div className="simple-kpi-card">
          <div className="kpi-label-row">
            <span>In Progress / Open</span>
            <Clock3 size={16} />
          </div>
          <strong>{metrics.open}</strong>
          <small>{metrics.inProgress} active field dispatches</small>
        </div>

        <div className="simple-kpi-card">
          <div className="kpi-label-row">
            <span>Critical Urgent</span>
            <ShieldAlert size={16} />
          </div>
          <strong>{metrics.critical}</strong>
          <small>{metrics.critical > 0 ? 'Requires immediate 2h SLA response' : 'Zero emergency hazards active'}</small>
        </div>
      </div>

      {/* Main Dual Analytics View: Simple Pie Chart (Left) + Department Breakdown (Right) */}
      <div className="simple-analytics-split">
        {/* Left Card: Simple Clean Monochrome Pie Chart */}
        <div className="simple-chart-card">
          <div className="chart-card-header">
            <div>
              <h3>Distribution Breakdown</h3>
              <p>Proportional analysis across campus grievances</p>
            </div>

            {/* Mode Switcher */}
            <div className="chart-mode-pills">
              <button
                className={chartMode === 'category' ? 'active' : ''}
                onClick={() => setChartMode('category')}
              >
                Category
              </button>
              <button
                className={chartMode === 'priority' ? 'active' : ''}
                onClick={() => setChartMode('priority')}
              >
                Priority
              </button>
              <button
                className={chartMode === 'status' ? 'active' : ''}
                onClick={() => setChartMode('status')}
              >
                Status
              </button>
            </div>
          </div>

          {tickets.length === 0 ? (
            <div className="chart-empty-state">
              <PieIcon size={36} />
              <p>No complaints reported yet. Submit a grievance to view the pie chart breakdown.</p>
            </div>
          ) : (
            <div className="pie-container">
              {/* SVG Donut / Pie Chart */}
              <div className="svg-pie-wrapper">
                <svg width="180" height="180" viewBox="0 0 180 180" className="pie-svg">
                  <circle
                    cx="90"
                    cy="90"
                    r={radius}
                    fill="transparent"
                    stroke="#1a1a1a"
                    strokeWidth="28"
                  />
                  {pieData.map((slice) => {
                    const strokeDash = (slice.percentage / 100) * circumference
                    const strokeOffset = -(accumulatedPercent / 100) * circumference
                    accumulatedPercent += slice.percentage

                    return (
                      <circle
                        key={slice.label}
                        cx="90"
                        cy="90"
                        r={radius}
                        fill="transparent"
                        stroke={slice.color}
                        strokeWidth="28"
                        strokeDasharray={`${strokeDash} ${circumference}`}
                        strokeDashoffset={strokeOffset}
                        transform="rotate(-90 90 90)"
                        className="pie-segment"
                        onMouseEnter={() => setHoveredSlice(slice)}
                        onMouseLeave={() => setHoveredSlice(null)}
                      />
                    )
                  })}
                </svg>

                <div className="pie-center-info">
                  <strong>{hoveredSlice ? hoveredSlice.count : metrics.total}</strong>
                  <small>{hoveredSlice ? hoveredSlice.label : 'Total'}</small>
                </div>
              </div>

              {/* Pie Legend */}
              <div className="pie-legend-list">
                {pieData.map((slice) => (
                  <div
                    key={slice.label}
                    className={`pie-legend-item ${hoveredSlice?.label === slice.label ? 'highlighted' : ''}`}
                    onMouseEnter={() => setHoveredSlice(slice)}
                    onMouseLeave={() => setHoveredSlice(null)}
                  >
                    <span className="legend-swatch" style={{ background: slice.color }} />
                    <span className="legend-name">{slice.label}</span>
                    <span className="legend-val">
                      {slice.count} ({slice.percentage}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Card: Department Workload Allocation */}
        <div className="simple-chart-card">
          <div className="chart-card-header">
            <div>
              <h3>Department Workload Allocation</h3>
              <p>Volume of complaints assigned per department</p>
            </div>
            <Users size={16} />
          </div>

          <div className="dept-meter-list">
            {deptData.length === 0 ? (
              <div className="chart-empty-state">
                <BarChart3 size={36} />
                <p>No departmental assignments recorded yet.</p>
              </div>
            ) : (
              deptData.map((dept) => (
                <div key={dept.label} className="dept-meter-item">
                  <div className="dept-meter-label">
                    <strong>{dept.label}</strong>
                    <span>{dept.count} ticket{dept.count === 1 ? '' : 's'}</span>
                  </div>
                  <div className="simple-bar-track">
                    <div className="simple-bar-fill" style={{ width: `${Math.max(6, dept.pct)}%` }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Clean Status Progress Summary */}
      <div className="simple-status-summary-card">
        <h3>Operational Lifecycle Status</h3>
        <div className="status-summary-grid">
          <div className="status-summary-box">
            <span className="dot dot-new" />
            <small>New Intake</small>
            <strong>{tickets.filter(t => t.status === 'New').length}</strong>
          </div>
          <div className="status-summary-box">
            <span className="dot dot-assigned" />
            <small>Assigned</small>
            <strong>{tickets.filter(t => t.status === 'Assigned').length}</strong>
          </div>
          <div className="status-summary-box">
            <span className="dot dot-progress" />
            <small>In Progress</small>
            <strong>{tickets.filter(t => t.status === 'In Progress').length}</strong>
          </div>
          <div className="status-summary-box">
            <span className="dot dot-resolved" />
            <small>Resolved & Closed</small>
            <strong>{metrics.resolved}</strong>
          </div>
        </div>
      </div>
    </div>
  )
}
