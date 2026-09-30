/** Fixed startup sources. Raw commands and shortcut targets are never evaluated. */
export const STARTUP_SOURCES = [
  { id: 'hkcu-run-64', label: '当前用户 HKCU Run · 64 位', writable: true },
  { id: 'hkcu-run-32', label: '当前用户 HKCU Run · 32 位', writable: true },
  { id: 'hklm-run-64', label: '全机 HKLM Run · 64 位', writable: true },
  { id: 'hklm-run-32', label: '全机 HKLM Run · 32 位', writable: true },
  { id: 'hkcu-runonce-64', label: '当前用户 HKCU RunOnce · 64 位（只读）', writable: false },
  { id: 'hkcu-runonce-32', label: '当前用户 HKCU RunOnce · 32 位（只读）', writable: false },
  { id: 'hklm-runonce-64', label: '全机 HKLM RunOnce · 64 位（只读）', writable: false },
  { id: 'hklm-runonce-32', label: '全机 HKLM RunOnce · 32 位（只读）', writable: false },
  { id: 'user-folder', label: '当前用户启动文件夹', writable: true },
  { id: 'common-folder', label: '所有用户启动文件夹', writable: true },
] as const
export type StartupSource = typeof STARTUP_SOURCES[number]['id']
export interface StartupRow {
  source: StartupSource; name: string; value: string; kind: 'String' | 'ExpandString' | 'File'
  backup: boolean; state: 'registered' | 'recoverable' | 'conflict' | 'readonly'; action: '' | 'disable' | 'restore'; token: string
}
export const STARTUP_STATES = { registered: '已登记（运行状态未知）', recoverable: '可恢复登记', conflict: '冲突：不覆盖', readonly: '仅查看' }
const validText = (s: string, max: number) => s.length <= max && !s.includes('\0')
  && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(s)
export function validStartupName(name: string, folder: boolean) {
  return !!name && validText(name, folder ? 255 : 256) && !/[\x00-\x1f\x7f-\x9f]/.test(name)
    && (!folder || (!/[<>:"/\\|?*]/.test(name) && !/[. ]$/.test(name)
      && !/^(con|prn|aux|nul|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(name)))
}
export function parseStartupSnapshot(output: string, source: string) {
  const rows: StartupRow[] = [], seen = new Set<string>()
  const spec = STARTUP_SOURCES.find(s => s.id === source), folder = source.endsWith('-folder')
  let limited = !spec, complete = false
  for (const line of output.split(/\r?\n/).filter(line => line.trim())) {
    if (complete) { limited = true; continue }
    try {
      const r = JSON.parse(line)
      if (r?.limited === true) { limited = true; continue }
      if (r?.startupSnapshot === true && r.source === source && Object.keys(r).length === 2) { complete = true; continue }
      if (!spec || !r || Object.keys(r).sort().join() !== ['source', 'name', 'value', 'kind', 'backup', 'state', 'action', 'token'].sort().join()
        || !['source', 'name', 'value', 'kind', 'state', 'action', 'token'].every(k => typeof r[k] === 'string')
        || r.source !== source || typeof r.backup !== 'boolean' || !validStartupName(r.name, folder)
        || !validText(r.value, folder ? 4096 : 8192)
        || (folder && (!/^[A-Za-z]:\\/.test(r.value) || !r.value.endsWith('\\' + r.name)
          || !r.value.slice(3).split('\\').every((part: string) => validStartupName(part, true))))
        || !(folder ? r.kind === 'File' && /^[a-f0-9]{64}$/.test(r.token)
          : ['String', 'ExpandString'].includes(r.kind) && r.token === '')
        || !['registered', 'recoverable', 'conflict', 'readonly'].includes(r.state)
        || (!spec.writable && (r.backup || r.state !== 'readonly' || r.action !== ''))
        || (r.state === 'registered' && (r.backup || r.action !== 'disable'))
        || (r.state === 'recoverable' && (!r.backup || r.action !== 'restore'))
        || (['conflict', 'readonly'].includes(r.state) && r.action !== '')
        || (r.state === 'readonly' && spec.writable)) { limited = true; continue }
      const key = `${r.backup}:${r.name.toUpperCase()}`
      if (seen.has(key) || rows.length >= 500) { limited = true; continue }
      seen.add(key); rows.push(r)
    } catch { limited = true }
  }
  return { rows, limited, complete }
}
export function startupChangeRequest(row: StartupRow) {
  return { action: row.action, source: row.source, name: row.name, value: row.value, kind: row.kind,
    expected: row.state, backup: row.backup, token: row.token, confirmed: true }
}
export function startupChangeVerified(output: string, row: StartupRow) {
  const lines = output.split(/\r?\n/).filter(line => line.trim())
  if (lines.length !== 1) return false
  try {
    const r = JSON.parse(lines[0])
    return Object.keys(r).sort().join() === ['verified', 'action', 'source', 'name'].sort().join()
      && r.verified === true && r.action === row.action && r.source === row.source && r.name === row.name
  } catch { return false }
}
