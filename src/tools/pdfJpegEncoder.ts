import type { PdfImagePixels } from './pdfImageCompression'
export async function encodePdfJpeg(image: PdfImagePixels, quality: number): Promise<Uint8Array> {
  let bitmap: ImageBitmap | undefined
  const canvas = new OffscreenCanvas(image.width, image.height)
  try {
    const context = canvas.getContext('2d'); if (!context) throw new Error('本机Canvas不可用。')
    if (image.kind === 'jpeg') {
      bitmap = await createImageBitmap(new Blob([new Uint8Array(image.bytes)], { type: 'image/jpeg' }), { imageOrientation: 'from-image', colorSpaceConversion: 'none' })
      if (bitmap.width !== image.width || bitmap.height !== image.height) throw new Error('JPEG解码尺寸变化，已停止。')
      context.drawImage(bitmap, 0, 0)
    } else {
      const rgba = new Uint8ClampedArray(image.width * image.height * 4)
      for (let i = 0, p = 0; i < image.bytes.length; i += 3, p += 4) { rgba[p] = image.bytes[i]!; rgba[p + 1] = image.bytes[i + 1]!; rgba[p + 2] = image.bytes[i + 2]!; rgba[p + 3] = 255 }
      context.putImageData(new ImageData(rgba, image.width, image.height), 0, 0)
    }
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality })
    if (blob.type !== 'image/jpeg' || blob.size > 8 * 1024 * 1024) throw new Error('本机JPEG编码失败或结果过大。')
    return new Uint8Array(await blob.arrayBuffer())
  } finally { bitmap?.close(); canvas.width = canvas.height = 0 }
}
