import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFNull, PDFRawStream } from 'pdf-lib'
import { loadPageDocument } from './pdfPages'
import { preflightPdf } from './pdfPreflight'
import { auditPdf } from './pdfAudit'
import { pdfPageFingerprinter } from './pdfPageFingerprint'
import { boundedInflatePdf } from './pdfBoundedInflate'
import { parseImageHeader } from './imageHeaders'
import { pdfFail } from './pdfRawSyntax'
export interface PdfImagePixels { bytes: Uint8Array; kind: 'jpeg' | 'rgb'; width: number; height: number }
export interface PdfCompressionResult { bytes: Uint8Array; before: number; after: number; images: number; changed: number; skipped: number; reasons: string[]; pages: number }
export type PdfJpegEncoder = (image: PdfImagePixels, quality: number) => Promise<Uint8Array>
const imageKeys = new Set('Type Subtype Width Height ColorSpace BitsPerComponent Filter Length Interpolate Intent Metadata Name'.split(' '))
export function inspectPlainJpeg(bytes: Uint8Array, width: number, height: number): void {
  const header = parseImageHeader(bytes)
  if (header.format !== 'jpeg' || header.width !== width || header.height !== height || header.orientation !== 1 || !header.fields.some(field => field.name === '颜色分量' && field.value === '3') || header.fields.some(field => field.name === 'ICC 配置' || field.name === 'EXIF 色彩空间' && field.value !== 'sRGB')) pdfFail('只处理尺寸一致、方向1、无ICC的三通道8位JPEG。')
}
function candidate(doc: PDFDocument, stream: PDFRawStream): PdfImagePixels {
  const dict = stream.dict, get = (key: string) => doc.context.lookup(dict.get(PDFName.of(key)))
  for (const key of dict.keys()) if (!imageKeys.has(key.decodeText())) pdfFail(`图片含${key.decodeText()}参数；保持原始图片。`)
  const width = get('Width'), height = get('Height'), bits = get('BitsPerComponent'), color = get('ColorSpace')
  if (!(width instanceof PDFNumber) || !(height instanceof PDFNumber) || !(bits instanceof PDFNumber) || bits.asNumber() !== 8 || !(color instanceof PDFName) || color.decodeText() !== 'DeviceRGB') pdfFail('只重编码8位DeviceRGB图片；蒙版/透明度/特殊色彩保持原始图片。')
  const w = width.asNumber(), h = height.asNumber()
  if (![w,h].every(n => Number.isSafeInteger(n) && n > 0 && n <= 4096) || w * h > 4_000_000) pdfFail('图片超过4096边长/400万像素；保持原始图片。')
  const filter = get('Filter'), filters = filter instanceof PDFArray ? filter.asArray().map(value => doc.context.lookup(value)) : filter && filter !== PDFNull ? [filter] : []
  if (filters.length > 1 || filters.some(value => !(value instanceof PDFName) || !['FlateDecode', 'DCTDecode'].includes(value.decodeText()))) pdfFail('只重编码未压缩、单层Flate或DCT图片。')
  const bytes = stream.getContents()
  if (filters[0] instanceof PDFName && filters[0].decodeText() === 'DCTDecode') { inspectPlainJpeg(bytes, w, h); return { bytes: new Uint8Array(bytes), kind: 'jpeg', width: w, height: h } }
  const raw = filters.length ? boundedInflatePdf(bytes, w * h * 3) : new Uint8Array(bytes)
  if (raw.length !== w * h * 3) pdfFail('RGB像素数据长度不匹配；保持原始图片。')
  return { bytes: raw, kind: 'rgb', width: w, height: h }
}
export async function compressPdfImages(input: Uint8Array, quality: number, encode: PdfJpegEncoder): Promise<PdfCompressionResult> {
  if (!Number.isInteger(quality) || quality < 10 || quality > 95 || typeof encode !== 'function') pdfFail('JPEG质量须为10–95整数。')
  if (!(input instanceof Uint8Array) || !input.length || input.length > 8 * 1024 * 1024) pdfFail('PDF输入限1字节至8MiB。')
  const snapshot = new Uint8Array(input), doc = await loadPageDocument(snapshot), originalSize = snapshot.length
  let images = 0, changed = 0, skipped = 0, pixels = 0
  const reasons = new Set<string>()
  for (const [ref, object] of doc.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream) || doc.context.lookup(object.dict.get(PDFName.of('Subtype')))?.toString() !== '/Image') continue
    images++
    if (images > 64) pdfFail('最多处理64个独立图片资源。')
    let image: PdfImagePixels
    try { image = candidate(doc, object) } catch (cause) { skipped++; reasons.add(cause instanceof Error ? cause.message : String(cause)); continue }
    pixels += image.width * image.height; if (pixels > 16_000_000) pdfFail('待重编码图片累计超过1600万像素。')
    const jpeg = await encode(image, quality / 100)
    if (!(jpeg instanceof Uint8Array) || !jpeg.length || jpeg.length > 8 * 1024 * 1024) pdfFail('JPEG编码结果大小无效。')
    inspectPlainJpeg(jpeg, image.width, image.height)
    if (jpeg.length >= object.getContentsSize()) { skipped++; reasons.add('候选JPEG不小于原图片，已保留原始图片字节。'); continue }
    const dict = object.dict.clone(doc.context) as PDFDict
    dict.set(PDFName.of('Filter'), PDFName.of('DCTDecode')); dict.set(PDFName.of('Length'), PDFNumber.of(jpeg.length))
    doc.context.assign(ref, PDFRawStream.of(dict, new Uint8Array(jpeg))); changed++
  }
  if (!changed) return { bytes: snapshot, before: originalSize, after: originalSize, images, changed, skipped, reasons: [...reasons], pages: doc.getPageCount() }
  const fingerprint = pdfPageFingerprinter(doc), expected = []
  for (const page of doc.getPages()) expected.push(await fingerprint(page))
  const bytes = await doc.save({ useObjectStreams: false, addDefaultPage: false, updateFieldAppearances: false, objectsPerTick: 20 })
  if (bytes.length > 16 * 1024 * 1024) pdfFail('压缩输出超过16MiB。')
  const raw = preflightPdf(bytes, 16 * 1024 * 1024), output = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: false, throwOnInvalidObject: true, capNumbers: false })
  if (auditPdf(output, raw) !== expected.length) pdfFail('输出页数校验失败。')
  const verify = pdfPageFingerprinter(output)
  for (const [index, page] of output.getPages().entries()) if (await verify(page) !== expected[index]) pdfFail('压缩保存后内容/资源/页面属性不一致。')
  return { bytes, before: originalSize, after: bytes.length, images, changed, skipped, reasons: [...reasons], pages: expected.length }
}
