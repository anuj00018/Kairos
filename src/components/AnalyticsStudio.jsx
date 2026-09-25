import { useState, useMemo } from 'react'
import {
  Activity,
  BarChart3,
  CheckCircle2,
  Clock3,
  FileSpreadsheet,
  FileText,
  MapPin,
  PieChart as PieIcon,
  ShieldAlert,
  Users
} from 'lucide-react'
import useCountUp from '../hooks/useCountUp'
import Card3D from './Card3D'

// Monochrome grayscale palette for pie chart segments
const SLICE_COLORS = [
  '#ffffff', // Pure White
  '#d4d4d4', // Silver / Light Gray
  '#a3a3a3', // Medium Gray
  '#737373', // Charcoal
  '#525252', // Dark Charcoal
  '#333333'  // Deep Gray
]

const DATE_RANGES = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: '7 Days' },
  { id: '30d', label: '30 Days' },
  { id: 'all', label: 'All Time' }
]

// Tickets created offline (no backend round-trip) have no raw ISO timestamp.
// Treat those as "now" rather than silently dropping them from a range filter.
function parseCreatedAt(ticket) {
  if (ticket.created_at_raw) {
    const parsed = new Date(ticket.created_at_raw)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  return new Date()
}

function CountStat({ value }) {
  const animated = useCountUp(value)
  return <strong>{animated}</strong>
}

export default function AnalyticsStudio({ tickets = [], analytics = null }) {
  const [chartMode, setChartMode] = useState('category') // 'category' or 'priority' or 'status'
  const [hoveredSlice, setHoveredSlice] = useState(null)
  const [downloadNotice, setDownloadNotice] = useState('')
  const [dateRange, setDateRange] = useState('all')

  const triggerNotice = (msg) => {
    setDownloadNotice(msg)
    setTimeout(() => setDownloadNotice(''), 3500)
  }

  // Scope tickets to the selected date range using the real created_at_raw timestamp
  const scopedTickets = useMemo(() => {
    if (dateRange === 'all') return tickets
    const now = Date.now()
    const windowMs = dateRange === 'today' ? 24 * 60 * 60 * 1000 : dateRange === '7d' ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000
    return tickets.filter((t) => now - parseCreatedAt(t).getTime() <= windowMs)
  }, [tickets, dateRange])

  // Live aggregated KPI metrics from the scoped ticket set
  const metrics = useMemo(() => {
    const total = scopedTickets.length
    const resolved = scopedTickets.filter(t => ['Resolved', 'Closed'].includes(t.status)).length
    const open = scopedTickets.filter(t => !['Resolved', 'Closed'].includes(t.status)).length
    const critical = scopedTickets.filter(t => t.priority === 'Critical' && !['Resolved', 'Closed'].includes(t.status)).length
    const inProgress = scopedTickets.filter(t => t.status === 'In Progress').length
    const complianceRate = total > 0
      ? Math.round(((total - scopedTickets.filter(t => t.is_breached).length) / total) * 100)
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
  }, [scopedTickets])

  // Highest-volume location in the scoped range — real aggregation, no synthetic data
  const topHotspot = useMemo(() => {
    const counts = {}
    scopedTickets.forEach((t) => {
      const loc = t.location || 'Unspecified'
      counts[loc] = (counts[loc] || 0) + 1
    })
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
    return sorted.length > 0 ? { location: sorted[0][0], count: sorted[0][1] } : null
  }, [scopedTickets])

  // Pie chart data based on active chartMode
  const pieData = useMemo(() => {
    const counts = {}
    if (chartMode === 'category') {
      scopedTickets.forEach(t => {
        const key = t.category || 'General'
        counts[key] = (counts[key] || 0) + 1
      })
    } else if (chartMode === 'priority') {
      ;['Critical', 'High', 'Medium', 'Low'].forEach(p => { counts[p] = 0 })
      scopedTickets.forEach(t => {
        const key = t.priority || 'Medium'
        counts[key] = (counts[key] || 0) + 1
      })
    } else {
      // Status
      ;['New', 'Assigned', 'In Progress', 'Resolved', 'Closed'].forEach(s => { counts[s] = 0 })
      scopedTickets.forEach(t => {
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
  }, [scopedTickets, chartMode])

  // Department workload distribution
  const deptData = useMemo(() => {
    const counts = {}
    scopedTickets.forEach(t => {
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
  }, [scopedTickets])

  // Fixed Export CSV function
  const handleExportCSV = () => {
    if (!scopedTickets || scopedTickets.length === 0) {
      triggerNotice('No complaints in this range to export.')
      return
    }

    const headers = ['ID', 'Title', 'Location', 'Category', 'Priority', 'Department', 'Status', 'Owner', 'SLA Hours', 'Created At', 'Resolved At']
    const rows = scopedTickets.map(t => [
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
    triggerNotice(`Exported ${scopedTickets.length} complaints to CSV`)
  }

  // Fixed Export JSON function
  const handleExportJSON = () => {
    if (!scopedTickets || scopedTickets.length === 0) {
      triggerNotice('No complaints in this range to export.')
      return
    }

    const exportPayload = {
      exported_at: new Date().toISOString(),
      date_range: dateRange,
      summary: metrics,
      total_records: scopedTickets.length,
      complaints: scopedTickets
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
    triggerNotice(`Exported ${scopedTickets.length} complaints to JSON`)
  }

  // SVG Pie Chart Geometry
  const radius = 70
  const circumference = 2 * Math.PI * radius
  let accumulatedPercent = 0

  return (
    <div className="analytics-simple-page stagger-in">
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

      {/* Date Range Filter */}
      <div className="date-range-row" role="group" aria-label="Date range filter">
        {DATE_RANGES.map((r) => (
          <button
            key={r.id}
            className={dateRange === r.id ? 'date-range-pill active' : 'date-range-pill'}
            onClick={() => setDateRange(r.id)}
            aria-pressed={dateRange === r.id}
          >
            {r.label}
          </button>
        ))}
        <span className="date-range-count">{metrics.total} complaint{metrics.total === 1 ? '' : 's'} in range</span>
      </div>

      <div aria-live="polite">
        {downloadNotice && (
          <div className="analytics-toast">
            <CheckCircle2 size={15} />
            <span>{downloadNotice}</span>
          </div>
        )}
      </div>

      {/* 5 Command-Center KPI Cards */}
      <div className="simple-kpi-grid stagger-in">
        <Card3D className="kpi-card-wrap">
          <div className="simple-kpi-card">
            <div className="kpi-label-row">
              <span>Total Complaints</span>
              <Activity size={16} />
            </div>
            <CountStat value={metrics.total} />
            <small>Campus-wide complaints logged</small>
          </div>
        </Card3D>

        <Card3D className="kpi-card-wrap">
          <div className="simple-kpi-card">
            <div className="kpi-label-row">
              <span>Resolved</span>
              <CheckCircle2 size={16} />
            </div>
            <CountStat value={metrics.resolved} />
            <small>{metrics.resolutionRate}% resolution efficiency</small>
          </div>
        </Card3D>

        <Card3D className="kpi-card-wrap">
          <div className="simple-kpi-card">
            <div className="kpi-label-row">
              <span>In Progress / Open</span>
              <Clock3 size={16} />
            </div>
            <CountStat value={metrics.open} />
            <small>{metrics.inProgress} active field dispatches</small>
          </div>
        </Card3D>

        <Card3D className="kpi-card-wrap">
          <div className="simple-kpi-card">
            <div className="kpi-label-row">
              <span>Critical Urgent</span>
              <ShieldAlert size={16} />
            </div>
            <CountStat value={metrics.critical} />
            <small>{metrics.critical > 0 ? 'Requires immediate 2h SLA response' : 'Zero emergency hazards active'}</small>
          </div>
        </Card3D>

        <Card3D className="kpi-card-wrap">
          <div className="simple-kpi-card kpi-card-gauge">
            <div className="kpi-label-row">
              <span>SLA Compliance</span>
            </div>
            <div
              className="compliance-ring"
              style={{ '--pct': metrics.complianceRate }}
              role="img"
              aria-label={`${metrics.complianceRate}% SLA compliance`}
            >
              <span><CountStat value={metrics.complianceRate} />%</span>
            </div>
          </div>
        </Card3D>
      </div>

      {topHotspot && (
        <div className="hotspot-callout">
          <MapPin size={13} />
          <span>Highest-volume sector in range: <strong>{topHotspot.location}</strong> ({topHotspot.count} ticket{topHotspot.count === 1 ? '' : 's'})</span>
        </div>
      )}

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

          {scopedTickets.length === 0 ? (
            <div className="chart-empty-state">
              <PieIcon size={36} />
              <p>{tickets.length === 0 ? 'No complaints reported yet. Submit a grievance to view the pie chart breakdown.' : 'No complaints in this date range.'}</p>
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
            <strong>{scopedTickets.filter(t => t.status === 'New').length}</strong>
          </div>
          <div className="status-summary-box">
            <span className="dot dot-assigned" />
            <small>Assigned</small>
            <strong>{scopedTickets.filter(t => t.status === 'Assigned').length}</strong>
          </div>
          <div className="status-summary-box">
            <span className="dot dot-progress" />
            <small>In Progress</small>
            <strong>{scopedTickets.filter(t => t.status === 'In Progress').length}</strong>
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

