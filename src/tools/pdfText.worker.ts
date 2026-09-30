/// <reference lib="webworker" />
import { extractPdfText } from './pdfTextExtract'
let started = false
self.onmessage = async (event: MessageEvent<{ file: File; selection: string }>) => {
  if (started) return
  started = true
  try {
    const { file, selection } = event.data
    if (!(file instanceof File) || !file.size || file.size > 8 * 1024 * 1024 || typeof selection !== 'string' || selection.length > 2000) throw new Error('输入须为1字节至8MiB的PDF及有效页码范围。')
    const result = await extractPdfText(new Uint8Array(await file.arrayBuffer()), selection)
    self.postMessage({ ok: true, result }, { transfer: [result.bytes.buffer as ArrayBuffer] })
  } catch (cause) { self.postMessage({ ok: false, error: cause instanceof Error ? cause.message : '文字提取失败。' }) }
}
