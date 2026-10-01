export interface WindowRect { left: number; top: number; right: number; bottom: number }
export interface DesktopWindow {
  handle: number; processId: number; title: string; processName: string
  topMost: boolean; minimized: boolean; maximized: boolean; rect?: WindowRect
}
export function validPosition(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && Math.abs(value) <= 100000
}
export function canMove(item: DesktopWindow) {
  const r = item.rect
  return !item.minimized && !item.maximized && !!r && [r.left, r.top, r.right, r.bottom].every(validPosition)
    && r.right > r.left && r.bottom > r.top
}
export function moveRequest(item: DesktopWindow, x: number, y: number, confirmed: boolean) {
  if (!confirmed || !canMove(item) || !validPosition(x) || !validPosition(y)) return null
  return { handle: item.handle, processId: item.processId, title: item.title, expected: { ...item.rect! }, x, y, confirmed }
}
