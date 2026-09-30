/// <reference lib="webworker" />
import { decodeBoundedImage } from './imageDecode'
import { FAVICON_ICO_SIZES, FAVICON_PNG_SIZES, iconGeometry, packIco, validateIconFrame, type FaviconRequest, type FaviconResult, type IconFrame } from './favicon'
self.onmessage = async (event: MessageEvent<FaviconRequest>) => {
  let bitmap: ImageBitmap | undefined, canvas: OffscreenCanvas | undefined
  try {
    const request = event.data
    if (!['png', 'ico'].includes(request.format) || !FAVICON_PNG_SIZES.includes(request.size as typeof FAVICON_PNG_SIZES[number])) throw new Error('输出格式或尺寸无效。')
    const decoded = await decodeBoundedImage(request.file); bitmap = decoded.bitmap
    const sizes = request.format === 'ico' ? [...FAVICON_ICO_SIZES] : [request.size], frames: IconFrame[] = []
    for (const size of sizes) {
      canvas = new OffscreenCanvas(size, size)
      const context = canvas.getContext('2d')
      if (!context) throw new Error('当前 WebView 不支持离屏 Canvas。')
      const box = iconGeometry(decoded.width, decoded.height, size, request.fit)
      context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high'
      context.drawImage(bitmap, box.sx, box.sy, box.sw, box.sh, box.dx, box.dy, box.dw, box.dh)
      const blob = await canvas.convertToBlob({ type: 'image/png' })
      if (blob.type !== 'image/png' || blob.size > 2 * 1024 * 1024) throw new Error('PNG 编码格式异常或超过 2 MiB 上限。')
      const frame = { size, bytes: new Uint8Array(await blob.arrayBuffer()) }; validateIconFrame(frame)
      frames.push(frame); canvas.width = 1; canvas.height = 1
    }
    const preview = frames[frames.length - 1].bytes, bytes = request.format === 'ico' ? packIco(frames) : preview
    const result: FaviconResult = { bytes, preview, sizes, format: request.format, width: decoded.width, height: decoded.height }
    self.postMessage({ ok: true, result })
  } catch (cause) { self.postMessage({ ok: false, error: cause instanceof Error ? cause.message : String(cause) }) }
  finally { bitmap?.close(); if (canvas) { canvas.width = 1; canvas.height = 1 } }
}
