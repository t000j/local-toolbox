// Selected classic TIFF/EXIF fields only; no recursive IFD traversal or MakerNote decoding.
import { METADATA_LIMIT, IFD_ENTRY_LIMIT, range, invalid, matches, ascii } from './imageHeaderShared'
import type { ImageMetadataField } from './imageHeaderShared'

interface ExifResult { orientation: number; fields: ImageMetadataField[] }
interface TiffEntry { tag: number; type: number; count: number; offset: number }
export function parseExif(bytes: Uint8Array): ExifResult {
  if (bytes.length > METADATA_LIMIT) invalid('EXIF 超过 1 MiB 上限。')
  range(bytes, 0, 8, 'EXIF TIFF 头')
  const little = matches(bytes, 0, [0x49, 0x49])
  if (!little && !matches(bytes, 0, [0x4d, 0x4d])) invalid('不支持的 EXIF 字节序。')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const u16 = (o: number): number => { range(bytes, o, 2, 'EXIF SHORT'); return view.getUint16(o, little) }
  const u32 = (o: number): number => { range(bytes, o, 4, 'EXIF LONG'); return view.getUint32(o, little) }
  if (u16(2) !== 42) invalid('不支持的 EXIF TIFF 版本（仅支持经典 TIFF 42）。')
  const fields: ImageMetadataField[] = []
  const visited = new Set<number>()
  let unsupported = 0
  let skippedLinkedIfd = false
  const sizes: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 13: 4 }
  const readIfd = (offset: number): Map<number, TiffEntry> => {
    if (offset < 8 || visited.has(offset)) invalid('EXIF IFD 偏移无效或循环引用。')
    visited.add(offset)
    const count = u16(offset)
    if (count > IFD_ENTRY_LIMIT) invalid('EXIF 单个 IFD 超过 256 项上限。')
    range(bytes, offset + 2, count * 12 + 4, 'EXIF IFD 表')
    const entries = new Map<number, TiffEntry>()
    for (let i = 0; i < count; i++) {
      const p = offset + 2 + i * 12
      const tag = u16(p), type = u16(p + 2), number = u32(p + 4)
      if (entries.has(tag)) invalid('EXIF IFD 中存在重复标签。')
      const size = sizes[type]
      if (!size) { entries.set(tag, { tag, type, count: number, offset: p + 8 }); continue }
      const length = size * number
      const dataOffset = length <= 4 ? p + 8 : u32(p + 8)
      range(bytes, dataOffset, length, 'EXIF 标签数据')
      if (length > 4 && dataOffset < 8) invalid('EXIF 标签数据指向 TIFF 头。')
      entries.set(tag, { tag, type, count: number, offset: dataOffset })
    }
    const next = u32(offset + 2 + count * 12)
    if (next) {
      if (next < 8 || visited.has(next)) invalid('EXIF 后续 IFD 偏移无效或循环引用。')
      range(bytes, next, 2, 'EXIF 后续 IFD')
      const nextCount = u16(next)
      if (nextCount > IFD_ENTRY_LIMIT) invalid('EXIF 后续 IFD 超过 256 项上限。')
      range(bytes, next + 2, nextCount * 12 + 4, 'EXIF 后续 IFD 表')
      skippedLinkedIfd = true
    }
    return entries
  }
  const take = (entries: Map<number, TiffEntry>, tag: number, types: number[], count?: number): TiffEntry | undefined => {
    const entry = entries.get(tag)
    if (!entry) return undefined
    entries.delete(tag)
    if (!types.includes(entry.type) || entry.count === 0 || (count !== undefined && entry.count !== count)) invalid(`EXIF 标签 0x${tag.toString(16)} 类型或数量无效。`)
    return entry
  }
  const integer = (entry: TiffEntry): number => entry.type === 1 ? bytes[entry.offset]! : entry.type === 3 ? u16(entry.offset) : u32(entry.offset)
  const rational = (entry: TiffEntry, index = 0): number => {
    const numerator = u32(entry.offset + index * 8), denominator = u32(entry.offset + index * 8 + 4)
    if (!denominator) invalid('EXIF 有理数分母为零。')
    return numerator / denominator
  }
  const addText = (entries: Map<number, TiffEntry>, tag: number, name: string): void => {
    const entry = take(entries, tag, [2])
    if (entry) fields.push({ name, value: ascii(bytes, entry.offset, entry.count) || '（空）' })
  }
  const addRational = (entries: Map<number, TiffEntry>, tag: number, name: string, suffix: string): void => {
    const entry = take(entries, tag, [5], 1)
    if (entry) fields.push({ name, value: `${Number(rational(entry).toPrecision(8))}${suffix}` })
  }
  const root = readIfd(u32(4))
  let orientation = 1
  const orientationEntry = take(root, 0x0112, [3], 1)
  if (orientationEntry) {
    orientation = integer(orientationEntry)
    if (orientation < 1 || orientation > 8) invalid('EXIF 方向必须介于 1 和 8。')
    fields.push({ name: 'EXIF 方向', value: String(orientation) })
  }
  addText(root, 0x010f, '相机品牌')
  addText(root, 0x0110, '相机型号')
  addText(root, 0x0131, '软件')
  addText(root, 0x0132, '修改时间（原始 EXIF，时区未知）')
  const exifPointer = take(root, 0x8769, [4], 1)
  const gpsPointer = take(root, 0x8825, [4], 1)
  unsupported += root.size
  if (exifPointer) {
    const exif = readIfd(integer(exifPointer))
    addText(exif, 0x9003, '拍摄时间（原始 EXIF，时区未知）')
    addText(exif, 0x9004, '数字化时间（原始 EXIF，时区未知）')
    addText(exif, 0xa434, '镜头型号')
    addRational(exif, 0x829a, '曝光时间', ' 秒')
    addRational(exif, 0x829d, '光圈', '')
    addRational(exif, 0x920a, '焦距', ' mm')
    const iso = take(exif, 0x8827, [3], 1)
    if (iso) fields.push({ name: 'ISO（PhotographicSensitivity）', value: String(integer(iso)) })
    const colorSpace = take(exif, 0xa001, [3], 1)
    if (colorSpace) {
      const value = integer(colorSpace)
      fields.push({ name: 'EXIF 色彩空间', value: value === 1 ? 'sRGB' : value === 0xffff ? '未校准（65535）' : `不支持的色彩空间代码 ${value}` })
    }
    unsupported += exif.size
  }
  if (gpsPointer) {
    const gps = readIfd(integer(gpsPointer))
    const coordinate = (refTag: number, valueTag: number, name: string, refs: string, limit: number): void => {
      const ref = take(gps, refTag, [2], 2), value = take(gps, valueTag, [5], 3)
      if (!ref && !value) return
      if (!ref || !value) { fields.push({ name, value: '不支持：GPS 坐标或方向字段不完整' }); return }
      const direction = ascii(bytes, ref.offset, ref.count)
      if (direction.length !== 1 || !refs.includes(direction) || bytes[ref.offset + 1] !== 0) invalid('GPS 方位值无效。')
      const degrees = rational(value), minutes = rational(value, 1), seconds = rational(value, 2)
      const result = degrees + minutes / 60 + seconds / 3600
      if (minutes >= 60 || seconds >= 60 || result > limit) invalid('GPS 坐标范围无效。')
      const signed = refs.indexOf(direction) === 1 ? -result : result
      fields.push({ name, value: `${signed.toFixed(6)}° (${direction})` })
    }
    coordinate(1, 2, 'GPS 纬度（敏感位置）', 'NS', 90)
    coordinate(3, 4, 'GPS 经度（敏感位置）', 'EW', 180)
    const altitudeRef = take(gps, 5, [1], 1), altitude = take(gps, 6, [5], 1)
    if (altitudeRef && integer(altitudeRef) > 1) invalid('GPS 海拔基准无效。')
    if (altitude) fields.push({ name: 'GPS 海拔', value: `${Number((rational(altitude) * (altitudeRef && integer(altitudeRef) === 1 ? -1 : 1)).toPrecision(8))} m` })
    unsupported += gps.size
  }
  fields.push({ name: 'EXIF 读取范围', value: `部分支持；${unsupported} 个未支持的标签未显示${skippedLinkedIfd ? '；后续 IFD／缩略图未读取' : ''}。未显示不代表不存在。` })
  return { orientation, fields }
}

