import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNull, PDFObject, PDFRawStream, PDFRef } from 'pdf-lib'
import { inspectPdfImagePredictor, inflatePdfPredictedImage } from './pdfImagePredictors'
import { boundedInflatePdf } from './pdfBoundedInflate'
import { auditPdfCmap } from './pdfCmapBudget'
import { pdfFail } from './pdfRawSyntax'
import { pdfPreviewRoles } from './pdfPreviewRoles'
import { inspectPdfPreviewImage, inspectPdfPreviewJpeg, inspectPdfPreviewMasks } from './pdfPreviewImages'
import type { PdfPreviewImage } from './pdfPreviewImages'
import { PDF_PREVIEW_DECODED_BYTES, PDF_PREVIEW_FONT_BYTES, PDF_PREVIEW_IMAGE_RGBA_BYTES, PDF_PREVIEW_TOTAL_IMAGE_PIXELS } from './pdfPreviewLimits'

// Preview-only restrictions. Export preserves opaque resource streams separately.
export function auditPdfPreview(doc: PDFDocument): void { auditPdfResources(doc, false) }
// Text extraction substitutes these proven image-only streams before PDF.js sees them.
export function auditPdfTextResources(doc: PDFDocument): Set<PDFRawStream> { return auditPdfResources(doc, true) }
function auditPdfResources(doc: PDFDocument, textOnly: boolean): Set<PDFRawStream> {
  const roles = pdfPreviewRoles(doc)
  if (roles.streams.size > 2000) pdfFail('资源流数量超过2000。')
  let total = 0, pixels = 0, rgba = 0, nodes = 0
  const cmapBudget = { mappings: 0 }, images = new Map<PDFRawStream, PdfPreviewImage>()
  const seen = new Set<PDFObject>(), active = new Set<PDFObject>(), imageDicts = new Set<PDFDict>()
  // Check direct structures independently of role proofs, including orphans. Ref
  // targets are audited as definitions; page Parent links are legitimate cycles.
  const checkProcedural = (value: PDFObject, depth = 0): void => {
    if (++nodes > 100_000 || depth > 32) pdfFail('缩略图资源结构超过上限。')
    if (active.has(value)) pdfFail('缩略图资源存在直接循环。')
    if (seen.has(value) || value instanceof PDFRef) return
    active.add(value)
    if (value instanceof PDFRawStream) {
      if (doc.context.lookup(value.dict.get(PDFName.of('Subtype')))?.toString() === '/Image') {
        if (textOnly) {
          if (!roles.images.has(value)) pdfFail('文字提取图片用途或别名不明确，不能跳过资源检查。')
          active.delete(value); seen.add(value); return
        }
        images.set(value, inspectPdfPreviewImage(doc, value)); imageDicts.add(value.dict)
      }
      checkProcedural(value.dict, depth + 1)
    } else if (value instanceof PDFArray) value.asArray().forEach(child => checkProcedural(child, depth + 1))
    else if (value instanceof PDFDict) {
      for (const key of ['FunctionType', 'PatternType', 'ShadingType', 'UseCMap', 'Pattern', 'Shading']) if (value.has(PDFName.of(key))) pdfFail(`缩略图暂不支持${key}过程资源，避免未界定的采样/平铺分配。`)
      // Image Mask/SMask exceptions are validated below; graphics-state soft masks
      // and disguised dictionaries must not reach PDF.js's procedural path.
      for (const key of ['Mask', 'SMask']) if (value.has(PDFName.of(key)) && !imageDicts.has(value)) pdfFail(`缩略图暂不支持${key}过程资源。`)
      const xobjects = doc.context.lookup(value.get(PDFName.of('XObject')))
      if (xobjects !== undefined && (!(xobjects instanceof PDFDict) || xobjects.values().some(item => {
        const stream = doc.context.lookup(item)
        return !(stream instanceof PDFRawStream) || !['/Image', '/Form'].includes(doc.context.lookup(stream.dict.get(PDFName.of('Subtype')))?.toString() ?? '')
      }))) pdfFail('缩略图XObject仅支持已验证的Image和静态Form。')
      const color = doc.context.lookup(value.get(PDFName.of('ColorSpace')))
      if (color && !imageDicts.has(value)) {
        const basic = (item: PDFObject | undefined) => item instanceof PDFName && ['DeviceGray', 'DeviceRGB', 'DeviceCMYK'].includes(item.decodeText())
        if (!(color instanceof PDFDict ? color.values().every(item => basic(doc.context.lookup(item))) : basic(color))) pdfFail('缩略图暂不支持ICCBased、特殊或过程ColorSpace资源。')
      }
      if (doc.context.lookup(value.get(PDFName.of('Type')))?.toString() === '/Font' && doc.context.lookup(value.get(PDFName.of('Subtype')))?.toString() === '/Type3') pdfFail('缩略图暂不支持Type3过程字体。')
      value.values().forEach(child => checkProcedural(child, depth + 1))
    }
    active.delete(value); seen.add(value)
  }
  for (const [, object] of doc.context.enumerateIndirectObjects()) checkProcedural(object)
  inspectPdfPreviewMasks(doc, images)
  for (const object of roles.streams) {
    if (textOnly && roles.images.has(object)) continue
    const dict = object.dict, image = images.get(object), font = roles.fonts.has(object)
    if (image && !roles.images.has(object)) pdfFail('缩略图图片角色或别名不受支持，不能绕过BI/CMap检查。')
    const filter = doc.context.lookup(dict.get(PDFName.of('Filter')))
    const filters = filter instanceof PDFArray ? filter.asArray().map(value => doc.context.lookup(value)) : filter && filter !== PDFNull ? [filter] : []
    if (filters.length > 1 || filters.some(value => !(value instanceof PDFName) || !['FlateDecode', 'Fl', ...(image ? ['DCTDecode'] : [])].includes(value.decodeText()))) pdfFail('缩略图仅支持原始/单层Flate资源流及已验证的DCTDecode图片。')
    if (dict.has(PDFName.of('DP')) || dict.has(PDFName.of('F'))) pdfFail('缩略图拒绝滤镜/预测器缩写DP/F，避免解析器别名歧义。')
    const params = doc.context.lookup(dict.get(PDFName.of('DecodeParms')))
    const predictor = image ? inspectPdfImagePredictor(doc, object, image) : undefined
    if (!image && params && params !== PDFNull) pdfFail('非图片资源暂不支持DecodeParms。')
    const bytes = object.getContents(), jpeg = filters[0] instanceof PDFName && filters[0].decodeText() === 'DCTDecode'
    const allowance = Math.min(PDF_PREVIEW_DECODED_BYTES - total, image ? predictor?.encodedBytes ?? image.byteLength : font ? PDF_PREVIEW_FONT_BYTES : PDF_PREVIEW_DECODED_BYTES)
    if (allowance < 0 || allowance === 0 && (bytes.length > 0 || filters.length > 0)) pdfFail('缩略图解压总量超过32MiB。')
    let decoded = bytes, charge = bytes.length
    if (jpeg && image) { inspectPdfPreviewJpeg(bytes, image); charge = image.byteLength }
    else if (predictor) { decoded = inflatePdfPredictedImage(bytes, predictor, allowance); charge = predictor.encodedBytes }
    else if (filters.length) { decoded = boundedInflatePdf(bytes, allowance); charge = decoded.length }
    if (charge > allowance) pdfFail(font ? '缩略图单个嵌入字体超过4MiB或资源总量超过32MiB。' : '缩略图解压总量或图片字节长度超过上限。')
    if (image) {
      if (!jpeg && decoded.length !== image.byteLength) pdfFail('缩略图图片/蒙版解码字节长度与尺寸不一致。')
      pixels += image.width * image.height
      // Account decoded sample bytes separately from a full RGBA staging image.
      // This is a cumulative admission charge, not an absolute process-heap bound.
      rgba += image.width * image.height * 4
      if (rgba > PDF_PREVIEW_IMAGE_RGBA_BYTES) pdfFail('缩略图图片与蒙版RGBA暂存预算超过64MiB。')
      if (pixels > PDF_PREVIEW_TOTAL_IMAGE_PIXELS) pdfFail('缩略图图片与蒙版累计超过1600万像素。')
    } else if (!font) {
      auditPdfCmap(decoded, cmapBudget)
      // Contents, Form, CMap, metadata and unknown streams remain conservative.
      // Only role-proven image/font bytes can contain incidental BI/CMap strings.
      for (let i = 0; i + 1 < decoded.length; i++) if (decoded[i] === 66 && decoded[i + 1] === 73) pdfFail('缩略图拒绝BI内联图像及疑似字节；页面导出不受此预览限制。')
    }
    total += charge
  }
  return roles.images
}
