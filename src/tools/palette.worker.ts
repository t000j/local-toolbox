/// <reference lib="webworker" />
import { decodeBoundedImage } from './imageDecode'
import { extractPalette, paletteSampleSize } from './palette'
export interface PaletteRequest { file: File; count: number; alphaThreshold: number }
self.onmessage = async (event: MessageEvent<PaletteRequest>) => {
  let bitmap: ImageBitmap | undefined, canvas: OffscreenCanvas | undefined
  try {
    const decoded = await decodeBoundedImage(event.data.file); bitmap = decoded.bitmap
    const size = paletteSampleSize(decoded.width, decoded.height)
    canvas = new OffscreenCanvas(size.width, size.height)
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('当前 WebView 不支持离屏 Canvas。')
    context.drawImage(bitmap, 0, 0, size.width, size.height)
    const result = { ...extractPalette(context.getImageData(0, 0, size.width, size.height).data, event.data.count, event.data.alphaThreshold), width: decoded.width, height: decoded.height, sampleWidth: size.width, sampleHeight: size.height }
    self.postMessage({ ok: true, result })
  } catch (cause) { self.postMessage({ ok: false, error: cause instanceof Error ? cause.message : String(cause) }) }
  finally { bitmap?.close(); if (canvas) { canvas.width = 1; canvas.height = 1 } }
}
