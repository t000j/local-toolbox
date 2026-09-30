import { be16, be32, range } from './imageHeaderShared'
import { ICC_RETENTION_WARNING, joinBytes, minimalExifTiff, pngChunk, sameBytes, verifyIdentical } from './imageStripShared'
import type { StripParts } from './imageStripShared'
interface PngBlock { type: string; raw: Uint8Array; payload: Uint8Array }
const colorChunks = new Set(['sRGB', 'gAMA', 'cHRM', 'iCCP', 'cICP', 'sBIT', 'bKGD', 'pHYs'])
function blocks(bytes: Uint8Array): PngBlock[] {
  const result: PngBlock[] = []
  for (let offset = 8; offset < bytes.length;) {
    range(bytes, offset, 12, 'PNG 清理块头')
    const length = be32(bytes, offset), end = offset + length + 12
    range(bytes, offset, length + 12, 'PNG 清理块')
    result.push({ type: String.fromCharCode(...bytes.subarray(offset + 4, offset + 8)), raw: bytes.subarray(offset, end), payload: bytes.subarray(offset + 8, end - 4) })
    offset = end
  }
  return result
}
const protectedBlock = (block: PngBlock): boolean => block.type[0] === block.type[0]!.toUpperCase() || block.type === 'tRNS' || colorChunks.has(block.type)
export function stripPng(bytes: Uint8Array, orientation: number, colorSpace?: number): StripParts {
  const original = blocks(bytes), parts = [bytes.subarray(0, 8)], retained: string[] = [], seen = new Set<string>()
  const ihdr = original[0]!.payload, depth = ihdr[8]!, color = ihdr[9]!
  let removed = 0, dataStarted = false, paletteStarted = false, paletteSize = 0
  for (const block of original) {
    const { type, payload } = block
    if (['mDCV', 'cLLI', 'sTER'].includes(type)) throw new Error(`不支持清理带 ${type} 的 HDR／立体 PNG；请保留原文件。`)
    if (type === 'eXIf') {
      const replacement = orientation > 1 || colorSpace !== undefined ? pngChunk(type, minimalExifTiff(orientation, colorSpace)) : null
      if (!replacement || !sameBytes(replacement, block.raw)) removed++
      if (replacement) { parts.push(replacement); retained.push(`保留最小 EXIF：显示方向 ${orientation}${colorSpace !== undefined ? `、色彩空间 ${colorSpace}` : ''}；其他字段已移除`) }
      continue
    }
    if (colorChunks.has(type)) {
      if (seen.has(type) || dataStarted || (paletteStarted && type !== 'bKGD' && type !== 'pHYs')) throw new Error(`PNG ${type} 重复或顺序不受支持。`)
      seen.add(type)
      if (type === 'pHYs' && (payload.length !== 9 || !be32(payload, 0) || !be32(payload, 4) || payload[8]! > 1)) throw new Error('PNG pHYs 比例／密度参数无效。')
      if (type === 'gAMA' && (payload.length !== 4 || !be32(payload, 0))) throw new Error('PNG gAMA 值无效。')
      if (type === 'cHRM' && payload.length !== 32) throw new Error('PNG cHRM 长度无效。')
      if (type === 'cICP' && (payload.length !== 4 || ![1, 9, 12].includes(payload[0]!) || ![1, 13].includes(payload[1]!) || payload[2] !== 0 || payload[3]! > 1)) throw new Error('不支持此 PNG cICP 颜色模型或范围标志。')
      if (type === 'sBIT') {
        const channels = ({ 0: 1, 2: 3, 3: 3, 4: 2, 6: 4 } as Record<number, number>)[color]
        if (payload.length !== channels || payload.some(value => value < 1 || value > (color === 3 ? 8 : depth))) throw new Error('PNG sBIT 参数无效。')
      }
      if (type === 'bKGD') {
        if (payload.length !== (color === 3 ? 1 : color === 0 || color === 4 ? 2 : 6)) throw new Error('PNG bKGD 长度无效。')
        if (color === 3 && (!paletteStarted || payload[0]! >= paletteSize)) throw new Error('PNG bKGD 调色板索引无效。')
        for (let p = 0; color !== 3 && p < payload.length; p += 2) if (be16(payload, p) >= 2 ** depth) throw new Error('PNG bKGD 颜色值超过位深。')
      }
      retained.push(type === 'iCCP' ? ICC_RETENTION_WARNING : type === 'pHYs' ? '保留 PNG pHYs 像素比例／物理密度' : `保留 PNG ${type} 色彩／显示参数`)
    }
    if (type === 'PLTE') { paletteStarted = true; paletteSize = payload.length / 3 }
    if (type === 'IDAT') dataStarted = true
    if (type === 'tRNS') retained.push('保留 PNG tRNS 透明度')
    if (protectedBlock(block)) parts.push(block.raw)
    else removed++
  }
  const output = joinBytes(parts)
  verifyIdentical(original.filter(protectedBlock).map(block => block.raw), blocks(output).filter(protectedBlock).map(block => block.raw))
  return { bytes: output, removed, retained }
}
