<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useWorkerTask } from '../useWorkerTask'
import { renderPdfThumbnails } from '../pdfThumbnails'
import type { PdfPageInfo, PdfPageOutput } from '../pdfPages'
import type { PdfPageRequest } from '../pdfPages.worker'
const props = defineProps<{ file: File; pages: PdfPageInfo[]; order: number[]; disabled: boolean }>()
const emit = defineEmits<{ move: [index: number, delta: number] }>()
const start = ref(0), rendering = ref(false), notice = ref(''), urls = shallowRef<string[]>([])
const visible = computed(() => props.order.slice(start.value, start.value + 12))
const { result, busy, error, reset, run } = useWorkerTask<PdfPageRequest, PdfPageOutput>(() => new Worker(new URL('../pdfPages.worker.ts', import.meta.url), { type: 'module' }), 30_000)
let controller: AbortController | undefined, revision = 0, disposed = false
function clear() { revision++; reset(); controller?.abort(); controller = undefined; rendering.value = false; notice.value = ''; urls.value.forEach(URL.revokeObjectURL); urls.value = [] }
watch(() => [props.file, props.order, props.disabled, start.value], clear, { flush: 'sync' })
function preview() { if (disposed || props.disabled || busy.value || rendering.value) return; clear(); run({ file: props.file, action: 'preview', order: [...visible.value] }) }
watch(result, async output => {
  if (!output) return
  const version = revision, current = new AbortController(); controller = current; rendering.value = true
  try {
    const blobs = await renderPdfThumbnails(output.bytes, output.pages.length, current.signal)
    if (disposed || revision !== version) return
    const created: string[] = []
    try { for (const blob of blobs) created.push(URL.createObjectURL(blob)); urls.value = created }
    catch (cause) { created.forEach(URL.revokeObjectURL); throw cause }
  } catch (cause) { if (!disposed && revision === version) notice.value = String(cause) }
  finally { if (!disposed && revision === version) rendering.value = false }
})
onBeforeUnmount(() => { disposed = true; clear() })
</script>
<template>
  <section>
    <div class="action-buttons"><button class="secondary-button" :disabled="start === 0 || disabled" @click="start = Math.max(0, start - 12)">前12页</button><span>列表位置 {{ start + 1 }}–{{ Math.min(start + 12, order.length) }}</span><button class="secondary-button" :disabled="start + 12 >= order.length || disabled" @click="start += 12">后12页</button><button class="primary-button" :disabled="disabled || busy || rendering" @click="preview">生成这组缩略图</button><button v-if="busy || rendering" class="secondary-button" @click="clear">取消预览</button></div>
    <p class="form-hint" role="status">{{ error || notice || (busy || rendering ? '校验资源并绘制缩略图…' : '') }}</p>
    <ol class="thumbnail-grid"><li v-for="(number, i) in visible" :key="number">
      <img v-if="urls[i]" :src="urls[i]" :alt="'原第' + number + '页内容缩略图'" /><div v-else class="placeholder">尚未生成内容预览</div>
      <p>位置 {{ start + i + 1 }} · 原第 {{ number }} 页<br />{{ pages[number - 1]?.width }} × {{ pages[number - 1]?.height }} · {{ pages[number - 1]?.rotation }}°</p>
      <button class="secondary-button" :disabled="start + i === 0 || disabled" :aria-label="'上移原第' + number + '页'" @click="emit('move', start + i, -1)">↑</button><button class="secondary-button" :disabled="start + i === order.length - 1 || disabled" :aria-label="'下移原第' + number + '页'" @click="emit('move', start + i, 1)">↓</button>
    </li></ol>
    <p class="form-hint">缩略图使用本地PDF.js，按12页一组显式生成；改变顺序后预览清空，按需重新生成。最长边256像素、白底，仅供辨认页序，非色彩/字体保真证明。预览比页面导出更严格：仅支持未压缩/单层Flate流，无DecodeParms，资源解压总量32MiB；BI内联图像/疑似字节、参数别名、函数/平铺/渐变、JPEG/JPX等其他压缩资源、额外CMap可能导致预览拒绝或不可用，不用空白图冒充内容。处理原文档仍按全部200页清单，当前分组不会删页。</p>
  </section>
</template>
<style scoped>
.action-buttons { align-items: center; flex-wrap: wrap; } .thumbnail-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; padding: 0; list-style: none; } li { border: 1px solid var(--line); border-radius: 8px; padding: 8px; font-size: 12px; overflow: hidden; } img { display: block; width: 100%; height: 180px; object-fit: contain; background: white; } .placeholder { height: 180px; display: grid; place-items: center; color: var(--muted); border: 1px dashed var(--line); } .form-hint { overflow-wrap: anywhere; }
</style>
