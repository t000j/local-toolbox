export interface FileRow { path: string; name: string; bytes: number; modifiedMs: number; hash?: string; kind?: 'file' | 'directory' }
export interface ScanSummary { visited: number; skipped: number; limited: boolean; failed: boolean; reasons: string[] }
export function parseFileScan(output: string) {
  const rows: FileRow[] = [], seen = new Set<string>()
  let summary: ScanSummary | null = null, limited = false
  for (const line of output.split(/\r?\n/).filter(s => s.trim())) {
    try {
      const r = JSON.parse(line)
      if (r?.summary === true) {
        if (summary || !Number.isSafeInteger(r.visited) || r.visited < 0 || !Number.isSafeInteger(r.skipped) || r.skipped < 0 || typeof r.limited !== 'boolean') { limited = true; continue }
        const reasons = [...(Array.isArray(r.limitReasons) ? r.limitReasons : []), ...Object.keys(r.skipReasons && typeof r.skipReasons === 'object' ? r.skipReasons : {})]
          .filter((v): v is string => typeof v === 'string' && v.length <= 80).slice(0, 20)
        summary = { visited: r.visited, skipped: r.skipped, limited: r.limited, failed: r.failed === true, reasons }; continue
      }
      if (!r || typeof r.path !== 'string' || !r.path || r.path.length > 32768 || typeof r.name !== 'string' || !r.name || r.name.length > 1024
        || !Number.isSafeInteger(r.bytes) || r.bytes < 0 || !Number.isSafeInteger(r.modifiedMs) || Math.abs(r.modifiedMs) > 8640000000000000
        || (r.hash !== undefined && (typeof r.hash !== 'string' || !/^[a-f0-9]{64}$/i.test(r.hash)))
        || (r.kind !== undefined && r.kind !== 'file' && r.kind !== 'directory')
        || seen.has(r.path) || rows.length >= 1000) { limited = true; continue }
      rows.push(r); seen.add(r.path)
    } catch { limited = true }
  }
  return { rows, summary, limited: limited || !summary || summary.limited || summary.failed || summary.skipped > 0 }
}
export function duplicateGroups(rows: FileRow[]) {
  const groups = new Map<string, FileRow[]>()
  for (const r of rows) {
    if (!r.hash) continue
    const key = `${r.bytes}:${r.hash.toLowerCase()}`
    const group = groups.get(key) ?? []; group.push(r); groups.set(key, group)
  }
  return [...groups.values()].filter(g => g.length >= 2)
}
export function scanFilters(name: string, extension: string, min: string, max: string, after: string, before: string) {
  const size = (s: string, fallback: number | null) => {
    if (!s.trim()) return fallback
    if (!/^\d+$/.test(s)) throw new Error('文件大小应为非负整数（字节）')
    const n = Number(s); if (!Number.isSafeInteger(n)) throw new Error('文件大小超出安全整数范围'); return n
  }
  const date = (s: string, fallback: number | null) => {
    if (!s) return fallback
    const n = new Date(s).getTime(); if (!Number.isSafeInteger(n) || n < -11644473600000 || n > 253402300799999) throw new Error('修改时间应在 1601—9999 年之间'); return n
  }
  if (name.length > 200 || /[\x00-\x1f]/.test(name)) throw new Error('文件名筛选最多 200 字符，不含控制字符')
  const ext = extension.trim().replace(/^\./, '')
  if (ext.length > 32 || /[.\\/:*?"<>|\s\x00-\x1f]/.test(ext)) throw new Error('请输入单个扩展名，例如 txt')
  const minBytes = size(min, null), maxBytes = size(max, null)
  const afterMs = date(after, null), beforeMs = date(before, null)
  if ((minBytes !== null && maxBytes !== null && minBytes > maxBytes) || (afterMs !== null && beforeMs !== null && afterMs > beforeMs)) throw new Error('最小值不能大于最大值')
  return { name, extension: ext, minBytes, maxBytes, afterMs, beforeMs }
}

export function scanReason(reason: string) {
  const labels: Record<string, string> = {
    'entry-limit': '遍历数量上限', 'depth-limit': '目录深度上限', 'directory-limit': '目录数量上限',
    'result-limit': '结果数量上限', 'output-budget': '结果输出上限', 'time-budget': '扫描内部时限',
    'file-hash-size-limit': '单文件哈希大小上限', 'total-hash-budget': '总哈希读取上限',
    'reparse-or-offline': '链接、重解析点或离线占位文件', 'open-denied-or-changed': '打开失败、无权限、被占用或文件变化',
    'directory-read-failed': '目录读取失败', 'access-denied': '访问被拒绝', 'file-changed': '文件在扫描期间变化',
    'hard-link-alias': '相同文件的硬链接别名', 'identity-unavailable': '无法核验文件标识', 'hash-incomplete': '哈希未完成',
    'scan-failed': '无法扫描所选目录（路径、权限、占用或平台限制）', 'invalid-or-long-path': '无效名称或路径过长',
    'io-error': '文件系统读取错误', 'metadata-unavailable': '元数据无法读取', 'change-time-unavailable': '无法读取变更时间',
  }
  return labels[reason] ?? `未读取项目：${reason}`
}
