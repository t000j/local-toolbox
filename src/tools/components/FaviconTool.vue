<script setup lang="ts">
import { onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useWorkerTask } from '../useWorkerTask'
import { saveBinaryOutput } from '../binaryExport'
import { FAVICON_PNG_SIZES, type FaviconRequest, type FaviconResult } from '../favicon'
const file = shallowRef<File | null>(null), format = ref<'png' | 'ico'>('ico'), size = ref(32), fit = ref<'contain' | 'cover'>('contain')
const saving = ref(false), notice = ref(''), preview = ref('')
const { result, error, busy, reset, cancel, run } = useWorkerTask<FaviconRequest, FaviconResult>(() => new Worker(new URL('../favicon.worker.ts', import.meta.url), { type: 'module' }), 30_000)
let revision = 0, disposed = false
function clear() { revision++; reset(); notice.value = '' }
watch([file, format, size, fit], clear, { flush: 'sync' })
watch(result, value => { if (preview.value) URL.revokeObjectURL(preview.value); preview.value = value ? URL.createObjectURL(new Blob([new Uint8Array(value.preview)], { type: 'image/png' })) : '' }, { flush: 'sync' })
function choose(event: Event) { const input = event.target as HTMLInputElement; file.value = input.files?.[0] ?? null; input.value = ''; clear() }
function generate() { if (!file.value || busy.value || saving.value || disposed) return; clear(); run({ file: file.value, format: format.value, size: size.value, fit: fit.value }) }
async function saveOutput() {
  const output = result.value
  if (!output || saving.value || busy.value || disposed) return
  const version = revision; saving.value = true; notice.value = ''
  try { const saved = await saveBinaryOutput(output.bytes, `favicon.${output.format}`, () => !disposed && revision === version); if (saved && !disposed && revision === version) notice.value = '已另存新图标；原图未修改。' }
  catch (cause) { if (!disposed) notice.value = String(cause) }
  finally { if (!disposed) saving.value = false }
}
onBeforeUnmount(() => { disposed = true; revision++; if (preview.value) URL.revokeObjectURL(preview.value); preview.value = '' })
</script>
<template>
  <div class="tool-form">
    <label>静态 PNG / JPEG，最多 16 MiB <input type="file" accept=".png,.jpg,.jpeg" :disabled="saving" @change="choose" /></label>
    <div class="action-buttons"><label>输出 <select v-model="format" :disabled="saving"><option value="ico">多尺寸 ICO</option><option value="png">单尺寸 PNG</option></select></label>
      <label v-if="format === 'png'">尺寸 <select v-model.number="size" :disabled="saving"><option v-for="value in FAVICON_PNG_SIZES" :key="value" :value="value">{{ value }} × {{ value }}</option></select></label>
      <label>适配 <select v-model="fit" :disabled="saving"><option value="contain">完整缩入，透明留白</option><option value="cover">居中裁切，填满方形</option></select></label>
      <button class="primary-button" :disabled="!file || busy || saving" @click="generate">生成并预览</button><button v-if="busy" class="secondary-button" @click="cancel">取消</button><button class="secondary-button" :disabled="saving" @click="file = null; clear()">清空</button></div>
    <template v-if="result">
      <p class="form-hint">{{ result.width }} × {{ result.height }} → {{ result.sizes.join(' / ') }} px · {{ result.bytes.length.toLocaleString() }} 字节</p>
      <div class="icon-preview"><img :src="preview" alt="最大尺寸图标预览（显示大小不代表实际像素）" /></div>
      <button class="primary-button" :disabled="saving" @click="saveOutput">{{ saving ? '保存中…' : '另存新图标' }}</button>
    </template>
    <p class="form-hint" role="status">{{ error || notice || (busy ? '正在本机生成图标…' : '') }}</p>
    <p class="form-hint">ICO 包含16/32/48/64/128/256像素的PNG图层，面向现代浏览器和Windows Vista及之后的PNG-in-ICO读取器；不提供旧式BMP图层或SVG。PNG可选16–512常见尺寸，含180/192/512。居中裁切会去掉长边两端，留白模式保留完整图像；允许放大但不能恢复细节。</p>
    <p class="form-hint">EXIF方向校正后通过Canvas输出8位颜色/透明度，不复制原元数据，不承诺ICC/HDR/高位深保真；动画拒绝。输入8192边长/1600万像素、输出2 MiB、30秒超时；编辑/取消/离页释放。Windows桌面版安全另存，不覆盖；提交保存后无法撤回。不上传、不自动保存。</p>
  </div>
</template>
<style scoped>
.action-buttons { flex-wrap: wrap; } label { font-size: 12px; } input { max-width: 100%; } .form-hint { overflow-wrap: anywhere; }
.icon-preview { width: 180px; height: 180px; padding: 10px; background: conic-gradient(#ddd 25%, white 0 50%, #ddd 0 75%, white 0) 0 0 / 16px 16px; border: 1px solid var(--line); } .icon-preview img { width: 160px; height: 160px; object-fit: contain; }
</style>
