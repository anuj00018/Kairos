import { memo } from 'react'

// Minimal, XSS-safe Markdown renderer: builds React elements, never injects HTML.
// Supports headings, bold/italic/inline code, bullet & numbered lists, tables and fenced code.

function renderInline(text, keyPrefix) {
  const parts = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|\[[^\]]+\]\([^)]+\))/g)
  return parts.map((part, i) => {
    const key = `${keyPrefix}-${i}`
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={key}>{part.slice(2, -2)}</strong>
    if (/^`[^`]+`$/.test(part)) return <code key={key}>{part.slice(1, -1)}</code>
    if (/^\*[^*]+\*$/.test(part)) return <em key={key}>{part.slice(1, -1)}</em>
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (link) {
      return /^https?:\/\//i.test(link[2])
        ? <a key={key} href={link[2]} target="_blank" rel="noopener noreferrer">{link[1]}</a>
        : <span key={key}>{link[1]}</span>
    }
    return part
  })
}

const splitRow = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())

function parseBlocks(md) {
  const lines = String(md || '').replace(/\r\n/g, '\n').split('\n')
  const blocks = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { i++; continue }

    if (line.trim().startsWith('```')) {
      const body = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) body.push(lines[i++])
      i++
      blocks.push({ type: 'code', text: body.join('\n') })
      continue
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/)
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] })
      i++
      continue
    }

    if (line.trim().startsWith('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const header = splitRow(line)
      const rows = []
      i += 2
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(splitRow(lines[i++]))
      blocks.push({ type: 'table', header, rows })
      continue
    }

    const listMatch = (l) => l.match(/^\s*([-*•]|\d+[.)])\s+(.*)$/)
    if (listMatch(line)) {
      const ordered = /\d/.test(listMatch(line)[1])
      const items = []
      while (i < lines.length && listMatch(lines[i])) items.push(listMatch(lines[i++])[2])
      blocks.push({ type: 'list', ordered, items })
      continue
    }

    const para = []
    while (i < lines.length && lines[i].trim() && !listMatch(lines[i]) && !/^(#{1,4})\s/.test(lines[i]) && !lines[i].trim().startsWith('```') && !lines[i].trim().startsWith('|')) {
      para.push(lines[i++])
    }
    blocks.push({ type: 'para', text: para.join(' ') })
  }
  return blocks
}

function MarkdownMessage({ text }) {
  return (
    <div className="md-body">
      {parseBlocks(text).map((b, bi) => {
        const k = `b${bi}`
        if (b.type === 'code') return <pre key={k}><code>{b.text}</code></pre>
        if (b.type === 'heading') {
          const Tag = b.level <= 2 ? 'h3' : 'h4'
          return <Tag key={k}>{renderInline(b.text, k)}</Tag>
        }
        if (b.type === 'table') {
          return (
            <div key={k} className="md-table-wrap">
              <table>
                <thead><tr>{b.header.map((h, hi) => <th key={hi}>{renderInline(h, `${k}h${hi}`)}</th>)}</tr></thead>
                <tbody>{b.rows.map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci}>{renderInline(c, `${k}r${ri}c${ci}`)}</td>)}</tr>)}</tbody>
              </table>
            </div>
          )
        }
        if (b.type === 'list') {
          const List = b.ordered ? 'ol' : 'ul'
          return <List key={k}>{b.items.map((it, ii) => <li key={ii}>{renderInline(it, `${k}i${ii}`)}</li>)}</List>
        }
        return <p key={k}>{renderInline(b.text, k)}</p>
      })}
    </div>
  )
}

export default memo(MarkdownMessage)
