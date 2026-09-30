import { AnnotationMode, PDFWorker, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { RenderTask } from 'pdfjs-dist/legacy/build/pdf.mjs'
import PdfJsWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs?worker'
import { previewCanvasFactory, thumbnailSize } from './pdfPreviewCanvas'
// All font URLs are build-time bundled assets. PDF content can only request an exact known name.
const fonts = import.meta.glob('/node_modules/pdfjs-dist/standard_fonts/*.{pfb,ttf}', { query: '?url', import: 'default', eager: true }) as Record<string, string>
function localBinaryFactory(onError: (cause: unknown) => void, signal: AbortSignal) { return class LocalBinaryData {
  async fetch({ kind, filename }: { kind: string; filename: string }) {
    try {
    const asset = kind === 'standardFontDataUrl' && fonts[`/node_modules/pdfjs-dist/standard_fonts/${filename}`]
    if (!asset) throw new Error('缩略图不支持此CMap/WASM/字体资源；不会访问外部地址。')
    const response = await fetch(asset, { credentials: 'omit', redirect: 'error', signal })
    if (!response.ok) throw new Error('本地字体资源加载失败。')
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.length > 512 * 1024) throw new Error('本地字体资源过大。')
    return bytes
    } catch (cause) { onError(cause); throw cause }
  }
} }
export async function renderPdfThumbnails(bytes: Uint8Array, count: number, signal: AbortSignal): Promise<Blob[]> {
  if (!(bytes instanceof Uint8Array) || bytes.length > 16 * 1024 * 1024 || !Number.isInteger(count) || count < 1 || count > 12 || signal.aborted) throw new Error('缩略图请求无效或已取消。')
  // Explicit real Worker port: never allow PDF.js to silently fall back to its main-thread parser.
  const assetController = new AbortController()
  let resourceError: unknown
  const port = new PdfJsWorker(), worker = PDFWorker.create({ port }), budget = previewCanvasFactory()
  const task = getDocument({ data: new Uint8Array(bytes), worker, CanvasFactory: budget.CanvasFactory, BinaryDataFactory: localBinaryFactory(cause => { resourceError = cause }, assetController.signal), useWorkerFetch: false, useWasm: false, useSystemFonts: false, disableFontFace: true, enableXfa: false, stopAtErrors: true, maxImageSize: 1_048_576, canvasMaxAreaInBytes: 4_194_304, isOffscreenCanvasSupported: false, isImageDecoderSupported: false, disableAutoFetch: true, disableStream: true, disableRange: true, verbosity: 0 })
  let rendering: RenderTask | undefined, canvas: HTMLCanvasElement | undefined, totalBytes = 0, stopped = false
  let rejectStop!: (reason: Error) => void
  const stop = new Promise<never>((_, reject) => { rejectStop = reject })
  const wait = <T>(promise: Promise<T>): Promise<T> => Promise.race([promise, stop])
  const abort = () => { assetController.abort(); stopped = true; rejectStop(new Error('缩略图已取消或超过20秒。')); rendering?.cancel(); void task.destroy().catch(() => {}); worker.destroy(); port.terminate() }
  signal.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(abort, 20_000)
  try {
    const doc = await wait(task.promise)
    if (doc.numPages !== count) throw new Error('缩略图页数与已校验结果不一致。')
    const blobs: Blob[] = []
    for (let number = 1; number <= count; number++) {
      if (stopped || signal.aborted) throw new Error('已取消缩略图。')
      const page = await wait(doc.getPage(number)), natural = page.getViewport({ scale: 1 }), size = thumbnailSize(natural.width, natural.height)
      canvas = document.createElement('canvas'); canvas.width = size.width; canvas.height = size.height
      rendering = page.render({ canvas, viewport: page.getViewport({ scale: size.scale }), annotationMode: AnnotationMode.DISABLE, background: 'rgb(255,255,255)' })
      rendering.onContinue = (next: () => void) => { if (stopped || signal.aborted) rendering?.cancel(); else setTimeout(next, 0) }
      await wait(rendering.promise)
      if (resourceError) throw resourceError
      const blob = await wait(new Promise<Blob>((resolve, reject) => canvas!.toBlob(value => value ? resolve(value) : reject(new Error('缩略图编码失败。')), 'image/png')))
      totalBytes += blob.size; if (totalBytes > 4 * 1024 * 1024) throw new Error('缩略图总输出超过4MiB。')
      blobs.push(blob); canvas.width = canvas.height = 0; canvas = undefined; page.cleanup(); rendering = undefined
    }
    return blobs
  } finally {
    assetController.abort(); clearTimeout(timer); signal.removeEventListener('abort', abort); rendering?.cancel(); if (canvas) canvas.width = canvas.height = 0
    // Terminate first; destruction is best-effort and must not keep cancelled UI pending forever.
    void task.destroy().catch(() => {}); worker.destroy(); port.terminate(); budget.clear()
  }
}
