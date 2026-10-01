export const MAX_BASE64_BYTES = 4 * 1024 * 1024
export const MAX_BASE64_INPUT = 6 * 1024 * 1024
export type Base64Request = { mode: 'encode'; value: string | Uint8Array } | { mode: 'decode'; value: string; file: boolean }
export type Base64Result = { text: string; bytes: null } | { text: null; bytes: Uint8Array }

export function encodeBytes(bytes: Uint8Array): string {
  if (bytes.byteLength > MAX_BASE64_BYTES) throw new Error('原始内容最多 4 MiB。')
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary)
}
export function decodeBytes(input: string): Uint8Array {
  if (input.length > MAX_BASE64_INPUT) throw new Error('Base64 输入最多 6 MiB 字符。')
  const value = input.replace(/[\t\n\r ]/g, '')
  const unpadded = value.replace(/=+$/, '')
  const padding = value.length - unpadded.length
  if (/[^A-Za-z0-9+/]/.test(unpadded) || unpadded.length % 4 === 1 || padding > 2
    || (padding > 0 && (value.length % 4 !== 0 || padding !== (4 - unpadded.length % 4) % 4))) {
    throw new Error('请输入标准 Base64；不支持 data URL 或 URL-safe 字母表。')
  }
  if (Math.floor(value.replace(/=+$/, '').length * 3 / 4) > MAX_BASE64_BYTES) throw new Error('解码后内容最多 4 MiB。')
  const binary = atob(value)
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
  if (encodeBytes(bytes).replace(/=+$/, '') !== value.replace(/=+$/, '')) throw new Error('Base64 填充位不合法。')
  return bytes
}
export function convertBase64(request: Base64Request): Base64Result {
  if (request.mode === 'encode') {
    if (typeof request.value === 'string' && request.value.length > MAX_BASE64_BYTES) throw new Error('原始文本最多 4 MiB。')
    const bytes = typeof request.value === 'string' ? new TextEncoder().encode(request.value) : request.value
    return { text: encodeBytes(bytes), bytes: null }
  }
  const bytes = decodeBytes(request.value)
  if (request.file) return { text: null, bytes }
  try { return { text: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes), bytes: null } }
  catch { throw new Error('解码内容不是有效的 UTF-8 文本，请切换到文件模式保存二进制内容。') }
}
