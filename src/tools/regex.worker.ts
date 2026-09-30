import { testRegex, type RegexRequest, type RegexResult } from './regex'
import type { WorkerReply } from './useWorkerTask'

const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<RegexRequest>) => void
  postMessage: (reply: WorkerReply<RegexResult>) => void
}
scope.onmessage = ({ data }) => {
  try { scope.postMessage({ ok: true, result: testRegex(data) }) }
  catch (cause) { scope.postMessage({ ok: false, error: cause instanceof Error ? cause.message : '正则测试失败。' }) }
}
