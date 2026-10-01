import { IMAGE_INPUT_LIMIT } from './imageHeaders'
export interface StripParts { bytes: Uint8Array; removed: number; retained: string[] }
export const ICC_RETENTION_WARNING = '保留 ICC 色彩配置；其内容可能包含作者、设备等身份信息，未检查或清理配置内部数据'
export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, index) => byte === b[index])
}
export function joinBytes(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0)
  if (length > IMAGE_INPUT_LIMIT) throw new Error('清理结果超过 16 MiB 限制。')
  const output = new Uint8Array(length)
  let offset = 0
  for (const part of parts) { output.set(part, offset); offset += part.length }
  return output
}
export function minimalExifTiff(orientation: number, colorSpace?: number): Uint8Array {
  // Only display-relevant SHORT values; no GPS, dates, names, previews or linked IFDs.
  const count = Number(orientation > 1) + Number(colorSpace !== undefined), exifOffset = 14 + count * 12
  const bytes = new Uint8Array(exifOffset + (colorSpace !== undefined ? 18 : 0)), view = new DataView(bytes.buffer)
  bytes.set([73,73,42,0,8,0,0,0]); view.setUint16(8, count, true)
  const entry = (offset: number, tag: number, type: number, value: number): void => {
    view.setUint16(offset, tag, true); view.setUint16(offset + 2, type, true); view.setUint32(offset + 4, 1, true)
    if (type === 3) view.setUint16(offset + 8, value, true)
    else view.setUint32(offset + 8, value, true)
  }
  let offset = 10
  if (orientation > 1) { entry(offset, 0x0112, 3, orientation); offset += 12 }
  if (colorSpace !== undefined) {
    entry(offset, 0x8769, 4, exifOffset); view.setUint16(exifOffset, 1, true); entry(exifOffset + 2, 0xa001, 3, colorSpace)
  }
  return bytes
}
export function pngChunk(type: string, payload: Uint8Array): Uint8Array {
  const output = new Uint8Array(payload.length + 12), view = new DataView(output.buffer)
  view.setUint32(0, payload.length)
  for (let index = 0; index < 4; index++) output[index + 4] = type.charCodeAt(index)
  output.set(payload, 8)
  let crc = 0xffffffff
  for (let index = 4; index < output.length - 4; index++) {
    crc ^= output[index]!
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
  }
  view.setUint32(output.length - 4, (crc ^ 0xffffffff) >>> 0)
  return output
}
export function jpegSegment(marker: number, payload: Uint8Array): Uint8Array {
  const output = new Uint8Array(payload.length + 4)
  output.set([255, marker, (payload.length + 2) >>> 8, (payload.length + 2) & 255]); output.set(payload, 4)
  return output
}
export function verifyIdentical(before: Uint8Array[], after: Uint8Array[]): void {
  if (before.length !== after.length || before.some((part, index) => !sameBytes(part, after[index]!))) {
    throw new Error('安全校验失败：压缩像素、关键结构或保留色彩数据发生变化。')
  }
}
