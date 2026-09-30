import { PDFDocument, ParseSpeeds } from 'pdf-lib'
import { admitPdf, PDF_ADMISSION_LIMITATIONS } from './pdfAdmission'
import { preflightPdf } from './pdfPreflight'
import { auditPdf } from './pdfAudit'
import { pdfPageFingerprinter } from './pdfPageFingerprint'
import { pdfFail } from './pdfRawSyntax'
export interface PdfMergeInput { name: string; bytes: Uint8Array }
export interface PdfMergeResult { bytes: Uint8Array; pages: number; inputs: Array<{ name: string; pages: number }>; warnings: string[] }
export const PDF_MERGE_LIMITATIONS = [
  PDF_ADMISSION_LIMITATIONS,
  '拒绝加密、表单、签名、注释／链接、动作／脚本、附件、外部文件、书签导航、可选层、标签结构及文档级色彩输出意图。',
  '按所选文件及原页序复制页面，保留页面框、旋转、原始内容流和资源；不渲染、不执行脚本、不解压内容流或联网；保留的资源／流仍可能含恶意或损坏载荷，这不是恶意 PDF 检测或净化工具。',
  '不保留文档级元数据、阅读器偏好或文档身份；页面可见内容、字体、图像及页面元数据仍会保留，不能用于匿名化。',
]
const loadOptions = { ignoreEncryption: false, updateMetadata: false, throwOnInvalidObject: true, parseSpeed: ParseSpeeds.Slow, capNumbers: false }
export async function mergePdfs(inputs: PdfMergeInput[]): Promise<PdfMergeResult> {
  if (!Array.isArray(inputs) || inputs.length < 2 || inputs.length > 8) pdfFail('请选择 2–8 个 PDF。')
  let totalBytes = 0
  for (const input of inputs) {
    if (!input || typeof input.name !== 'string' || !input.name || input.name.length > 255 || !(input.bytes instanceof Uint8Array) || !input.bytes.length || input.bytes.length > 8 * 1024 * 1024) pdfFail('文件名或输入大小无效；每个 PDF 最多 8 MiB。')
    totalBytes += input.bytes.length
  }
  if (totalBytes > 16 * 1024 * 1024) pdfFail('输入总大小最多 16 MiB。')
  const sources = inputs.map(input => ({ name: input.name, bytes: new Uint8Array(input.bytes) }))
  const output = await PDFDocument.create({ updateMetadata: false }), summaries: PdfMergeResult['inputs'] = [], expected: string[] = []
  const admissionWarnings: string[] = []
  let totalObjects = 2
  for (const input of sources) {
    const admitted = admitPdf(input.bytes), raw = admitted.preflight; totalObjects += raw.objects.size
    if (admitted.normalized) admissionWarnings.push(`${input.name}：已按有界规则展开结构对象流。`)
    if (totalObjects > 6000) pdfFail('合并对象总量超过 6000。')
    const doc = await PDFDocument.load(admitted.bytes, loadOptions), count = auditPdf(doc, raw)
    if (expected.length + count > 200) pdfFail('合并总页数最多 200。')
    const fingerprint = pdfPageFingerprinter(doc), pages = doc.getPages()
    if (pages.length !== count) pdfFail('页面遍历与预检数量不一致。')
    for (const page of pages) expected.push(await fingerprint(page))
    for (const page of await output.copyPages(doc, pages.map((_, index) => index))) output.addPage(page)
    summaries.push({ name: input.name, pages: count })
  }
  const bytes = await output.save({ useObjectStreams: false, addDefaultPage: false, updateFieldAppearances: false, objectsPerTick: 20 })
  if (bytes.length > 16 * 1024 * 1024) pdfFail('合并结果超过 16 MiB。')
  const raw = preflightPdf(bytes, 16 * 1024 * 1024), verified = await PDFDocument.load(bytes, loadOptions)
  if (auditPdf(verified, raw) !== expected.length) pdfFail('保存后页数校验失败。')
  const fingerprint = pdfPageFingerprinter(verified)
  for (const [index, page] of verified.getPages().entries()) if (await fingerprint(page) !== expected[index]) pdfFail(`第 ${index + 1} 页内容、资源或页面属性发生变化。`)
  return { bytes, pages: expected.length, inputs: summaries, warnings: [...PDF_MERGE_LIMITATIONS, ...admissionWarnings] }
}
