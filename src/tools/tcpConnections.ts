export interface TcpConnection { local: string; remote: string; state: string; pid: number; name: string }
export function parseTcpSnapshot(output: string, processes: string) {
  const names = new Map<number, string>()
  for (const line of processes.split(/\r?\n/)) {
    const match = /^"((?:[^"]|"")*)","([0-9]+)"(?:,|$)/.exec(line.trim())
    if (match) names.set(Number(match[2]), match[1].replace(/""/g, '"'))
  }
  const rows: TcpConnection[] = []
  let limited = false, skipped = 0
  for (const line of output.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/)
    if (parts[0]?.toUpperCase() !== 'TCP') continue
    if (parts.length !== 5 || !/^\d+$/.test(parts[4]) || !parts[1].includes(':') || !parts[2].includes(':') || Number(parts[4]) > 0xffffffff) { skipped++; continue }
    if (rows.length >= 2000) { limited = true; break }
    const pid = Number(parts[4])
    rows.push({ local: parts[1], remote: parts[2], state: parts[3], pid, name: names.get(pid) ?? '未知或已退出' })
  }
  return { rows, limited, skipped }
}
export function filterTcpConnections(rows: TcpConnection[], query: string) {
  const needle = query.trim().toLocaleLowerCase()
  return needle ? rows.filter(row => [row.local, row.remote, row.state, row.pid, row.name].join(' ').toLocaleLowerCase().includes(needle)) : rows
}
