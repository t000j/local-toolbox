import { be16, matches, range } from './imageHeaderShared'
import { ICC_RETENTION_WARNING, joinBytes, minimalExifTiff, jpegSegment, sameBytes, verifyIdentical } from './imageStripShared'
import type { StripParts } from './imageStripShared'
interface JpegPart { marker: number; raw: Uint8Array; payload: Uint8Array }
const exifId = [69,120,105,102,0,0], iccId = [73,67,67,95,80,82,79,70,73,76,69,0], jfifId = [74,70,73,70,0], adobeId = [65,100,111,98,101]
function pieces(bytes: Uint8Array): JpegPart[] {
  const result: JpegPart[] = [{ marker: 0xd8, raw: bytes.subarray(0, 2), payload: bytes.subarray(0, 0) }]
  let offset = 2, inScan = false
  while (offset < bytes.length) {
    if (inScan) {
      const start = offset
      while (offset < bytes.length) {
        if (bytes[offset] !== 255) { offset++; continue }
        range(bytes, offset, 2, 'JPEG 清理扫描')
        if (bytes[offset + 1] === 0) { offset += 2; continue }
        let next = offset + 1
        while (bytes[next] === 255) next++
        range(bytes, next, 1, 'JPEG 清理扫描标记')
        const marker = bytes[next]!
        if (marker === 1 || marker >= 0xd0 && marker <= 0xd7) { offset = next + 1; continue }
        break
      }
      result.push({ marker: -1, raw: bytes.subarray(start, offset), payload: bytes.subarray(start, offset) }); inScan = false
    }
    const start = offset
    while (bytes[offset] === 255) offset++
    range(bytes, offset, 1, 'JPEG 清理标记')
    const marker = bytes[offset++]!
    if (marker === 0xd9 || marker === 1) {
      result.push({ marker, raw: bytes.subarray(start, offset), payload: bytes.subarray(offset, offset) }); continue
    }
    range(bytes, offset, 2, 'JPEG 清理段长度')
    const length = be16(bytes, offset)
    range(bytes, offset, length, 'JPEG 清理段')
    result.push({ marker, raw: bytes.subarray(start, offset + length), payload: bytes.subarray(offset + 2, offset + length) })
    offset += length; inScan = marker === 0xda
  }
  return result
}
function protectedPart(part: JpegPart): boolean {
  return !(part.marker >= 0xe0 && part.marker <= 0xef) && part.marker !== 0xfe || part.marker === 0xe2 && matches(part.payload, 0, iccId) || part.marker === 0xee && matches(part.payload, 0, adobeId)
}
export function stripJpeg(bytes: Uint8Array, orientation: number, colorSpace?: number): StripParts {
  const original = pieces(bytes), parts: Uint8Array[] = [], retained: string[] = [], iccSeen = new Set<number>()
  let removed = 0, jfifSeen = false, iccTotal = 0
  for (const part of original) {
    const { marker, payload } = part
    if (marker === 0xe2 && matches(payload, 0, [77,80,70,0]) || marker === 0xeb && matches(payload, 0, [74,80])) throw new Error('不支持多图 MPO／JPEG 扩展数据；请保留原文件。')
    if (marker === 0xe1 && matches(payload, 0, exifId)) {
      const replacement = orientation > 1 || colorSpace !== undefined ? jpegSegment(marker, joinBytes([new Uint8Array(exifId), minimalExifTiff(orientation, colorSpace)])) : null
      if (!replacement || !sameBytes(replacement, part.raw)) removed++
      if (replacement) { parts.push(replacement); retained.push(`保留最小 EXIF：显示方向 ${orientation}${colorSpace !== undefined ? `、色彩空间 ${colorSpace}` : ''}；其他字段已移除`) }
    } else if (marker === 0xe0 && matches(payload, 0, jfifId)) {
      if (jfifSeen || payload.length < 14 || payload[5] !== 1 || payload[6]! > 2 || payload[7]! > 2 || !be16(payload, 8) || !be16(payload, 10) || payload.length !== 14 + 3 * payload[12]! * payload[13]! || (!payload[12] !== !payload[13])) throw new Error('不支持此 JFIF 版本、密度或缩略图结构。')
      jfifSeen = true
      const header = new Uint8Array(payload.subarray(0, 14)); header[12] = 0; header[13] = 0
      const replacement = jpegSegment(marker, header)
      verifyIdentical([payload.subarray(0, 12)], [replacement.subarray(4, 16)])
      if (!sameBytes(replacement, part.raw)) removed++
      parts.push(replacement); retained.push('保留 JFIF 版本、密度单位和像素比例；嵌入缩略图已移除')
    } else if (marker === 0xe2 && matches(payload, 0, iccId)) {
      const index = payload[12]!, total = payload[13]!
      if (payload.length <= 14 || !index || index > total || iccSeen.has(index) || (iccTotal && iccTotal !== total)) throw new Error('JPEG ICC 配置分段不完整或重复。')
      iccTotal = total; iccSeen.add(index); parts.push(part.raw)
    } else if (marker === 0xee && matches(payload, 0, adobeId)) {
      parts.push(part.raw); retained.push('保留 Adobe APP14 色彩变换及标志')
    } else if (protectedPart(part)) parts.push(part.raw)
    else removed++
  }
  if (iccTotal) {
    if (iccSeen.size !== iccTotal) throw new Error('JPEG ICC 配置缺少分段。')
    retained.push(ICC_RETENTION_WARNING)
  }
  const output = joinBytes(parts)
  verifyIdentical(original.filter(protectedPart).map(part => part.raw), pieces(output).filter(protectedPart).map(part => part.raw))
  return { bytes: output, removed, retained }
}
