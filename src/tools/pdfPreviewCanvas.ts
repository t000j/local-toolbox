// Per-session intermediate canvas budget; PDF.js still owns parser/decoder allocations.
export function previewCanvasFactory() {
  const active = new Map<HTMLCanvasElement, number>(); let pixels = 0
  function reserve(canvas: HTMLCanvasElement, width: number, height: number) {
    const count = Math.ceil(width) * Math.ceil(height), next = pixels - (active.get(canvas) ?? 0) + count
    if (!Number.isFinite(count) || width <= 0 || height <= 0 || width > 2048 || height > 2048 || count > 1_048_576 || next > 4_194_304) throw new Error('缩略图中间画布超出安全预算。')
    pixels = next; active.set(canvas, count); canvas.width = Math.ceil(width); canvas.height = Math.ceil(height)
  }
  class CanvasFactory {
    create(width: number, height: number) { const canvas = document.createElement('canvas'); reserve(canvas, width, height); const context = canvas.getContext('2d'); if (!context) throw new Error('Canvas不可用。'); return { canvas, context } }
    reset(target: { canvas: HTMLCanvasElement }, width: number, height: number) { reserve(target.canvas, width, height) }
    destroy(target: { canvas: HTMLCanvasElement | null; context: CanvasRenderingContext2D | null }) {
      if (target.canvas) { pixels -= active.get(target.canvas) ?? 0; active.delete(target.canvas); target.canvas.width = target.canvas.height = 0 }
      target.canvas = null; target.context = null
    }
  }
  return { CanvasFactory, clear: () => { for (const canvas of active.keys()) canvas.width = canvas.height = 0; active.clear(); pixels = 0 } }
}
export function thumbnailSize(width: number, height: number) {
  if (![width, height].every(n => Number.isFinite(n) && n > 0 && n <= 75_000_000_000)) throw new Error('页面显示尺寸无效。')
  const scale = 256 / Math.max(width, height)
  return { scale, width: Math.max(1, Math.ceil(width * scale)), height: Math.max(1, Math.ceil(height * scale)) }
}
