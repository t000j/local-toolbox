import { parseMarkdown } from './markdown'
import type { WorkerReply } from './useWorkerTask'

const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<string>) => void
  postMessage: (reply: WorkerReply<string>) => void
}
scope.onmessage = ({ data }) => {
  try { scope.postMessage({ ok: true, result: parseMarkdown(data) }) }
  catch (cause) { scope.postMessage({ ok: false, error: cause instanceof Error ? cause.message : 'Markdown 预览失败。' }) }
}
