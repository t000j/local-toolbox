import type { ResizeOptions, CropOptions } from './imageGeometry'
export interface ImageRequest { files: File[]; resize?: ResizeOptions; crop?: CropOptions }
export interface ImageOutput { name: string; width: number; height: number; sourceWidth: number; sourceHeight: number; bytes: Uint8Array }
export const MAX_IMAGE_BYTES = 16 * 1024 * 1024, MAX_IMAGE_TOTAL = 32 * 1024 * 1024
export function validateImageFiles(files: File[]) {
  if (!files.length || files.length > 8) throw new Error('每批选择 1–8 张图片。')
  if (files.some(file => !file.size || file.size > MAX_IMAGE_BYTES) || files.reduce((sum, file) => sum + file.size, 0) > MAX_IMAGE_TOTAL)
    throw new Error('每张图片最多 16 MiB，每批输入总共最多 32 MiB。')
}
