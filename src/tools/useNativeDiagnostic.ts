import { computed, onBeforeUnmount, ref } from 'vue'
import { trackedInvoke as invoke } from '../app/activity'
import { copyText } from './clipboard'
export interface DiagnosticResult {
  output: string
  status: 'completed' | 'cancelled' | 'timeout' | 'outputLimit'
  exitCode: number | null
  elapsedMs: number
}
/** Fixed command chosen by the caller; no arbitrary OS command is exposed. */
export function useNativeDiagnostic() {
  const busy = ref(false), cancelling = ref(false), error = ref(''), copied = ref(false)
  const result = ref<DiagnosticResult | null>(null)
  let jobId: string | null = null, disposed = false, cancelled = false, revision = 0
  const summary = computed(() => {
    const r = result.value
    return r ? `${({ completed: '命令已完成', cancelled: '已取消，结果可能不完整', timeout: '达到总时限，结果可能不完整', outputLimit: '输出达到上限，结果不完整' })[r.status]} · ${(r.elapsedMs / 1000).toFixed(1)} 秒${r.exitCode === null ? '' : ` · 退出码 ${r.exitCode}`}` : ''
  })
  function clear() { if (busy.value) return; revision++; result.value = null; error.value = ''; copied.value = false }
  async function cancel() {
    if (!busy.value) return
    cancelled = true; cancelling.value = true
    if (!jobId) return
    try { await invoke('cancel_network_probe', { jobId }) }
    catch { if (!disposed) { error.value = '取消请求未送达，任务仍受总时限保护，可再次取消。'; cancelling.value = false } }
  }
  async function start(command: string, args: Record<string, unknown> = {}) {
    if (busy.value || disposed) return
    clear(); busy.value = true; cancelled = false; cancelling.value = false
    try {
      jobId = await invoke<string>('prepare_network_probe')
      if (cancelled || disposed) {
        await cancel()
        // Consume a reservation if cancellation delivery failed, with a guaranteed
        // invalid read-only request. Never fall back to a mutating operation.
        try { await invoke('run_dns_query', { jobId, target: '', recordType: '' }) } catch { /* invalid/cancelled token */ }
        if (!disposed) error.value = '已取消，未启动命令。'
        return
      }
      const response = await invoke<DiagnosticResult>(command, { ...args, jobId })
      if (!disposed) result.value = response
    } catch (cause) { if (!disposed) error.value = cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : '请在 Windows 桌面版运行此工具。' }
    finally { jobId = null; busy.value = false; cancelling.value = false }
  }
  async function copy() {
    if (!result.value?.output) return
    const version = revision
    try { await copyText(result.value.output); if (!disposed && version === revision) copied.value = true }
    catch { if (!disposed && version === revision) error.value = '复制失败，请检查剪贴板权限。' }
  }
  onBeforeUnmount(() => { disposed = true; revision++; void cancel(); result.value = null })
  return { busy, cancelling, error, copied, result, summary, clear, cancel, start, copy }
}
