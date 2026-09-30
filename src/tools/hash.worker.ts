import { calculateHash, type HashRequest } from './hash'
self.onmessage = async (event: MessageEvent<HashRequest>) => {
  try { self.postMessage({ ok: true, result: await calculateHash(event.data) }) }
  catch (error) { self.postMessage({ ok: false, error: error instanceof Error ? error.message : '摘要计算失败。' }) }
}
