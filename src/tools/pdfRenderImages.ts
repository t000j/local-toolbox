import type { PDFPageProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { PDF_PREVIEW_IMAGE_EDGE, PDF_PREVIEW_IMAGE_PIXELS, PDF_PREVIEW_TOTAL_IMAGE_PIXELS } from './pdfPreviewLimits'

/** Pinned PDF.js can resolve failed image decoding as null even with stopAtErrors.
 * Inspect the actual render's resolved resource stores before publishing pixels.
 * Do not call getOperatorList here: it has a distinct intent/cache and would
 * launch a second image decode. This detects omission/bounds, not pixel fidelity. */
export function verifyPdfRenderImages(page: PDFPageProxy): void {
  let nodes = 0, pixels = 0
  const seen = new Set<unknown>()
  for (const objects of [page.objs, page.commonObjs]) for (const [, image] of objects) {
    if (++nodes > 100_000) throw new Error('PDF绘制资源数量超限。')
    if (image === null || image === undefined) throw new Error('PDF图片或绘制资源解码失败，拒绝静默省略内容。')
    if (typeof image !== 'object' || seen.has(image)) continue
    seen.add(image)
    if (!('width' in image) && !('height' in image)) continue // Fonts/glyph paths are not raster image receipts.
    const decoded = image as { width?: number; height?: number; kind?: number; data?: Uint8Array; bitmap?: unknown }
    const width = decoded.width ?? 0, height = decoded.height ?? 0
    if (![width, height].every(n => Number.isSafeInteger(n) && n > 0 && n <= PDF_PREVIEW_IMAGE_EDGE)
      || width * height > PDF_PREVIEW_IMAGE_PIXELS || decoded.bitmap) throw new Error('PDF图片解码尺寸或表示不符合预算。')
    const expected = decoded.kind === undefined || decoded.kind === 1 ? Math.ceil(width / 8) * height
      : decoded.kind === 2 ? width * height * 3 : decoded.kind === 3 ? width * height * 4 : -1
    if (!ArrayBuffer.isView(decoded.data) || decoded.data.BYTES_PER_ELEMENT !== 1 || decoded.data.byteLength !== expected) {
      throw new Error('PDF图片解码数据缺失或长度不符，拒绝不完整画面。')
    }
    pixels += width * height
    if (pixels > PDF_PREVIEW_TOTAL_IMAGE_PIXELS) throw new Error('PDF已解码图片累计超过1600万像素。')
  }
}
