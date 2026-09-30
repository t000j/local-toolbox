import { onBeforeUnmount, ref } from 'vue'
export interface EyeDropperHandle { open(options: { signal: AbortSignal }): Promise<{ sRGBHex: string }> }
interface EyeDropperWindow { EyeDropper?: new () => EyeDropperHandle; isSecureContext: boolean }
export function useScreenColorPicker(environment: EyeDropperWindow = window as unknown as EyeDropperWindow) {
  const color = ref(''), busy = ref(false), error = ref(''), notice = ref('')
  const supported = typeof environment.EyeDropper === 'function' && environment.isSecureContext
  let controller: AbortController | null = null, disposed = false, timer: ReturnType<typeof setTimeout> | undefined
  function cancel() { controller?.abort(); clearTimeout(timer) }
  function clear() { cancel(); color.value = ''; error.value = ''; notice.value = '' }
  async function pick() {
    if (disposed || busy.value || controller) return
    color.value = ''; error.value = ''; notice.value = ''
    if (!supported || !environment.EyeDropper) { error.value = '当前运行环境未提供安全上下文中的 EyeDropper API，无法屏幕取色；不会改用后台截屏。'; return }
    const current = new AbortController(); controller = current; busy.value = true
    let timedOut = false
    try {
      // Must run synchronously in this click handler, before any await, to preserve user activation.
      const operation = new environment.EyeDropper().open({ signal: current.signal })
      timer = setTimeout(() => { timedOut = true; current.abort() }, 30_000)
      const result = await operation
      if (disposed || current.signal.aborted || controller !== current) return
      if (!/^#[0-9a-f]{6}$/i.test(result.sRGBHex)) throw new Error('取色器返回了非规范的 sRGB 色值。')
      color.value = result.sRGBHex.toUpperCase(); notice.value = '已读取所选像素的 sRGB 色值。'
    } catch (cause) {
      if (disposed || controller !== current) return
      const name = cause instanceof Error ? cause.name : ''
      if (current.signal.aborted || name === 'AbortError') notice.value = timedOut ? '30 秒未完成选择，已停止取色。' : '已取消取色。'
      else error.value = name === 'NotAllowedError' ? '取色被运行环境拒绝。请通过“开始取色”按钮手动启动。' : cause instanceof Error ? cause.message : '无法启动屏幕取色。'
    } finally {
      clearTimeout(timer)
      if (controller === current) { controller = null; if (!disposed) busy.value = false }
    }
  }
  onBeforeUnmount(() => { disposed = true; cancel(); color.value = '' })
  return { color, busy, error, notice, supported, pick, cancel, clear }
}
