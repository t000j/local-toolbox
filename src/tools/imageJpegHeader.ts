// Bounds-check every segment and scan, including progressive scans, stuffing and restart markers.
import { STRUCTURE_LIMIT, range, invalid, dimensions, be16, matches } from './imageHeaderShared'
import type { ImageHeader, ImageMetadataField } from './imageHeaderShared'
import { parseExif } from './imageExif'

export function parseJpeg(bytes: Uint8Array): ImageHeader {
  let offset = 2, markers = 0, width = 0, height = 0, orientation = 1, frame = 0, scans = 0
  let inScan = false, scanHasData = false, sawExif = false, sawIcc = false, sawAdobe = false
  const components = new Set<number>()
  const fields: ImageMetadataField[] = []
  while (offset < bytes.length) {
    if (inScan) {
      // Entropy data is traversed without allocation. Stuffed FF00 and restart markers stay in the scan.
      while (offset < bytes.length) {
        if (bytes[offset] !== 0xff) { offset++; scanHasData = true; continue }
        range(bytes, offset, 2, 'JPEG 扫描标记')
        if (bytes[offset + 1] === 0) { offset += 2; scanHasData = true; continue }
        let next = offset + 1
        while (next < bytes.length && bytes[next] === 0xff) next++
        range(bytes, next, 1, 'JPEG 扫描标记')
        const marker = bytes[next]!
        if (marker >= 0xd0 && marker <= 0xd7 || marker === 0x01) {
          if (++markers > STRUCTURE_LIMIT) invalid('JPEG 标记数量超过安全上限。')
          offset = next + 1; continue
        }
        if (marker === 0) invalid('JPEG 填充字节后存在非法填充标记。')
        if (!scanHasData) invalid('JPEG 扫描数据为空。')
        inScan = false
        break
      }
      if (inScan) invalid('JPEG 扫描被截断，缺少 EOI。')
    }
    if (++markers > STRUCTURE_LIMIT) invalid('JPEG 标记数量超过安全上限。')
    if (bytes[offset] !== 0xff) invalid('JPEG 标记前缀错误。')
    while (offset < bytes.length && bytes[offset] === 0xff) offset++
    range(bytes, offset, 1, 'JPEG 标记')
    const marker = bytes[offset++]!
    if (marker === 0xd9) {
      if (!width || !scans || offset !== bytes.length) invalid('JPEG 缺少图像／扫描数据或存在尾随数据。')
      return { format: 'jpeg', width, height, orientation, animated: false, fields }
    }
    if (marker === 0 || marker === 0xd8 || marker >= 0xd0 && marker <= 0xd7) invalid('JPEG 出现非法独立标记。')
    if (marker === 0x01) continue // TEM has no length field.
    range(bytes, offset, 2, 'JPEG 段长度')
    const length = be16(bytes, offset)
    if (length < 2) invalid('JPEG 段长度小于 2。')
    range(bytes, offset, length, 'JPEG 段')
    const data = offset + 2, payloadLength = length - 2, end = offset + length
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      if (![0xc0, 0xc1, 0xc2].includes(marker)) invalid('仅支持 8 位顺序／渐进 JPEG，不支持无损、算术或层级 JPEG。')
      if (frame || payloadLength < 6 || bytes[data] !== 8) invalid('JPEG 帧重复、被截断或不是 8 位精度。')
      const count = bytes[data + 5]!
      if (count < 1 || count > 4 || payloadLength !== 6 + 3 * count) invalid('JPEG 颜色分量数量或帧长度无效。')
      height = be16(bytes, data + 1); width = be16(bytes, data + 3); dimensions(width, height)
      for (let i = 0; i < count; i++) {
        const p = data + 6 + i * 3, id = bytes[p]!, sampling = bytes[p + 1]!
        if (components.has(id) || sampling >> 4 < 1 || sampling >> 4 > 4 || (sampling & 15) < 1 || (sampling & 15) > 4 || bytes[p + 2]! > 3) invalid('JPEG 帧分量参数无效。')
        components.add(id)
      }
      frame = marker
      fields.push({ name: 'JPEG 编码', value: marker === 0xc2 ? '8 位渐进式' : '8 位顺序式' }, { name: '颜色分量', value: String(count) })
    } else if (marker === 0xda) {
      if (!frame || payloadLength < 4) invalid('JPEG SOS 缺少帧头或已截断。')
      const count = bytes[data]!
      if (count < 1 || count > components.size || payloadLength !== 4 + 2 * count) invalid('JPEG SOS 长度或分量数量无效。')
      const selected = new Set<number>()
      for (let i = 0; i < count; i++) {
        const id = bytes[data + 1 + 2 * i]!, table = bytes[data + 2 + 2 * i]!
        if (!components.has(id) || selected.has(id) || table >> 4 > 3 || (table & 15) > 3) invalid('JPEG SOS 分量或编码表无效。')
        selected.add(id)
      }
      const start = bytes[end - 3]!, finish = bytes[end - 2]!, approximation = bytes[end - 1]!
      if (start > finish || finish > 63 || approximation >> 4 > 13 || (approximation & 15) > 13 || (frame !== 0xc2 && (start !== 0 || finish !== 63 || approximation !== 0)) || (frame === 0xc2 && (start === 0 ? finish !== 0 : count !== 1))) invalid('JPEG 扫描谱选择或逐次逼近参数无效。')
      scans++; inScan = true; scanHasData = false
    } else if (marker === 0xe1 && matches(bytes, data, [69, 120, 105, 102, 0, 0])) {
      if (payloadLength < 6 || sawExif) invalid('JPEG EXIF 段重复或已截断。')
      const exif = parseExif(bytes.subarray(data + 6, end))
      orientation = exif.orientation; fields.push(...exif.fields); sawExif = true
    } else if (marker === 0xe2 && matches(bytes, data, [73, 67, 67, 95, 80, 82, 79, 70, 73, 76, 69, 0])) {
      if (payloadLength < 14 || !bytes[data + 12] || !bytes[data + 13] || bytes[data + 12]! > bytes[data + 13]!) invalid('JPEG ICC 配置分段无效。')
      if (!sawIcc) fields.push({ name: 'ICC 配置', value: '存在；配置分段内容未组合或解释' })
      sawIcc = true
    } else if (marker === 0xee && matches(bytes, data, [65, 100, 111, 98, 101])) {
      if (payloadLength !== 12 || sawAdobe || bytes[data + 11]! > 2) invalid('JPEG Adobe 色彩标记无效。')
      sawAdobe = true
      fields.push({ name: 'Adobe 色彩变换', value: ['无变换（RGB 或 CMYK）', 'YCbCr', 'YCCK'][bytes[data + 11]!]! })
    } else if (marker === 0xdb) {
      let p = data
      if (!payloadLength) invalid('JPEG 量化表为空。')
      while (p < end) {
        const info = bytes[p++]!
        if (info >> 4 > 1 || (info & 15) > 3) invalid('JPEG 量化表参数无效。')
        p += (info >> 4 ? 128 : 64)
        if (p > end) invalid('JPEG 量化表被截断。')
      }
    } else if (marker === 0xc4) {
      let p = data
      if (!payloadLength) invalid('JPEG Huffman 表为空。')
      while (p < end) {
        if (end - p < 17) invalid('JPEG Huffman 表头被截断。')
        const info = bytes[p++]!
        if (info >> 4 > 1 || (info & 15) > 3) invalid('JPEG Huffman 表参数无效。')
        let count = 0
        for (let i = 0; i < 16; i++) count += bytes[p++]!
        if (!count || count > 256 || count > end - p) invalid('JPEG Huffman 表符号数量无效。')
        p += count
      }
    } else if (marker === 0xdd) {
      if (payloadLength !== 2) invalid('JPEG 重启间隔段长度无效。')
    } else if (!(marker >= 0xe0 && marker <= 0xef) && marker !== 0xfe) {
      invalid(`不支持的 JPEG 标记 0x${marker.toString(16)}。`)
    }
    offset = end
  }
  return invalid('JPEG 缺少 EOI 结束标记。')
}

