import { save } from '@tauri-apps/plugin-dialog'
import { trackedInvoke } from '../app/activity'

export async function saveBinaryOutput(bytes: Uint8Array, name: string, current: () => boolean): Promise<boolean> {
  const path = await save({ title: '另存为新文件（拒绝覆盖）', defaultPath: name })
  if (!path || !current()) return false
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 32768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768))
  }
  await trackedInvoke('save_binary_output', { path, content: btoa(binary) })
  return true
}
