import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNull, PDFNumber, PDFRawStream } from 'pdf-lib'
import type { PdfPreviewImage } from './pdfPreviewImages'
import { boundedInflatePdf } from './pdfBoundedInflate'
import { pdfFail } from './pdfRawSyntax'
export interface PdfImagePredictor { predictor: number; rowBytes: number; components: number; height: number; encodedBytes: number }
/** Only one Flate image, exact 8-bit Gray/RGB row geometry. No generic filter pipeline. */
export function inspectPdfImagePredictor(doc: PDFDocument, stream: PDFRawStream, image: PdfPreviewImage): PdfImagePredictor | undefined {
  let params = doc.context.lookup(stream.dict.get(PDFName.of('DecodeParms')))
  if (params === undefined || params === PDFNull) return undefined
  const filter = doc.context.lookup(stream.dict.get(PDFName.of('Filter')))
  if (params instanceof PDFArray) {
    if (!(filter instanceof PDFArray) || filter.size() !== 1 || params.size() !== 1) pdfFail('图片DecodeParms数组须与单层滤镜一一对应。')
    params = doc.context.lookup(params.get(0))
    if (params === PDFNull) return undefined
  }
  const codec = filter instanceof PDFArray && filter.size() === 1 ? doc.context.lookup(filter.get(0)) : filter
  if (!(codec instanceof PDFName) || !['FlateDecode', 'Fl'].includes(codec.decodeText()) || !(params instanceof PDFDict)) pdfFail('图片预测参数仅支持单层Flate字典。')
  if (image.stencil || image.bits !== 8 || ![1, 3].includes(image.components)) pdfFail('图片预测器只支持8位灰度/RGB，不支持1位蒙版。')
  for (const key of params.keys()) if (!['Predictor', 'Colors', 'BitsPerComponent', 'Columns'].includes(key.decodeText())) pdfFail('图片预测器含未支持参数。')
  const number = (key: string, fallback: number): number => {
    const value = doc.context.lookup((params as PDFDict).get(PDFName.of(key)))
    if (value === undefined) return fallback
    if (!(value instanceof PDFNumber) || !Number.isSafeInteger(value.asNumber())) pdfFail('图片预测器参数须为整数。')
    return value.asNumber()
  }
  const predictor = number('Predictor', 1), colors = number('Colors', 1), bits = number('BitsPerComponent', 8), columns = number('Columns', 1)
  if (![1, 2, 10, 11, 12, 13, 14, 15].includes(predictor) || bits !== 8 || colors !== image.components || columns !== image.width) pdfFail('图片预测器类型/行宽/分量/位深与图片不一致。')
  const rowBytes = image.width * colors, encodedBytes = (rowBytes + (predictor >= 10 ? 1 : 0)) * image.height
  if (!Number.isSafeInteger(encodedBytes) || encodedBytes > 32 * 1024 * 1024) pdfFail('图片预测行展开超过32MiB。')
  return { predictor, rowBytes, components: colors, height: image.height, encodedBytes }
}
/** Undo rows in the inflated allocation, avoiding another whole-image allocation.
 * Compact PNG tags in-place only after their input bytes have been consumed. */
export function inflatePdfPredictedImage(bytes: Uint8Array, plan: PdfImagePredictor, allowance: number): Uint8Array {
  if (plan.encodedBytes > allowance) pdfFail('图片预测行超过剩余资源预算。')
  const decoded = boundedInflatePdf(bytes, plan.encodedBytes)
  if (decoded.length !== plan.encodedBytes) pdfFail('图片预测行长度与尺寸不一致。')
  const { predictor, rowBytes, components, height } = plan
  for (let y = 0; y < height; y++) {
    const input = y * (rowBytes + (predictor >= 10 ? 1 : 0)), output = y * rowBytes
    const filter = predictor >= 10 ? decoded[input]! : predictor === 2 ? 1 : 0
    if (filter > 4 || predictor >= 10 && predictor !== 15 && filter !== predictor - 10) pdfFail('图片PNG预测行标签无效或与Predictor不一致。')
    for (let x = 0; x < rowBytes; x++) {
      const raw = decoded[input + x + (predictor >= 10 ? 1 : 0)]!, left = x >= components ? decoded[output + x - components]! : 0
      const up = y ? decoded[output + x - rowBytes]! : 0, upperLeft = y && x >= components ? decoded[output + x - rowBytes - components]! : 0
      let prediction = 0
      if (filter === 1) prediction = left
      else if (filter === 2) prediction = up
      else if (filter === 3) prediction = Math.floor((left + up) / 2)
      else if (filter === 4) { const p = left + up - upperLeft, a = Math.abs(p - left), b = Math.abs(p - up), c = Math.abs(p - upperLeft); prediction = a <= b && a <= c ? left : b <= c ? up : upperLeft }
      decoded[output + x] = (raw + prediction) & 255
    }
  }
  return decoded.subarray(0, rowBytes * height)
}
