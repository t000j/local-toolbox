import { PdfRawReader, PDF_MAX_OBJECTS, pdfFail, pdfWhite, rejectStreamNames } from './pdfRawSyntax'
export interface PdfPreflight { root: string; objects: Map<string, number> }
export function preflightPdf(bytes: Uint8Array, maxBytes = 8 * 1024 * 1024): PdfPreflight {
  if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > maxBytes) pdfFail('单文件必须为 1 字节至 8 MiB。')
  if (!/^%PDF-1\.[0-7][\r\n]/.test(String.fromCharCode(...bytes.subarray(0, 10)))) pdfFail('仅支持签名规范的 PDF 1.0–1.7。')
  rejectStreamNames(bytes)
  const reader = new PdfRawReader(bytes), objects = new Map<string, number>(); reader.offset = 8
  while (!reader.keyword('xref', false)) {
    reader.skip(); const offset = reader.offset, id = reader.unsigned(), generation = reader.unsigned()
    if (!id || generation > 65535 || objects.size >= PDF_MAX_OBJECTS) pdfFail('对象编号或对象数量超过限制。')
    const ref = `${id} ${generation} R`
    if (objects.has(ref)) pdfFail('重复对象或增量更新不支持。')
    reader.expect('obj'); const object = reader.object(); reader.skip()
    if (reader.keyword('stream', false)) {
      if (object.kind !== 'dict' || object.length === undefined || !Number.isSafeInteger(object.length) || object.length < 0) pdfFail('流必须有直接、非负整数 Length；间接长度暂不支持。')
      reader.expect('stream')
      if (bytes[reader.offset] === 13) { reader.offset++; if (bytes[reader.offset] === 10) reader.offset++ }
      else if (bytes[reader.offset] === 10) reader.offset++
      else pdfFail('stream 后缺少标准换行。')
      if (object.length > bytes.length - reader.offset) pdfFail('流越界。')
      reader.offset += object.length; reader.expect('endstream')
    }
    reader.expect('endobj'); objects.set(ref, offset)
  }
  reader.skip(); const xrefOffset = reader.offset; reader.expect('xref')
  const listed = new Set<string>(), ids = new Set<number>(); let entries = 0
  while (!reader.keyword('trailer', false)) {
    const start = reader.unsigned(), count = reader.unsigned()
    if (!count || entries + count > PDF_MAX_OBJECTS + 1 || start + count > 1_000_000_000) pdfFail('交叉引用表数量无效。')
    entries += count
    for (let i = 0; i < count; i++) {
      const offset = reader.unsigned(), generation = reader.unsigned(), id = start + i
      if (ids.has(id) || generation > 65535) pdfFail('重复交叉引用或代次无效。'); ids.add(id)
      if (reader.keyword('n')) {
        const ref = `${id} ${generation} R`
        if (!id || objects.get(ref) !== offset) pdfFail('交叉引用偏移与对象位置不一致；不自动修复。')
        listed.add(ref)
      } else if (!reader.keyword('f')) pdfFail('交叉引用项必须为 n 或 f。')
    }
  }
  if (objects.size !== listed.size) pdfFail('交叉引用表缺失对象。')
  reader.expect('trailer'); const trailer = reader.object()
  if (trailer.kind !== 'dict' || !trailer.root || !objects.has(trailer.root) || trailer.size !== Math.max(...ids) + 1) pdfFail('trailer Root／Size 无效。')
  for (const ref of reader.refs) if (!objects.has(ref)) pdfFail('存在未定义的间接引用。')
  reader.expect('startxref'); if (reader.unsigned() !== xrefOffset) pdfFail('startxref 不匹配；不自动修复。')
  while (pdfWhite(bytes[reader.offset])) reader.offset++
  if (String.fromCharCode(...bytes.subarray(reader.offset, reader.offset + 5)) !== '%%EOF') pdfFail('缺少最终 EOF。')
  reader.offset += 5
  while (pdfWhite(bytes[reader.offset])) reader.offset++
  if (reader.offset !== bytes.length) pdfFail('不支持 EOF 后附加内容或增量更新。')
  return { root: trailer.root, objects }
}
