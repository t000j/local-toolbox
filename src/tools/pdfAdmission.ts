import { preflightPdf } from './pdfPreflight'
import type { PdfPreflight } from './pdfPreflight'
import { pdfFail } from './pdfRawSyntax'
import { readStartXref, readStreamRecords } from './pdfStreamRecords'
import type { StructuralBudget } from './pdfStreamRecords'
import { expandObjectStreams } from './pdfObjectStreams'
import { validateXrefStream } from './pdfXrefStreams'
import { canonicalPdf, CANONICAL_LIMIT } from './pdfCanonical'
import { readClassicRecords } from './pdfClassicRecords'
export interface PdfAdmission { bytes: Uint8Array; preflight: PdfPreflight; normalized: boolean; warnings: string[] }
const INPUT_LIMIT = 8 * 1024 * 1024
export const PDF_ADMISSION_LIMITATIONS = '支持经典 xref 和单次保存的有界 ObjStm／XRef：仅直接结构参数、未压缩或单层 FlateDecode（xref 可用 8 位单通道 PNG 预测器）。结构流每个最多展开 1 MiB、合计 4 MiB、最多 128 个，压缩合计 2 MiB；经典 xref 支持经原始字节全扫描核验的一跳整数间接 Length；混合／增量 xref、结构流的间接长度、链式长度、加密和歧义结构仍拒绝。普通内容流不解压，这不是恶意载荷净化。'
export function admitPdf(input: Uint8Array, maxBytes = INPUT_LIMIT): PdfAdmission {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > CANONICAL_LIMIT || !(input instanceof Uint8Array) || !input.length || input.length > maxBytes) pdfFail('PDF 输入大小超出准入上限。')
  if (!/^%PDF-1\.[0-7][\r\n]/.test(String.fromCharCode(...input.subarray(0, 10)))) pdfFail('仅支持规范的 PDF 1.0–1.7。')
  const bytes = new Uint8Array(input), startXref = readStartXref(bytes)
  if (String.fromCharCode(...bytes.subarray(startXref, startXref + 4)) === 'xref') {
    const classic = readClassicRecords(bytes, true)
    if (!classic.patched) return { bytes, preflight: classic.preflight, normalized: false, warnings: [] }
    const canonical = canonicalPdf(classic.records, classic.trailer), preflight = preflightPdf(canonical, CANONICAL_LIMIT)
    return { bytes: canonical, preflight, normalized: true, warnings: [`已核验并将 ${classic.patched} 个一跳间接 Length 改为直接整数；保留长度对象及原始流字节。`, PDF_ADMISSION_LIMITATIONS] }
  }
  const { records, nodes } = readStreamRecords(bytes, startXref), xrefs = records.filter(record => record.value.dict?.get('Type')?.name === 'XRef')
  if (xrefs.length !== 1 || xrefs[0]!.offset !== startXref) pdfFail('只支持唯一且 startxref 精确指向的交叉引用流。')
  const budget: StructuralBudget = { encoded: 0, decoded: 0, nodes, streams: 0 }, expanded = expandObjectStreams(records, budget)
  validateXrefStream(xrefs[0]!, records, expanded.objects, expanded.indices, budget)
  const ordinary = records.filter(record => !['ObjStm', 'XRef'].includes(record.value.dict?.get('Type')?.name ?? ''))
  const canonical = canonicalPdf([...ordinary, ...expanded.objects], xrefs[0]!.value)
  // Mandatory second admission: no compressed structural names can reach pdf-lib, including indirect-Type tricks.
  const preflight = preflightPdf(canonical, CANONICAL_LIMIT)
  return { bytes: canonical, preflight, normalized: true, warnings: [`已在有界准入阶段展开 ${expanded.indices.size} 个对象流并改写为经典 xref；页面内容流原始字节未解压或改写。`, PDF_ADMISSION_LIMITATIONS] }
}
