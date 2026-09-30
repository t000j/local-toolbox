// PNG chunk structure follows https://www.w3.org/TR/png-3/; compressed pixels remain decoder-owned.
import { STRUCTURE_LIMIT, range, invalid, dimensions, be32, ascii } from './imageHeaderShared'
import type { ImageHeader, ImageMetadataField } from './imageHeaderShared'
import { parseExif } from './imageExif'

const crcTable = new Uint32Array(256)
for (let i = 0; i < 256; i++) {
  let value = i
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  crcTable[i] = value >>> 0
}
function crc32(bytes: Uint8Array, offset: number, end: number): number {
  let crc = 0xffffffff
  for (let i = offset; i < end; i++) crc = crcTable[(crc ^ bytes[i]!) & 255]! ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
export function parsePng(bytes: Uint8Array): ImageHeader {
  let offset = 8, width = 0, height = 0, depth = 0, color = -1, chunks = 0, idatBytes = 0
  let sawIdat = false, idatEnded = false, sawPalette = false, paletteEntries = 0, sawExif = false, sawTransparency = false
  let animated = false, animationFrames = 0, frameControls = 0, sequence = 0, frameHasData = false, frameUsesIdat = false
  let orientation = 1, sawSrgb = false, sawIcc = false
  const fields: ImageMetadataField[] = []
  while (offset < bytes.length) {
    if (++chunks > STRUCTURE_LIMIT) invalid('PNG 块数量超过安全上限。')
    range(bytes, offset, 12, 'PNG 块头')
    const length = be32(bytes, offset), data = offset + 8
    range(bytes, data, length + 4, 'PNG 块')
    const type = String.fromCharCode(...bytes.subarray(offset + 4, data))
    if (!/^[A-Za-z]{2}[A-Z][A-Za-z]$/.test(type)) invalid('PNG 块类型无效。')
    if (crc32(bytes, offset + 4, data + length) !== be32(bytes, data + length)) invalid(`PNG ${type} CRC 校验失败。`)
    if (chunks === 1 && type !== 'IHDR') invalid('PNG 首块必须为 IHDR。')
    if (sawIdat && type !== 'IDAT') idatEnded = true
    switch (type) {
      case 'IHDR': {
        if (chunks !== 1 || length !== 13) invalid('PNG IHDR 必须唯一且为 13 字节。')
        width = be32(bytes, data); height = be32(bytes, data + 4); dimensions(width, height)
        depth = bytes[data + 8]!; color = bytes[data + 9]!
        const allowed: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] }
        if (!allowed[color]?.includes(depth) || bytes[data + 10] !== 0 || bytes[data + 11] !== 0 || bytes[data + 12]! > 1) invalid('PNG IHDR 编码参数不支持或无效。')
        fields.push({ name: '颜色模式', value: ({ 0: '灰度', 2: 'RGB', 3: '索引色', 4: '灰度 + Alpha', 6: 'RGBA' } as Record<number, string>)[color]! })
        fields.push({ name: '位深／颜色类型', value: `${depth} bit / ${color}` }, { name: 'PNG 隔行扫描', value: bytes[data + 12] === 1 ? 'Adam7' : '无' })
        break
      }
      case 'PLTE':
        if (sawPalette || sawIdat || !length || length > 768 || length % 3 || color === 0 || color === 4) invalid('PNG 调色板无效或顺序错误。')
        paletteEntries = length / 3
        if (color === 3 && paletteEntries > 2 ** depth) invalid('PNG 调色板超过位深容量。')
        sawPalette = true
        break
      case 'IDAT':
        if (idatEnded || (color === 3 && !sawPalette)) invalid('PNG IDAT 不连续或缺少调色板。')
        sawIdat = true; idatBytes += length
        if (frameUsesIdat && length > 0) frameHasData = true
        break
      case 'IEND':
        if (length || !sawIdat || !idatBytes || data + 4 !== bytes.length) invalid('PNG 缺少数据、结束块错误或存在尾随数据。')
        if (animated && (frameControls !== animationFrames || !frameHasData)) invalid('APNG 帧数量或帧数据无效。')
        return { format: 'png', width, height, orientation, animated, fields }
      case 'eXIf': {
        if (sawExif) invalid('PNG 包含重复 EXIF。')
        const exif = parseExif(bytes.subarray(data, data + length))
        orientation = exif.orientation; fields.push(...exif.fields); sawExif = true
        break
      }
      case 'sRGB':
        if (sawSrgb || sawPalette || sawIdat || length !== 1 || bytes[data]! > 3) invalid('PNG sRGB 块无效或顺序错误。')
        sawSrgb = true
        fields.push({ name: 'PNG 色彩空间', value: `sRGB；渲染意图 ${bytes[data]}` })
        break
      case 'iCCP': {
        if (sawIcc || sawPalette || sawIdat) invalid('PNG ICC 块重复或顺序错误。')
        let terminator = data
        while (terminator < data + Math.min(length, 80) && bytes[terminator] !== 0) terminator++
        if (terminator === data || terminator >= data + Math.min(length, 80) || terminator + 2 >= data + length || bytes[terminator + 1] !== 0) invalid('PNG ICC 配置名称或压缩参数无效。')
        sawIcc = true
        fields.push({ name: 'ICC 配置', value: `存在（${ascii(bytes, data, terminator - data)}）；压缩内容未解压或解释` })
        break
      }
      case 'tRNS':
        if (sawTransparency || sawIdat || !((color === 0 && length === 2) || (color === 2 && length === 6) || (color === 3 && sawPalette && length > 0 && length <= paletteEntries))) invalid('PNG 透明度块无效或顺序错误。')
        sawTransparency = true
        break
      case 'acTL':
        if (animated || sawIdat || length !== 8 || !be32(bytes, data)) invalid('APNG 动画控制块无效。')
        animated = true; animationFrames = be32(bytes, data)
        if (animationFrames > STRUCTURE_LIMIT) invalid('APNG 帧数量超过安全上限。')
        fields.push({ name: 'APNG 帧数', value: String(animationFrames) })
        break
      case 'fcTL': {
        if (!animated || length !== 26 || be32(bytes, data) !== sequence++ || (frameControls > 0 && !frameHasData)) invalid('APNG 帧控制块无效。')
        const frameWidth = be32(bytes, data + 4), frameHeight = be32(bytes, data + 8)
        if (!frameWidth || !frameHeight || frameWidth > width || frameHeight > height || be32(bytes, data + 12) > width - frameWidth || be32(bytes, data + 16) > height - frameHeight || bytes[data + 24]! > 2 || bytes[data + 25]! > 1) invalid('APNG 帧范围或合成参数无效。')
        if (!sawIdat && (frameControls > 0 || frameWidth !== width || frameHeight !== height || be32(bytes, data + 12) || be32(bytes, data + 16))) invalid('APNG 默认帧必须覆盖画布。')
        frameControls++; frameHasData = false; frameUsesIdat = !sawIdat
        break
      }
      case 'fdAT':
        if (!animated || !sawIdat || !frameControls || frameUsesIdat || length < 5 || be32(bytes, data) !== sequence++) invalid('APNG 帧数据块无效。')
        frameHasData = true
        break
      default:
        if (type[0] === type[0]!.toUpperCase()) invalid(`不支持的 PNG 关键块 ${type}。`)
        // Ancillary payloads are intentionally never decompressed or interpreted as HTML/XML.
    }
    offset = data + length + 4
  }
  return invalid('PNG 缺少 IEND 结束块。')
}

