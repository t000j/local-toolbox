import { compareSafeJson, type JsonChange } from './safeJson'
import type { WorkerReply } from './useWorkerTask'
const scope = globalThis as unknown as { onmessage: (event: MessageEvent<{ left: string; right: string }>) => void; postMessage: (reply: WorkerReply<JsonChange[]>) => void }
scope.onmessage = ({ data }) => {
  try { scope.postMessage({ ok: true, result: compareSafeJson(data.left, data.right) }) }
  catch (cause) { scope.postMessage({ ok: false, error: cause instanceof Error ? cause.message : 'JSON 比较失败。' }) }
}
