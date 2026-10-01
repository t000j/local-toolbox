import { parsePng } from './imagePngHeader'
import { parseJpeg } from './imageJpegHeader'
export const PDF_RASTER_LIMITS = Object.freeze({ inputBytes: 8 * 1024 * 1024, preparedBytes: 16 * 1024 * 1024, pages: 8, minDpi: 36, maxDpi: 300, edge: 4096, pagePixels: 4_000_000, totalPixels: 16_000_000, outputBytes: 32 * 1024 * 1024, livePixels: 16_000_000, timeoutMs: 30_000 })
export interface PdfRasterOptions { pages: number[]; dpi: number; format: 'png' | 'jpeg'; quality?: number }
export interface PdfRasterImage { page: number; width: number; height: number; bytes: Uint8Array }
export interface PdfRasterOutput { images: PdfRasterImage[]; dpi: number; format: 'png' | 'jpeg'; mime: 'image/png' | 'image/jpeg'; totalPixels: number; totalBytes: number; sourcePages?: number }
export function validatePdfRasterOptions(value: PdfRasterOptions): PdfRasterOptions {
  if (!value || !Array.isArray(value.pages) || !value.pages.length || value.pages.length > PDF_RASTER_LIMITS.pages || value.pages.some(n => !Number.isInteger(n) || n < 1 || n > 200) || new Set(value.pages).size !== value.pages.length) throw new Error('请选择1–8个不重复页码（1–200）。')
  if (!Number.isInteger(value.dpi) || value.dpi < 36 || value.dpi > 300) throw new Error('DPI须为36–300的整数。')
  if (!['png', 'jpeg'].includes(value.format)) throw new Error('图片格式仅支持PNG或JPEG。')
  if (value.quality !== undefined && (!Number.isFinite(value.quality) || value.quality < 0.1 || value.quality > 1)) throw new Error('JPEG质量须为0.1–1。')
  return { pages: [...value.pages], dpi: value.dpi, format: value.format, quality: value.quality ?? 0.9 }
}
// Dimensions must come from PDF.js's rotated, UserUnit-aware viewport at dpi/72.
// Reject oversized requests rather than silently lowering the requested DPI.
export function pdfRasterSize(width: number, height: number) {
  const w = Math.ceil(width), h = Math.ceil(height), pixels = w * h
  if (![width, height].every(n => Number.isFinite(n) && n > 0) || w > PDF_RASTER_LIMITS.edge || h > PDF_RASTER_LIMITS.edge || !Number.isSafeInteger(pixels) || pixels > PDF_RASTER_LIMITS.pagePixels) throw new Error('每页图片须不超过4096像素边长及400万像素；请降低DPI。')
  return { width: w, height: h, pixels }
}
export function validatePdfRasterOutput(value: PdfRasterOutput, options: PdfRasterOptions): PdfRasterOutput {
  const mime = options.format === 'png' ? 'image/png' : 'image/jpeg'
  if (!value || value.format !== options.format || value.mime !== mime || value.dpi !== options.dpi || !Array.isArray(value.images) || value.images.length !== options.pages.length) throw new Error('图片输出与请求不一致。')
  let totalPixels = 0, totalBytes = 0
  for (const [index, image] of value.images.entries()) {
    if (!image || image.page !== options.pages[index] || !Number.isInteger(image.width) || !Number.isInteger(image.height) || !(image.bytes instanceof Uint8Array) || !image.bytes.length) throw new Error('图片页面或输出字节无效。')
    totalPixels += pdfRasterSize(image.width, image.height).pixels; totalBytes += image.bytes.length
    if (totalPixels > PDF_RASTER_LIMITS.totalPixels || totalBytes > PDF_RASTER_LIMITS.outputBytes) throw new Error('图片总量须不超过1600万像素及32MiB。')
    const b = image.bytes
    if (options.format === 'png' ? b.length < 8 || ![137,80,78,71,13,10,26,10].every((n, i) => b[i] === n) : b.length < 4 || b[0] !== 255 || b[1] !== 216 || b[b.length - 2] !== 255 || b[b.length - 1] !== 217) throw new Error('浏览器返回的图片格式不匹配。')
    const header = options.format === 'png' ? parsePng(b) : parseJpeg(b)
    if (header.width !== image.width || header.height !== image.height || header.animated || header.orientation !== 1) throw new Error('图片编码尺寸或方向与请求不一致。')
  }
  if (value.sourcePages !== undefined && (!Number.isInteger(value.sourcePages) || value.sourcePages < Math.max(...options.pages) || value.sourcePages > 200)) throw new Error('原PDF页数无效。')
  if (totalPixels > PDF_RASTER_LIMITS.totalPixels || totalBytes > PDF_RASTER_LIMITS.outputBytes || value.totalPixels !== totalPixels || value.totalBytes !== totalBytes) throw new Error('图片总量须不超过1600万像素及32MiB。')
  return value
}
