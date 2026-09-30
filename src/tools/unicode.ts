export type UnicodeFormat = 'utf16' | 'codepoint'
export const UNICODE_INPUT_LIMIT = 100_000
export const UNICODE_OUTPUT_LIMIT = 600_000
export interface UnicodeRow {
  index: number
  offset: number
  display: string
  codepoint: string
  utf16: string
  escaped: string
  loneSurrogate: boolean
}
function checkInput(value: string): void {
  if (value.length > UNICODE_INPUT_LIMIT) throw new Error('输入最多 100,000 个 UTF-16 码元。')
}
const hex = (value: number, width = 4): string => value.toString(16).toUpperCase().padStart(width, '0')
const unitEscape = (value: number): string => `\\u${hex(value)}`
function isSurrogate(value: number): boolean { return value >= 0xD800 && value <= 0xDFFF }

export function inspectUnicode(value: string): UnicodeRow[] {
  checkInput(value)
  const rows: UnicodeRow[] = []
  let offset = 0
  for (const character of value) {
    const point = character.codePointAt(0)!
    const units = Array.from({ length: character.length }, (_, index) => character.charCodeAt(index))
    const escaped = units.map(unitEscape).join('')
    const loneSurrogate = isSurrogate(point)
    // Keep control, format, separator and combining characters legible and bidi-safe in the table.
    const hidden = /[\p{C}\p{Z}\p{M}]/u.test(character)
    rows.push({ index: rows.length + 1, offset, display: loneSurrogate || hidden ? escaped : character,
      codepoint: `U+${hex(point)}`, utf16: units.map(unit => `0x${hex(unit)}`).join(' '), escaped, loneSurrogate })
    offset += character.length
  }
  return rows
}

export function encodeUnicode(value: string, format: UnicodeFormat = 'utf16'): string {
  checkInput(value)
  const parts: string[] = []
  let length = 0
  for (const character of value) {
    const point = character.codePointAt(0)!
    // Braced escapes represent scalar values only. Preserve lone surrogates with a fixed-width escape.
    const part = format === 'codepoint' && !isSurrogate(point) ? `\\u{${hex(point, 1)}}`
      : Array.from({ length: character.length }, (_, index) => unitEscape(character.charCodeAt(index))).join('')
    length += part.length
    if (length > UNICODE_OUTPUT_LIMIT) throw new Error('编码结果超过 600,000 字符，请缩短输入。')
    parts.push(part)
  }
  return parts.join('')
}

export function decodeUnicode(value: string): string {
  checkInput(value)
  const parts: string[] = []
  for (let index = 0; index < value.length;) {
    if (value[index] !== '\\') { parts.push(value[index++]!); continue }
    const offset = index
    const fail = (): never => { throw new Error(`第 ${offset + 1} 个 UTF-16 码元处转义无效；仅支持 \\uXXXX、\\u{H…} 和 \\\\。`) }
    index++
    if (value[index] === '\\') { parts.push('\\'); index++; continue }
    if (value[index++] !== 'u') fail()
    if (value[index] === '{') {
      const end = value.indexOf('}', index + 1)
      if (end < 0 || end - index > 7) fail()
      const digits = value.slice(index + 1, end)
      if (!/^[0-9a-fA-F]{1,6}$/.test(digits)) fail()
      const point = Number.parseInt(digits, 16)
      if (point > 0x10FFFF || isSurrogate(point)) {
        throw new Error(`第 ${offset + 1} 个码元处不是 Unicode 标量值；花括号形式不接受代理项或大于 U+10FFFF 的值。`)
      }
      parts.push(String.fromCodePoint(point)); index = end + 1
    } else {
      const digits = value.slice(index, index + 4)
      if (!/^[0-9a-fA-F]{4}$/.test(digits)) fail()
      parts.push(String.fromCharCode(Number.parseInt(digits, 16))); index += 4
    }
  }
  // Decoding never expands this input; lone fixed-width surrogates are intentionally preserved.
  return parts.join('')
}
