/// <reference lib="webworker" />
import { buildImagePdf } from './imagePdf'
import { checkImagePdfOptions } from './imagePdfGeometry'
import type { ImagePdfOptions } from './imagePdfGeometry'
import type { PreparedPdfImage } from './imagePdfInput'
import { validateImageFiles } from './imageProcessing'
import { parseImageHeader } from './imageHeaders'
self.onmessage = async (event: MessageEvent<{ files: File[]; options: ImagePdfOptions }>) => {
  try {
    const { files, options } = event.data; validateImageFiles(files); checkImagePdfOptions(options)
    const images: PreparedPdfImage[] = []; let totalPixels = 0, totalBytes = 0
    for (const file of files) {
      const bytes = new Uint8Array(await file.arrayBuffer()), header = parseImageHeader(bytes)
      if (header.animated || header.width > 4096 || header.height > 4096 || header.width * header.height > 4_000_000) throw new Error('仅静态PNG/JPEG，每图400万像素/4096边长。')
      totalPixels += header.width * header.height; if (totalPixels > 16_000_000) throw new Error('全部图片最多1600万像素。')
      const bitmap = await createImageBitmap(new Blob([bytes], { type: `image/${header.format}` }), { imageOrientation: 'from-image' })
      const width = header.orientation >= 5 ? header.height : header.width, height = header.orientation >= 5 ? header.width : header.height
      let canvas: OffscreenCanvas | undefined
      try {
        if (bitmap.width !== width || bitmap.height !== height) throw new Error('图片解码方向/尺寸不一致。')
        canvas = new OffscreenCanvas(width, height); const context = canvas.getContext('2d'); if (!context) throw new Error('Canvas不可用。')
        if (options.encoding === 'jpeg') { context.fillStyle = '#ffffff'; context.fillRect(0, 0, width, height) }
        context.drawImage(bitmap, 0, 0)
        const mime = `image/${options.encoding}`, blob = await canvas.convertToBlob({ type: mime, quality: options.quality / 100 })
        if (blob.type !== mime || blob.size > 16 * 1024 * 1024) throw new Error('规范化图片编码失败或超过16MiB。')
        totalBytes += blob.size; if (totalBytes > 32 * 1024 * 1024) throw new Error('规范化数据总计超过32MiB。')
        images.push({ name: file.name, bytes: new Uint8Array(await blob.arrayBuffer()), width, height, format: options.encoding })
      } finally { bitmap.close(); if (canvas) canvas.width = canvas.height = 0 }
    }
    const result = await buildImagePdf(images, options)
    self.postMessage({ ok: true, result }, { transfer: [result.bytes.buffer] })
  } catch (cause) { self.postMessage({ ok: false, error: cause instanceof Error ? cause.message : String(cause) }) }
}
