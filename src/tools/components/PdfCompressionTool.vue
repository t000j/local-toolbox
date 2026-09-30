<script setup lang="ts">
import { onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useWorkerTask } from '../useWorkerTask'
import { saveBinaryOutput } from '../binaryExport'
import type { PdfCompressionResult } from '../pdfImageCompression'
const file = shallowRef<File | null>(null), quality = ref(75), acknowledged = ref(false), saving = ref(false), notice = ref('')
const { result, error, busy, reset, cancel, run } = useWorkerTask<{ file: File; quality: number }, PdfCompressionResult>(() => new Worker(new URL('../pdfCompression.worker.ts', import.meta.url), { type: 'module' }), 30_000)
let revision = 0, disposed = false
function clear() { revision++; reset(); acknowledged.value = false; notice.value = '' }
watch([file, quality], clear, { flush: 'sync' })
function choose(event: Event) { const input = event.target as HTMLInputElement; file.value = input.files?.[0] ?? null; input.value = ''; clear(); if (file.value && (!file.value.size || file.value.size > 8 * 1024 * 1024)) { file.value = null; error.value = 'PDF须为1字节至8MiB。' } }
function compress() { if (!file.value || disposed || busy.value || saving.value) return; clear(); run({ file: file.value, quality: quality.value }) }
async function saveOutput() {
  const output = result.value; if (!output || !acknowledged.value || disposed || busy.value || saving.value) return
  const version = revision; saving.value = true; notice.value = ''
  try { const saved = await saveBinaryOutput(output.bytes, 'compressed.pdf', () => !disposed && revision === version); if (saved && !disposed && revision === version) notice.value = '已安全另存，原PDF未修改。' }
  catch (cause) { if (!disposed && revision === version) notice.value = String(cause) }
  finally { if (!disposed) saving.value = false }
}
onBeforeUnmount(() => { disposed = true; revision++ })
</script>
<template>
  <div class="tool-form">
    <label>选择PDF<input type="file" accept=".pdf" :disabled="busy || saving" @change="choose" /></label>
    <p v-if="file" class="form-hint">{{ file.name }} · {{ file.size.toLocaleString() }} 字节</p>
    <label>图片JPEG质量（10–95，越低损失越多）<input v-model.number="quality" type="number" min="10" max="95" step="1" :disabled="busy || saving" /></label>
    <p class="form-hint">有损图片重编码，不把整页变成图片。只重编码证明仅用于直接页面图片槽位的8位DeviceRGB图片，保持尺寸、页序、文字/矢量和页面框；若候选图片不更小则保留原图。照片/扫描文字细节可能明显受损，颜色和元数据也可能变化；缩小体积不保证成功。</p>
    <div class="action-buttons"><button class="primary-button" :disabled="!file || busy || saving" @click="compress">尝试压缩并校验</button><button v-if="busy" class="secondary-button" @click="cancel">取消</button><button class="secondary-button" :disabled="saving" @click="file = null; clear()">清空</button></div>
    <template v-if="result">
      <p>原 {{ result.before.toLocaleString() }} 字节 → 输出 {{ result.after.toLocaleString() }} 字节（{{ ((1 - result.after / result.before) * 100).toFixed(1) }}%减少）</p>
      <p class="form-hint">{{ result.pages }} 页 · 图片资源 {{ result.images }} 个 · 重编码 {{ result.changed }} 个 · 保留原样 {{ result.skipped }} 个</p>
      <p v-if="result.after >= result.before" class="form-hint">此次没有变小。保存结构开销、原文件已经优化或没有合适图片都可能导致无收益；可保留原文件，不必另存。</p>
      <ul><li v-for="reason in result.reasons" :key="reason">{{ reason }}</li></ul>
      <label><input v-model="acknowledged" type="checkbox" :disabled="saving" />已理解有损质量/色彩变化和体积比较，愿意另存此结果</label>
      <button class="primary-button" :disabled="!acknowledged || saving" @click="saveOutput">{{ saving ? '保存中…' : '另存新PDF（不覆盖）' }}</button>
    </template>
    <p class="form-hint" role="status">{{ error || notice || (busy ? '本机逐张重编码并重读校验…' : '') }}</p>
    <p class="form-hint">当前部分实现：共用静态PDF准入支持经典xref/有界对象流；加密、表单/签名、链接/注释、脚本/附件、混合/增量xref等会拒绝，不静默移除。图片仅支持原始RGB、无预测器单层Flate、方向1且无ICC的三通道JPEG；透明蒙版、ICC/CMYK、其他编码/特殊参数、Form内图片或共享绘制/字体/元数据用途的流保留原样并报告。不降采样、无整页栅格化、不是恶意文件清洗或匿名化工具。仅处理可信输入。</p>
    <p class="form-hint">输入8MiB/输出16MiB/200页/64个图片资源；每图400万像素/4096边长，处理像素总计1600万；30秒Worker超时，逐张释放Bitmap/Canvas，编辑/取消/离页终止。只保存重编码图片实际更小的替换；若全无替换，结果逐字节等于原输入。Windows保存/真实Canvas未验证。</p>
  </div>
</template>
<style scoped>
.action-buttons { flex-wrap: wrap; } .form-hint, li { overflow-wrap: anywhere; } label, li { font-size: 12px; } input { max-width: 100%; }
</style>
