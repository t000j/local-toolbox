import { formatSafeJson } from './safeJson'
import type { WorkerReply } from './useWorkerTask'
const scope = globalThis as unknown as { onmessage: (event: MessageEvent<{ input: string; compact: boolean }>) => void; postMessage: (reply: WorkerReply<string>) => void }
scope.onmessage = ({ data }) => {
  try { scope.postMessage({ ok: true, result: formatSafeJson(data.input, data.compact) }) }
  catch (cause) { scope.postMessage({ ok: false, error: cause instanceof Error ? cause.message : 'JSON 处理失败。' }) }
}
