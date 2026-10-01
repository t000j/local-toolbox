export const MAX_JWT_INPUT = 100_000
export interface JwtContent { header: string; payload: string }

function decodeSegment(value: string, name: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(value) || value.length % 4 === 1) {
    throw new Error(`${name} 必须使用无填充的 Base64URL；不允许空白、+、/ 或 =。`)
  }
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'))
  const canonical = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  if (canonical !== value) throw new Error(`${name} 的 Base64URL 填充位不规范。`)
  return Uint8Array.from(binary, character => character.charCodeAt(0))
}

function decodeObject(value: string, name: string): { text: string; object: Record<string, unknown> } {
  const bytes = decodeSegment(value, name)
  let text: string
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes) }
  catch { throw new Error(`${name} 不是有效的 UTF-8 文本。`) }
  let object: unknown
  try { object = JSON.parse(text) }
  catch { throw new Error(`${name} 不是有效的 JSON。`) }
  if (object === null || typeof object !== 'object' || Array.isArray(object)) {
    throw new Error(`${name} 必须是 JSON 对象。`)
  }
  return { text, object: object as Record<string, unknown> }
}

export function decodeJwt(input: string): JwtContent {
  if (input.length > MAX_JWT_INPUT) throw new Error('输入最多 100,000 个字符。')
  if (!input) throw new Error('请输入 JWT。')
  const parts = input.split('.')
  if (parts.length === 5) throw new Error('不支持五段式 JWE 加密令牌；此工具不会解密。')
  if (parts.length !== 3 || !parts[0] || !parts[1]) {
    throw new Error('请输入三段式紧凑令牌：header.payload.signature，前两段不能为空。')
  }
  const header = decodeObject(parts[0], 'Header')
  if (header.object.b64 === false) throw new Error('不支持 b64=false 的未编码载荷。')
  const payload = decodeObject(parts[1], 'Payload')
  decodeSegment(parts[2]!, '第三段')
  // Preserve the original JSON text: reserializing can round numbers or drop duplicate keys.
  return { header: header.text, payload: payload.text }
}
