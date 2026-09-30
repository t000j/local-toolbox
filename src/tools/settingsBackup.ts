import { settingsRestoredEvent, type SettingsRestoredDetail } from '../app/settingsEvents'

export const maxSettingsBackupBytes = 4 * 1024 * 1024
export type SettingsGroup = 'preferences' | 'favorites' | 'worldClockZones' | 'textSnippets' | 'workspaces'
interface Preferences { autoCheckUpdates: boolean; clipboardHistoryLimit: number }
interface Snippet { id: string; title: string; content: string; updatedAt: number }
interface Workspace { id: string; name: string; paths: string[] }
export interface BackupSettings {
  preferences?: Preferences; favorites?: string[]; worldClockZones?: string[]; textSnippets?: Snippet[]; workspaces?: Workspace[]
}
export interface SettingsBackup {
  format: 'localtoolbox-settings'; schemaVersion: 1; appVersion: string; exportedAt: string; settings: BackupSettings
}
export interface RestorePlan { changes: { key: string; value: string }[]; warnings: string[] }
export const settingsGroups: { id: SettingsGroup; label: string; description: string; optional: boolean }[] = [
  { id: 'preferences', label: '基本偏好', description: '自动检查更新、剪贴板历史条数上限', optional: false },
  { id: 'favorites', label: '工具收藏', description: '首页收藏的工具', optional: false },
  { id: 'worldClockZones', label: '世界时钟', description: '已经选择的城市时区', optional: false },
  { id: 'textSnippets', label: '文本片段', description: '包含你保存的名称和文本内容', optional: true },
  { id: 'workspaces', label: '工作区', description: '包含本机应用和文件夹路径', optional: true },
]
const keys = {
  autoUpdate: 'toolbox:auto-update:v1', clipboardLimit: 'toolbox:clipboard-history-limit:v1', favorites: 'toolbox:favorites:v1',
  worldClockZones: 'toolbox:world-clock-zones:v1', textSnippets: 'toolbox:text-snippets:v1', workspaces: 'toolbox:workspaces:v1',
}
const groupIds = settingsGroups.map((group) => group.id)

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}的格式无效。`)
  return value as Record<string, unknown>
}
function text(value: unknown, label: string, maximum: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) throw new Error(`${label}为空或超过允许长度。`)
  return value
}
function list(value: unknown, label: string, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) throw new Error(`${label}的格式或数量无效。`)
  return value
}
function unique<T>(items: T[], identifier: (item: T) => string, label: string): T[] {
  if (new Set(items.map(identifier)).size !== items.length) throw new Error(`${label}包含重复标识。`)
  return items
}
function normalizeSettings(value: unknown): BackupSettings {
  const source = record(value, '设置')
  if (!Object.keys(source).length || Object.keys(source).some((key) => !groupIds.includes(key as SettingsGroup))) {
    throw new Error('备份没有可恢复的设置，或包含当前不支持的设置分组。')
  }
  const result: BackupSettings = {}
  if (Object.hasOwn(source, 'preferences')) {
    const item = record(source.preferences, '基本偏好')
    if (typeof item.autoCheckUpdates !== 'boolean' || typeof item.clipboardHistoryLimit !== 'number' || ![20, 50, 100].includes(item.clipboardHistoryLimit)) {
      throw new Error('自动更新偏好或剪贴板条数上限无效。')
    }
    result.preferences = { autoCheckUpdates: item.autoCheckUpdates, clipboardHistoryLimit: item.clipboardHistoryLimit }
  }
  if (Object.hasOwn(source, 'favorites')) {
    const items = list(source.favorites, '收藏', 1000).map((value) => text(value, '工具标识', 80))
    if (items.some((value) => !/^[a-z0-9-]+$/.test(value))) throw new Error('收藏中包含无效的工具标识。')
    result.favorites = unique(items, (item) => item, '收藏')
  }
  if (Object.hasOwn(source, 'worldClockZones')) {
    const items = list(source.worldClockZones, '世界时钟', 12).map((value) => text(value, '时区', 100))
    for (const zone of items) {
      try { new Intl.DateTimeFormat('zh-CN', { timeZone: zone }).format(0) }
      catch { throw new Error(`当前环境不支持备份中的时区：${zone}`) }
    }
    result.worldClockZones = unique(items, (item) => item, '世界时钟')
  }
  if (Object.hasOwn(source, 'textSnippets')) {
    const items = list(source.textSnippets, '文本片段', 100).map((value) => {
      const item = record(value, '文本片段')
      if (typeof item.updatedAt !== 'number' || !Number.isSafeInteger(item.updatedAt) || item.updatedAt < 0 || item.updatedAt > 8.64e15) {
        throw new Error('文本片段的更新时间无效。')
      }
      return { id: text(item.id, '片段标识', 160), title: text(item.title, '片段名称', 80), content: text(item.content, '片段内容', 10000), updatedAt: item.updatedAt }
    })
    result.textSnippets = unique(items, (item) => item.id, '文本片段')
  }
  if (Object.hasOwn(source, 'workspaces')) {
    const items = list(source.workspaces, '工作区', 20).map((value) => {
      const item = record(value, '工作区')
      const paths = list(item.paths, '工作区项目', 20).map((value) => text(value, '工作区路径', 32767))
      if (paths.some((path) => path.includes('\0') || !/^(?:[A-Za-z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+)/.test(path))) {
        throw new Error('工作区包含无效的 Windows 绝对路径。')
      }
      return { id: text(item.id, '工作区标识', 160), name: text(item.name, '工作区名称', 32767), paths: unique(paths, (path) => path, '工作区路径') }
    })
    result.workspaces = unique(items, (item) => item.id, '工作区')
  }
  return result
}
function readJson(key: string, fallback: unknown): unknown {
  const value = localStorage.getItem(key)
  if (value === null) return fallback
  try { return JSON.parse(value) as unknown }
  catch { throw new Error('某项本机设置无法解析，请在对应工具中核对并重新保存后再备份。') }
}
export function createSettingsBackup(appVersion: string, groups: SettingsGroup[]): SettingsBackup {
  if (!groups.length) throw new Error('请至少选择一项备份内容。')
  const settings: Record<string, unknown> = {}
  const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'
  for (const group of groups) {
    if (group === 'preferences') {
      const limit = Number(localStorage.getItem(keys.clipboardLimit))
      settings.preferences = { autoCheckUpdates: localStorage.getItem(keys.autoUpdate) !== 'false', clipboardHistoryLimit: [20, 50, 100].includes(limit) ? limit : 50 }
    } else if (group === 'worldClockZones') {
      settings.worldClockZones = readJson(keys.worldClockZones, [...new Set([localZone, 'Asia/Tokyo', 'Europe/London', 'America/New_York', 'Australia/Sydney'])])
    } else settings[group] = readJson(keys[group], [])
  }
  return { format: 'localtoolbox-settings', schemaVersion: 1, appVersion, exportedAt: new Date().toISOString(), settings: normalizeSettings(settings) }
}
export function serializeSettingsBackup(backup: SettingsBackup): string {
  const content = JSON.stringify(backup, null, 2)
  if (new TextEncoder().encode(content).byteLength > maxSettingsBackupBytes) throw new Error('备份超过 4 MiB，请减少包含的文本片段或工作区内容。')
  return content
}
export function parseSettingsBackup(content: string): SettingsBackup {
  if (new TextEncoder().encode(content).byteLength > maxSettingsBackupBytes) throw new Error('备份文件超过 4 MiB。')
  let value: unknown
  try { value = JSON.parse(content.replace(/^\uFEFF/, '')) as unknown }
  catch { throw new Error('文件不是有效的 JSON 设置备份。') }
  const source = record(value, '备份')
  if (source.format !== 'localtoolbox-settings' || source.schemaVersion !== 1) throw new Error('备份格式或版本不受支持，请使用 LocalToolbox 导出的备份。')
  const appVersion = text(source.appVersion, '应用版本', 80)
  if (!/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(appVersion)) throw new Error('备份中的应用版本无效。')
  const exportedAt = text(source.exportedAt, '备份时间', 80)
  if (!Number.isFinite(Date.parse(exportedAt))) throw new Error('备份时间无效。')
  return { format: 'localtoolbox-settings', schemaVersion: 1, appVersion, exportedAt, settings: normalizeSettings(source.settings) }
}
export function createRestorePlan(backup: SettingsBackup, groups: SettingsGroup[], toolIds: readonly string[]): RestorePlan {
  if (!groups.length) throw new Error('请至少选择一项要恢复的内容。')
  const settings = normalizeSettings(backup.settings)
  const changes: RestorePlan['changes'] = []
  const warnings: string[] = []
  for (const group of groups) {
    if (!Object.hasOwn(settings, group)) throw new Error('备份中没有所选分组。')
    if (group === 'preferences' && settings.preferences) {
      changes.push({ key: keys.autoUpdate, value: String(settings.preferences.autoCheckUpdates) })
      changes.push({ key: keys.clipboardLimit, value: String(settings.preferences.clipboardHistoryLimit) })
    } else if (group === 'favorites' && settings.favorites) {
      const items = settings.favorites.filter((id) => toolIds.includes(id))
      const skipped = settings.favorites.length - items.length
      if (skipped) warnings.push(`${skipped} 个收藏工具在当前版本中不存在，恢复时将跳过。`)
      changes.push({ key: keys.favorites, value: JSON.stringify(items) })
    } else changes.push({ key: keys[group as Exclude<SettingsGroup, 'preferences'>], value: JSON.stringify(settings[group]) })
  }
  return { changes, warnings }
}
export function applyRestorePlan(plan: RestorePlan): void {
  const allowedKeys = Object.values(keys) as string[]
  if (!plan.changes.length || plan.changes.some((change) => !allowedKeys.includes(change.key))) throw new Error('恢复计划包含不支持的设置。')
  const before = plan.changes.map((change) => ({ ...change, previous: localStorage.getItem(change.key) }))
  before.sort((left, right) => (left.value.length - (left.previous?.length ?? 0)) - (right.value.length - (right.previous?.length ?? 0)))
  const written: typeof before = []
  try {
    for (const change of before) { localStorage.setItem(change.key, change.value); written.push(change) }
  } catch {
    let rollbackFailed = false
    for (const change of [...written].reverse()) {
      try { if (change.previous === null) localStorage.removeItem(change.key); else localStorage.setItem(change.key, change.previous) }
      catch { rollbackFailed = true }
    }
    throw new Error(rollbackFailed ? '恢复未完成，部分设置可能已改变，请重新打开应用并核对。' : '本机存储写入失败，已恢复原有设置；请检查可用存储空间。')
  }
  window.dispatchEvent(new CustomEvent<SettingsRestoredDetail>(settingsRestoredEvent, { detail: { keys: plan.changes.map((change) => change.key) } }))
}
export function groupSummary(settings: BackupSettings, group: SettingsGroup): string {
  if (group === 'preferences' && settings.preferences) {
    return `自动检查更新${settings.preferences.autoCheckUpdates ? '开启' : '关闭'}；剪贴板上限 ${settings.preferences.clipboardHistoryLimit} 条`
  }
  if (group === 'favorites') return `${settings.favorites?.length ?? 0} 个收藏`
  if (group === 'worldClockZones') return `${settings.worldClockZones?.length ?? 0} 个时区`
  if (group === 'textSnippets') return `${settings.textSnippets?.length ?? 0} 条文本片段`
  return `${settings.workspaces?.length ?? 0} 个工作区，共 ${settings.workspaces?.reduce((sum, item) => sum + item.paths.length, 0) ?? 0} 个项目`
}
