import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useWorkerTask } from './useWorkerTask'
import { saveBinaryOutput } from './binaryExport'
import type { ImageOutput, ImageRequest } from './imageProcessing'
export function useImageOutput() {
  const task = useWorkerTask<ImageRequest, ImageOutput[]>(() => new Worker(new URL('./imageProcessing.worker.ts', import.meta.url), { type: 'module' }), 30_000)
  const index = ref(0), preview = ref(''), saving = ref(false), notice = ref('')
  const selected = computed(() => task.result.value?.[index.value] ?? null)
  let revision = 0, disposed = false
  function clear() { revision++; task.reset(); notice.value = ''; index.value = 0 }
  watch(selected, item => {
    if (preview.value) URL.revokeObjectURL(preview.value)
    preview.value = item ? URL.createObjectURL(new Blob([new Uint8Array(item.bytes)], { type: 'image/png' })) : ''
  }, { flush: 'sync' })
  async function saveOutput() {
    const output = selected.value
    if (!output || saving.value || disposed || task.busy.value) return
    const version = revision; saving.value = true; notice.value = ''
    try {
      const saved = await saveBinaryOutput(output.bytes, 'image-edited.png', () => !disposed && version === revision)
      if (saved && !disposed && version === revision) notice.value = '已另存新 PNG 文件；未覆盖原图。'
    } catch (cause) { if (!disposed) notice.value = String(cause) }
    finally { if (!disposed) saving.value = false }
  }
  onBeforeUnmount(() => { disposed = true; revision++; if (preview.value) URL.revokeObjectURL(preview.value); preview.value = '' })
  return { ...task, index, preview, saving, notice, selected, clear, saveOutput }
}
