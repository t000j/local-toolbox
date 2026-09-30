import { PDF_MAX_NODES, PDF_MAX_OBJECTS, PdfRawReader, pdfFail } from './pdfRawSyntax'
import { allowKeys, rawDict, rawInt } from './pdfStreamRecords'
import type { PdfRecord, StructuralBudget } from './pdfStreamRecords'
import { decodePdfStructure } from './pdfStructuralDecode'
export interface ExpandedObjects { objects: PdfRecord[]; indices: Map<number, number[]> }
export function expandObjectStreams(records: PdfRecord[], budget: StructuralBudget): ExpandedObjects {
  const occupied = new Set(records.map(record => record.id)), objects: PdfRecord[] = [], indices = new Map<number, number[]>()
  for (const record of records) {
    if (record.value.dict?.get('Type')?.name !== 'ObjStm') continue
    if (record.generation !== 0) pdfFail('对象流代次必须为 0。')
    const dict = rawDict(record.value, 'ObjStm'); allowKeys(dict, ['Type', 'N', 'First', 'Length', 'Filter', 'DecodeParms'], 'ObjStm')
    const count = rawInt(dict.get('N'), 'ObjStm N', PDF_MAX_OBJECTS), first = rawInt(dict.get('First'), 'ObjStm First', 1024 * 1024)
    if (!count || records.length + objects.length + count > PDF_MAX_OBJECTS) pdfFail('展开后的对象数量超过 6000。')
    const decoded = decodePdfStructure(record, budget, false)
    if (first < 1 || first >= decoded.length) pdfFail('ObjStm First 越界。')
    const header = new PdfRawReader(decoded.subarray(0, first)), ids: number[] = [], offsets: number[] = []
    for (let i = 0; i < count; i++) {
      const id = header.unsigned(), offset = header.unsigned()
      if (!id || occupied.has(id) || offset >= decoded.length - first || (i === 0 ? offset !== 0 : offset <= offsets[i - 1]!)) pdfFail('对象流编号重复或偏移无效。')
      occupied.add(id); ids.push(id); offsets.push(offset)
    }
    header.skip(); if (header.offset !== first) pdfFail('对象流头存在多余数据。')
    for (let i = 0; i < count; i++) {
      const body = decoded.subarray(first + offsets[i]!, i + 1 < count ? first + offsets[i + 1]! : decoded.length), reader = new PdfRawReader(body)
      const value = reader.object(); reader.skip()
      if (reader.offset !== body.length) pdfFail('压缩对象包含额外对象、流或截断数据。')
      budget.nodes += reader.nodes; if (budget.nodes > PDF_MAX_NODES) pdfFail('展开对象节点总数超过上限。')
      objects.push({ id: ids[i]!, generation: 0, offset: -1, body, value })
    }
    indices.set(record.id, ids)
  }
  return { objects, indices }
}
