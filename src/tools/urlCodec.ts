export type UrlMode = 'component' | 'uri' | 'form'
export function convertUrl(value: string, encode: boolean, mode: UrlMode): string {
  if (value.length > 100_000) throw new Error('输入最多 100,000 个字符。')
  try {
    if (mode === 'uri') return encode ? encodeURI(value) : decodeURI(value)
    if (mode === 'component') return encode ? encodeURIComponent(value) : decodeURIComponent(value)
    if (!encode) return decodeURIComponent(value.replace(/\+/g, ' '))
    return encodeURIComponent(value).replace(/[!'()~]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
      .replace(/%20/g, '+')
  } catch {
    throw new Error(encode ? '输入包含无效的 Unicode 代理字符，请检查文本。' : '百分号转义或 UTF-8 字节无效，请检查输入。')
  }
}
