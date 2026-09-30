import { verifyPdfRenderImages } from './pdfRenderImages'
import { PDF_PREVIEW_IMAGE_EDGE, PDF_PREVIEW_IMAGE_PIXELS } from './pdfPreviewLimits'
// Production imports this module ONLY in pdfRaster.worker.ts. The bundled parser
// is deliberately local to that dedicated outer worker; it never runs on the UI.
import 'pdfjs-dist/legacy/build/pdf.worker.mjs'
import { AnnotationMode, PDFWorker, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { RenderTask } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { PDF_RASTER_LIMITS, pdfRasterSize, validatePdfRasterOptions } from './pdfRasterLimits'
import type { PdfRasterOptions, PdfRasterOutput } from './pdfRasterLimits'
const fonts = import.meta.glob('/node_modules/pdfjs-dist/standard_fonts/*.{pfb,ttf}', { query: '?url', import: 'default', eager: true }) as Record<string, string>

export function rasterCanvasFactory() {
  const active = new Map<OffscreenCanvas, number>(); let pixels = 0
  function reserve(canvas: OffscreenCanvas, width: number, height: number) {
    const size = { width: Math.ceil(width), height: Math.ceil(height), pixels: Math.ceil(width) * Math.ceil(height) }
    if (![width, height].every(value => Number.isFinite(value) && value > 0) || size.width > PDF_PREVIEW_IMAGE_EDGE
      || size.height > PDF_PREVIEW_IMAGE_EDGE || size.pixels > PDF_PREVIEW_IMAGE_PIXELS) throw new Error('PDF中间画布超过4096边长或1200万像素。')
    const next = pixels - (active.get(canvas) ?? 0) + size.pixels
    if (next > PDF_RASTER_LIMITS.livePixels) throw new Error('PDF图片中间画布总量超过1600万像素。')
    pixels = next; active.set(canvas, size.pixels); canvas.width = size.width; canvas.height = size.height
  }
  class CanvasFactory {
    create(width: number, height: number) {
      const canvas = new OffscreenCanvas(1, 1)
      reserve(canvas, width, height)
      const context = canvas.getContext('2d')
      if (!context) throw new Error('隔离线程的OffscreenCanvas二维绘图不可用。')
      return { canvas, context }
    }
    reset(target: { canvas: OffscreenCanvas }, width: number, height: number) { reserve(target.canvas, width, height) }
    destroy(target: { canvas: OffscreenCanvas | null; context: OffscreenCanvasRenderingContext2D | null }) {
      if (target.canvas) { pixels -= active.get(target.canvas) ?? 0; active.delete(target.canvas); target.canvas.width = target.canvas.height = 0 }
      target.canvas = null; target.context = null
    }
  }
  return { CanvasFactory, clear: () => { for (const canvas of active.keys()) canvas.width = canvas.height = 0; active.clear(); pixels = 0 } }
}
// Canvas/SVG URL filters need a DOM and are unsupported in this isolated path.
// Throw rather than silently returning a visually incorrect no-op filter.
export class RasterFilterFactory {
  addFilter(maps: unknown) { if (!maps) return 'none'; throw new Error('隔离图片导出暂不支持DOM/SVG转移滤镜。') }
  addHCMFilter(): never { throw new Error('隔离图片导出不支持DOM高对比度滤镜。') }
  addAlphaFilter(): never { throw new Error('隔离图片导出不支持DOM透明度滤镜。') }
  addLuminosityFilter(): never { throw new Error('隔离图片导出不支持DOM亮度滤镜。') }
  addKnockoutFilter(): never { throw new Error('隔离图片导出不支持DOM挖空滤镜。') }
  destroy() {}
}
export async function renderPreparedPdfRaster(bytes: Uint8Array, request: PdfRasterOptions): Promise<PdfRasterOutput> {
  const options = validatePdfRasterOptions(request)
  if (typeof document !== 'undefined') throw new Error('PDF图片渲染仅允许在隔离线程执行。')
  if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > PDF_RASTER_LIMITS.preparedBytes) throw new Error('已校验PDF字节大小无效。')
  const assets = new AbortController(), budget = rasterCanvasFactory(), factory = new budget.CanvasFactory()
  let resourceError: unknown
  class BinaryDataFactory {
    async fetch({ kind, filename }: { kind: string; filename: string }) {
      try {
        const asset = kind === 'standardFontDataUrl' && fonts[`/node_modules/pdfjs-dist/standard_fonts/${filename}`]
        if (!asset) throw new Error('图片导出不支持此CMap/WASM/字体资源；不会访问外部地址。')
        const response = await fetch(asset, { credentials: 'omit', redirect: 'error', signal: assets.signal })
        if (!response.ok) throw new Error('本地标准字体资源加载失败。')
        const data = new Uint8Array(await response.arrayBuffer())
        if (data.length > 512 * 1024) throw new Error('本地字体资源超过512KiB。')
        return data
      } catch (cause) { resourceError = cause; throw cause }
    }
  }
  // The worker bundle above installs the local WorkerMessageHandler. Its loopback
  // transport shares the outer dedicated worker, so terminating that worker kills
  // parsing, rendering and encoding together, even if their event loop is blocked.
  const worker = PDFWorker.create({})
  let task: ReturnType<typeof getDocument> | undefined, rendering: RenderTask | undefined
  try {
    task = getDocument({ data: new Uint8Array(bytes), worker, CanvasFactory: budget.CanvasFactory, FilterFactory: RasterFilterFactory, BinaryDataFactory, useWorkerFetch: false, useWasm: false, useSystemFonts: false, disableFontFace: true, enableXfa: false, stopAtErrors: true, maxImageSize: PDF_PREVIEW_IMAGE_PIXELS, canvasMaxAreaInBytes: PDF_PREVIEW_IMAGE_PIXELS * 4, isOffscreenCanvasSupported: false, isImageDecoderSupported: false, disableAutoFetch: true, disableStream: true, disableRange: true, verbosity: 0 })
    const doc = await task.promise
    if (doc.numPages !== options.pages.length) throw new Error('渲染PDF页数与已校验清单不一致。')
    const plans = []; let totalPixels = 0, totalBytes = 0
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i), viewport = page.getViewport({ scale: options.dpi / 72 }), size = pdfRasterSize(viewport.width, viewport.height)
      totalPixels += size.pixels
      if (totalPixels > PDF_RASTER_LIMITS.totalPixels) throw new Error('所选页总量超过1600万像素；请降低DPI或减少页数。')
      plans.push({ page, viewport, size })
    }
    const images = [], mime = options.format === 'png' ? 'image/png' : 'image/jpeg'
    for (const [i, { page, viewport, size }] of plans.entries()) {
      const target = factory.create(size.width, size.height)
      try {
        rendering = page.render({ canvas: target.canvas as unknown as HTMLCanvasElement, viewport, annotationMode: AnnotationMode.DISABLE, background: 'rgb(255,255,255)' })
        await rendering.promise
        rendering = undefined
        if (resourceError) throw resourceError
      verifyPdfRenderImages(page)
        const blob = await target.canvas.convertToBlob({ type: mime, quality: options.quality })
        if (blob.type !== mime || !blob.size) throw new Error('浏览器不支持请求的图片编码格式。')
        totalBytes += blob.size
        if (totalBytes > PDF_RASTER_LIMITS.outputBytes) throw new Error('图片总输出超过32MiB。')
        images.push({ page: options.pages[i]!, width: size.width, height: size.height, bytes: new Uint8Array(await blob.arrayBuffer()) })
      } finally { rendering?.cancel(); rendering = undefined; factory.destroy(target); page.cleanup() }
    }
    return { images, dpi: options.dpi, format: options.format, mime, totalPixels, totalBytes }
  } finally {
    assets.abort(); rendering?.cancel(); budget.clear()
    if (task) void task.destroy().catch(() => {})
    worker.destroy()
  }
}
