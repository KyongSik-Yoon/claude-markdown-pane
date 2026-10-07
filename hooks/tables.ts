const SEPARATOR = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/
const FENCE = /^\s*(```|~~~)/

const cellsOf = (line: string) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split(/(?<!\\)\|/)
    .map(cell => cell.trim())

/** A cell's width as drawn, near enough: its text without the marks of emphasis, code and links. */
const widthOf = (cell: string) => cell.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '').length

/**
 * A table is drawn at its natural width, and one wider than the pane wraps into
 * noise. This rewrites each table that would not fit `columns` as a list: the
 * row's first cell in bold, then one `header: cell` line for each other cell.
 * Tables that fit, and everything inside code fences, are left as written.
 */
export const narrow = (text: string, columns: number): string => {
  const lines = text.split('\n')
  const out: string[] = []
  let isFenced = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (FENCE.test(line)) isFenced = !isFenced
    const isTable = !isFenced && line.includes('|') && SEPARATOR.test(lines[i + 1] ?? '') && (lines[i + 1] ?? '').includes('-')
    if (!isTable) {
      out.push(line)
      continue
    }
    const header = cellsOf(line)
    const rows: string[][] = []
    let end = i + 2
    while (end < lines.length && (lines[end] ?? '').includes('|') && (lines[end] ?? '').trim() !== '') {
      rows.push(cellsOf(lines[end] ?? ''))
      end++
    }
    const widths = header.map((h, c) => Math.max(widthOf(h), ...rows.map(row => widthOf(row[c] ?? ''))))
    const natural = widths.reduce((sum, w) => sum + w + 3, 1)
    if (natural <= columns) {
      out.push(...lines.slice(i, end))
    } else {
      for (const row of rows) {
        out.push(`**${(row[0] ?? '').replace(/^\*\*|\*\*$/g, '')}**`)
        for (let c = 1; c < header.length; c++) if ((row[c] ?? '') !== '') out.push(`- ${header[c]}: ${row[c]}`)
        out.push('')
      }
      if (out[out.length - 1] === '') out.pop()
    }
    i = end - 1
  }

  return out.join('\n')
}
