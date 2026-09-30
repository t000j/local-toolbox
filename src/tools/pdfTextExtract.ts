// Imported only by the dedicated, terminable text worker in production.
import 'pdfjs-dist/legacy/build/pdf.worker.mjs'
import { PDFWorker, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { loadPageDocument } from './pdfPages'
import { auditPdfPreview } from './pdfPreviewGate'
import { parsePageSelection } from './pdfPageSelection'
import { finishPdfText, PDF_TEXT_LIMITS, textAccumulator } from './pdfText'
import type { PdfTextPage } from './pdfText'
const fonts = import.meta.glob('/node_modules/pdfjs-dist/standard_fonts/*.{pfb,ttf}', { query: '?url', import: 'default', eager: true }) as Record<string, string>
export async function extractPdfText(bytes: Uint8Array, selection: string) {
  if (typeof document !== 'undefined') throw new Error('PDF文字提取仅允许在隔离线程执行。')
  const source = await loadPageDocument(bytes), count = source.getPageCount()
  const pages = selection.trim() ? parsePageSelection(selection, count) : Array.from({ length: count }, (_, i) => i + 1)
  if (pages.length > PDF_TEXT_LIMITS.pages) throw new Error('一次最多提取50页，请缩小页码范围。')
  auditPdfPreview(source)
  // Normalize the admitted document, avoiding any second parser's recovery of original syntax.
  const prepared = await source.save({ useObjectStreams: false, updateFieldAppearances: false })
  if (prepared.length > 16 * 1024 * 1024) throw new Error('规范化PDF超过16MiB。')
  let resourceError: unknown
  const assets = new AbortController()
  class BinaryDataFactory {
    async fetch({ kind, filename }: { kind: string; filename: string }) {
      try {
        const url = kind === 'standardFontDataUrl' && fonts[`/node_modules/pdfjs-dist/standard_fonts/${filename}`]
        if (!url) throw new Error('该PDF需要未提供的CMap/字体资源；不会访问外部地址。')
        const response = await fetch(url, { credentials: 'omit', redirect: 'error', signal: assets.signal })
        if (!response.ok) throw new Error('随应用提供的字体资源读取失败。')
        const data = new Uint8Array(await response.arrayBuffer())
        if (data.length > 512 * 1024) throw new Error('字体资源超过512KiB。')
        return data
      } catch (cause) { resourceError = cause; throw cause }
    }
  }
  const worker = PDFWorker.create({})
  const task = getDocument({ data: prepared, worker, BinaryDataFactory, useWorkerFetch: false, useWasm: false, useSystemFonts: false, disableFontFace: true, enableXfa: false, stopAtErrors: true, isOffscreenCanvasSupported: false, isImageDecoderSupported: false, disableAutoFetch: true, disableStream: true, disableRange: true, verbosity: 0 })
  try {
    const doc = await task.promise, accumulator = textAccumulator(), result: PdfTextPage[] = []
    if (doc.numPages !== count) throw new Error('解析器页数不一致。')
    for (const number of pages) {
      const page = await doc.getPage(number), reader = page.streamTextContent({ includeMarkedContent: false, disableNormalization: false }).getReader()
      const parts: string[] = []; let items = 0
      try {
        while (true) { const chunk = await reader.read(); if (chunk.done) break; items += accumulator.append(chunk.value, parts) }
        if (resourceError) throw resourceError
        result.push({ page: number, text: parts.join(''), items })
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); page.cleanup() }
    }
    return finishPdfText(result, count)
  } finally { assets.abort(); void task.destroy().catch(() => {}); worker.destroy() }
}
