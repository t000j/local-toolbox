import { PDF_MAX_OBJECTS, PdfRawReader, pdfFail, rejectStreamNames } from './pdfRawSyntax'
import { classicLengthResolver, readClassicXref } from './pdfClassicXref'
import { readPdfStream, readStartXref } from './pdfStreamRecords'
import type { PdfRecord } from './pdfStreamRecords'
const encoder = new TextEncoder()
export function readClassicRecords(bytes: Uint8Array, indirect = false) {
  rejectStreamNames(bytes)
  const budget = { nodes: 0 }, xref = readClassicXref(bytes, readStartXref(bytes), budget), resolve = classicLengthResolver(bytes, xref, budget)
  const reader = new PdfRawReader(bytes, true, budget, false), records: PdfRecord[] = [], objects = new Map<string, number>(), ids = new Set<number>()
  let patched = 0; reader.offset = 8
  while (!reader.keyword('xref', false)) {
    reader.skip(); const offset = reader.offset, id = reader.unsigned(), generation = reader.unsigned()
    if (!id || generation > 65535 || ids.has(id) || records.length >= PDF_MAX_OBJECTS) pdfFail('重复对象、代次或对象数量不支持。')
    ids.add(id); reader.expect('obj'); const start = reader.offset, value = reader.object(); reader.skip()
    let stream: Uint8Array | undefined, length = value.length
    if (reader.keyword('stream', false)) {
      if (value.lengthRef) {
        if (!indirect) pdfFail('流必须有直接 Length；请先经过间接长度准入。')
        length = resolve(value.lengthRef.ref)
      }
      if (value.kind !== 'dict' || length === undefined) pdfFail('流必须有直接或已核验的一跳整数 Length。')
      stream = readPdfStream(reader, length)
    }
    reader.skip(); let body = bytes.subarray(start, reader.offset); reader.expect('endobj')
    const ref = `${id} ${generation} R`, entry = xref.entries.get(id)
    if (!entry?.active || entry.generation !== generation || entry.offset !== offset) pdfFail('交叉引用偏移与对象位置不一致；不自动修复。')
    if (stream && value.lengthRef) {
      const { start: from, end: to } = value.lengthRef, number = encoder.encode(String(length))
      const replacement = new Uint8Array(body.length - (to - from) + number.length)
      replacement.set(body.subarray(0, from - start)); replacement.set(number, from - start)
      replacement.set(body.subarray(to - start), from - start + number.length); body = replacement; patched++
    }
    records.push({ id, generation, offset, body, value, stream }); objects.set(ref, offset)
  }
  if (reader.offset !== xref.offset || objects.size !== [...xref.entries.values()].filter(entry => entry.active).length) pdfFail('交叉引用位置错误、位于流内或缺失实际对象。')
  for (const ref of [...reader.refs, ...xref.refs]) if (!objects.has(ref)) pdfFail('存在未定义的间接引用。')
  return { records, trailer: xref.trailer, patched, nodes: budget.nodes, preflight: { root: xref.trailer.root!, objects } }
}
