import { parseImageHeader } from './imageHeaders'
import { validateImageFiles } from './imageProcessing'
export async function decodeBoundedImage(file: File) {
  validateImageFiles([file])
  const bytes = new Uint8Array(await file.arrayBuffer()), header = parseImageHeader(bytes)
  if (header.animated) throw new Error('仅支持静态 PNG/JPEG；不会自动丢弃动画帧。')
  const width = header.orientation >= 5 ? header.height : header.width, height = header.orientation >= 5 ? header.width : header.height
  const bitmap = await createImageBitmap(new Blob([bytes], { type: `image/${header.format}` }), { imageOrientation: 'from-image' })
  if (bitmap.width !== width || bitmap.height !== height) { bitmap.close(); throw new Error('解码器方向或尺寸与图片头不一致。') }
  return { bitmap, width, height }
}
