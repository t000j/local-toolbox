import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFNull, PDFObject, PDFRawStream } from 'pdf-lib'
import { boundedInflatePdf } from './pdfBoundedInflate'
import { auditPdfCmap } from './pdfCmapBudget'
import { pdfFail } from './pdfRawSyntax'
// Preview-only restrictions. Export preserves opaque image/resource streams without decoding them.
export function auditPdfPreview(doc: PDFDocument): void {
  let total = 0, streams = 0, nodes = 0
  const cmapBudget = { mappings: 0 }
  const seen = new Set<PDFObject>()
  const checkProcedural = (value: PDFObject, depth = 0): void => {
    if (seen.has(value)) return
    seen.add(value)
    if (++nodes > 100_000 || depth > 32) pdfFail('缩略图资源结构超过上限。')
    if (value instanceof PDFRawStream) { checkProcedural(value.dict, depth + 1); return }
    if (value instanceof PDFArray) { value.asArray().forEach(child => checkProcedural(child, depth + 1)); return }
    if (value instanceof PDFDict) {
      for (const key of ['FunctionType', 'PatternType', 'ShadingType', 'SMask', 'Mask', 'UseCMap']) if (value.has(PDFName.of(key))) pdfFail(`缩略图暂不支持${key}过程资源，避免未界定的采样/平铺分配。`)
      value.values().forEach(child => checkProcedural(child, depth + 1))
    }
  }
  for (const [, object] of doc.context.enumerateIndirectObjects()) checkProcedural(object)
  const number = (dict: PDFDict, key: string) => { const value = doc.context.lookup(dict.get(PDFName.of(key))); return value instanceof PDFNumber ? value.asNumber() : undefined }
  for (const [, object] of doc.context.enumerateIndirectObjects()) if (object instanceof PDFRawStream) {
    if (++streams > 2000) pdfFail('缩略图最多处理2000个资源流。')
    const dict = object.dict, filter = doc.context.lookup(dict.get(PDFName.of('Filter'))), filters = filter instanceof PDFArray ? filter.asArray().map(value => doc.context.lookup(value)) : filter ? [filter] : []
    if (filters.length > 1 || filters.some(value => !(value instanceof PDFName) || !['FlateDecode', 'Fl'].includes(value.decodeText()))) pdfFail('缩略图仅支持未压缩/单层Flate资源流；此文件仍可尝试页面导出。')
    if (dict.has(PDFName.of('DP')) || dict.has(PDFName.of('F'))) pdfFail('缩略图拒绝滤镜/预测器缩写DP/F，避免解析器别名歧义。')
    const params = doc.context.lookup(dict.get(PDFName.of('DecodeParms')))
    if (params && params !== PDFNull) pdfFail('缩略图暂不支持DecodeParms/图像预测器；不会生成可能不完整的预览。')
    const bytes = object.getContents(), decoded = filters.length ? boundedInflatePdf(bytes, 32 * 1024 * 1024 - total) : bytes
    auditPdfCmap(decoded, cmapBudget)
    // Inline-image payloads are not indirect streams; conservatively reject their BI spelling anywhere.
    // This can reject harmless binary/string bytes, but cannot admit an unbounded nested image decoder.
    for (let i = 0; i + 1 < decoded.length; i++) if (decoded[i] === 66 && decoded[i + 1] === 73) pdfFail('缩略图拒绝BI内联图像及疑似字节；页面导出不受此预览限制。')
    total += decoded.length; if (total > 32 * 1024 * 1024) pdfFail('缩略图解压总量超过32MiB。')
    const subtype = doc.context.lookup(dict.get(PDFName.of('Subtype')))
    if (subtype instanceof PDFName && subtype.decodeText() === 'Image') {
      for (const key of ['W', 'H', 'BPC', 'IM', 'CS']) if (dict.has(PDFName.of(key))) pdfFail('缩略图拒绝图像参数缩写，避免解析器别名歧义。')
      const width = number(dict, 'Width'), height = number(dict, 'Height'), bits = number(dict, 'BitsPerComponent')
      if (!width || !height || width <= 0 || height <= 0 || !Number.isInteger(width) || !Number.isInteger(height) || width > 2048 || height > 2048 || width * height > 1_048_576 || bits !== undefined && ![1,2,4,8,16].includes(bits)) pdfFail('缩略图图片资源尺寸/位深超出范围。')
    }
  }
}
