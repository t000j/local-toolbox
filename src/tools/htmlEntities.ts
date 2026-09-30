const namedEntities: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', copy: '©', reg: '®', trade: '™',
  euro: '€', pound: '£', yen: '¥', cent: '¢', hellip: '…', mdash: '—', ndash: '–',
  laquo: '«', raquo: '»', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', bull: '•', middot: '·',
}
export const supportedEntities = Object.keys(namedEntities).map(name => `&${name};`).join(' ')
const encodedCharacters: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export function convertHtmlEntities(value: string, encode: boolean, numeric = false): string {
  if (value.length > 100_000) throw new Error('输入最多 100,000 个 UTF-16 单元。')
  for (const character of value) {
    const code = character.codePointAt(0)!
    if (code >= 0xd800 && code <= 0xdfff) throw new Error('输入包含孤立的 Unicode 代理字符。')
  }
  if (encode) return Array.from(value, character => encodedCharacters[character]
    ?? (numeric && character.codePointAt(0)! > 127 ? `&#x${character.codePointAt(0)!.toString(16).toUpperCase()};` : character)).join('')
  return value.replace(/&(#(?:[xX][0-9a-fA-F]+|[0-9]+)|[a-zA-Z][a-zA-Z0-9]*);/g, (entity, name: string) => {
    if (!name.startsWith('#')) return Object.hasOwn(namedEntities, name) ? namedEntities[name] : entity
    const hex = name[1].toLowerCase() === 'x'
    const code = Number.parseInt(name.slice(hex ? 2 : 1), hex ? 16 : 10)
    if (!Number.isSafeInteger(code) || code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
      throw new Error('数字实体必须为有效 Unicode 标量值，不能是零、代理字符或超出 U+10FFFF。')
    }
    return String.fromCodePoint(code)
  })
}
