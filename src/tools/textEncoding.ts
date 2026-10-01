export const MAX_ENCODING_INPUT = 4 * 1024 * 1024
export const MAX_ENCODING_OUTPUT = 16 * 1024 * 1024
export const TEXT_ENCODINGS = ['utf-8', 'utf-16le', 'utf-16be', 'ascii', 'latin1'] as const
export type TextEncoding = typeof TEXT_ENCODINGS[number]
export type SourceBom = 'strip' | 'keep' | 'require'
export type TargetBom = 'none' | 'add'
export type EncodingRequest = { file: Blob; source: TextEncoding; target: TextEncoding; sourceBom: SourceBom; targetBom: TargetBom }
export type EncodingResult = { bytes: Uint8Array; preview: string; characters: number; inputBytes: number; outputBytes: number;
  source: TextEncoding; target: TextEncoding; detectedBom: string; outputBom: string; previewTruncated: boolean }
const signatures: Partial<Record<TextEncoding, number[]>> = { 'utf-8': [0xef, 0xbb, 0xbf], 'utf-16le': [0xff, 0xfe], 'utf-16be': [0xfe, 0xff] }
const startsWith = (bytes: Uint8Array, prefix: number[]) => prefix.every((byte, index) => bytes[index] === byte)
function validateEncoding(value: TextEncoding) {
  if (!TEXT_ENCODINGS.includes(value)) throw new Error('不支持此文本编码。')
}
export function decodeText(bytes: Uint8Array, encoding: TextEncoding, bom: SourceBom): { text: string; detected: string } {
  validateEncoding(encoding)
  if (!['strip', 'keep', 'require'].includes(bom)) throw new Error('无效的源 BOM 选项。')
  if (bytes.length > MAX_ENCODING_INPUT) throw new Error('源文件最多 4 MiB。')
  const unicode = Object.hasOwn(signatures, encoding)
  const detected = Object.entries(signatures).find(([, signature]) => startsWith(bytes, signature!))?.[0] ?? ''
  let offset = 0
  if (unicode) {
    if (detected && detected !== encoding) throw new Error(`BOM 指示 ${detected}，与所选源编码不同。`)
    if (bom === 'require' && !detected) throw new Error('源文件没有所选 Unicode 编码的 BOM。')
    if (detected && bom !== 'keep') offset = signatures[encoding]!.length
  } else if (bom !== 'keep') throw new Error('ASCII / Latin-1 不定义 BOM，请选择「保留为正文」。')
  const payload = bytes.subarray(offset)
  if (encoding === 'ascii' || encoding === 'latin1') {
    if (encoding === 'ascii' && payload.some(byte => byte > 127)) throw new Error('文件含非 ASCII 字节；不能按 ASCII 无损读取。')
    let text = ''
    for (let p = 0; p < payload.length; p += 32768) text += String.fromCharCode(...payload.subarray(p, p + 32768))
    return { text, detected: detected ? `${detected} 字节前缀（按普通字节保留）` : '无' }
  }
  try {
    // BOM is handled explicitly above. Fatal decoding rejects malformed bytes,
    // rather than injecting U+FFFD or discarding a second leading U+FEFF.
    return { text: new TextDecoder(encoding, { fatal: true, ignoreBOM: true }).decode(payload), detected: detected || '无' }
  } catch { throw new Error('源文件含无效编码序列、奇数字节或孤立代理项；已拒绝有损解码。') }
}
export function encodeText(text: string, encoding: TextEncoding, bom: TargetBom): Uint8Array {
  validateEncoding(encoding)
  if (!['none', 'add'].includes(bom)) throw new Error('无效的目标 BOM 选项。')
  if (text.length > MAX_ENCODING_INPUT) throw new Error('正文超过转换预算。')
  for (const character of text) {
    const point = character.codePointAt(0)!
    if (point >= 0xd800 && point <= 0xdfff) throw new Error('正文含孤立代理项，不能无损编码。')
    if ((encoding === 'ascii' && point > 127) || (encoding === 'latin1' && point > 255)) {
      throw new Error(`目标编码无法表示 U+${point.toString(16).toUpperCase()}；未用问号替换，未生成有损结果。`)
    }
  }
  if (bom === 'add' && !signatures[encoding]) throw new Error('ASCII / Latin-1 不支持 BOM。')
  if (bom === 'add' && text.startsWith('\ufeff')) throw new Error('正文已含前导 U+FEFF；请移除源 BOM 或选择目标不另加 BOM，避免重复。')
  let payload: Uint8Array
  if (encoding === 'utf-8') payload = new TextEncoder().encode(text)
  else if (encoding === 'utf-16le' || encoding === 'utf-16be') {
    payload = new Uint8Array(text.length * 2)
    const view = new DataView(payload.buffer)
    for (let i = 0; i < text.length; i++) view.setUint16(i * 2, text.charCodeAt(i), encoding === 'utf-16le')
  } else {
    payload = new Uint8Array(text.length)
    for (let i = 0; i < text.length; i++) payload[i] = text.charCodeAt(i)
  }
  const prefix = bom === 'add' ? signatures[encoding]! : []
  if (payload.length + prefix.length > MAX_ENCODING_OUTPUT) throw new Error('转换结果最多 16 MiB。')
  const output = new Uint8Array(payload.length + prefix.length)
  output.set(prefix); output.set(payload, prefix.length)
  return output
}
export async function convertEncoding(request: EncodingRequest): Promise<EncodingResult> {
  if (!(request.file instanceof Blob) || request.file.size > MAX_ENCODING_INPUT) throw new Error('请选择不超过 4 MiB 的本地文件。')
  const input = new Uint8Array(await request.file.arrayBuffer())
  const { text, detected } = decodeText(input, request.source, request.sourceBom)
  const bytes = encodeText(text, request.target, request.targetBom)
  // Independently decode the result and require exact code-unit equality.
  const offset = request.targetBom === 'add' ? signatures[request.target]!.length : 0
  let roundTrip: string
  if (request.target === 'ascii' || request.target === 'latin1') {
    roundTrip = ''; for (let p = 0; p < bytes.length; p += 32768) roundTrip += String.fromCharCode(...bytes.subarray(p, p + 32768))
  } else roundTrip = new TextDecoder(request.target, { fatal: true, ignoreBOM: true }).decode(bytes.subarray(offset))
  if (roundTrip !== text) throw new Error('往返验证失败；未提供转换结果。')
  let characters = 0
  for (const _character of text) characters++
  // Avoid splitting a supplementary character at the preview boundary.
  let cut = Math.min(50_000, text.length)
  if (cut < text.length && text.charCodeAt(cut - 1) >= 0xd800 && text.charCodeAt(cut - 1) <= 0xdbff) cut--
  return { bytes, preview: text.slice(0, cut), characters, inputBytes: input.length, outputBytes: bytes.length,
    source: request.source, target: request.target, detectedBom: detected,
    outputBom: request.targetBom === 'add' ? request.target : text.startsWith('\ufeff') ? '正文含前导 U+FEFF（已保留）' : '无',
    previewTruncated: cut < text.length }
}
