/** Bounded, synchronous header inspection. This is not a pixel decoder or a full EXIF reader. */
export const IMAGE_INPUT_LIMIT = 16 * 1024 * 1024
export const IMAGE_EDGE_LIMIT = 8192
export const IMAGE_PIXEL_LIMIT = 16_000_000
export const METADATA_LIMIT = 1024 * 1024
export const STRUCTURE_LIMIT = 32768
export const IFD_ENTRY_LIMIT = 256
export interface ImageMetadataField { name: string; value: string }
export interface ImageHeader {
  format: 'png' | 'jpeg'
  /** Stored dimensions, before EXIF orientation. Orientations 5–8 exchange the axes. */
  width: number
  height: number
  orientation: number
  animated: boolean
  fields: ImageMetadataField[]
}
export const IMAGE_METADATA_LIMITATIONS = '仅读取基础图像头与部分 EXIF（方向、相机、时间、曝光、光圈、焦距、ISO、GPS）；不支持完整 EXIF、MakerNote、缩略图、XMP、ICC 或 PNG 文本。未显示不代表不存在；不解码像素、不验证压缩数据，也不证明隐私信息已清除。'

export function invalid(message: string): never { throw new Error(`图片格式无效：${message}`) }
export function range(bytes: Uint8Array, offset: number, size: number, label: string): void {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size) || offset < 0 || size < 0 || offset > bytes.length - size) invalid(`${label}越界或被截断。`)
}
export function dimensions(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) invalid('宽高必须为正整数。')
  if (width > IMAGE_EDGE_LIMIT || height > IMAGE_EDGE_LIMIT || width * height > IMAGE_PIXEL_LIMIT) {
    throw new Error('图片超过安全限制：单边最多 8192 像素，总像素最多 16,000,000。')
  }
}
export const be16 = (b: Uint8Array, o: number): number => b[o]! * 256 + b[o + 1]!
export const be32 = (b: Uint8Array, o: number): number => b[o]! * 0x1000000 + b[o + 1]! * 0x10000 + b[o + 2]! * 256 + b[o + 3]!
export function matches(bytes: Uint8Array, offset: number, values: number[]): boolean {
  return offset + values.length <= bytes.length && values.every((value, index) => bytes[offset + index] === value)
}
export function ascii(bytes: Uint8Array, offset: number, count: number): string {
  // Only bounded, printable ASCII is exposed. Control bytes and angle brackets stay visibly escaped.
  const parts: string[] = []
  const end = offset + Math.min(count, 160)
  for (let i = offset; i < end; i++) {
    const byte = bytes[i]!
    if (byte === 0) break
    parts.push(byte >= 32 && byte <= 126 && byte !== 60 && byte !== 62 ? String.fromCharCode(byte) : `\\x${byte.toString(16).toUpperCase().padStart(2, '0')}`)
  }
  const value = parts.join('')
  return value.slice(0, 256) + (count > 160 || value.length > 256 ? '…（已截断）' : '')
}

