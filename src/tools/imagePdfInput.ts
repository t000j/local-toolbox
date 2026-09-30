import { parseImageHeader } from './imageHeaders'
import { be32 } from './imageHeaderShared'
import { boundedInflatePdf } from './pdfBoundedInflate'
export interface PreparedPdfImage { name: string; bytes: Uint8Array; width: number; height: number; format: 'png' | 'jpeg' }
export function validatePreparedPdfImage(image: PreparedPdfImage): void {
  if (!image || typeof image.name !== 'string' || !image.name || image.name.length > 255 || !(image.bytes instanceof Uint8Array) || !image.bytes.length || image.bytes.length > 16 * 1024 * 1024 || !['png','jpeg'].includes(image.format)) throw new Error('图片名称/格式/大小无效。')
  const header = parseImageHeader(image.bytes)
  if (header.format !== image.format || header.width !== image.width || header.height !== image.height || header.orientation !== 1 || header.animated || image.width > 4096 || image.height > 4096 || image.width * image.height > 4_000_000) throw new Error('规范化图片的尺寸/方向/帧数不符合要求。')
  if (image.format === 'jpeg') {
    if (!header.fields.some(f => f.name === '颜色分量' && f.value === '3') || header.fields.some(f => f.name === 'ICC 配置')) throw new Error('规范化JPEG必须是无ICC三通道图像。')
    return
  }
  // pdf-lib's PNG decoder inflates the full IDAT; prove its decompressed byte bound first.
  const bytes = image.bytes, depth = bytes[24], color = bytes[25], interlace = bytes[28]
  if (depth !== 8 || ![2,6].includes(color!) || interlace !== 0) throw new Error('规范化PNG仅允许8位RGB/RGBA、无交错。')
  const parts: Uint8Array[] = []; let total = 0
  for (let offset = 8; offset < bytes.length;) {
    const length = be32(bytes, offset), type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8))
    if (!['IHDR','IDAT','IEND','sRGB','gAMA','cHRM','pHYs'].includes(type)) throw new Error('规范化PNG含未支持的额外块。')
    if (type === 'IDAT') { const part = bytes.subarray(offset + 8, offset + 8 + length); total += part.length; parts.push(part) }
    offset += length + 12
  }
  const data = new Uint8Array(total); let offset = 0
  for (const part of parts) { data.set(part, offset); offset += part.length }
  const stride = image.width * (color === 6 ? 4 : 3) + 1, raw = boundedInflatePdf(data, stride * image.height)
  if (raw.length !== stride * image.height) throw new Error('PNG解压长度与尺寸不一致。')
  for (let row = 0; row < image.height; row++) if (raw[row * stride]! > 4) throw new Error('PNG行滤镜无效。')
}
