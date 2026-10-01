export interface ManagerRow { name: string; value: string; state: string; action: string; scope: string; kind?: string }
const actions = ['', 'start', 'stop', 'disable', 'restore', 'edit']
export function parseManagerRows(output: string) {
  const rows: ManagerRow[] = [], seen = new Set<string>()
  let limited = false
  for (const line of output.split(/\r?\n/).filter(line => line.trim())) {
    try {
      const r = JSON.parse(line)
      if (r.limited === true) { limited = true; continue }
      if (r.verified === true) continue
      if (!r || !['name', 'value', 'state', 'action', 'scope'].every(k => typeof r[k] === 'string')
        || !r.name || r.name.length > 256 || r.value.length > 8192 || r.scope.length > 128
        || r.state.length > 128 || !actions.includes(r.action) || (r.kind !== undefined && !['String', 'ExpandString'].includes(r.kind))) {
        limited = true; continue
      }
      const key = `${r.scope}\0${r.name}`
      if (seen.has(key) || rows.length >= 500) { limited = true; continue }
      seen.add(key); rows.push(r)
    } catch { limited = true }
  }
  return { rows, limited }
}
