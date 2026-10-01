import { PDFArray, PDFBool, PDFDict, PDFHexString, PDFName, PDFNull, PDFNumber, PDFRawStream, PDFString } from 'pdf-lib'
import { loadPageDocument, pageInformation } from './pdfPages'
import { boundedInflatePdf } from './pdfBoundedInflate'
export interface PdfMetadataResult { version: string; bytes: number; pages: ReturnType<typeof pageInformation>; fields: { name: string; value: string }[]; xmp: string; xmpStatus: string }
// Controls/bidi formatting are shown literally, never interpreted as UI markup.
export function safePdfMetadataText(text: string): string {
  if (text.length > 65_536) throw new Error('单个元数据字段超过65536字符。')
  return text.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`)
}
export async function inspectPdfMetadata(input: Uint8Array): Promise<PdfMetadataResult> {
  if (!(input instanceof Uint8Array) || !input.length || input.length > 8 * 1024 * 1024) throw new Error('PDF须为1字节至8MiB。')
  const original = new Uint8Array(input), doc = await loadPageDocument(original), fields: PdfMetadataResult['fields'] = []
  const info = doc.context.lookup(doc.context.trailerInfo.Info)
  if (info !== undefined && !(info instanceof PDFDict)) throw new Error('文档Info不是字典。')
  let size = 0
  if (info instanceof PDFDict) {
    if (info.keys().length > 64) throw new Error('Info元数据超过64个字段。')
    for (const [key, raw] of info.entries()) {
      const value = doc.context.lookup(raw)
      const text = value instanceof PDFString || value instanceof PDFHexString || value instanceof PDFName ? value.decodeText() : value instanceof PDFNumber || value instanceof PDFBool || value === PDFNull ? value.toString() : '[非标量属性，未展开]'
      const field = { name: safePdfMetadataText(key.decodeText()), value: safePdfMetadataText(text) }
      size += field.name.length + field.value.length
      if (size > 262_144) throw new Error('Info元数据显示总量超过256Ki字符。')
      fields.push(field)
    }
  }
  let xmp = '', xmpStatus = '没有Catalog/Metadata流；不代表其他对象没有元数据。'
  const metadata = doc.context.lookup(doc.catalog.get(PDFName.of('Metadata')))
  if (metadata !== undefined) {
    if (!(metadata instanceof PDFRawStream)) throw new Error('Catalog/Metadata不是流。')
    const filter = doc.context.lookup(metadata.dict.get(PDFName.of('Filter'))), filters = filter instanceof PDFArray ? filter.asArray().map(value => doc.context.lookup(value)) : filter ? [filter] : []
    if (filters.length > 1 || filters.some(value => !(value instanceof PDFName) || !['FlateDecode', 'Fl'].includes(value.decodeText())) || ['DecodeParms', 'DP', 'F'].some(key => metadata.dict.has(PDFName.of(key)))) xmpStatus = '发现Metadata流，但其编码/参数不在支持范围内，未解码。'
    else {
      const encoded = metadata.getContents()
      if (encoded.length > 262_144) throw new Error('Metadata编码流超过256KiB。')
      const bytes = filters.length ? boundedInflatePdf(encoded, 262_144) : encoded
      if (bytes.length > 262_144) throw new Error('Metadata展开超过256KiB。')
      try { xmp = new TextDecoder('utf-8', { fatal: true }).decode(bytes); xmpStatus = '原始UTF-8 Metadata文本；未解析XML、加载实体/链接或验证真实性。' }
      catch { xmpStatus = 'Metadata不是有效UTF-8；未猜测编码，内容未显示。' }
      // XMP has a separate bounded display size; preserve visible line breaks only.
      xmp = xmp.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`)
      if (xmp.length > 524_288) throw new Error('Metadata转义显示超过512Ki字符。')
    }
  }
  return { version: new TextDecoder('ascii').decode(original.subarray(0, 8)), bytes: original.length, pages: pageInformation(doc), fields, xmp, xmpStatus }
}
