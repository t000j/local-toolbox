import { inflatePdfStructure } from './pdfBoundedInflate'
import { pdfFail } from './pdfRawSyntax'
import { allowKeys, rawArray, rawDict, rawInt } from './pdfStreamRecords'
import type { PdfRecord, StructuralBudget } from './pdfStreamRecords'
function undoPngPredictor(bytes: Uint8Array, columns: number, predictor: number): Uint8Array {
  if (bytes.length % (columns + 1)) pdfFail('交叉引用流 PNG 预测行被截断。')
  const rows = bytes.length / (columns + 1), output = new Uint8Array(rows * columns)
  for (let row = 0; row < rows; row++) {
    const filter = bytes[row * (columns + 1)]!
    if (filter > 4 || (predictor !== 15 && filter !== predictor - 10)) pdfFail('交叉引用流 PNG 预测类型不匹配。')
    for (let x = 0; x < columns; x++) {
      const index = row * columns + x, left = x ? output[index - 1]! : 0, up = row ? output[index - columns]! : 0, upperLeft = row && x ? output[index - columns - 1]! : 0
      let prediction = 0
      if (filter === 1) prediction = left
      if (filter === 2) prediction = up
      if (filter === 3) prediction = (left + up) >>> 1
      if (filter === 4) { const p = left + up - upperLeft, a = Math.abs(p - left), b = Math.abs(p - up), c = Math.abs(p - upperLeft); prediction = a <= b && a <= c ? left : b <= c ? up : upperLeft }
      output[index] = bytes[row * (columns + 1) + x + 1]! + prediction
    }
  }
  return output
}
export function decodePdfStructure(record: PdfRecord, budget: StructuralBudget, xref: boolean): Uint8Array {
  if (!record.stream) pdfFail('结构对象不是流。')
  if (++budget.streams > 128 || (budget.encoded += record.stream.length) > 2 * 1024 * 1024) pdfFail('结构流数量或压缩总大小超过上限。')
  const dict = rawDict(record.value, '结构流'), filterValue = dict.get('Filter'), paramsValue = dict.get('DecodeParms')
  const filters = filterValue?.kind === 'array' ? rawArray(filterValue, 'Filter') : filterValue ? [filterValue] : []
  if (filters.length > 1 || filters.some(filter => filter.kind !== 'name' || filter.name !== 'FlateDecode')) pdfFail('结构流仅支持单层 FlateDecode 或未压缩数据。')
  const limit = Math.min(1024 * 1024, 4 * 1024 * 1024 - budget.decoded)
  if (limit <= 0) pdfFail('结构流展开总大小超过 4 MiB。')
  let output: Uint8Array
  if (filters.length) output = inflatePdfStructure(record.stream, limit)
  else { if (record.stream.length > limit) pdfFail('未压缩结构流超出上限。'); output = new Uint8Array(record.stream) }
  budget.decoded += output.length
  let params = paramsValue
  if (params?.kind === 'array') { const array = rawArray(params, 'DecodeParms'); if (array.length !== 1 || filters.length !== 1) pdfFail('DecodeParms 数量不匹配。'); params = array[0] }
  if (params && params.kind !== 'null') {
    if (!filters.length) pdfFail('无滤镜结构流不得带 DecodeParms。')
    const values = rawDict(params, 'DecodeParms'); allowKeys(values, ['Predictor', 'Columns', 'Colors', 'BitsPerComponent'], 'DecodeParms')
    const predictor = values.has('Predictor') ? rawInt(values.get('Predictor'), 'Predictor', 15) : 1
    if (predictor !== 1) {
      if (!xref || predictor < 10 || predictor > 15) pdfFail('仅交叉引用流支持 PNG 预测器 10–15。')
      const columns = values.has('Columns') ? rawInt(values.get('Columns'), 'Columns', 256) : 1
      const colors = values.has('Colors') ? rawInt(values.get('Colors'), 'Colors', 1) : 1
      const bits = values.has('BitsPerComponent') ? rawInt(values.get('BitsPerComponent'), 'BitsPerComponent', 8) : 8
      if (!columns || colors !== 1 || bits !== 8) pdfFail('交叉引用流预测器仅支持 8 位单通道。')
      output = undoPngPredictor(output, columns, predictor)
    }
  }
  return output
}
