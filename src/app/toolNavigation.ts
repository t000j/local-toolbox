import { onBeforeUnmount, ref, shallowRef } from 'vue'
export interface ToolLeaveGuard { label: string; dirty: () => boolean; busy?: () => boolean; save?: () => Promise<boolean> | boolean; escape?: () => boolean }
export const activeLeaveGuard = shallowRef<ToolLeaveGuard | null>(null)
export const pendingNavigation = shallowRef<{ action: () => void; guard: ToolLeaveGuard } | null>(null)
export const navigationSaving = ref(false)
export const navigationError = ref('')
export function useToolLeaveGuard(guard: ToolLeaveGuard): void {
  activeLeaveGuard.value = guard
  onBeforeUnmount(() => { if (activeLeaveGuard.value === guard) activeLeaveGuard.value = null })
}
export function requestToolNavigation(action: () => void): void {
  if (navigationSaving.value || pendingNavigation.value) return
  const guard = activeLeaveGuard.value
  if (guard && (guard.dirty() || guard.busy?.())) {
    pendingNavigation.value = { action, guard }; navigationError.value = ''
  } else action()
}
export function cancelToolNavigation(): void { if (!navigationSaving.value) { pendingNavigation.value = null; navigationError.value = '' } }
export function discardAndNavigate(): void {
  const pending = pendingNavigation.value
  if (!pending || navigationSaving.value || pending.guard.busy?.()) return
  pendingNavigation.value = null; navigationError.value = ''; pending.action()
}
export async function saveAndNavigate(): Promise<void> {
  const pending = pendingNavigation.value
  if (!pending?.guard.save || navigationSaving.value || pending.guard.busy?.()) return
  navigationSaving.value = true; navigationError.value = ''
  try {
    const saved = await pending.guard.save()
    if (pendingNavigation.value !== pending) return
    if (saved && !pending.guard.dirty()) { pendingNavigation.value = null; pending.action() }
    else navigationError.value = '尚未保存，已保留编辑；请继续编辑查看提示，或再次保存。'
  } catch { navigationError.value = '保存未完成，编辑仍保留；请继续编辑后重试。' }
  finally { navigationSaving.value = false }
}
