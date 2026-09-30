<script setup lang="ts">
import { ref, shallowRef, watch } from 'vue'
import { validateImageFiles } from '../imageProcessing'
import { useImageOutput } from '../useImageOutput'
import ImageOutputPanel from './ImageOutputPanel.vue'
const files = shallowRef<File[]>([]), mode = ref<'pixels' | 'percent'>('pixels')
const width = ref(1024), height = ref(1024), percent = ref(50), keepAspect = ref(true)
const { result, error, busy, cancel, run, clear, preview, index, saving, notice, saveOutput } = useImageOutput()
watch([files, mode, width, height, percent, keepAspect], clear, { flush: 'sync' })
function choose(event: Event) {
  const input = event.target as HTMLInputElement
  files.value = Array.from(input.files ?? []); input.value = ''
  try { validateImageFiles(files.value) } catch (cause) { files.value = []; error.value = String(cause) }
}
function resize() {
  if (busy.value || saving.value || !files.value.length) return
  clear(); run({ files: files.value, resize: { mode: mode.value, width: width.value, height: height.value, percent: percent.value, keepAspect: keepAspect.value } })
}
</script>
<template>
  <div class="tool-form">
    <label>选择 1–8 张 PNG / JPEG <input type="file" accept=".png,.jpg,.jpeg" multiple :disabled="saving" @change="choose" /></label>
    <p class="form-hint">已选择 {{ files.length }} 张图片。像素模式可指定准确尺寸，或保持比例缩入宽高框；比例模式分别按各张原图计算。像素取最近整数，最小 1 像素。</p>
    <div class="action-buttons">
      <label>方式 <select v-model="mode" :disabled="saving"><option value="pixels">像素</option><option value="percent">比例</option></select></label>
      <template v-if="mode === 'pixels'">
        <label>宽 <input v-model.number="width" type="number" min="1" max="8192" :disabled="saving" /></label>
        <label>高 <input v-model.number="height" type="number" min="1" max="8192" :disabled="saving" /></label>
        <label><input v-model="keepAspect" type="checkbox" :disabled="saving" />保持比例（缩入框，可放大）</label>
      </template>
      <label v-else>百分比 <input v-model.number="percent" type="number" min="1" max="800" step="0.1" :disabled="saving" />%</label>
    </div>
    <div class="action-buttons"><button class="primary-button" :disabled="!files.length || busy || saving" @click="resize">缩放并预览全部</button>
      <button v-if="busy" class="secondary-button" @click="cancel">取消</button>
      <button class="secondary-button" :disabled="saving" @click="files = []; clear()">清空</button></div>
    <p class="form-hint" role="status">{{ error || notice || (busy ? '正在顺序处理；整批成功后显示结果…' : '') }}</p>
    <ImageOutputPanel v-model:index="index" :outputs="result" :preview="preview" :saving="saving" :busy="busy" @save="saveOutput" />
  </div>
</template>
<style scoped>
input[type=number] { width: 90px; } input[type=file] { max-width: 100%; } label { font-size: 12px; }
</style>
