import { pdfFail } from './pdfRawSyntax'
export interface PdfCmapBudget { mappings: number }
// PDF.js itself allows almost 2^24 entries per range. Bound the supported textual
// subset before it expands ranges. Unusual CMap syntax fails closed, never guessed.
export function auditPdfCmap(bytes: Uint8Array, budget: PdfCmapBudget): void {
  const raw = new TextDecoder('latin1').decode(bytes)
  const markers = raw.match(/begin(?:bfchar|bfrange|cidchar|cidrange)/g)
  if (!markers) return
  if (raw.length > 1024 * 1024 || /usecmap/i.test(raw)) pdfFail('字体CMap超过1MiB或包含不支持的继承。')
  let hexOpen = false
  for (const char of raw) { if (char === '<') hexOpen = true; else if (char === '>') hexOpen = false; else if (char === '%' && hexOpen) pdfFail('CMap十六进制或字典范围内的百分号语法不受支持。') }
  const text = raw.replace(/%[^\r\n]*/g, '')
  if ((text.match(/begin(?:bfchar|bfrange|cidchar|cidrange)/g) ?? []).length !== markers.length) pdfFail('CMap注释含映射命令标记，保守拒绝歧义。')
  let blocks = 0
  const sections = /(\d+)\s+begin(bfchar|bfrange|cidchar|cidrange)\b([\s\S]*?)\bend\2\b/g
  for (const match of text.matchAll(sections)) {
    blocks++
    const count = Number(match[1]), kind = match[2]!, body = match[3]!
    if (!Number.isSafeInteger(count) || count < 1 || count > 4096) pdfFail('CMap单块映射条目须为1–4096。')
    const tokens = body.match(/<[\da-fA-F\s]*>|\[|\]|\d+|\S+/g) ?? []; let at = 0
    const token = () => { const value = tokens[at++]; if (value === undefined) pdfFail('CMap映射项不完整。'); return value! }
    const hex = (value: string, maximum: number) => {
      if (!/^<[\da-fA-F\s]+>$/.test(value)) pdfFail('CMap仅支持明确的十六进制字符串。')
      const digits = value.slice(1, -1).replace(/\s/g, '')
      if (!digits.length || digits.length > maximum) pdfFail('CMap字符编码长度超出支持范围。')
      return digits.length % 2 ? digits + '0' : digits
    }
    const source = () => parseInt(hex(token(), 4), 16)
    const destination = () => { hex(token(), 128) }
    const cid = () => { const value = token(); if (!/^\d{1,5}$/.test(value) || Number(value) > 65535) pdfFail('CMap目标CID超出16位范围。'); return Number(value) }
    for (let entry = 0; entry < count; entry++) {
      const low = source(), range = kind.endsWith('range'), high = range ? source() : low
      if (high < low) pdfFail('CMap范围倒序。')
      const length = high - low + 1
      budget.mappings += length
      if (budget.mappings > 100_000) pdfFail('CMap映射展开总量超过100000。')
      if (kind.startsWith('cid')) { if (cid() + length - 1 > 65535) pdfFail('CMap目标CID范围超过16位。') }
      else if (range && tokens[at] === '[') {
        at++; for (let i = 0; i < length; i++) destination()
        if (token() !== ']') pdfFail('CMap映射数组长度与范围不一致。')
      } else destination()
    }
    if (at !== tokens.length) pdfFail('CMap块包含额外或不支持的映射语法。')
  }
  if (blocks !== markers.length) pdfFail('CMap块边界或计数语法不受支持。')
}
