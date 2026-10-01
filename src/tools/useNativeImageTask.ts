import { onBeforeUnmount, ref } from 'vue'
import { trackedInvoke as invoke } from '../app/activity'
/** One page owns its prepared native lease. Cancellation never frees a running codec early. */
export function useNativeImageTask() {
  const busy = ref(false), cancelling = ref(false)
  let disposed = false, cancelled = false, revision = 0, jobId: string | null = null
  const current = (version: number) => !disposed && !cancelled && version === revision
  function begin() {
    if (busy.value || disposed) return null
    busy.value = true; cancelling.value = false; cancelled = false
    return ++revision
  }
  function finish(version: number) { if (version === revision) { busy.value = false; cancelling.value = false } }
  async function cancel() {
    if (!busy.value) return
    cancelled = true; cancelling.value = true
    if (jobId) { try { await invoke('cancel_network_probe', { jobId }) } catch { cancelling.value = false } }
  }
  async function execute<T>(version: number, command: string, args: Record<string, unknown>): Promise<T | undefined> {
    if (!current(version) || !busy.value) return
    jobId = await invoke<string>('prepare_network_probe')
    try {
      if (!current(version)) {
        await cancel()
        try { await invoke('run_dns_query', { jobId, target: '', recordType: '' }) } catch { /* consume cancelled reservation */ }
        return
      }
      const result = await invoke<T>(command, { ...args, jobId })
      return current(version) ? result : undefined
    } finally { jobId = null }
  }
  onBeforeUnmount(() => { disposed = true; void cancel() })
  return { busy, cancelling, begin, finish, current, cancel, execute }
}
