import type { TreeSnapshot } from './fileTree'
/** Quoting alone does not stop spreadsheet formula execution. Neutralize
 * dangerous leading characters, including formulas preceded by whitespace. */
export function csvCell(value: string): string {
  const safe = /^[\t\r\n]|^\s*[=+\-@]/u.test(value) ? "'" + value : value
  return '"' + safe.replaceAll('"', '""') + '"'
}
export function fileListText(root: string, snapshot: TreeSnapshot, format: 'csv' | 'txt'): string {
  const state = snapshot.complete ? 'complete-bounded-live-scan' : 'INCOMPLETE: missing entries are unknown'
  const rows = [...snapshot.rows].sort((a,b) => a.relative < b.relative ? -1 : a.relative > b.relative ? 1 : 0)
  let text: string
  if (format === 'csv') {
    const fields = ['record','scan_status','root','relative_path','type','bytes','modified_utc']
    const records = [['summary', state, root, '', '', '', ''], ...rows.map(r => ['entry', state, root, r.relative, r.kind,
      r.kind === 'file' ? String(r.bytes) : '', new Date(r.modifiedMs).toISOString()])]
    text = '\uFEFF' + [fields, ...records].map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
  } else {
    // JSON-escaped path strings prevent tabs/newlines from forging extra rows.
    text = `Local Toolbox file list\nScan: ${state}\nRoot: ${JSON.stringify(root)}\nSkipped: ${snapshot.skipped}\nReasons: ${JSON.stringify(snapshot.reasons)}\nMetadata only; live scan, not a filesystem snapshot.\n\n`
      + rows.map(r => `${r.kind === 'directory' ? '[DIR]' : '[FILE]'} ${JSON.stringify(r.relative)}\t${r.kind === 'file' ? r.bytes : '-'}\t${new Date(r.modifiedMs).toISOString()}`).join('\n') + '\n'
  }
  if (new TextEncoder().encode(text).length > 1024 * 1024) throw new Error('导出清单超过 1 MiB，请缩小扫描目录')
  return text
}
