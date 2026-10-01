<script setup lang="ts">
import { shallowRef } from 'vue'
import { useWorkerTask } from '../useWorkerTask'
import type { parseImageHeader } from '../imageHeaders'
const file = shallowRef<File | null>(null)
const { result, error, busy, cancel, reset, run } = useWorkerTask<File, ReturnType<typeof parseImageHeader>>(
  () => new Worker(new URL('../imageHeaders.worker.ts', import.meta.url), { type: 'module' }), 10_000,
)
function choose(event: Event) {
  const input = event.target as HTMLInputElement
  file.value = input.files?.[0] ?? null; input.value = ''; reset()
  if (file.value) run(file.value)
}
function clear() { file.value = null; reset() }
</script>
<template>
  <div class="tool-form">
    <label>选择 PNG / JPEG（最多 16 MiB）<input type="file" accept=".png,.jpg,.jpeg" @change="choose" /></label>
    <div class="action-buttons"><button v-if="busy" class="secondary-button" @click="cancel">取消</button><button class="secondary-button" @click="clear">清空</button></div>
    <p class="form-hint" role="status">{{ error || (busy ? '正在本机读取图片头及支持的元数据…' : '') }}</p>
    <template v-if="result">
      <p class="form-hint">{{ file?.name }} · {{ file?.size.toLocaleString() }} 字节 · {{ result.format.toUpperCase() }}</p>
      <p class="form-hint">原始像素 {{ result.width }} × {{ result.height }} · EXIF 方向 {{ result.orientation }} · 显示尺寸 {{ result.orientation >= 5 ? result.height : result.width }} × {{ result.orientation >= 5 ? result.width : result.height }} · {{ result.animated ? '含动画标记' : '未发现支持的动画标记' }}</p>
      <dl class="metadata-grid"><template v-for="(field, i) in result.fields" :key="i"><dt>{{ field.name }}</dt><dd>{{ field.value }}</dd></template></dl>
    </template>
    <p class="form-hint">只读图片头，不解码像素、不上传、不修改或自动保存。最多 8192 边长/1600 万像素，10 秒线程超时。读取结果来自未经信任的文件，不能证明拍摄时间、设备或位置真实。</p>
    <p class="form-hint">仅展示受支持的 PNG/JPEG 头及有限 EXIF 标签，文本安全显示；不完整解析 MakerNote、XMP、IPTC 或 ICC 配置文件。颜色字段是声明信息，不能等同于显示校准或色彩准确性。未显示某字段不代表文件没有该信息或已清除隐私；分享前注意 GPS、设备及时间。</p>
  </div>
</template>
<style scoped>
.action-buttons { flex-wrap: wrap; } .form-hint { overflow-wrap: anywhere; }
.metadata-grid { display: grid; grid-template-columns: minmax(100px, 160px) minmax(0, 1fr); gap: 8px 16px; font-size: 12px; }
dt { color: var(--muted); } dd { margin: 0; overflow-wrap: anywhere; white-space: pre-wrap; } input { max-width: 100%; }
</style>
