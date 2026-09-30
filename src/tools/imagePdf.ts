import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream } from 'pdf-lib'
import { preflightPdf } from './pdfPreflight'
import { auditPdf } from './pdfAudit'
import { checkImagePdfOptions, imagePdfGeometry } from './imagePdfGeometry'
import type { ImagePdfOptions } from './imagePdfGeometry'
import { validatePreparedPdfImage } from './imagePdfInput'
import type { PreparedPdfImage } from './imagePdfInput'
export interface ImagePdfResult { bytes: Uint8Array; pages: Array<{ name: string; width: number; height: number; imageWidth: number; imageHeight: number }>; encoding: 'png' | 'jpeg' }
export async function buildImagePdf(images: PreparedPdfImage[], options: ImagePdfOptions): Promise<ImagePdfResult> {
  checkImagePdfOptions(options); const settings = { ...options }
  if (!Array.isArray(images) || !images.length || images.length > 8 || images.some(image => !image || !(image.bytes instanceof Uint8Array)) || images.reduce((sum, image) => sum + image.bytes.length, 0) > 32 * 1024 * 1024) throw new Error('选择1–8张图，规范化数据共32MiB以内。')
  const inputs = images.map(image => ({ ...image, bytes: new Uint8Array(image.bytes) }))
  if (inputs.reduce((sum, image) => sum + image.width * image.height, 0) > 16_000_000) throw new Error('全部图片合计最多1600万像素。')
  for (const image of inputs) { validatePreparedPdfImage(image); if (image.format !== settings.encoding) throw new Error('图片编码与输出选项不一致。') }
  const doc = await PDFDocument.create({ updateMetadata: false }), pages: ImagePdfResult['pages'] = []
  for (const image of inputs) {
    const geometry = imagePdfGeometry(image.width, image.height, settings), embedded = image.format === 'png' ? await doc.embedPng(image.bytes) : await doc.embedJpg(image.bytes)
    if (embedded.width !== image.width || embedded.height !== image.height) throw new Error('嵌入图片尺寸变化。')
    const page = doc.addPage([geometry.pageWidth, geometry.pageHeight]); page.drawImage(embedded, { x: geometry.x, y: geometry.y, width: geometry.width, height: geometry.height })
    pages.push({ name: image.name, width: geometry.pageWidth, height: geometry.pageHeight, imageWidth: image.width, imageHeight: image.height })
  }
  const bytes = await doc.save({ useObjectStreams: false, addDefaultPage: false, updateFieldAppearances: false, objectsPerTick: 20 })
  if (bytes.length > 32 * 1024 * 1024) throw new Error('PDF输出超过32MiB。')
  const raw = preflightPdf(bytes, 32 * 1024 * 1024), verify = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: false, throwOnInvalidObject: true })
  if (auditPdf(verify, raw) !== pages.length) throw new Error('重读页数校验失败。')
  for (const [index, page] of verify.getPages().entries()) {
    const expected = pages[index]!, box = page.getMediaBox(), resource = page.node.Resources()?.lookup(PDFName.of('XObject'), PDFDict)
    if (Math.abs(box.width - expected.width) > 1e-6 || Math.abs(box.height - expected.height) > 1e-6 || page.getRotation().angle !== 0 || !resource || resource.keys().length !== 1) throw new Error('输出页面尺寸/旋转/图片数量校验失败。')
    const image = verify.context.lookup(resource.values()[0])
    if (!(image instanceof PDFRawStream) || image.dict.lookup(PDFName.of('Width'), PDFNumber).asNumber() !== expected.imageWidth || image.dict.lookup(PDFName.of('Height'), PDFNumber).asNumber() !== expected.imageHeight) throw new Error('输出嵌入图片尺寸校验失败。')
    const content = verify.context.lookup(page.node.get(PDFName.of('Contents')))
    if (!(content instanceof PDFRawStream || content instanceof PDFArray)) throw new Error('输出缺少页面绘制内容。')
  }
  return { bytes, pages, encoding: settings.encoding }
}
