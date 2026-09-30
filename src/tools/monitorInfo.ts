export interface MonitorRow { name: string; x: number; y: number; width: number; height: number; scale: number; primary: boolean }
export function parseMonitors(value: unknown): { monitors: MonitorRow[]; limited: boolean } {
  if (!value || typeof value !== 'object' || !('monitors' in value) || !Array.isArray(value.monitors)) throw new Error('显示器响应格式无效')
  const monitors: MonitorRow[] = []
  let limited = 'limited' in value && value.limited === true
  for (const row of value.monitors) {
    if (!row || typeof row.name !== 'string' || row.name.length > 1024 || typeof row.primary !== 'boolean'
      || ![row.x, row.y, row.width, row.height].every(Number.isSafeInteger) || row.width <= 0 || row.height <= 0
      || row.width > 100000 || row.height > 100000 || Math.abs(row.x) > 1000000 || Math.abs(row.y) > 1000000
      || !Number.isFinite(row.scale) || row.scale <= 0 || row.scale > 16 || monitors.length >= 32) { limited = true; continue }
    monitors.push(row)
  }
  return { monitors, limited }
}
export function monitorLayout(rows: MonitorRow[]) {
  if (!rows.length) return { viewBox: '0 0 640 200', rows: [] }
  const x = Math.min(...rows.map(r => r.x)), y = Math.min(...rows.map(r => r.y))
  const width = Math.max(...rows.map(r => r.x + r.width)) - x
  const height = Math.max(...rows.map(r => r.y + r.height)) - y
  const factor = Math.min(600 / width, 180 / height)
  return { viewBox: '0 0 640 220', rows: rows.map(r => ({ ...r, left: 20 + (r.x - x) * factor, top: 20 + (r.y - y) * factor, w: r.width * factor, h: r.height * factor })) }
}
