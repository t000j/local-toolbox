export interface FirewallRow {
  name: string; displayName: string; direction: string; action: string; enabled: string
  profile: string; source: string; detail: string; incomplete: boolean
}
export function parseFirewallRows(output: string) {
  const rows: FirewallRow[] = [], seen = new Set<string>()
  let limited = false
  for (const line of output.split(/\r?\n/).filter(s => s.trim())) {
    try {
      const r = JSON.parse(line)
      if (r?.limited === true) { limited = true; continue }
      if (!r || !['name', 'displayName', 'direction', 'action', 'enabled', 'profile', 'source', 'detail']
        .every(k => typeof r[k] === 'string' && r[k].length <= (k === 'detail' ? 8192 : 1024))
        || !r.name || typeof r.incomplete !== 'boolean' || seen.has(r.name) || rows.length >= 1000) {
        limited = true; continue
      }
      rows.push(r); seen.add(r.name); if (r.incomplete) limited = true
    } catch { limited = true }
  }
  return { rows, limited }
}
export function filterFirewall(rows: FirewallRow[], query: string, direction: string, enabled: string) {
  return rows.filter(r => (!direction || r.direction === direction) && (!enabled || r.enabled === enabled)
    && Object.values(r).join(' ').toLowerCase().includes(query.toLowerCase()))
}
