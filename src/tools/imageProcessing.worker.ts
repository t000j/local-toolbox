/// <reference lib="webworker" />
import { parseImageHeader } from './imageHeaders'
import { cropGeometry, resizeSize } from './imageGeometry'
import { MAX_IMAGE_BYTES, MAX_IMAGE_TOTAL, validateImageFiles, type ImageRequest, type ImageOutput } from './imageProcessing'
self.onmessage = async (event: MessageEvent<ImageRequest>) => {
  const outputs: ImageOutput[] = []; let total = 0
  try {
    const request = event.data; validateImageFiles(request.files)
    if (!!request.resize === !!request.crop || (request.crop && request.files.length !== 1)) throw new Error('图片处理参数无效。')
    for (const file of request.files) {
      const bytes = new Uint8Array(await file.arrayBuffer()), header = parseImageHeader(bytes)
      if (header.animated) throw new Error('不处理动画 PNG；请先选取静态图片。')
      const swapped = header.orientation >= 5
      const source = { width: swapped ? header.height : header.width, height: swapped ? header.width : header.height }
      const size = request.resize ? resizeSize(source, request.resize) : cropGeometry(source, request.crop!)
      const bitmap = await createImageBitmap(new Blob([bytes], { type: `image/${header.format}` }), { imageOrientation: 'from-image' })
      try {
        if (bitmap.width !== source.width || bitmap.height !== source.height) throw new Error('解码器方向或尺寸与图片头不一致，已停止。')
        const canvas = new OffscreenCanvas(size.width, size.height), context = canvas.getContext('2d')
        if (!context) throw new Error('当前 WebView 不支持离屏 Canvas。')
        try {
          context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high'
          if (request.resize) context.drawImage(bitmap, 0, 0, size.width, size.height)
          else {
            const crop = request.crop!
            context.translate(size.width / 2, size.height / 2)
            context.scale(crop.flipX ? -1 : 1, crop.flipY ? -1 : 1)
            context.rotate(crop.rotation * Math.PI / 180)
            context.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, -crop.width / 2, -crop.height / 2, crop.width, crop.height)
          }
          const blob = await canvas.convertToBlob({ type: 'image/png' })
          if (blob.type !== 'image/png' || blob.size > MAX_IMAGE_BYTES || total + blob.size > MAX_IMAGE_TOTAL) throw new Error('PNG 输出超过单张 16 MiB 或整批 32 MiB 上限，请减小尺寸。')
          total += blob.size
          outputs.push({ name: file.name, ...size, sourceWidth: source.width, sourceHeight: source.height, bytes: new Uint8Array(await blob.arrayBuffer()) })
        } finally { canvas.width = 1; canvas.height = 1 }
      } finally { bitmap.close() }
    }
    self.postMessage({ ok: true, result: outputs }, { transfer: outputs.map(output => output.bytes.buffer) })
  } catch (cause) { self.postMessage({ ok: false, error: cause instanceof Error ? cause.message : String(cause) }) }
}
