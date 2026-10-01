export interface ImagePdfOptions { page: 'a4' | 'letter' | 'image'; orientation: 'auto' | 'portrait' | 'landscape'; marginMm: number; dpi: number; encoding: 'png' | 'jpeg'; quality: number }
export function checkImagePdfOptions(options: ImagePdfOptions): void {
  if (!options || !['a4','letter','image'].includes(options.page) || !['auto','portrait','landscape'].includes(options.orientation) || !['png','jpeg'].includes(options.encoding) || !Number.isFinite(options.marginMm) || options.marginMm < 0 || options.marginMm > 50 || !Number.isInteger(options.dpi) || options.dpi < 36 || options.dpi > 300 || !Number.isInteger(options.quality) || options.quality < 10 || options.quality > 95) throw new Error('页面/方向/边距/DPI/编码或质量参数无效。')
}
export function imagePdfGeometry(width: number, height: number, options: ImagePdfOptions) {
  checkImagePdfOptions(options)
  if (![width,height].every(n => Number.isInteger(n) && n > 0 && n <= 4096) || width * height > 4_000_000) throw new Error('每图最多4096边长/400万像素。')
  const margin = options.marginMm * 72 / 25.4
  let pageWidth: number, pageHeight: number
  if (options.page === 'image') { pageWidth = width * 72 / options.dpi + 2 * margin; pageHeight = height * 72 / options.dpi + 2 * margin }
  else {
    [pageWidth,pageHeight] = options.page === 'a4' ? [210 * 72 / 25.4,297 * 72 / 25.4] : [612,792]
    if (options.orientation === 'landscape' || options.orientation === 'auto' && width > height) [pageWidth,pageHeight] = [pageHeight,pageWidth]
  }
  const availableWidth = pageWidth - 2 * margin, availableHeight = pageHeight - 2 * margin
  if (availableWidth <= 0 || availableHeight <= 0 || pageWidth > 14400 || pageHeight > 14400) throw new Error('页面或边距超出范围。')
  const scale = Math.min(availableWidth / width, availableHeight / height), drawWidth = width * scale, drawHeight = height * scale
  return { pageWidth, pageHeight, x: (pageWidth - drawWidth) / 2, y: (pageHeight - drawHeight) / 2, width: drawWidth, height: drawHeight }
}
