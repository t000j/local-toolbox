/// <reference lib="webworker" />
import { preparePdfRaster } from './pdfRasterPrepare'
import { PDF_RASTER_LIMITS, validatePdfRasterOptions, validatePdfRasterOutput } from './pdfRasterLimits'
import { renderPreparedPdfRaster } from './pdfRasterRenderer'
import type { PdfRasterOptions } from './pdfRasterLimits'
let started = false
self.onmessage = async (event: MessageEvent<{ file: File; options: PdfRasterOptions }>) => {
  if (started) return
  started = true
  try {
    if (typeof document !== 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof DOMMatrix === 'undefined' || typeof Path2D === 'undefined' || typeof ImageData === 'undefined') throw new Error('当前环境不支持隔离的OffscreenCanvas绘图；未启用界面线程回退。')
    const { file } = event.data, options = validatePdfRasterOptions(event.data.options)
    if (!(file instanceof File) || !file.size || file.size > PDF_RASTER_LIMITS.inputBytes) throw new Error('请选择1字节至8MiB的PDF。')
    const prepared = await preparePdfRaster(new Uint8Array(await file.arrayBuffer()), options)
    const result = validatePdfRasterOutput({ ...await renderPreparedPdfRaster(prepared.bytes, options), sourcePages: prepared.sourcePages }, options)
    self.postMessage({ ok: true, result }, { transfer: result.images.map(image => image.bytes.buffer as ArrayBuffer) })
  } catch (cause) { self.postMessage({ ok: false, error: cause instanceof Error ? cause.message : 'PDF图片导出失败。' }) }
}
