import { PDFDocument, ParseSpeeds, degrees } from 'pdf-lib'
import { admitPdf } from './pdfAdmission'
import { preflightPdf } from './pdfPreflight'
import { auditPdf } from './pdfAudit'
import { pdfPageFingerprinter } from './pdfPageFingerprint'
import { pdfFail } from './pdfRawSyntax'
export interface PdfPageInfo { number: number; width: number; height: number; rotation: number }
export interface PdfPageOutput { bytes: Uint8Array; sourcePages: number; order: number[]; pages: PdfPageInfo[] }
const loadOptions = { ignoreEncryption: false, updateMetadata: false, throwOnInvalidObject: true, parseSpeed: ParseSpeeds.Slow, capNumbers: false }
export function parsePageSelection(text: string, count: number): number[] {
  if (typeof text !== 'string' || !text.trim() || text.length > 2000 || !Number.isInteger(count) || count < 1 || count > 200) pdfFail('页码范围不能为空，文档须为1–200页。')
  const pages: number[] = [], seen = new Set<number>()
  for (const token of text.split(',')) {
    const match = /^\s*([1-9]\d{0,2})(?:\s*-\s*([1-9]\d{0,2}))?\s*$/.exec(token)
    if (!match) pdfFail('使用英文逗号和升序范围，例如 1-3,5,8-10。')
    const start = Number(match[1]), end = Number(match[2] ?? match[1])
    if (start > end || end > count) pdfFail(`页码必须在1–${count}内；范围不能倒序。`)
    for (let page = start; page <= end; page++) {
      if (seen.has(page)) pdfFail(`第${page}页重复；请移除重叠范围。`)
      seen.add(page); pages.push(page)
    }
  }
  return pages
}
export async function loadPageDocument(bytes: Uint8Array): Promise<PDFDocument> {
  if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > 8 * 1024 * 1024) pdfFail('输入必须为1字节至8MiB。')
  const admitted = admitPdf(bytes), snapshot = admitted.bytes, raw = admitted.preflight
  const doc = await PDFDocument.load(snapshot, loadOptions), count = auditPdf(doc, raw), fingerprint = pdfPageFingerprinter(doc)
  if (doc.getPages().length !== count) pdfFail('页数与结构校验不一致。')
  for (const page of doc.getPages()) await fingerprint(page)
  return doc
}
export function pageInformation(doc: PDFDocument): PdfPageInfo[] {
  return doc.getPages().map((page, index) => { const box = page.getCropBox(); return { number: index + 1, width: box.width, height: box.height, rotation: ((page.getRotation().angle % 360) + 360) % 360 } })
}
export async function inspectPdfPages(bytes: Uint8Array): Promise<PdfPageInfo[]> { return pageInformation(await loadPageDocument(bytes)) }
export async function exportPdfPages(bytes: Uint8Array, order: number[], rotations?: number[]): Promise<PdfPageOutput> {
  // Copy controls before any await, so caller edits cannot mutate an in-flight operation.
  if (!Array.isArray(order) || !order.length || order.length > 200 || order.some(n => !Number.isInteger(n) || n < 1) || new Set(order).size !== order.length) pdfFail('页面清单必须包含1–200个不重复的正整数页码。')
  if (rotations !== undefined && !Array.isArray(rotations)) pdfFail('旋转清单必须为数组。')
  const selected = [...order], turns = rotations === undefined ? selected.map(() => 0) : [...rotations]
  if (turns.length !== selected.length || turns.some(n => ![0, 90, 180, 270].includes(n))) pdfFail('每页旋转须为0/90/180/270度。')
  const source = await loadPageDocument(bytes), pages = source.getPages()
  if (selected.some(n => n > pages.length)) pdfFail('页码超出文档范围。')
  // Expected fingerprint includes ONLY the requested rotation mutation; everything else must survive unchanged.
  const fingerprint = pdfPageFingerprinter(source), expected: string[] = []
  for (const [index, number] of selected.entries()) {
    const page = pages[number - 1]!
    if (turns[index]) page.setRotation(degrees(((page.getRotation().angle + turns[index]!) % 360 + 360) % 360))
    expected.push(await fingerprint(page))
  }
  const output = await PDFDocument.create({ updateMetadata: false })
  for (const page of await output.copyPages(source, selected.map(n => n - 1))) output.addPage(page)
  const result = await output.save({ useObjectStreams: false, addDefaultPage: false, updateFieldAppearances: false, objectsPerTick: 20 })
  if (result.length > 16 * 1024 * 1024) pdfFail('输出超过16MiB。')
  const raw = preflightPdf(result, 16 * 1024 * 1024), verified = await PDFDocument.load(result, loadOptions)
  if (auditPdf(verified, raw) !== selected.length) pdfFail('保存后页数不一致。')
  const verifyFingerprint = pdfPageFingerprinter(verified)
  for (const [index, page] of verified.getPages().entries()) if (await verifyFingerprint(page) !== expected[index]) pdfFail(`第${index + 1}个输出页面与预期不一致。`)
  return { bytes: result, sourcePages: pages.length, order: selected, pages: pageInformation(verified) }
}
