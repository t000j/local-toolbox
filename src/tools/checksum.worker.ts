import { verifyChecksum, type ChecksumRequest } from './checksum'
self.onmessage = async (event: MessageEvent<ChecksumRequest>) => {
  try { self.postMessage({ ok: true, result: await verifyChecksum(event.data) }) }
  catch (error) { self.postMessage({ ok: false, error: error instanceof Error ? error.message : '文件校验失败。' }) }
}
