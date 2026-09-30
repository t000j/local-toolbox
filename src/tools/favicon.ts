import { parseImageHeader } from './imageHeaders'
export const FAVICON_PNG_SIZES = [16, 32, 48, 64, 128, 180, 192, 256, 512] as const
export const FAVICON_ICO_SIZES = [16, 32, 48, 64, 128, 256] as const
export interface IconFrame { size: number; bytes: Uint8Array }
export function iconGeometry(width: number, height: number, size: number, fit: 'contain' | 'cover') {
  if (![width, height].every(n => Number.isInteger(n) && n > 0 && n <= 8192) || width * height > 16_000_000 || !FAVICON_PNG_SIZES.includes(size as typeof FAVICON_PNG_SIZES[number])) throw new Error('图像或图标尺寸不受支持。')
  if (fit === 'cover') {
    const edge = Math.min(width, height)
    return { sx: (width - edge) / 2, sy: (height - edge) / 2, sw: edge, sh: edge, dx: 0, dy: 0, dw: size, dh: size }
  }
  if (fit !== 'contain') throw new Error('未知图标适配方式。')
  const scale = Math.min(size / width, size / height), dw = width * scale, dh = height * scale
  return { sx: 0, sy: 0, sw: width, sh: height, dx: (size - dw) / 2, dy: (size - dh) / 2, dw, dh }
}
export function validateIconFrame(frame: IconFrame) {
  const header = parseImageHeader(frame.bytes)
  if (header.format !== 'png' || header.animated || header.width !== frame.size || header.height !== frame.size || header.orientation !== 1) throw new Error('图层必须是相应尺寸、无方向变换的静态 PNG。')
}
export function packIco(frames: IconFrame[]): Uint8Array {
  if (!frames.length || frames.length > 6) throw new Error('ICO 需要 1–6 个 PNG 图层。')
  const seen = new Set<number>(); let total = 6 + frames.length * 16
  for (const frame of frames) {
    if (!FAVICON_ICO_SIZES.includes(frame.size as typeof FAVICON_ICO_SIZES[number]) || seen.has(frame.size)) throw new Error('ICO 图层尺寸不受支持或重复。')
    seen.add(frame.size)
    validateIconFrame(frame)
    total += frame.bytes.length
  }
  if (total > 2 * 1024 * 1024) throw new Error('ICO 输出最多 2 MiB。')
  const bytes = new Uint8Array(total), view = new DataView(bytes.buffer)
  view.setUint16(2, 1, true); view.setUint16(4, frames.length, true)
  let offset = 6 + frames.length * 16
  frames.forEach((frame, index) => {
    const entry = 6 + index * 16
    bytes[entry] = frame.size === 256 ? 0 : frame.size; bytes[entry + 1] = bytes[entry]
    view.setUint16(entry + 4, 1, true); view.setUint16(entry + 6, 32, true)
    view.setUint32(entry + 8, frame.bytes.length, true); view.setUint32(entry + 12, offset, true)
    bytes.set(frame.bytes, offset); offset += frame.bytes.length
  })
  return bytes
}
export interface FaviconRequest { file: File; format: 'png' | 'ico'; size: number; fit: 'contain' | 'cover' }
export interface FaviconResult { bytes: Uint8Array; preview: Uint8Array; sizes: number[]; format: 'png' | 'ico'; width: number; height: number }
