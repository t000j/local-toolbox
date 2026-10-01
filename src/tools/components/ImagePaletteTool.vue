<script setup lang="ts">
import { onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { copyText } from '../clipboard'
import { useWorkerTask } from '../useWorkerTask'
import type { extractPalette } from '../palette'
import type { PaletteRequest } from '../palette.worker'
type Result = ReturnType<typeof extractPalette> & { width: number; height: number; sampleWidth: number; sampleHeight: number }
const file = shallowRef<File | null>(null), count = ref(6), alphaThreshold = ref(16), copied = ref(''), copying = ref(false)
const { result, error, busy, reset, cancel, run } = useWorkerTask<PaletteRequest, Result>(() => new Worker(new URL('../palette.worker.ts', import.meta.url), { type: 'module' }), 20_000)
let revision = 0, disposed = false
function clear() { revision++; reset(); copied.value = '' }
watch([file, count, alphaThreshold], clear, { flush: 'sync' })
function choose(event: Event) { const input = event.target as HTMLInputElement; file.value = input.files?.[0] ?? null; input.value = ''; clear() }
function extract() { if (!file.value || busy.value || disposed) return; clear(); run({ file: file.value, count: count.value, alphaThreshold: alphaThreshold.value }) }
async function copy(value: string) {
  if (copying.value || disposed || !result.value) return
  const version = revision; copying.value = true
  try { await copyText(value); if (!disposed && revision === version) copied.value = value }
  catch { if (!disposed && revision === version) error.value = '复制失败，请检查剪贴板权限。' }
  finally { if (!disposed) copying.value = false }
}
onBeforeUnmount(() => { disposed = true; revision++ })
</script>
<template>
  <div class="tool-form">
    <label>静态 PNG / JPEG（最多 16 MiB）<input type="file" accept=".png,.jpg,.jpeg" @change="choose" /></label>
    <div class="action-buttons"><label>颜色数 <input v-model.number="count" type="number" min="1" max="16" /></label><label>最低 Alpha <input v-model.number="alphaThreshold" type="number" min="1" max="255" /></label>
      <button class="primary-button" :disabled="!file || busy" @click="extract">提取调色板</button><button v-if="busy" class="secondary-button" @click="cancel">取消</button><button class="secondary-button" @click="file = null; clear()">清空</button></div>
    <p v-if="file" class="form-hint">{{ file.name }}</p>
    <template v-if="result">
      <p class="form-hint">{{ result.width }} × {{ result.height }} → 取样 {{ result.sampleWidth }} × {{ result.sampleHeight }}，包含 {{ result.includedPixels }} / {{ result.sampledPixels }} 个取样像素</p>
      <div class="palette-grid"><div v-for="color in result.colors" :key="color.hex" class="palette-color"><span :style="{ backgroundColor: color.hex }" :aria-label="color.hex" /><strong>{{ color.hex }}</strong><small>{{ color.percent.toFixed(1) }}%</small><button class="secondary-button" :disabled="copying" @click="copy(color.hex)">{{ copied === color.hex ? '已复制' : '复制' }}</button></div></div>
      <button class="secondary-button" :disabled="copying" @click="copy(result.colors.map(color => color.hex).join('\n'))">{{ copied.includes('\n') ? '已复制全部' : '复制全部 HEX' }}</button>
    </template>
    <p class="form-hint" role="status">{{ error || (busy ? '正在本机取样、量化…' : '') }}</p>
    <p class="form-hint">先按 EXIF 方向校正，再等比例取样到最多 256×256；5位通道直方图与加权中位切分产生代表色，结果可能不是原图中某个精确像素。完全透明像素不计，低于阈值忽略，剩余像素按 Alpha 加权；百分比针对纳入取样的权重，并非原图像素面积，舍入后和可能不恰为100%。</p>
    <p class="form-hint">最多8192边长/1600万像素，20秒线程超时；取消/编辑/离页释放。按WebView的8位sRGB颜色处理，不保证ICC/HDR/高位深保真或感知均匀；透明图不合成背景。不上传、不保存图片或结果，只有显式复制写入剪贴板。</p>
  </div>
</template>
<style scoped>
.action-buttons { flex-wrap: wrap; } label { font-size: 12px; } input[type=number] { width: 65px; } input { max-width: 100%; } .form-hint { overflow-wrap: anywhere; }
.palette-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 10px; } .palette-color { display: grid; gap: 5px; text-align: center; font-size: 12px; } .palette-color span { height: 56px; border: 1px solid var(--line); border-radius: 7px; } .palette-color small { color: var(--muted); }
</style>
