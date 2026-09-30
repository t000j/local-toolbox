import { parseImageHeader } from './imageHeaders'
import type { ImageHeader } from './imageHeaders'
import { stripJpeg } from './imageStripJpeg'
import { stripPng } from './imageStripPng'
export interface ImageMetadataStripResult {
  bytes: Uint8Array
  format: 'png' | 'jpeg'
  /** Number of metadata segments/chunks removed or rewritten; not a count of EXIF tags. */
  removed: number
  retained: string[]
  before: ImageHeader
  after: ImageHeader
}
export const IMAGE_STRIP_LIMITATIONS = '仅移除支持范围内的元数据块，不重新编码像素。保留显示方向、色彩与透明度所需信息；ICC 配置本身仍可能包含身份信息。可见画面、像素内隐藏信息和文件名不受清理，不保证匿名或彻底去标识。'
export function stripImageMetadata(bytes: Uint8Array): ImageMetadataStripResult {
  const before = parseImageHeader(bytes)
  if (before.animated) throw new Error('不支持动画 PNG 元数据清理；不会自动丢弃动画帧。')
  const colorLabel = before.fields.find(field => field.name === 'EXIF 色彩空间')?.value
  const colorSpace = colorLabel === undefined ? undefined : colorLabel === 'sRGB' ? 1 : colorLabel === '未校准（65535）' ? 65535 : Number(colorLabel.match(/代码 (\d+)$/)?.[1])
  if (colorSpace !== undefined && (!Number.isInteger(colorSpace) || colorSpace < 0 || colorSpace > 65535)) throw new Error('无法安全保留 EXIF 色彩空间。')
  if (colorSpace !== undefined && colorSpace !== 1 && !before.fields.some(field => field.name === 'ICC 配置')) {
    throw new Error('EXIF 指定了无法独立保留的色彩空间；缺少 ICC 配置，暂不清理此图片。')
  }
  const result = before.format === 'png' ? stripPng(bytes, before.orientation, colorSpace) : stripJpeg(bytes, before.orientation, colorSpace)
  const after = parseImageHeader(result.bytes)
  if (colorLabel !== after.fields.find(field => field.name === 'EXIF 色彩空间')?.value) throw new Error('安全校验失败：EXIF 色彩空间发生变化。')
  if (before.format !== after.format || before.width !== after.width || before.height !== after.height || before.orientation !== after.orientation || after.animated) {
    throw new Error('安全校验失败：清理前后图像格式、尺寸或方向不一致。')
  }
  return { ...result, format: before.format, before, after }
}
