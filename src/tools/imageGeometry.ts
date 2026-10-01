export const MAX_IMAGE_EDGE = 8192, MAX_IMAGE_PIXELS = 16_000_000
export interface Size { width: number; height: number }
export interface ResizeOptions { mode: 'pixels' | 'percent'; width: number; height: number; percent: number; keepAspect: boolean }
export function validSize(width: number, height: number): Size {
  if (![width, height].every(n => Number.isSafeInteger(n) && n > 0 && n <= MAX_IMAGE_EDGE) || width * height > MAX_IMAGE_PIXELS)
    throw new Error('尺寸必须为 1–8192 整数像素，总像素不超过 1600 万。')
  return { width, height }
}
export function resizeSize(source: Size, options: ResizeOptions): Size {
  validSize(source.width, source.height)
  if (options.mode === 'percent') {
    if (!Number.isFinite(options.percent) || options.percent < 1 || options.percent > 800) throw new Error('比例应为 1–800%。')
    return validSize(Math.max(1, Math.round(source.width * options.percent / 100)), Math.max(1, Math.round(source.height * options.percent / 100)))
  }
  if (options.mode !== 'pixels') throw new Error('未知缩放方式。')
  if (![options.width, options.height].every(n => Number.isSafeInteger(n) && n > 0 && n <= MAX_IMAGE_EDGE))
    throw new Error('目标宽高必须为 1–8192 的整数。')
  if (!options.keepAspect) return validSize(options.width, options.height)
  const scale = Math.min(options.width / source.width, options.height / source.height)
  return validSize(Math.max(1, Math.round(source.width * scale)), Math.max(1, Math.round(source.height * scale)))
}
export interface CropOptions { x: number; y: number; width: number; height: number; rotation: number; flipX: boolean; flipY: boolean }
export function cropGeometry(source: Size, options: CropOptions) {
  validSize(source.width, source.height); validSize(options.width, options.height)
  if (![options.x, options.y].every(n => Number.isSafeInteger(n) && n >= 0) || options.x + options.width > source.width || options.y + options.height > source.height)
    throw new Error('裁切区域必须完整位于方向校正后的原图内。')
  if (![0, 90, 180, 270].includes(options.rotation)) throw new Error('旋转仅支持 0 / 90 / 180 / 270 度。')
  const swapped = options.rotation % 180 !== 0
  return { width: swapped ? options.height : options.width, height: swapped ? options.width : options.height }
}
