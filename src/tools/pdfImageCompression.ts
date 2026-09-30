import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFNull, PDFRawStream } from 'pdf-lib'
import { loadPageDocument } from './pdfPages'
import { preflightPdf } from './pdfPreflight'
import { auditPdf } from './pdfAudit'
import { pdfPageFingerprinter } from './pdfPageFingerprint'
import { boundedInflatePdf } from './pdfBoundedInflate'
import { parseImageHeader } from './imageHeaders'
import { pdfFail } from './pdfRawSyntax'
import { safeImageStreams } from './pdfImageRoles'
export interface PdfImagePixels { bytes: Uint8Array; kind: 'jpeg' | 'rgb' | 'gray'; width: number; height: number; components?: 1 | 3 }
export interface PdfCompressionResult { bytes: Uint8Array; before: number; after: number; images: number; changed: number; skipped: number; reasons: string[]; pages: number }
export type PdfJpegEncoder = (image: PdfImagePixels, quality: number) => Promise<Uint8Array>
const imageKeys = new Set('Type Subtype Width Height ColorSpace BitsPerComponent Filter Length Interpolate Intent Metadata Name'.split(' '))
export function inspectPlainJpeg(bytes: Uint8Array, width: number, height: number, components: 1 | 3 = 3): void {
  const header = parseImageHeader(bytes)
  if (header.format !== 'jpeg' || header.width !== width || header.height !== height || header.orientation !== 1 || !header.fields.some(field => field.name === '颜色分量' && field.value === String(components)) || header.fields.some(field => field.name === 'ICC 配置' || field.name === 'EXIF 色彩空间' && field.value !== 'sRGB')) pdfFail('只处理尺寸一致、方向1、无ICC且分量匹配的8位JPEG。')
}
function candidate(doc: PDFDocument, stream: PDFRawStream, sampleAllowance: number, pixelAllowance: number): PdfImagePixels {
  const dict = stream.dict, get = (key: string) => doc.context.lookup(dict.get(PDFName.of(key)))
  for (const key of dict.keys()) if (!imageKeys.has(key.decodeText())) pdfFail(`图片含${key.decodeText()}参数；保持原始图片。`)
  const width = get('Width'), height = get('Height'), bits = get('BitsPerComponent'), color = get('ColorSpace')
  if (!(width instanceof PDFNumber) || !(height instanceof PDFNumber) || !(bits instanceof PDFNumber) || bits.asNumber() !== 8 || !(color instanceof PDFName) || !['DeviceGray', 'DeviceRGB'].includes(color.decodeText())) pdfFail('只重编码8位DeviceGray/DeviceRGB图片；蒙版/透明度/特殊色彩保持原始图片。')
  const w = width.asNumber(), h = height.asNumber()
  if (![w,h].every(n => Number.isSafeInteger(n) && n > 0 && n <= 4096) || w * h > 12_000_000) pdfFail('图片超过4096边长/1200万像素；保持原始图片。')
  if (w * h > pixelAllowance) pdfFail('待编码图片累计超过1600万像素；保持原始图片。')
  const components = color.decodeText() === 'DeviceGray' ? 1 : 3, samples = w * h * components
  if (samples > sampleAllowance) pdfFail('待编码源分量累计超过32MiB；保持原始图片。')
  const filter = get('Filter'), filters = filter instanceof PDFArray ? filter.asArray().map(value => doc.context.lookup(value)) : filter && filter !== PDFNull ? [filter] : []
  if (filters.length > 1 || filters.some(value => !(value instanceof PDFName) || !['FlateDecode', 'DCTDecode'].includes(value.decodeText()))) pdfFail('只重编码未压缩、单层Flate或DCT图片。')
  const bytes = stream.getContents()
  if (filters[0] instanceof PDFName && filters[0].decodeText() === 'DCTDecode') { inspectPlainJpeg(bytes, w, h, components); return { bytes: new Uint8Array(bytes), kind: 'jpeg', width: w, height: h, components } }
  const raw = filters.length ? boundedInflatePdf(bytes, samples) : new Uint8Array(bytes)
  if (raw.length !== samples) pdfFail('图片分量数据长度不匹配；保持原始图片。')
  return { bytes: raw, kind: components === 1 ? 'gray' : 'rgb', width: w, height: h, components }
}
export async function compressPdfImages(input: Uint8Array, quality: number, encode: PdfJpegEncoder): Promise<PdfCompressionResult> {
  if (!Number.isInteger(quality) || quality < 10 || quality > 95 || typeof encode !== 'function') pdfFail('JPEG质量须为10–95整数。')
  if (!(input instanceof Uint8Array) || !input.length || input.length > 8 * 1024 * 1024) pdfFail('PDF输入限1字节至8MiB。')
  const snapshot = new Uint8Array(input), doc = await loadPageDocument(snapshot), originalSize = snapshot.length
  const safeImages = safeImageStreams(doc)
  const originalContent = pdfPageFingerprinter(doc, 'content'), expectedContent = []
  for (const page of doc.getPages()) expectedContent.push(await originalContent(page))
  let images = 0, changed = 0, skipped = 0, pixels = 0, samples = 0
  const reasons = new Set<string>()
  for (const [ref, object] of doc.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream) || doc.context.lookup(object.dict.get(PDFName.of('Subtype')))?.toString() !== '/Image') continue
    images++
    if (images > 64) pdfFail('最多处理64个独立图片资源。')
    if (!safeImages.has(object)) { skipped++; reasons.add('图片未证明只用于直接页面图片槽位（可能共享绘制/字体/元数据用途或位于Form）；保留原始资源。'); continue }
    let image: PdfImagePixels
    try { image = candidate(doc, object, 32 * 1024 * 1024 - samples, 16_000_000 - pixels) } catch (cause) { skipped++; reasons.add(cause instanceof Error ? cause.message : String(cause)); continue }
    samples += image.width * image.height * (image.components ?? 3)
    pixels += image.width * image.height; if (pixels > 16_000_000) pdfFail('待重编码图片累计超过1600万像素。')
    const jpeg = await encode(image, quality / 100)
    if (!(jpeg instanceof Uint8Array) || !jpeg.length || jpeg.length > 8 * 1024 * 1024) pdfFail('JPEG编码结果大小无效。')
    inspectPlainJpeg(jpeg, image.width, image.height)
    if (jpeg.length >= object.getContentsSize()) { skipped++; reasons.add('候选JPEG不小于原图片，已保留原始图片字节。'); continue }
    const dict = object.dict.clone(doc.context) as PDFDict
    dict.set(PDFName.of('ColorSpace'), PDFName.of('DeviceRGB')) // Canvas emits a validated three-component JPEG, including gray input.
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
  const verify = pdfPageFingerprinter(output), verifyContent = pdfPageFingerprinter(output, 'content')
  for (const [index, page] of output.getPages().entries()) {
    if (await verifyContent(page) !== expectedContent[index]) pdfFail('原始页面绘制内容或非图片属性发生变化，拒绝输出。')
    if (await verify(page) !== expected[index]) pdfFail('压缩保存后内容/资源/页面属性不一致。')
  }
  return { bytes, before: originalSize, after: bytes.length, images, changed, skipped, reasons: [...reasons], pages: expected.length }
}
