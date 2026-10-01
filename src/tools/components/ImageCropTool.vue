<script setup lang="ts">
import { ref, shallowRef, watch } from 'vue'
import { useWorkerTask } from '../useWorkerTask'
import type { parseImageHeader } from '../imageHeaders'
import { useImageOutput } from '../useImageOutput'
import ImageOutputPanel from './ImageOutputPanel.vue'
const file = shallowRef<File | null>(null), x = ref(0), y = ref(0), width = ref(1), height = ref(1)
const rotation = ref(0), flipX = ref(false), flipY = ref(false)
const header = useWorkerTask<File, ReturnType<typeof parseImageHeader>>(() => new Worker(new URL('../imageHeaders.worker.ts', import.meta.url), { type: 'module' }), 10_000)
const { result, error, busy, cancel, run, clear, preview, index, saving, notice, saveOutput } = useImageOutput()
watch([file, x, y, width, height, rotation, flipX, flipY], clear, { flush: 'sync' })
watch(header.result, info => {
  if (!info) return
  x.value = 0; y.value = 0; rotation.value = 0; flipX.value = false; flipY.value = false
  width.value = info.orientation >= 5 ? info.height : info.width; height.value = info.orientation >= 5 ? info.width : info.height
}, { flush: 'sync' })
function choose(event: Event) {
  const input = event.target as HTMLInputElement
  file.value = input.files?.[0] ?? null; input.value = ''; header.reset()
  if (file.value) header.run(file.value)
}
function edit() {
  if (!file.value || !header.result.value || header.busy.value || busy.value || saving.value) return
  clear(); run({ files: [file.value], crop: { x: x.value, y: y.value, width: width.value, height: height.value, rotation: rotation.value, flipX: flipX.value, flipY: flipY.value } })
}
function clearAll() { file.value = null; header.reset(); clear() }
</script>
<template>
  <div class="tool-form">
    <label>选择静态 PNG / JPEG <input type="file" accept=".png,.jpg,.jpeg" :disabled="saving" @change="choose" /></label>
    <p v-if="header.result.value" class="form-hint">{{ file?.name }} · 原始 {{ header.result.value.width }} × {{ header.result.value.height }} · EXIF 方向 {{ header.result.value.orientation }}</p>
    <p class="form-hint">坐标原点是 EXIF 方向校正后的左上角，先裁切、再顺时针旋转、最后按输出画面轴翻转。初始为整张；可仅旋转或翻转。输入坐标与尺寸为整数像素，先生成预览确认区域，再另存。</p>
    <div class="action-buttons">
      <label>X <input v-model.number="x" type="number" min="0" :disabled="saving" /></label>
      <label>Y <input v-model.number="y" type="number" min="0" :disabled="saving" /></label>
      <label>宽 <input v-model.number="width" type="number" min="1" max="8192" :disabled="saving" /></label>
      <label>高 <input v-model.number="height" type="number" min="1" max="8192" :disabled="saving" /></label>
      <label>顺时针 <select v-model.number="rotation" :disabled="saving"><option v-for="angle in [0, 90, 180, 270]" :key="angle" :value="angle">{{ angle }}°</option></select></label>
      <label><input v-model="flipX" type="checkbox" :disabled="saving" />水平翻转</label><label><input v-model="flipY" type="checkbox" :disabled="saving" />垂直翻转</label>
    </div>
    <div class="action-buttons"><button class="primary-button" :disabled="!header.result.value || busy || header.busy.value || saving" @click="edit">编辑并预览</button>
      <button v-if="busy || header.busy.value" class="secondary-button" @click="cancel(); header.cancel()">取消</button>
      <button class="secondary-button" :disabled="saving" @click="clearAll">清空</button></div>
    <p class="form-hint" role="status">{{ error || header.error.value || notice || ((busy || header.busy.value) ? '本机处理中…' : '') }}</p>
    <ImageOutputPanel v-model:index="index" :outputs="result" :preview="preview" :saving="saving" :busy="busy" @save="saveOutput" />
  </div>
</template>
<style scoped>
.action-buttons { flex-wrap: wrap; } .form-hint { overflow-wrap: anywhere; }
input[type=number] { width: 78px; } input[type=file] { max-width: 100%; } label { font-size: 12px; }
</style>
