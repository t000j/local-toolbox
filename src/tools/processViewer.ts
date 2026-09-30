export interface ProcessRow { pid: number; name: string; memoryBytes: number | null; cpuSeconds: number | null }
export function parseProcessSnapshot(output: string) {
  const rows: ProcessRow[] = [], seen = new Set<number>()
  let skipped = 0, limited = false
  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) continue
    try {
      const row = JSON.parse(line)
      if (row?.limited === true) { limited = true; continue }
      if (!row || !Number.isInteger(row.pid) || row.pid < 0 || row.pid > 0xffffffff || typeof row.name !== 'string' || row.name.length > 128 || seen.has(row.pid)) { skipped++; continue }
      const validMetric = (value: unknown) => value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER)
      if (!validMetric(row.memoryBytes) || !validMetric(row.cpuSeconds)) { skipped++; continue }
      if (rows.length >= 2000) { limited = true; break }
      seen.add(row.pid)
      rows.push({ pid: row.pid, name: row.name, memoryBytes: row.memoryBytes, cpuSeconds: row.cpuSeconds })
    } catch { skipped++ }
  }
  return { rows, skipped, limited }
}
export function filterProcesses(rows: ProcessRow[], query: string, minMemoryMiB: number, minCpuSeconds: number, sort: string) {
  const needle = query.trim().toLocaleLowerCase()
  const memory = Number.isFinite(minMemoryMiB) ? Math.max(0, minMemoryMiB) * 1048576 : 0
  const cpu = Number.isFinite(minCpuSeconds) ? Math.max(0, minCpuSeconds) : 0
  return rows.filter(row => (!needle || `${row.pid} ${row.name}`.toLocaleLowerCase().includes(needle))
    && (!memory || (row.memoryBytes !== null && row.memoryBytes >= memory))
    && (!cpu || (row.cpuSeconds !== null && row.cpuSeconds >= cpu)))
    .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) || a.pid - b.pid
      : sort === 'memory' ? (b.memoryBytes ?? -1) - (a.memoryBytes ?? -1) || a.pid - b.pid
      : sort === 'cpu' ? (b.cpuSeconds ?? -1) - (a.cpuSeconds ?? -1) || a.pid - b.pid : a.pid - b.pid)
}
