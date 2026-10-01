/** Environment-specific parsing and preview validation. Never evaluates or expands values. */
export const USER_ENVIRONMENT_SCOPE = '用户 HKCU Environment'
export const SYSTEM_ENVIRONMENT_SCOPE = '系统 HKLM Environment（只读）'
export const HIDDEN_ENVIRONMENT_VALUE = '[敏感名称：未读取内容]'
export type EnvironmentKind = 'String' | 'ExpandString'
export type EnvironmentAction = 'add' | 'edit' | 'delete'
export interface EnvironmentRow {
  name: string; value: string; kind: EnvironmentKind; scope: string; state: string; action: '' | 'edit'
}
export interface EnvironmentChange {
  action: EnvironmentAction; name: string; value: string; kind: EnvironmentKind; scope: string
  expected: 'present' | 'absent'; newValue: string; confirmed: boolean
}
// Keep these policy patterns identical to the fixed native script. A denylist cannot identify all secrets.
const sensitiveName = /(password|passwd|secret|token|credential|private|api.?key|access.?key|auth|cookie)/i
const protectedName = /^(path|pathext|comspec|systemroot|windir|psmodulepath|powershell.*|__.*|.*proxy|node_.*|npm_.*|python.*|java.*|jdk_.*|_java.*|dotnet.*|coreclr.*|cor_.*|complus.*|openssl.*|ssl_.*|git_.*|ssh_.*|gpg_.*|gnupg.*|ld_.*|dyld_.*|bash_env|env|shell|zsh.*|ruby.*|gem_.*|perl.*|lua.*|r_home|r_profile.*|r_environ.*|curl_ca_bundle|requests_ca_bundle|kubeconfig|docker_.*|cargo_.*|rust.*|cl|_cl_|link|_link_|include|lib|libpath|home|homedrive|homepath|userprofile|appdata|localappdata|programdata|programfiles.*|commonprogramfiles.*|temp|tmp|username|userdomain|userdnsdomain|computername|logonserver|os|processor_.*|number_of_processors|allusersprofile|public)$/i
export function editableEnvironmentName(name: string) {
  return name.length >= 1 && name.length <= 256 && /^[A-Za-z_]/.test(name) && !/[^A-Za-z0-9_]/.test(name)
    && !sensitiveName.test(name) && !protectedName.test(name)
}
export function validEnvironmentValue(value: string) {
  return value.length <= 8192 && !value.includes('\0') && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)
}
export function parseEnvironmentSnapshot(output: string) {
  const rows: EnvironmentRow[] = [], seen = new Set<string>()
  let limited = false, complete = false
  for (const line of output.split(/\r?\n/).filter(line => line.trim())) {
    if (complete) { limited = true; continue }
    try {
      const r = JSON.parse(line)
      if (r?.limited === true) { limited = true; continue }
      if (r?.environmentSnapshot === true && Object.keys(r).length === 1) { complete = true; continue }
      if (!r || !['name', 'value', 'state', 'action', 'scope', 'kind'].every(k => typeof r[k] === 'string')
        || !r.name || r.name.length > 256 || /[\x00-\x1f\x7f=]/.test(r.name)
        || !validEnvironmentValue(r.value) || !['String', 'ExpandString'].includes(r.kind)
        || ![USER_ENVIRONMENT_SCOPE, SYSTEM_ENVIRONMENT_SCOPE].includes(r.scope)) { limited = true; continue }
      const hidden = sensitiveName.test(r.name)
      const editable = r.scope === USER_ENVIRONMENT_SCOPE && editableEnvironmentName(r.name)
      if (r.action !== (editable ? 'edit' : '') || r.state !== (hidden ? '内容已隐藏' : editable ? '可预览修改' : '只读')
        || (hidden && r.value !== HIDDEN_ENVIRONMENT_VALUE)) { limited = true; continue }
      const key = `${r.scope}\0${r.name.toUpperCase()}`
      if (seen.has(key) || rows.length >= 500) { limited = true; continue }
      seen.add(key); rows.push({ name: r.name, value: r.value, state: r.state, action: r.action, scope: r.scope, kind: r.kind })
    } catch { limited = true }
  }
  return { rows, limited, complete }
}
/** Revalidate before submit as well as preview; the native handler also rechecks the registry. */
export function environmentChangeError(rows: EnvironmentRow[], change: EnvironmentChange): string {
  if (!['add', 'edit', 'delete'].includes(change.action) || change.scope !== USER_ENVIRONMENT_SCOPE) return '仅支持当前用户变量。'
  if (!editableEnvironmentName(change.name)) return '名称须为 1–256 个 ASCII 字母、数字或下划线，首位不能为数字；敏感或受保护名称不可变更。'
  if (!['String', 'ExpandString'].includes(change.kind) || !validEnvironmentValue(change.value) || !validEnvironmentValue(change.newValue)) return '值须为有效文本，最多 8192 个 UTF-16 字符且不能含 NUL；类型须为字符串。'
  const current = rows.find(r => r.scope === USER_ENVIRONMENT_SCOPE && r.name.toUpperCase() === change.name.toUpperCase())
  if (change.action === 'add') {
    if (change.expected !== 'absent' || change.value !== '' || current) return '该用户变量已存在或预览无效；不会覆盖，请重新读取。'
  } else {
    if (change.expected !== 'present' || !current || current.action !== 'edit' || current.name !== change.name
      || current.value !== change.value || current.kind !== change.kind) return '旧值、名称或类型与快照不符，请重新读取。'
    if (change.action === 'edit' && change.newValue === change.value) return '新值与旧值相同，无需修改。'
    if (change.action === 'delete' && change.newValue !== '') return '删除预览包含无效的新值。'
  }
  return ''
}
export function environmentChangeVerified(output: string, change: EnvironmentChange) {
  const lines = output.split(/\r?\n/).filter(line => line.trim())
  if (lines.length !== 1) return false
  try {
    const r = JSON.parse(lines[0])
    return r.verified === true && r.action === change.action && r.name === change.name && r.scope === change.scope
  } catch { return false }
}
