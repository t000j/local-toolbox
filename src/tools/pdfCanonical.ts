import { pdfFail } from './pdfRawSyntax'
import type { RawValue } from './pdfRawSyntax'
import { rawArray } from './pdfStreamRecords'
import type { PdfRecord } from './pdfStreamRecords'
export const CANONICAL_LIMIT = 16 * 1024 * 1024
const encoder = new TextEncoder()
// Keep original object bodies; only rebuild bounded object framing, xref and supported trailer fields.
export function canonicalPdf(objects: PdfRecord[], trailer: RawValue): Uint8Array {
  const sorted = [...objects].sort((a, b) => a.id - b.id), parts: Uint8Array[] = [encoder.encode('%PDF-1.7\n')], offsets = new Map<number, number>(); let length = parts[0]!.length
  const add = (part: Uint8Array): void => { length += part.length; if (length > CANONICAL_LIMIT) pdfFail('结构标准化结果超过 16 MiB。'); parts.push(part) }
  for (const object of sorted) {
    offsets.set(object.id, length); add(encoder.encode(`${object.id} ${object.generation} obj\n`)); add(object.body); add(encoder.encode('\nendobj\n'))
  }
  const size = Math.max(...objects.map(object => object.id)) + 1, xrefOffset = length
  if (!objects.length) pdfFail('标准化对象为空。')
  add(encoder.encode('xref\n0 1\n0000000000 65535 f \n'))
  for (let i = 0; i < sorted.length;) {
    let end = i + 1
    while (end < sorted.length && sorted[end]!.id === sorted[end - 1]!.id + 1) end++
    add(encoder.encode(`${sorted[i]!.id} ${end - i}\n`))
    for (; i < end; i++) {
      const object = sorted[i]!
      add(encoder.encode(`${String(offsets.get(object.id)).padStart(10, '0')} ${String(object.generation).padStart(5, '0')} n \n`))
    }
  }
  const dict = trailer.dict!, root = dict.get('Root')?.ref, info = dict.get('Info'), id = dict.get('ID')
  if (!root) pdfFail('trailer Root 缺失。')
  if (info && info.kind !== 'ref') pdfFail('trailer Info 必须为间接引用。')
  add(encoder.encode(`trailer\n<< /Size ${size} /Root ${root}${info ? ` /Info ${info.ref}` : ''}`))
  if (id) {
    const values = rawArray(id, 'trailer ID')
    if (values.length !== 2 || values.some(value => value.kind !== 'string' || !value.encoded || value.encoded.length > 256)) pdfFail('trailer ID 结构不支持。')
    add(encoder.encode(' /ID [')); for (const value of values) { add(value.encoded!); add(encoder.encode(' ')) } add(encoder.encode(']'))
  }
  add(encoder.encode(` >>\nstartxref\n${xrefOffset}\n%%EOF`))
  const output = new Uint8Array(length); let offset = 0
  for (const part of parts) { output.set(part, offset); offset += part.length }
  return output
}
