import { onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useWorkerTask } from './useWorkerTask'
import { saveBinaryOutput } from './binaryExport'
import type { PdfPageInfo, PdfPageOutput } from './pdfPages'
import type { PdfPageRequest } from './pdfPages.worker'
export function usePdfPageEditor(mode: 'split' | 'order' | 'rotate') {
  const file = shallowRef<File | null>(null), pages = shallowRef<PdfPageInfo[]>([]), order = shallowRef<number[]>([]), rotations = shallowRef<number[]>([])
  const selection = ref(''), acknowledged = ref(false), saving = ref(false), notice = ref('')
  const worker = () => new Worker(new URL('./pdfPages.worker.ts', import.meta.url), { type: 'module' })
  const inspection = useWorkerTask<PdfPageRequest, { pages: PdfPageInfo[] }>(worker, 30_000)
  const output = useWorkerTask<PdfPageRequest, PdfPageOutput>(worker, 30_000)
  let revision = 0, disposed = false
  function resetOutput() { revision++; output.reset(); acknowledged.value = false; notice.value = '' }
  function clear() { inspection.reset(); pages.value = []; order.value = []; rotations.value = []; resetOutput() }
  watch(file, clear, { flush: 'sync' })
  watch([selection, order, rotations], resetOutput, { flush: 'sync' })
  watch(inspection.result, value => {
    pages.value = value?.pages ?? []; order.value = pages.value.map(page => page.number); rotations.value = pages.value.map(() => 0)
    if (value) selection.value = `1-${value.pages.length}`
  })
  function choose(event: Event) {
    const input = event.target as HTMLInputElement; file.value = input.files?.[0] ?? null; input.value = ''; clear()
    if (file.value && (!file.value.size || file.value.size > 8 * 1024 * 1024)) { file.value = null; notice.value = 'PDF必须为1字节至8MiB。' }
  }
  function inspect() { if (disposed || !file.value || saving.value || inspection.busy.value || output.busy.value) return; clear(); inspection.run({ file: file.value, action: 'inspect' }) }
  function generate() {
    if (disposed || !file.value || !pages.value.length || saving.value || inspection.busy.value || output.busy.value) return
    resetOutput(); output.run({ file: file.value, action: mode, selection: selection.value, order: order.value, rotations: rotations.value })
  }
  function move(index: number, delta: number) {
    if (disposed || saving.value || output.busy.value || !Number.isInteger(index) || ![-1, 1].includes(delta) || index < 0 || index >= order.value.length || index + delta < 0 || index + delta >= order.value.length) return
    const next = [...order.value]; [next[index], next[index + delta]] = [next[index + delta]!, next[index]!]; order.value = next
  }
  function rotate(index: number, value: number) {
    if (disposed || saving.value || output.busy.value || ![0, 90, 180, 270].includes(value) || !Number.isInteger(index) || index < 0 || index >= pages.value.length) return
    const next = [...rotations.value]; next[index] = value; rotations.value = next
  }
  async function saveOutput() {
    const result = output.result.value
    if (disposed || !result || !acknowledged.value || saving.value || output.busy.value) return
    const version = revision; saving.value = true; notice.value = ''
    try { const saved = await saveBinaryOutput(result.bytes, `pages-${mode}.pdf`, () => !disposed && revision === version); if (saved && !disposed && revision === version) notice.value = '已另存新PDF，原文件未修改。' }
    catch (cause) { if (!disposed && revision === version) notice.value = String(cause) }
    finally { if (!disposed) saving.value = false }
  }
  onBeforeUnmount(() => { disposed = true; revision++ })
  return { file, pages, order, rotations, selection, acknowledged, saving, notice, inspection, output, choose, inspect, generate, move, rotate, saveOutput, clear }
}
