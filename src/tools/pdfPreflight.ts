import { pdfFail } from './pdfRawSyntax'
import { readClassicRecords } from './pdfClassicRecords'
export interface PdfPreflight { root: string; objects: Map<string, number> }
export function preflightPdf(bytes: Uint8Array, maxBytes = 8 * 1024 * 1024): PdfPreflight {
  if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > maxBytes) pdfFail('单文件必须为 1 字节至 8 MiB。')
  if (!/^%PDF-1\.[0-7][\r\n]/.test(String.fromCharCode(...bytes.subarray(0, 10)))) pdfFail('仅支持签名规范的 PDF 1.0–1.7。')
  return readClassicRecords(bytes).preflight
}
