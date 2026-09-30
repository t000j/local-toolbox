import { IMAGE_INPUT_LIMIT, IMAGE_METADATA_LIMITATIONS, matches } from './imageHeaderShared'
import type { ImageHeader } from './imageHeaderShared'
import { parsePng } from './imagePngHeader'
import { parseJpeg } from './imageJpegHeader'
export { IMAGE_INPUT_LIMIT, IMAGE_EDGE_LIMIT, IMAGE_PIXEL_LIMIT, IMAGE_METADATA_LIMITATIONS } from './imageHeaderShared'
export type { ImageHeader, ImageMetadataField } from './imageHeaderShared'

export function parseImageHeader(bytes: Uint8Array): ImageHeader {
  if (!(bytes instanceof Uint8Array)) throw new Error('图片输入必须为 Uint8Array。')
  if (bytes.byteLength > IMAGE_INPUT_LIMIT) throw new Error('图片文件最多 16 MiB。')
  let result: ImageHeader
  if (matches(bytes, 0, [137, 80, 78, 71, 13, 10, 26, 10])) result = parsePng(bytes)
  else if (matches(bytes, 0, [0xff, 0xd8])) result = parseJpeg(bytes)
  else throw new Error('仅支持签名有效的 PNG 和 JPEG 图片。')
  result.fields.unshift({ name: '格式', value: result.format.toUpperCase() }, { name: '存储尺寸', value: `${result.width} × ${result.height} px` }, { name: '文件大小', value: `${bytes.byteLength} bytes` })
  if (!result.fields.some(field => field.name === 'EXIF 方向')) result.fields.push({ name: 'EXIF 方向', value: '未记录；默认 1' })
  result.fields.push({ name: '元数据限制', value: IMAGE_METADATA_LIMITATIONS })
  return result
}
