import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFObject, PDFPage, PDFRawStream, PDFRef } from 'pdf-lib'
import { pdfFail } from './pdfRawSyntax'
const encoder = new TextEncoder()
async function digest(bytes: Uint8Array): Promise<string> {
  const result = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer)
  return Array.from(new Uint8Array(result), byte => byte.toString(16).padStart(2, '0')).join('')
}
export function pdfPageFingerprinter(doc: PDFDocument, scope: 'all' | 'content' = 'all'): (page: PDFPage) => Promise<string> {
  const memo = new Map<PDFObject, string>(), active = new Set<PDFObject>(); let visited = 0, streamBytes = 0
  const hash = async (object: PDFObject | undefined, depth = 0): Promise<string> => {
    if (!object) return 'absent'
    if (depth > 48 || active.has(object)) pdfFail('页面资源存在循环或过深的间接引用。')
    const cached = memo.get(object); if (cached) return cached
    if (++visited > 100_000) pdfFail('页面资源图过大。')
    active.add(object)
    let value: string
    if (object instanceof PDFRef) {
      const resolved = doc.context.lookup(object); if (!resolved) pdfFail('页面资源引用缺失。')
      value = await hash(resolved, depth + 1)
    } else if (object instanceof PDFRawStream) {
      const bytes = object.getContents(); streamBytes += bytes.length
      if (streamBytes > 16 * 1024 * 1024) pdfFail('页面流数据超过安全上限。')
      value = `stream:${await hash(object.dict, depth + 1)}:${await digest(bytes)}`
    } else if (object instanceof PDFDict) {
      const entries: [string, string][] = []
      for (const [key, child] of object.entries().sort(([a], [b]) => a.toString().localeCompare(b.toString()))) entries.push([key.toString(), await hash(child, depth + 1)])
      value = JSON.stringify(['dict', entries])
    } else if (object instanceof PDFArray) {
      const values: string[] = []; for (const child of object.asArray()) values.push(await hash(child, depth + 1))
      value = JSON.stringify(['array', values])
    } else value = `${object.constructor.name}:${object.toString()}`
    const result = await digest(encoder.encode(value)); memo.set(object, result); active.delete(object); return result
  }
  return async page => {
    const unit = doc.context.lookup(page.node.get(PDFName.of('UserUnit')))
    if (unit && (!(unit instanceof PDFNumber) || unit.asNumber() <= 0 || unit.asNumber() > 75000)) pdfFail('页面 UserUnit 必须为正数且不超过 75000。')
    const content = doc.context.lookup(page.node.get(PDFName.of('Contents')))
    if (content && !(content instanceof PDFRawStream || content instanceof PDFArray && content.asArray().every(value => doc.context.lookup(value) instanceof PDFRawStream))) pdfFail('页面内容必须是本地流或本地流数组。')
    const resources = doc.context.lookup(page.node.getInheritableAttribute(PDFName.of('Resources')))
    if (resources && !(resources instanceof PDFDict)) pdfFail('页面资源必须为字典。')
    for (const key of ['MediaBox', 'CropBox', 'BleedBox', 'TrimBox', 'ArtBox']) {
      const box = doc.context.lookup(['MediaBox', 'CropBox'].includes(key) ? page.node.getInheritableAttribute(PDFName.of(key)) : page.node.get(PDFName.of(key)))
      if (box && (!(box instanceof PDFArray) || box.size() !== 4 || box.asArray().some(value => !(doc.context.lookup(value) instanceof PDFNumber)))) pdfFail('页面框必须恰好有四个数值。')
    }
    const media = page.getMediaBox(), crop = page.getCropBox(), rotation = page.getRotation().angle
    for (const box of [media, crop, page.getBleedBox(), page.getTrimBox(), page.getArtBox()]) {
      if (!Object.values(box).every(value => Number.isFinite(value) && Math.abs(value) <= 1_000_000) || box.width <= 0 || box.height <= 0) pdfFail('页面框无效或超出安全范围。')
    }
    if (!Number.isInteger(rotation) || rotation % 90) pdfFail('页面旋转必须为 90 度的整数倍。')
    const entries = new Map(page.node.entries().filter(([key]) => !['Parent', 'Type', ...(scope === 'content' ? ['Resources'] : [])].includes(key.decodeText())).map(([key, value]) => [key.decodeText(), value]))
    for (const key of ['Resources', 'MediaBox', 'CropBox', 'Rotate']) {
      const inherited = page.node.getInheritableAttribute(PDFName.of(key))
      if (inherited && !(scope === 'content' && key === 'Resources')) entries.set(key, inherited)
    }
    const canonical: [string, string][] = []
    for (const [key, value] of [...entries].sort(([a], [b]) => a.localeCompare(b))) canonical.push([key, await hash(value)])
    return digest(encoder.encode(JSON.stringify({ media, crop, rotation, entries: canonical })))
  }
}
