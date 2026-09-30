// Strict, bounded syntax for classic-xref PDFs; stream bytes are skipped only by a direct /Length.
export const PDF_MAX_OBJECTS = 6000, PDF_MAX_NODES = 100_000, PDF_MAX_DEPTH = 32
export function pdfFail(message: string): never { throw new Error(`PDF 无法安全合并：${message}`) }
export const pdfWhite = (byte: number | undefined): boolean => byte !== undefined && [0, 9, 10, 12, 13, 32].includes(byte)
export const pdfDelimiter = (byte: number | undefined): boolean => byte === undefined || pdfWhite(byte) || [40,41,60,62,91,93,123,125,47,37].includes(byte)
export interface RawValue { kind: string; number?: number; ref?: string; length?: number; root?: string; size?: number }
const forbiddenPreparse = new Set(['ObjStm', 'XRef', 'XRefStm', 'Encrypt', 'Prev'])
export function rejectStreamNames(bytes: Uint8Array): void {
  // Scan even strings/comments/stream payloads: false positives are preferable to missing a parser decompression path.
  for (let i = 0; i < bytes.length; i++) if (bytes[i] === 47) {
    let name = ''
    for (let p = i + 1; p < bytes.length && !pdfDelimiter(bytes[p]) && name.length < 12; p++) {
      let value = bytes[p]!
      if (value === 35 && p + 2 < bytes.length) {
        const hex = String.fromCharCode(bytes[p + 1]!, bytes[p + 2]!)
        if (/^[0-9a-f]{2}$/i.test(hex)) { value = Number.parseInt(hex, 16); p += 2 }
      }
      name += String.fromCharCode(value)
      if (forbiddenPreparse.has(name) && pdfDelimiter(bytes[p + 1])) pdfFail(`不支持 ${name}：加密、增量更新、对象流和交叉引用流均拒绝解析。`)
    }
  }
}
export class PdfRawReader {
  offset = 0
  nodes = 0
  readonly refs = new Set<string>()
  constructor(readonly bytes: Uint8Array) {}
  skip(): void {
    while (this.offset < this.bytes.length) {
      if (pdfWhite(this.bytes[this.offset])) this.offset++
      else if (this.bytes[this.offset] === 37) { while (this.offset < this.bytes.length && ![10,13].includes(this.bytes[this.offset]!)) this.offset++ }
      else break
    }
  }
  keyword(word: string, consume = true): boolean {
    this.skip()
    const match = [...word].every((char, i) => this.bytes[this.offset + i] === char.charCodeAt(0)) && pdfDelimiter(this.bytes[this.offset + word.length])
    if (match && consume) this.offset += word.length
    return match
  }
  expect(word: string): void { if (!this.keyword(word)) pdfFail(`缺少 ${word} 或语法边界错误。`) }
  number(): number {
    this.skip(); const start = this.offset
    while (this.offset < this.bytes.length && /[0-9.+-]/.test(String.fromCharCode(this.bytes[this.offset]!))) this.offset++
    const value = String.fromCharCode(...this.bytes.subarray(start, Math.min(this.offset, start + 65)))
    if (this.offset - start > 64 || !/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(value) || !pdfDelimiter(this.bytes[this.offset])) pdfFail('数字格式无效。')
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || Math.abs(parsed) > 1_000_000_000) pdfFail('数值超过安全范围。')
    return parsed
  }
  unsigned(): number { const value = this.number(); if (!Number.isSafeInteger(value) || value < 0) pdfFail('需要非负整数。'); return value }
  name(): string {
    this.skip(); if (this.bytes[this.offset++] !== 47) pdfFail('字典键不是名称。')
    let name = ''
    while (!pdfDelimiter(this.bytes[this.offset])) {
      let byte = this.bytes[this.offset++]!
      if (byte === 35) {
        const hex = String.fromCharCode(this.bytes[this.offset]!, this.bytes[this.offset + 1]!)
        if (!/^[0-9A-F]{2}$/.test(hex)) pdfFail('名称转义仅支持规范的大写 #XX，避免解析器歧义。')
        byte = Number.parseInt(hex, 16); this.offset += 2
      }
      if (!byte || name.length >= 127) pdfFail('名称包含空字符或超过长度上限。')
      name += String.fromCharCode(byte)
    }
    if (forbiddenPreparse.has(name)) pdfFail(`不支持 ${name}。`)
    return name
  }
  object(depth = 0): RawValue {
    if (depth > PDF_MAX_DEPTH || ++this.nodes > PDF_MAX_NODES) pdfFail('对象嵌套或节点数量超过安全上限。')
    this.skip(); const byte = this.bytes[this.offset]
    if (byte === 47) { this.name(); return { kind: 'name' } }
    if (byte === 40) {
      const start = this.offset++; let nesting = 1
      while (this.offset < this.bytes.length && nesting) {
        const current = this.bytes[this.offset++]!
        if (current === 92) { if (this.offset >= this.bytes.length) pdfFail('字符串转义被截断。'); this.offset++ }
        else if (current === 40) nesting++
        else if (current === 41) nesting--
        if (nesting > PDF_MAX_DEPTH || this.offset - start > 65536) pdfFail('字符串超过安全上限。')
      }
      if (nesting) pdfFail('字符串未结束。')
      return { kind: 'string' }
    }
    if (byte === 60 && this.bytes[this.offset + 1] !== 60) {
      const start = this.offset++
      while (this.offset < this.bytes.length && this.bytes[this.offset] !== 62) {
        const current = this.bytes[this.offset++]!
        if (!pdfWhite(current) && !/[0-9a-f]/i.test(String.fromCharCode(current))) pdfFail('十六进制字符串无效。')
        if (this.offset - start > 65536) pdfFail('十六进制字符串超过安全上限。')
      }
      if (this.bytes[this.offset++] !== 62) pdfFail('十六进制字符串未结束。')
      return { kind: 'string' }
    }
    if (byte === 91) {
      this.offset++; this.skip()
      while (this.bytes[this.offset] !== 93) { this.object(depth + 1); this.skip() }
      this.offset++; return { kind: 'array' }
    }
    if (byte === 60 && this.bytes[this.offset + 1] === 60) {
      this.offset += 2; const keys = new Set<string>(), result: RawValue = { kind: 'dict' }
      while (!this.keyword('>>', false)) {
        const key = this.name(); if (keys.has(key)) pdfFail('字典键重复。'); keys.add(key)
        const value = this.object(depth + 1)
        if (key === 'Length' && value.kind === 'number') result.length = value.number
        if (key === 'Root' && value.kind === 'ref') result.root = value.ref
        if (key === 'Size' && value.kind === 'number') result.size = value.number
      }
      this.expect('>>'); return result
    }
    if (byte !== undefined && /[0-9.+-]/.test(String.fromCharCode(byte))) {
      const first = this.number(), afterFirst = this.offset; this.skip()
      if (this.bytes[this.offset] !== undefined && /[0-9]/.test(String.fromCharCode(this.bytes[this.offset]!))) {
        const second = this.number()
        if (this.keyword('R')) {
          if (!Number.isInteger(first) || first < 1 || !Number.isInteger(second) || second < 0 || second > 65535) pdfFail('间接引用无效。')
          const ref = `${first} ${second} R`; this.refs.add(ref); return { kind: 'ref', ref }
        }
      }
      this.offset = afterFirst; return { kind: 'number', number: first }
    }
    for (const word of ['true', 'false', 'null']) if (this.keyword(word)) return { kind: word }
    return pdfFail('对象语法不支持或被截断。')
  }
}
