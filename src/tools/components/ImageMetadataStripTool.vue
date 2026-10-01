<script setup lang="ts">
import { onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useWorkerTask } from '../useWorkerTask'
import { saveBinaryOutput } from '../binaryExport'
import type { stripImageMetadata } from '../imageMetadataStrip'
const file = shallowRef<File | null>(null), saving = ref(false), notice = ref(''), acknowledged = ref(false)
const { result, error, busy, reset, cancel, run } = useWorkerTask<File, ReturnType<typeof stripImageMetadata>>(
  () => new Worker(new URL('../imageMetadataStrip.worker.ts', import.meta.url), { type: 'module' }), 10_000,
)
let revision = 0, disposed = false
function clear() { revision++; reset(); notice.value = ''; acknowledged.value = false }
watch(file, clear, { flush: 'sync' })
function choose(event: Event) {
  const input = event.target as HTMLInputElement
  file.value = input.files?.[0] ?? null; input.value = ''; clear()
}
function strip() { if (!file.value || busy.value || saving.value) return; clear(); run(file.value) }
async function saveOutput() {
  const output = result.value
  if (!output || !acknowledged.value || busy.value || saving.value || disposed) return
  const version = revision; saving.value = true; notice.value = ''
  try {
    const saved = await saveBinaryOutput(output.bytes, `image-stripped.${output.format === 'jpeg' ? 'jpg' : 'png'}`, () => !disposed && revision === version)
    if (saved && !disposed && revision === version) notice.value = '已另存新文件；原图未修改。'
  } catch (cause) { if (!disposed) notice.value = String(cause) }
  finally { if (!disposed) saving.value = false }
}
onBeforeUnmount(() => { disposed = true; revision++ })
</script>
<template>
  <div class="tool-form">
    <label>静态 PNG / JPEG，最多 16 MiB <input type="file" accept=".png,.jpg,.jpeg" :disabled="saving" @change="choose" /></label>
    <p v-if="file" class="form-hint">{{ file.name }} · {{ file.size.toLocaleString() }} 字节</p>
    <div class="action-buttons"><button class="primary-button" :disabled="!file || busy || saving" @click="strip">移除常见隐私元数据并预览</button>
      <button v-if="busy" class="secondary-button" @click="cancel">取消</button><button class="secondary-button" :disabled="saving" @click="file = null; clear()">清空</button></div>
    <p class="form-hint">容器级删除相机、GPS、时间、XMP、IPTC、注释和文本等元数据；不解码或重编码像素，校验压缩像素内容保持一致。保留显示需要的最小方向、透明度、像素比例及支持的色彩信息，避免因清除而旋转或变色。</p>
    <template v-if="result">
      <p class="form-hint">{{ result.format.toUpperCase() }} · {{ result.before.width }} × {{ result.before.height }} · {{ file?.size.toLocaleString() }} → {{ result.bytes.length.toLocaleString() }} 字节 · 删除或净化 {{ result.removed }} 个段/块</p>
      <p class="form-hint">保留项：</p><ul><li v-for="(item, i) in result.retained" :key="i">{{ item }}</li></ul>
      <p class="form-hint">处理后可读元数据（仅支持的字段，不是全量隐私审计）：</p>
      <dl><template v-for="(field, i) in result.after.fields" :key="i"><dt>{{ field.name }}</dt><dd>{{ field.value }}</dd></template></dl>
      <label><input v-model="acknowledged" type="checkbox" :disabled="saving" />我理解：保留的 ICC 配置本身可能含识别信息，像素中的人脸/文字/位置也不会清除；结果不保证匿名</label>
      <button class="primary-button" :disabled="!acknowledged || saving || busy" @click="saveOutput">{{ saving ? '保存中…' : '另存新文件（不覆盖）' }}</button>
    </template>
    <p class="form-hint" role="status">{{ error || notice || (busy ? '本机删除与字节校验中…' : '') }}</p>
    <p class="form-hint">不处理动画、HEIF/AVIF/GIF/WebP/TIFF、未支持的 HDR 或色彩声明；不静默转静态图或重编码。最多 8192 边长/1600 万像素、10 秒线程超时，可取消/离页。只在 Windows 桌面版另存，复用安全新建文件，拒绝覆盖/重解析路径；保存提交后无法撤回。原图和结果不上传、不自动保存。</p>
  </div>
</template>
<style scoped>
.action-buttons { flex-wrap: wrap; } .form-hint { overflow-wrap: anywhere; }
label, li, dl { font-size: 12px; } input { max-width: 100%; } dl { display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 6px 12px; } dd { margin: 0; overflow-wrap: anywhere; } dt { color: var(--muted); }
</style>
