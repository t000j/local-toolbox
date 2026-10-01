/// <reference lib="webworker" />
import { inspectPdfMetadata } from './pdfMetadata'
let started = false
self.onmessage = async (event: MessageEvent<File>) => {
  if (started) return
  started = true
  try {
    const file = event.data
    if (!(file instanceof File) || !file.size || file.size > 8 * 1024 * 1024) throw new Error('PDF须为1字节至8MiB。')
    self.postMessage({ ok: true, result: await inspectPdfMetadata(new Uint8Array(await file.arrayBuffer())) })
  } catch (cause) { self.postMessage({ ok: false, error: cause instanceof Error ? cause.message : '元数据读取失败。' }) }
}
