export const settingsRestoredEvent = 'toolbox:settings-restored'
export interface SettingsRestoredDetail { keys: string[] }

export function restoredKeys(event: Event): string[] {
  const detail: unknown = (event as CustomEvent<unknown>).detail
  if (!detail || typeof detail !== 'object') return []
  const keys: unknown = (detail as Partial<SettingsRestoredDetail>).keys
  return Array.isArray(keys) ? keys.filter((key): key is string => typeof key === 'string') : []
}
