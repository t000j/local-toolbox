<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useWorkerTask } from '../useWorkerTask'
import { saveBinaryOutput } from '../binaryExport'
import type { ImagePdfOptions } from '../imagePdfGeometry'
import type { ImagePdfResult } from '../imagePdf'
const files = shallowRef<File[]>([]), page = ref<ImagePdfOptions['page']>('a4'), orientation = ref<ImagePdfOptions['orientation']>('auto'), marginMm = ref(10), dpi = ref(96), encoding = ref<ImagePdfOptions['encoding']>('png'), quality = ref(80)
const acknowledged = ref(false), saving = ref(false), notice = ref('')
const options = computed<ImagePdfOptions>(() => ({ page: page.value, orientation: orientation.value, marginMm: marginMm.value, dpi: dpi.value, encoding: encoding.value, quality: quality.value }))
const { result, error, busy, reset, cancel, run } = useWorkerTask<{ files: File[]; options: ImagePdfOptions }, ImagePdfResult>(() => new Worker(new URL('../imagePdf.worker.ts', import.meta.url), { type: 'module' }), 45_000)
let revision = 0, disposed = false
function clear() { revision++; reset(); acknowledged.value = false; notice.value = '' }
watch([files, page, orientation, marginMm, dpi, encoding, quality], clear, { flush: 'sync' })
function choose(event: Event) {
  const input = event.target as HTMLInputElement; files.value = Array.from(input.files ?? []); input.value = ''; clear()
  if (files.value.length > 8 || files.value.some(file => !file.size || file.size > 16 * 1024 * 1024) || files.value.reduce((sum, file) => sum + file.size, 0) > 32 * 1024 * 1024) { files.value = []; error.value = '最多8张，每图16MiB、输入合计32MiB。' }
}
function move(index: number, delta: number) { if (busy.value || saving.value || disposed || !Number.isInteger(index) || index < 0 || index >= files.value.length || ![-1, 1].includes(delta) || index + delta < 0 || index + delta >= files.value.length) return; const next = [...files.value]; [next[index], next[index + delta]] = [next[index + delta]!, next[index]!]; files.value = next }
function generate() { if (!files.value.length || busy.value || saving.value || disposed) return; clear(); run({ files: files.value, options: options.value }) }
async function saveOutput() {
  const output = result.value; if (!output || !acknowledged.value || busy.value || saving.value || disposed) return
  const version = revision; saving.value = true; notice.value = ''
  try { const saved = await saveBinaryOutput(output.bytes, 'images.pdf', () => !disposed && revision === version); if (saved && !disposed && revision === version) notice.value = '已另存新PDF，原图片未修改。' }
  catch (cause) { if (!disposed && revision === version) notice.value = String(cause) }
  finally { if (!disposed) saving.value = false }
}
onBeforeUnmount(() => { disposed = true; revision++ })
</script>
<template>
  <div class="tool-form">
    <label>选择1–8张静态PNG/JPEG（重新选择替换列表）<input type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" multiple :disabled="busy || saving" @change="choose" /></label>
    <ol class="file-list"><li v-for="(file, i) in files" :key="i"><span>{{ i + 1 }}. {{ file.name }}</span><button class="secondary-button" :disabled="i === 0 || busy || saving" :aria-label="'上移第' + (i + 1) + '张'" @click="move(i, -1)">↑</button><button class="secondary-button" :disabled="i === files.length - 1 || busy || saving" :aria-label="'下移第' + (i + 1) + '张'" @click="move(i, 1)">↓</button><button class="secondary-button" :disabled="busy || saving" @click="files = files.filter((_, index) => index !== i)">移除</button></li></ol>
    <div class="option-row"><label>页面<select v-model="page" :disabled="busy || saving"><option value="a4">A4</option><option value="letter">Letter</option><option value="image">按图片像素/DPI</option></select></label><label v-if="page !== 'image'">纸张方向<select v-model="orientation" :disabled="busy || saving"><option value="auto">跟随校正后图片横竖</option><option value="portrait">纵向</option><option value="landscape">横向</option></select></label><label>边距毫米（0–50）<input v-model.number="marginMm" type="number" min="0" max="50" step="1" :disabled="busy || saving" /></label><label v-if="page === 'image'">图片DPI（36–300）<input v-model.number="dpi" type="number" min="36" max="300" step="1" :disabled="busy || saving" /></label></div>
    <div class="option-row"><label>嵌入编码<select v-model="encoding" :disabled="busy || saving"><option value="png">PNG：保留透明度</option><option value="jpeg">JPEG：白底、有损</option></select></label><label v-if="encoding === 'jpeg'">JPEG质量（10–95）<input v-model.number="quality" type="number" min="10" max="95" step="1" :disabled="busy || saving" /></label></div>
    <p class="form-hint">一张图片一页，按清单顺序。解码时校正EXIF方向（含镜像），等比例完整居中放入边距，不拉伸/不裁切；A4/Letter可能放大图片。按图片模式以像素/DPI确定物理大小，边距另外增加，不采信文件内DPI标签。</p>
    <div class="action-buttons"><button class="primary-button" :disabled="!files.length || busy || saving" @click="generate">生成并校验PDF</button><button v-if="busy" class="secondary-button" @click="cancel">取消</button><button class="secondary-button" :disabled="saving" @click="files = []; clear()">清空</button></div>
    <template v-if="result"><p>{{ result.pages.length }}页 · {{ result.bytes.length.toLocaleString() }}字节</p><ol><li v-for="(item, index) in result.pages" :key="index">{{ item.name }}：{{ item.imageWidth }}×{{ item.imageHeight }}像素 → {{ item.width.toFixed(2) }}×{{ item.height.toFixed(2) }} PDF点</li></ol><label><input v-model="acknowledged" type="checkbox" :disabled="saving" />已确认顺序、页面尺寸和编码限制</label><button class="primary-button" :disabled="!acknowledged || saving" @click="saveOutput">{{ saving ? '保存中…' : '另存新PDF（不覆盖）' }}</button></template>
    <p class="form-hint" role="status">{{ error || notice || (busy ? '本机依次校正图片并生成PDF…' : '') }}</p>
    <p class="form-hint">Canvas统一为8位图像，原EXIF/ICC/文本块不直接复制；不承诺ICC/HDR/高位深色彩保真或原文件像素编码不变。PNG保留绘制后的Alpha，JPEG明确合成白底并有损压缩；PDF内图片文字不可选择，不含OCR。动画/APNG/其他格式拒绝，不静默取首帧；图片内容中的隐私不清除。</p>
    <p class="form-hint">每图16MiB/4096边长/400万像素，最多8张/输入32MiB/累计1600万像素，规范化数据及PDF各32MiB内，45秒Worker超时，逐张释放Bitmap/Canvas。PNG进入PDF库前校验IDAT解压长度防止无界展开；输出重读核对页数/几何/图片尺寸。真实浏览器方向/Canvas与Windows保存尚未验证，不上传或自动保存。</p>
  </div>
</template>
<style scoped>
.action-buttons,.option-row { display: flex; flex-wrap: wrap; gap: 8px; } label,li { font-size: 12px; } input { max-width: 100%; } .form-hint,li { overflow-wrap: anywhere; } .file-list { padding: 0; list-style: none; } .file-list li { display: flex; align-items: center; gap: 6px; margin: 6px 0; } .file-list span { flex: 1; min-width: 0; }
</style>
