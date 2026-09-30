import { preflightPdf } from './pdfPreflight'
import type { PdfPreflight } from './pdfPreflight'
import { pdfFail } from './pdfRawSyntax'
import { rawArray, readStartXref, readStreamRecords } from './pdfStreamRecords'
import type { PdfRecord, StructuralBudget } from './pdfStreamRecords'
import { expandObjectStreams } from './pdfObjectStreams'
import { validateXrefStream } from './pdfXrefStreams'
export interface PdfAdmission { bytes: Uint8Array; preflight: PdfPreflight; normalized: boolean; warnings: string[] }
const encoder = new TextEncoder(), CANONICAL_LIMIT = 16 * 1024 * 1024
export const PDF_ADMISSION_LIMITATIONS = '支持经典 xref 和单次保存的有界 ObjStm／XRef：仅直接结构参数、未压缩或单层 FlateDecode（xref 可用 8 位单通道 PNG 预测器）。结构流每个最多展开 1 MiB、合计 4 MiB、最多 128 个，压缩合计 2 MiB；混合／增量 xref、间接流长度、加密和歧义结构仍拒绝。普通内容流不解压，这不是恶意载荷净化。'
function canonicalPdf(objects: PdfRecord[], xref: PdfRecord): Uint8Array {
  const parts: Uint8Array[] = [encoder.encode('%PDF-1.7\n')], offsets = new Map<number, number>(); let length = parts[0]!.length
  const add = (part: Uint8Array): void => { length += part.length; if (length > CANONICAL_LIMIT) pdfFail('结构标准化结果超过 16 MiB。'); parts.push(part) }
  for (const object of objects.sort((a, b) => a.id - b.id)) {
    offsets.set(object.id, length); add(encoder.encode(`${object.id} ${object.generation} obj\n`)); add(object.body); add(encoder.encode('\nendobj\n'))
  }
  const size = Math.max(...objects.map(object => object.id)) + 1, xrefOffset = length, byId = new Map(objects.map(object => [object.id, object]))
  if (!objects.length || size > 6001) pdfFail('标准化对象编号范围过大。')
  add(encoder.encode(`xref\n0 ${size}\n0000000000 65535 f \n`))
  for (let id = 1; id < size; id++) {
    const object = byId.get(id)
    add(encoder.encode(object ? `${String(offsets.get(id)).padStart(10, '0')} ${String(object.generation).padStart(5, '0')} n \n` : '0000000000 00000 f \n'))
  }
  const dict = xref.value.dict!, root = dict.get('Root')?.ref, info = dict.get('Info'), id = dict.get('ID')
  if (!root) pdfFail('XRef Root 缺失。')
  if (info && info.kind !== 'ref') pdfFail('XRef Info 必须为间接引用。')
  add(encoder.encode(`trailer\n<< /Size ${size} /Root ${root}${info ? ` /Info ${info.ref}` : ''}`))
  if (id) {
    const values = rawArray(id, 'XRef ID')
    if (values.length !== 2 || values.some(value => value.kind !== 'string' || !value.encoded || value.encoded.length > 256)) pdfFail('XRef ID 结构不支持。')
    add(encoder.encode(' /ID [')); for (const value of values) { add(value.encoded!); add(encoder.encode(' ')) } add(encoder.encode(']'))
  }
  add(encoder.encode(` >>\nstartxref\n${xrefOffset}\n%%EOF`))
  const output = new Uint8Array(length); let offset = 0
  for (const part of parts) { output.set(part, offset); offset += part.length }
  return output
}
export function admitPdf(input: Uint8Array, maxBytes = 8 * 1024 * 1024): PdfAdmission {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > CANONICAL_LIMIT || !(input instanceof Uint8Array) || !input.length || input.length > maxBytes || input.length > CANONICAL_LIMIT) pdfFail('PDF 输入大小超出准入上限。')
  if (!/^%PDF-1\.[0-7][\r\n]/.test(String.fromCharCode(...input.subarray(0, 10)))) pdfFail('仅支持规范的 PDF 1.0–1.7。')
  const bytes = new Uint8Array(input), startXref = readStartXref(bytes)
  if (String.fromCharCode(...bytes.subarray(startXref, startXref + 4)) === 'xref') return { bytes, preflight: preflightPdf(bytes, maxBytes), normalized: false, warnings: [] }
  const { records, nodes } = readStreamRecords(bytes, startXref), xrefs = records.filter(record => record.value.dict?.get('Type')?.name === 'XRef')
  if (xrefs.length !== 1 || xrefs[0]!.offset !== startXref) pdfFail('只支持唯一且 startxref 精确指向的交叉引用流。')
  const budget: StructuralBudget = { encoded: 0, decoded: 0, nodes, streams: 0 }, expanded = expandObjectStreams(records, budget)
  validateXrefStream(xrefs[0]!, records, expanded.objects, expanded.indices, budget)
  const ordinary = records.filter(record => !['ObjStm', 'XRef'].includes(record.value.dict?.get('Type')?.name ?? ''))
  const canonical = canonicalPdf([...ordinary, ...expanded.objects], xrefs[0]!)
  // Mandatory second admission: no compressed structural names can reach pdf-lib, including indirect-Type tricks.
  const preflight = preflightPdf(canonical, CANONICAL_LIMIT)
  return { bytes: canonical, preflight, normalized: true, warnings: [`已在有界准入阶段展开 ${expanded.indices.size} 个对象流并改写为经典 xref；页面内容流原始字节未解压或改写。`, PDF_ADMISSION_LIMITATIONS] }
}
