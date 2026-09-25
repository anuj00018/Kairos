import { useMemo, useState } from 'react'
import './intelligence.css'

// Layered relationship graph: individual signals → common location → shared line → service → pattern → possible cause.
const COLUMNS = ['incident', 'building', 'line', 'service', 'pattern', 'cause']
const COLUMN_LABELS = ['Individual signals', 'Common location', 'Shared line', 'Common service', 'Correlated pattern', 'Possible common cause']
const LAYERED_RELS = new Set(['located in', 'supplied by', 'carries', 'uses', 'pattern in', 'possible common cause'])
const W = 960
const ROW = 44
const PAD_Y = 48

function truncate(s, n) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

export default function IncidentGraph({ graph, onSelectIncident, height }) {
  const [hover, setHover] = useState(null)

  const layout = useMemo(() => {
    if (!graph?.nodes?.length) return null
    const cols = COLUMNS.map((c) => graph.nodes.filter((n) => n.type === c))
    const usedCols = COLUMNS.map((_, i) => i).filter((i) => cols[i].length)
    const colX = {}
    usedCols.forEach((ci, idx) => { colX[ci] = 70 + (idx * (W - 180)) / Math.max(1, usedCols.length - 1) })
    const maxRows = Math.max(...cols.map((c) => c.length))
    const h = Math.max(height || 0, PAD_Y * 2 + maxRows * ROW)
    const pos = {}
    cols.forEach((list, ci) => {
      const offset = (h - list.length * ROW) / 2 + ROW / 2
      list.forEach((n, ri) => { pos[n.id] = { x: colX[ci], y: offset + ri * ROW, n } })
    })
    const edges = graph.edges.filter((e) => LAYERED_RELS.has(e.rel) && pos[e.from] && pos[e.to])
    return { pos, edges, h, usedCols, colX }
  }, [graph, height])

  const lit = useMemo(() => {
    if (!hover || !layout) return null
    // Everything reachable upstream and downstream of the hovered node
    const set = new Set([hover])
    const walk = (dir) => {
      const queue = [hover]
      while (queue.length) {
        const cur = queue.shift()
        for (const e of layout.edges) {
          const [a, b] = dir === 'down' ? [e.from, e.to] : [e.to, e.from]
          if (a === cur && !set.has(b)) { set.add(b); queue.push(b) }
        }
      }
    }
    walk('down')
    walk('up')
    return set
  }, [hover, layout])

  if (!layout) {
    return <div className="fe-empty-panel">No correlated incidents to map right now.</div>
  }

  return (
    <div className="fe-graph-wrap">
      <svg className="fe-graph" viewBox={`0 0 ${W} ${layout.h}`} role="img" aria-label="Incident relationship graph">
        {layout.usedCols.map((ci) => (
          <text key={ci} x={layout.colX[ci]} y={20} textAnchor="middle" className="fe-graph-col">{COLUMN_LABELS[ci].toUpperCase()}</text>
        ))}
        {layout.edges.map((e, i) => {
          const a = layout.pos[e.from]
          const b = layout.pos[e.to]
          const mx = (a.x + b.x) / 2
          const active = lit ? lit.has(e.from) && lit.has(e.to) : false
          return (
            <path key={i} d={`M${a.x},${a.y} C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`}
              className={`fe-edge${active ? ' active' : ''}${lit && !active ? ' dim' : ''}`}
              style={{ animationDelay: `${(COLUMNS.indexOf(a.n.type) || 0) * 0.12}s` }} />
          )
        })}
        {Object.values(layout.pos).map(({ x, y, n }) => {
          const dim = lit && !lit.has(n.id)
          const r = n.type === 'pattern' || n.type === 'cause' ? 9 : 7
          const clickable = n.type === 'incident' && onSelectIncident
          return (
            <g key={n.id} transform={`translate(${x},${y})`}
              className={`fe-node ${n.type}${dim ? ' dim' : ''}${n.level ? ` lvl-${n.level.toLowerCase()}` : ''}${n.priority ? ` pri-${n.priority.toLowerCase()}` : ''}`}
              onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(n.id)} onBlur={() => setHover(null)}
              onClick={clickable ? () => onSelectIncident(n.label) : undefined}
              tabIndex={0} role={clickable ? 'button' : undefined}
              aria-label={`${n.type}: ${n.title || n.label}`}>
              <circle r={r} />
              {n.type === 'cause' ? (
                <text x={0} y={24} textAnchor="middle">{truncate(n.label.replace('Possible common cause: ', ''), 26)}</text>
              ) : (
                <text x={13} y={4} textAnchor="start">{truncate(n.label, 20)}</text>
              )}
              <title>{n.title ? `${n.label}: ${n.title}` : n.label}</title>
            </g>
          )
        })}
      </svg>
      {graph.note && <p className="fe-muted fe-graph-note">{graph.note}</p>}
    </div>
  )
}
