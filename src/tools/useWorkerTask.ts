import { onBeforeUnmount, ref, shallowRef } from 'vue'

export type WorkerReply<T> = { ok: true; result: T } | { ok: false; error: string }

// Each run gets its own worker; edits, cancellation and navigation terminate stale work.
export function useWorkerTask<Request, Result>(createWorker: () => Worker, timeoutMs = 3000) {
  const result = shallowRef<Result | null>(null)
  const error = ref('')
  const busy = ref(false)
  let worker: Worker | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  function stop(): void {
    worker?.terminate()
    worker = null
    clearTimeout(timer)
    busy.value = false
  }
  function reset(): void { stop(); result.value = null; error.value = '' }
  function cancel(): void { reset(); error.value = '已取消本次处理。' }
  function run(request: Request): void {
    reset()
    try {
      const current = createWorker()
      worker = current
      busy.value = true
      current.onmessage = (event: MessageEvent<WorkerReply<Result>>) => {
        if (worker !== current) return
        stop()
        if (event.data.ok) result.value = event.data.result
        else error.value = event.data.error
      }
      current.onerror = (event) => {
        if (worker !== current) return
        event.preventDefault()
        stop()
        error.value = '本机处理线程发生错误，请检查输入或缩小内容。'
      }
      timer = setTimeout(() => {
        if (worker !== current) return
        stop()
        error.value = `处理超过 ${timeoutMs / 1000} 秒，已停止；请简化输入后重试。`
      }, timeoutMs)
      current.postMessage(request)
    } catch { stop(); error.value = '无法启动本机处理线程，请重试。' }
  }
  onBeforeUnmount(stop)
  return { result, error, busy, reset, cancel, run }
}
