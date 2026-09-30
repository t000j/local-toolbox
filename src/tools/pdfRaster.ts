import { PDF_RASTER_LIMITS, validatePdfRasterOptions, validatePdfRasterOutput } from './pdfRasterLimits'
import type { PdfRasterOptions, PdfRasterOutput } from './pdfRasterLimits'
export { PDF_RASTER_LIMITS } from './pdfRasterLimits'
export type { PdfRasterOptions, PdfRasterOutput, PdfRasterImage } from './pdfRasterLimits'
// No PDF parser, decoder, canvas or image encoder is imported into the UI thread.
export async function renderPdfRaster(file: File, request: PdfRasterOptions, signal: AbortSignal): Promise<PdfRasterOutput> {
  const options = validatePdfRasterOptions(request)
  if (!(file instanceof File) || !file.size || file.size > PDF_RASTER_LIMITS.inputBytes) throw new Error('请选择1字节至8MiB的PDF。')
  if (signal.aborted) throw new Error('PDF图片导出已取消。')
  return new Promise((resolve, reject) => {
    let worker: Worker | undefined, timer: ReturnType<typeof setTimeout> | undefined, settled = false
    const finish = (cause?: unknown, result?: PdfRasterOutput) => {
      if (settled) return
      settled = true; clearTimeout(timer); signal.removeEventListener('abort', abort); worker?.terminate()
      if (cause) reject(cause); else resolve(result!)
    }
    const abort = () => finish(new Error('PDF图片导出已取消。'))
    try {
      worker = new Worker(new URL('./pdfRaster.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = event => {
        if (settled) return
        try {
          if (event.data?.ok !== true) throw new Error(typeof event.data?.error === 'string' ? event.data.error : '图片处理线程返回无效结果。')
          finish(undefined, validatePdfRasterOutput(event.data.result, options))
        } catch (cause) { finish(cause) }
      }
      worker.onerror = event => { event.preventDefault(); finish(new Error('隔离图片线程不可用或处理失败；需要支持Worker、OffscreenCanvas二维绘图和DOMMatrix的环境。不会退回界面线程处理。')) }
      worker.onmessageerror = () => finish(new Error('图片线程结果无法读取。'))
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted) { abort(); return }
      timer = setTimeout(() => finish(new Error('PDF图片导出超过30秒，已终止隔离线程。')), PDF_RASTER_LIMITS.timeoutMs)
      worker.postMessage({ file, options })
    } catch (cause) { finish(cause) }
  })
}
