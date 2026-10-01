import { PDF_MAX_OBJECTS, PdfRawReader, pdfFail } from './pdfRawSyntax'
import type { RawBudget, RawValue } from './pdfRawSyntax'
import { allowKeys, rawDict, readPdfEnd } from './pdfStreamRecords'
export interface ClassicEntry { offset: number; generation: number; active: boolean; end: number }
export interface ClassicXref { offset: number; entries: Map<number, ClassicEntry>; trailer: RawValue; refs: Set<string> }
// This is only a candidate index. The separate original-byte scan must prove every live offset.
export function readClassicXref(bytes: Uint8Array, offset: number, budget: RawBudget): ClassicXref {
  const reader = new PdfRawReader(bytes, true, budget, false); reader.offset = offset
  if (bytes[offset] !== 120) pdfFail('startxref 必须精确指向 xref。')
  reader.expect('xref'); const entries = new Map<number, ClassicEntry>(); let count = 0
  while (!reader.keyword('trailer', false)) {
    const start = reader.unsigned(), size = reader.unsigned()
    if (!size || count + size > PDF_MAX_OBJECTS + 1 || start + size > 1_000_000_000) pdfFail('交叉引用表数量无效或超过对象数量上限。')
    count += size
    for (let i = 0; i < size; i++) {
      const position = reader.unsigned(), generation = reader.unsigned(), id = start + i
      if (entries.has(id) || generation > 65535) pdfFail('重复交叉引用或代次无效。')
      const active = reader.keyword('n')
      if (!active && !reader.keyword('f')) pdfFail('交叉引用项必须为 n 或 f。')
      if (active && (!id || position < 8 || position >= offset)) pdfFail('交叉引用对象偏移越界。')
      entries.set(id, { offset: position, generation, active, end: offset })
    }
  }
  reader.expect('trailer'); const trailer = reader.object(), dict = rawDict(trailer, 'trailer')
  allowKeys(dict, ['Size', 'Root', 'Info', 'ID'], 'trailer')
  const root = trailer.root?.split(' ').map(Number), rootEntry = root ? entries.get(root[0]!) : undefined
  if (!rootEntry?.active || rootEntry.generation !== root![1] || trailer.size !== Math.max(...entries.keys()) + 1) pdfFail('trailer Root／Size 无效。')
  readPdfEnd(reader, offset)
  const live = [...entries.values()].filter(entry => entry.active).sort((a, b) => a.offset - b.offset)
  for (let i = 0; i < live.length; i++) {
    live[i]!.end = live[i + 1]?.offset ?? offset
    if (live[i]!.offset >= live[i]!.end) pdfFail('交叉引用对象偏移重复。')
  }
  return { offset, entries, trailer, refs: reader.refs }
}
export function classicLengthResolver(bytes: Uint8Array, xref: ClassicXref, budget: RawBudget): (ref: string) => number {
  const cache = new Map<string, number>()
  return ref => {
    const cached = cache.get(ref); if (cached !== undefined) return cached
    const [id, generation] = ref.split(' ').map(Number), entry = xref.entries.get(id!)
    if (!entry?.active || entry.generation !== generation) pdfFail('Length 引用缺失、空闲或代次不匹配。')
    // Non-overlapping index intervals bound total preparse bytes even for malicious payload offsets.
    const reader = new PdfRawReader(bytes.subarray(entry.offset, entry.end), false, budget)
    reader.skip(); if (reader.offset !== 0 || reader.unsigned() !== id || reader.unsigned() !== generation) pdfFail('Length 对象头与交叉引用不匹配。')
    reader.expect('obj'); reader.skip(); const start = reader.offset, value = reader.object(), end = reader.offset
    if (value.kind !== 'number' || !Number.isSafeInteger(value.number) || value.number! < 0 || value.number! > bytes.length || !/^[+-]?\d+$/.test(String.fromCharCode(...reader.bytes.subarray(start, Math.min(end, start + 65)))) || end - start > 64) pdfFail('Length 仅支持一跳、直接非负整数对象；链式或循环引用不支持。')
    reader.expect('endobj'); cache.set(ref, value.number!); return value.number!
  }
}
