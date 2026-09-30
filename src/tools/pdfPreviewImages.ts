import { PDFArray, PDFBool, PDFDict, PDFDocument, PDFName, PDFNull, PDFNumber, PDFRawStream } from 'pdf-lib'
import { parseJpeg } from './imageJpegHeader'
import { pdfFail } from './pdfRawSyntax'
import { PDF_PREVIEW_IMAGE_EDGE, PDF_PREVIEW_IMAGE_PIXELS } from './pdfPreviewLimits'

export interface PdfPreviewImage { width: number; height: number; bits: number; components: number; stencil: boolean; byteLength: number }
const keys = new Set('Type Subtype Width Height ColorSpace BitsPerComponent ImageMask Mask SMask Decode Interpolate Intent Name Metadata Length Filter DecodeParms'.split(' '))
const aliases = ['W', 'H', 'BPC', 'IM', 'CS', 'D', 'I']

/** Only basic device images and explicitly checked masks are admitted. PDF.js is
 * still the pixel decoder; a JPEG header check does not verify its entropy data. */
export function inspectPdfPreviewImage(doc: PDFDocument, stream: PDFRawStream): PdfPreviewImage {
  const dict = stream.dict, get = (key: string) => doc.context.lookup(dict.get(PDFName.of(key)))
  for (const key of aliases) if (dict.has(PDFName.of(key))) pdfFail('缩略图拒绝图像参数缩写，避免解析器别名歧义。')
  for (const key of dict.keys()) if (!keys.has(key.decodeText())) pdfFail(`缩略图图片参数${key.decodeText()}不受支持。`)
  const type = get('Type')
  if (type && (!(type instanceof PDFName) || type.decodeText() !== 'XObject')) pdfFail('缩略图图片Type无效。')
  const w = get('Width'), h = get('Height'), bpc = get('BitsPerComponent'), mask = get('ImageMask'), color = get('ColorSpace')
  const width = w instanceof PDFNumber ? w.asNumber() : 0, height = h instanceof PDFNumber ? h.asNumber() : 0
  if (![width, height].every(value => Number.isSafeInteger(value) && value > 0 && value <= PDF_PREVIEW_IMAGE_EDGE) || width * height > PDF_PREVIEW_IMAGE_PIXELS) pdfFail(`缩略图图片资源尺寸超出${PDF_PREVIEW_IMAGE_EDGE}边长/${PDF_PREVIEW_IMAGE_PIXELS}像素。`)
  if (mask !== undefined && !(mask instanceof PDFBool)) pdfFail('缩略图ImageMask须为布尔值。')
  const stencil = mask === PDFBool.True, bits = bpc instanceof PDFNumber ? bpc.asNumber() : stencil && bpc === undefined ? 1 : 0
  if (stencil ? bits !== 1 || color !== undefined : !(color instanceof PDFName) || !['DeviceGray', 'DeviceRGB'].includes(color.decodeText()) || bits !== 8) pdfFail('缩略图图片仅支持8位DeviceGray/DeviceRGB，或无ColorSpace的1位ImageMask。')
  const components = color instanceof PDFName && color.decodeText() === 'DeviceRGB' ? 3 : 1
  const decode = get('Decode')
  if (decode !== undefined && (!(decode instanceof PDFArray) || decode.size() !== 2 * components || decode.asArray().some((item, index, array) => {
    const value = doc.context.lookup(item), pair = doc.context.lookup(array[index ^ 1])
    return !(value instanceof PDFNumber) || !(pair instanceof PDFNumber) || ![0, 1].includes(value.asNumber()) || value.asNumber() + pair.asNumber() !== 1
  }))) pdfFail('缩略图Decode仅支持每分量[0 1]或[1 0]。')
  const interpolate = get('Interpolate')
  if (interpolate !== undefined && !(interpolate instanceof PDFBool)) pdfFail('缩略图Interpolate须为布尔值。')
  const intent = get('Intent')
  if (intent !== undefined && (!(intent instanceof PDFName) || !['AbsoluteColorimetric', 'RelativeColorimetric', 'Saturation', 'Perceptual'].includes(intent.decodeText()))) pdfFail('缩略图图片Intent不受支持。')
  return { width, height, bits, components, stencil, byteLength: Math.ceil(width * components * bits / 8) * height }
}

export function inspectPdfPreviewMasks(doc: PDFDocument, images: Map<PDFRawStream, PdfPreviewImage>): void {
  const get = (dict: PDFDict, key: string) => doc.context.lookup(dict.get(PDFName.of(key)))
  for (const [stream, image] of images) {
    const mask = get(stream.dict, 'Mask'), soft = get(stream.dict, 'SMask')
    // Null is absent; only SMask has the additional standard /None value.
    const absent = (value: unknown, soft = false) => value === undefined || value === PDFNull || soft && value instanceof PDFName && value.decodeText() === 'None'
    const hasMask = !absent(mask), hasSoft = !absent(soft, true)
    if (hasMask && hasSoft || image.stencil && (hasMask || hasSoft)) pdfFail('缩略图Mask/SMask不能同时存在或嵌套在ImageMask中。')
    for (const [key, value, present] of [['Mask', mask, hasMask], ['SMask', soft, hasSoft]] as const) {
      if (!present) continue
      if (!(value instanceof PDFRawStream)) pdfFail(`缩略图${key}仅支持已验证的图像流，不支持色键数组或过程蒙版。`)
      const target = images.get(value)
      if (!target || value === stream || target.width !== image.width || target.height !== image.height) pdfFail(`缩略图${key}须为同尺寸、无循环的Image流。`)
      if (!absent(get(value.dict, 'Mask')) || !absent(get(value.dict, 'SMask'), true)) pdfFail(`缩略图${key}不支持嵌套蒙版或循环。`)
      if (key === 'SMask' ? target.stencil || target.components !== 1 || target.bits !== 8 : !target.stencil || target.bits !== 1) pdfFail(`缩略图${key}的色彩/位深无效。`)
      const filter = get(value.dict, 'Filter'), first = filter instanceof PDFArray && filter.size() === 1 ? doc.context.lookup(filter.get(0)) : filter
      if (first instanceof PDFName && !['FlateDecode', 'Fl'].includes(first.decodeText())) pdfFail(`缩略图${key}仅支持原始/单层Flate字节。`)
    }
  }
}

export function inspectPdfPreviewJpeg(bytes: Uint8Array, image: PdfPreviewImage): void {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || image.stencil || image.bits !== 8) pdfFail('缩略图DCTDecode需要真实的8位JPEG签名。')
  const header = parseJpeg(bytes)
  if (header.width !== image.width || header.height !== image.height || !header.fields.some(field => field.name === '颜色分量' && field.value === String(image.components))) pdfFail('缩略图JPEG实际尺寸/分量与PDF图片字典不一致。')
  // PDF uses stored JPEG dimensions and the PDF CTM, never the JPEG EXIF display
  // orientation. The renderer's in-process PDF.js JPEG decoder follows that rule.
}
