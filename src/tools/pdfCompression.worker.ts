/// <reference lib="webworker" />
import { compressPdfImages } from './pdfImageCompression'
import { encodePdfJpeg } from './pdfJpegEncoder'
self.onmessage = async (event: MessageEvent<{ file: File; quality: number }>) => {
  try {
    const { file, quality } = event.data
    if (!file || !file.size || file.size > 8 * 1024 * 1024) throw new Error('PDF输入限1字节至8MiB。')
    const result = await compressPdfImages(new Uint8Array(await file.arrayBuffer()), quality, encodePdfJpeg)
    self.postMessage({ ok: true, result }, { transfer: [result.bytes.buffer] })
  } catch (cause) { self.postMessage({ ok: false, error: cause instanceof Error ? cause.message : String(cause) }) }
}
