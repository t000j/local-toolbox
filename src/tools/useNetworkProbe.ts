import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { trackedInvoke as invoke } from '../app/activity'
import { copyText } from './clipboard'
import { boundedProbeInteger, validateNetworkTarget } from './networkTarget'

interface ProbeResult {
  jobId: string
  target: string
  output: string
  status: 'completed' | 'cancelled' | 'timeout' | 'outputLimit'
  exitCode: number | null
  elapsedMs: number
}

export function useNetworkProbe(target: Ref<string>, count: Ref<number>, timeoutMs: Ref<number>) {
  const busy = ref(false), cancelling = ref(false), error = ref(''), copied = ref(false)
  const result = ref<ProbeResult | null>(null)
  let jobId: string | null = null, cancelRequested = false, disposed = false, revision = 0
  const summary = computed(() => {
    const value = result.value
    if (!value) return ''
    const status = { completed: '命令已完成', cancelled: '已取消', timeout: '已达总时限，显示部分结果', outputLimit: '输出已达上限，显示部分结果' }[value.status]
    return `${status} · ${(value.elapsedMs / 1000).toFixed(1)} 秒${value.exitCode === null ? '' : ` · 退出码 ${value.exitCode}`}`
  })
  function clear(): void { if (busy.value) return; revision++; result.value = null; error.value = ''; copied.value = false }
  watch([target, count, timeoutMs], clear, { flush: 'sync' })
  async function cancel(): Promise<void> {
    if (!busy.value) return
    cancelRequested = true; cancelling.value = true
    if (!jobId) return // start() handles cancellation while preparation is pending.
    try { await invoke<boolean>('cancel_network_probe', { jobId }) }
    catch { if (!disposed) { error.value = '取消请求未能送达，任务仍受总时限保护，可再次取消。'; cancelling.value = false } }
  }
  async function start(): Promise<void> {
    if (busy.value || disposed) return
    clear()
    let host: string, samples: number, wait: number
    try {
      host = validateNetworkTarget(target.value)
      samples = boundedProbeInteger(count.value, 1, 10)
      wait = boundedProbeInteger(timeoutMs.value, 250, 2000)
    } catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause); return }
    busy.value = true; cancelRequested = false; cancelling.value = false
    try {
      jobId = await invoke<string>('prepare_network_probe')
      if (cancelRequested || disposed) {
        await cancel()
        // Consume any reservation left by a failed cancellation without launching a process.
        try { await invoke('run_ping', { jobId, target: '', count: samples, timeoutMs: wait }) } catch { /* expected invalid/cancelled reservation */ }
        if (!disposed) error.value = '已取消，未启动网络探测。'
        return
      }
      const response = await invoke<ProbeResult>('run_ping', { jobId, target: host, count: samples, timeoutMs: wait })
      if (!disposed) result.value = response
    } catch (cause) {
      if (!disposed) error.value = typeof cause === 'string' ? cause : cause instanceof Error ? cause.message : '请在 Windows 桌面版运行此工具。'
    } finally {
      jobId = null; busy.value = false; cancelling.value = false
    }
  }
  async function copy(): Promise<void> {
    if (!result.value?.output) return
    const version = revision
    try { await copyText(result.value.output); if (!disposed && version === revision) copied.value = true }
    catch { if (!disposed && version === revision) error.value = '复制失败，请检查剪贴板权限。' }
  }
  onBeforeUnmount(() => { disposed = true; revision++; void cancel(); result.value = null })
  return { busy, cancelling, error, copied, result, summary, start, cancel, clear, copy }
}
