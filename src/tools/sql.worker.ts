import { formatSql, type SqlRequest } from './sql'
import type { WorkerReply } from './useWorkerTask'

const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<SqlRequest>) => void
  postMessage: (reply: WorkerReply<string>) => void
}
scope.onmessage = ({ data }) => {
  try { scope.postMessage({ ok: true, result: formatSql(data) }) }
  catch (cause) { scope.postMessage({ ok: false, error: cause instanceof Error ? cause.message : 'SQL 格式化失败。' }) }
}
