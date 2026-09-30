export interface PaletteColor { hex: string; weight: number; percent: number; r: number; g: number; b: number }
interface Bin { key: number; r: number; g: number; b: number; weight: number }
export function extractPalette(pixels: Uint8ClampedArray, count: number, alphaThreshold: number): { colors: PaletteColor[]; sampledPixels: number; includedPixels: number } {
  if (!(pixels instanceof Uint8ClampedArray) || !pixels.length || pixels.length % 4 || pixels.length > 256 * 256 * 4) throw new Error('取样必须是最多 256×256 的 RGBA 像素。')
  if (!Number.isInteger(count) || count < 1 || count > 16 || !Number.isInteger(alphaThreshold) || alphaThreshold < 1 || alphaThreshold > 255) throw new Error('颜色数量应为 1–16，透明度阈值应为 1–255。')
  const bins = new Map<number, Bin>(); let includedPixels = 0, total = 0
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2], a = pixels[i + 3]
    if (a < alphaThreshold) continue
    includedPixels++; total += a
    const key = (r >> 3) * 1024 + (g >> 3) * 32 + (b >> 3), bin = bins.get(key) ?? { key, r: 0, g: 0, b: 0, weight: 0 }
    bin.r += r * a; bin.g += g * a; bin.b += b * a; bin.weight += a; bins.set(key, bin)
  }
  if (!total) throw new Error('没有满足透明度阈值的像素；请降低阈值或选择其他图片。')
  const values = [...bins.values()].map(bin => ({ ...bin, r: bin.r / bin.weight, g: bin.g / bin.weight, b: bin.b / bin.weight }))
  const stats = (box: Bin[]) => {
    const range = (channel: 'r' | 'g' | 'b') => { let min = 255, max = 0; for (const bin of box) { min = Math.min(min, bin[channel]); max = Math.max(max, bin[channel]) }; return max - min }
    const channels = (['r', 'g', 'b'] as const).map(channel => ({ channel, range: range(channel) })).sort((a, b) => b.range - a.range)
    const weight = box.reduce((sum, bin) => sum + bin.weight, 0)
    return { channel: channels[0].channel, score: channels[0].range * weight, weight }
  }
  const boxes: Bin[][] = [values]
  while (boxes.length < count) {
    const candidates = boxes.map((box, index) => ({ ...stats(box), index, length: box.length })).filter(box => box.length > 1).sort((a, b) => b.score - a.score || a.index - b.index)
    if (!candidates.length) break
    const candidate = candidates[0], box = boxes[candidate.index].slice().sort((a, b) => a[candidate.channel] - b[candidate.channel] || a.key - b.key)
    let split = 0, accumulated = 0
    while (split < box.length - 1 && accumulated < candidate.weight / 2) accumulated += box[split++].weight
    split = Math.max(1, split); boxes.splice(candidate.index, 1, box.slice(0, split), box.slice(split))
  }
  const merged = new Map<string, PaletteColor>(), hexByte = (n: number) => n.toString(16).padStart(2, '0').toUpperCase()
  for (const box of boxes) {
    const weight = box.reduce((sum, bin) => sum + bin.weight, 0)
    const channel = (key: 'r' | 'g' | 'b') => Math.round(box.reduce((sum, bin) => sum + bin[key] * bin.weight, 0) / weight)
    const r = channel('r'), g = channel('g'), b = channel('b'), hex = `#${hexByte(r)}${hexByte(g)}${hexByte(b)}`
    const previous = merged.get(hex)
    if (previous) { previous.weight += weight; previous.percent = previous.weight / total * 100 }
    else merged.set(hex, { hex, r, g, b, weight, percent: weight / total * 100 })
  }
  return { colors: [...merged.values()].sort((a, b) => b.weight - a.weight || a.hex.localeCompare(b.hex)), sampledPixels: pixels.length / 4, includedPixels }
}
export function paletteSampleSize(width: number, height: number) {
  if (![width, height].every(n => Number.isInteger(n) && n > 0 && n <= 8192) || width * height > 16_000_000) throw new Error('源图尺寸超限。')
  const scale = Math.min(1, 256 / width, 256 / height)
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}
