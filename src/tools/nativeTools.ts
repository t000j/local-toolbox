import { ref } from 'vue'

export function useNativeTask() {
  const busy = ref(false)
  const error = ref('')
  const message = ref('')
  async function run<T>(action: () => Promise<T>, success = ''): Promise<T | undefined> {
    if (busy.value) return undefined
    busy.value = true
    error.value = ''
    message.value = ''
    try { const result = await action(); if (success) message.value = success; return result }
    catch (cause) { error.value = typeof cause === 'string' ? cause : cause instanceof Error ? cause.message : '操作失败，请重试。'; return undefined }
    finally { busy.value = false }
  }
  return { busy, error, message, run }
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KiB', 'MiB', 'GiB', 'TiB']
  let value = bytes / 1024
  let index = 0
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index++ }
  return `${value.toFixed(1)} ${units[index]}`
}

export function formatDate(value: string | number | null | undefined): string {
  if (value == null || value === '') return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('zh-CN', { hour12: false })
}
