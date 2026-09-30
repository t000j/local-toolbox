import { readonly, ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'

const runningTasks = ref(0)
const installationLocked = ref(false)
export const activeNativeTasks = readonly(runningTasks)

export async function trackedInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (installationLocked.value) throw new Error('应用正在安装更新，请等待应用重新启动。')
  runningTasks.value++
  try { return await invoke<T>(command, args) }
  finally { runningTasks.value = Math.max(0, runningTasks.value - 1) }
}

export function claimUpdateInstallation(): boolean {
  if (runningTasks.value || installationLocked.value) return false
  installationLocked.value = true
  return true
}

export function releaseUpdateInstallation(): void {
  installationLocked.value = false
}
