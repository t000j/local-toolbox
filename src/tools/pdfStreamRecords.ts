import { PDF_MAX_OBJECTS, PdfRawReader, pdfFail, pdfWhite } from './pdfRawSyntax'
import type { RawValue } from './pdfRawSyntax'
export interface PdfRecord { id: number; generation: number; offset: number; body: Uint8Array; value: RawValue; stream?: Uint8Array }
export interface StructuralBudget { encoded: number; decoded: number; nodes: number; streams: number }
export function rawInt(value: RawValue | undefined, label: string, maximum = 1_000_000_000): number {
  if (value?.kind !== 'number' || !Number.isSafeInteger(value.number) || value.number! < 0 || value.number! > maximum) pdfFail(`${label} 必须为直接非负整数。`)
  return value.number!
}
export function rawArray(value: RawValue | undefined, label: string): RawValue[] {
  if (value?.kind !== 'array' || !value.array) pdfFail(`${label} 必须为直接数组。`)
  return value.array
}
export function rawDict(value: RawValue, label: string): Map<string, RawValue> {
  if (value.kind !== 'dict' || !value.dict) pdfFail(`${label} 必须为直接字典。`)
  return value.dict
}
export function allowKeys(dict: Map<string, RawValue>, allowed: string[], label: string): void {
  for (const key of dict.keys()) if (!allowed.includes(key)) pdfFail(`${label} 不支持 ${key}。`)
}
export function readStartXref(bytes: Uint8Array): number {
  const tail = String.fromCharCode(...bytes.subarray(Math.max(0, bytes.length - 160)))
  const match = tail.match(/startxref[\x00\t\n\f\r ]+(\d{1,10})[\x00\t\n\f\r ]+%%EOF[\x00\t\n\f\r ]*$/)
  const offset = match ? Number(match[1]) : NaN
  if (!Number.isSafeInteger(offset) || offset < 8 || offset >= bytes.length) pdfFail('末尾 startxref 无效；不自动恢复。')
  return offset
}
export function readPdfEnd(reader: PdfRawReader, startXref: number): void {
  const bytes = reader.bytes
  reader.expect('startxref'); if (reader.unsigned() !== startXref) pdfFail('startxref 不匹配。')
  while (pdfWhite(bytes[reader.offset])) reader.offset++
  if (String.fromCharCode(...bytes.subarray(reader.offset, reader.offset + 5)) !== '%%EOF') pdfFail('缺少最终 EOF。')
  reader.offset += 5; while (pdfWhite(bytes[reader.offset])) reader.offset++
  if (reader.offset !== bytes.length) pdfFail('不支持增量更新或尾随内容。')
}
export function readPdfStream(reader: PdfRawReader, length: number): Uint8Array {
  const bytes = reader.bytes; reader.expect('stream')
  if (bytes[reader.offset] === 13) { reader.offset++; if (bytes[reader.offset] === 10) reader.offset++ }
  else if (bytes[reader.offset] === 10) reader.offset++
  else pdfFail('stream 缺少标准换行。')
  if (!Number.isSafeInteger(length) || length < 0 || length > bytes.length - reader.offset) pdfFail('流长度无效或越界。')
  const stream = bytes.subarray(reader.offset, reader.offset + length); reader.offset += length
  if (bytes[reader.offset] === 13) { reader.offset++; if (bytes[reader.offset] === 10) reader.offset++ }
  else if (bytes[reader.offset] === 10) reader.offset++
  if (bytes[reader.offset] !== 101) pdfFail('Length 未精确指向 endstream 边界。')
  reader.expect('endstream'); return stream
}
export function readStreamRecords(bytes: Uint8Array, startXref: number): { records: PdfRecord[]; nodes: number } {
  const reader = new PdfRawReader(bytes, true), records: PdfRecord[] = [], ids = new Set<number>(); reader.offset = 8
  while (!reader.keyword('startxref', false)) {
    reader.skip(); const offset = reader.offset, id = reader.unsigned(), generation = reader.unsigned()
    if (!id || generation > 65535 || ids.has(id) || records.length >= PDF_MAX_OBJECTS) pdfFail('重复对象、代次或对象数量不支持。')
    ids.add(id); reader.expect('obj'); reader.skip(); const start = reader.offset, value = reader.object(); reader.skip()
    let stream: Uint8Array | undefined
    if (reader.keyword('stream', false)) {
      const length = value.length
      if (value.kind !== 'dict' || length === undefined || !Number.isSafeInteger(length) || length < 0) pdfFail('结构准入要求直接流长度。')
      stream = readPdfStream(reader, length)
    }
    const body = bytes.subarray(start, reader.offset); reader.expect('endobj')
    records.push({ id, generation, offset, body, value, stream })
  }
  readPdfEnd(reader, startXref)
  return { records, nodes: reader.nodes }
}
