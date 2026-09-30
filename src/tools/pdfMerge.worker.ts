/// <reference lib="webworker" />
import { mergePdfs } from './pdfMerge'
self.onmessage = async (event: MessageEvent<File[]>) => {
  try {
    const files = event.data
    if (!Array.isArray(files) || files.length < 2 || files.length > 8 || files.some(file => !file.size || file.size > 8 * 1024 * 1024) || files.reduce((sum, file) => sum + file.size, 0) > 16 * 1024 * 1024) throw new Error('选择2–8个PDF，每份最多8MiB，总输入最多16MiB。')
    const inputs = []
    for (const file of files) inputs.push({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) })
    const result = await mergePdfs(inputs)
    self.postMessage({ ok: true, result }, { transfer: [result.bytes.buffer] })
  } catch (cause) { self.postMessage({ ok: false, error: cause instanceof Error ? cause.message : String(cause) }) }
}
