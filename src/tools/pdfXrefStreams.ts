import { PDF_MAX_OBJECTS, pdfFail } from './pdfRawSyntax'
import { allowKeys, rawArray, rawDict, rawInt } from './pdfStreamRecords'
import type { PdfRecord, StructuralBudget } from './pdfStreamRecords'
import { decodePdfStructure } from './pdfStructuralDecode'
export function validateXrefStream(record: PdfRecord, originals: PdfRecord[], expanded: PdfRecord[], indices: Map<number, number[]>, budget: StructuralBudget): void {
  const dict = rawDict(record.value, 'XRef')
  allowKeys(dict, ['Type', 'Size', 'Root', 'Info', 'ID', 'W', 'Index', 'Length', 'Filter', 'DecodeParms'], 'XRef')
  if (record.generation !== 0 || dict.get('Root')?.kind !== 'ref') pdfFail('XRef 代次或 Root 无效。')
  const size = rawInt(dict.get('Size'), 'XRef Size', PDF_MAX_OBJECTS + 1)
  if (!size) pdfFail('XRef Size 为空。')
  const widths = rawArray(dict.get('W'), 'XRef W').map(value => rawInt(value, 'XRef W 项', 4))
  if (widths.length !== 3 || !widths.some(Boolean)) pdfFail('XRef W 必须为三个有界宽度。')
  const index = dict.has('Index') ? rawArray(dict.get('Index'), 'XRef Index').map(value => rawInt(value, 'XRef Index 项', size)) : [0, size]
  if (!index.length || index.length % 2 || index.length > 2 * (PDF_MAX_OBJECTS + 1)) pdfFail('XRef Index 不合法。')
  let count = 0
  for (let i = 0; i < index.length; i += 2) { if (!index[i + 1] || index[i]! + index[i + 1]! > size) pdfFail('XRef Index 越界。'); count += index[i + 1]! }
  if (count > PDF_MAX_OBJECTS + 1) pdfFail('XRef 条目超过上限。')
  const decoded = decodePdfStructure(record, budget, true), rowWidth = widths.reduce((sum, width) => sum + width, 0)
  if (decoded.length !== count * rowWidth) pdfFail('XRef 展开字节长度与 Index／W 不一致。')
  const rawById = new Map(originals.map(object => [object.id, object])), compressedById = new Map(expanded.map(object => [object.id, object])), seen = new Set<number>(), active = new Set<number>()
  let offset = 0
  const field = (width: number): number => { let value = 0; for (let i = 0; i < width; i++) value = value * 256 + decoded[offset++]!; return value }
  for (let i = 0; i < index.length; i += 2) for (let j = 0; j < index[i + 1]!; j++) {
    const id = index[i]! + j, type = widths[0] ? field(widths[0]) : 1, second = field(widths[1]!), third = field(widths[2]!)
    if (seen.has(id)) pdfFail('XRef 条目重叠。'); seen.add(id)
    if (type === 0) {
      if (second >= size || third > 65535 || rawById.has(id) || compressedById.has(id)) pdfFail('XRef 空闲条目与实际对象冲突。')
    } else if (type === 1) {
      const object = rawById.get(id)
      if (!id || !object || object.offset !== second || object.generation !== third) pdfFail('XRef 直接对象偏移／代次与原始文件不一致。')
      active.add(id)
    } else if (type === 2) {
      if (!id || !compressedById.has(id) || indices.get(second)?.[third] !== id) pdfFail('XRef 压缩对象编号、流或索引不匹配。')
      active.add(id)
    } else pdfFail('XRef 条目类型不支持。')
  }
  if (active.size !== originals.length + expanded.length || [...rawById.keys(), ...compressedById.keys()].some(id => !active.has(id))) pdfFail('XRef 未完整覆盖实际对象。')
  if (Math.max(...seen) + 1 !== size) pdfFail('XRef Size 与条目范围不匹配。')
}
