<script setup lang="ts">
import { onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { renderPdfRaster } from '../pdfRaster'
import type { PdfRasterOutput } from '../pdfRaster'
import { parsePageSelection } from '../pdfPageSelection'
import { saveBinaryOutput } from '../binaryExport'
const file = shallowRef<File | null>(null), selection = ref('1'), dpi = ref(96), format = ref<'png' | 'jpeg'>('png'), quality = ref(80)
const result = shallowRef<PdfRasterOutput | null>(null), urls = shallowRef<string[]>([]), busy = ref(false), saving = ref(false), notice = ref('')
let controller: AbortController | undefined, revision = 0, disposed = false
function clear() { revision++; controller?.abort(); controller = undefined; busy.value = false; result.value = null; notice.value = ''; urls.value.forEach(URL.revokeObjectURL); urls.value = [] }
watch([file, selection, dpi, format, quality], clear, { flush: 'sync' })
function choose(event: Event) { const input = event.target as HTMLInputElement; file.value = input.files?.[0] ?? null; input.value = ''; clear(); if (file.value && (!file.value.size || file.value.size > 8 * 1024 * 1024)) { file.value = null; notice.value = 'PDF须为1字节至8MiB。' } }
async function generate() {
  if (!file.value || busy.value || saving.value || disposed) return
  clear(); const version = revision, current = new AbortController(); controller = current; busy.value = true
  try {
    const pages = parsePageSelection(selection.value, 200)
    if (pages.length > 8) throw new Error('每批最多选择8页。')
    const output = await renderPdfRaster(file.value, { pages, dpi: dpi.value, format: format.value, quality: quality.value / 100 }, current.signal)
    if (disposed || revision !== version) return
    const created: string[] = []
    try { for (const image of output.images) created.push(URL.createObjectURL(new Blob([new Uint8Array(image.bytes)], { type: output.mime }))); urls.value = created }
    catch (cause) { created.forEach(URL.revokeObjectURL); throw cause }
    result.value = output
  } catch (cause) { if (!disposed && revision === version) notice.value = String(cause) }
  finally { if (!disposed && revision === version) busy.value = false }
}
async function saveImage(index: number) {
  const output = result.value, image = output?.images[index]
  if (!output || !image || busy.value || saving.value || disposed) return
  const version = revision; saving.value = true; notice.value = ''
  try { const saved = await saveBinaryOutput(image.bytes, `page-${String(image.page).padStart(4, '0')}.${output.format === 'jpeg' ? 'jpg' : 'png'}`, () => !disposed && revision === version); if (saved && !disposed && revision === version) notice.value = `已另存原第${image.page}页。` }
  catch (cause) { if (!disposed && revision === version) notice.value = String(cause) }
  finally { if (!disposed) saving.value = false }
}
onBeforeUnmount(() => { disposed = true; clear() })
</script>
<template>
  <div class="tool-form">
    <label>PDF文件<input type="file" accept=".pdf" :disabled="busy || saving" @change="choose" /></label>
    <p v-if="file" class="form-hint">{{ file.name }}</p>
    <label>页码/升序范围（每批1–8页）<input v-model="selection" maxlength="2000" placeholder="1-3,5" :disabled="busy || saving" /></label>
    <div class="option-row"><label>DPI（36–300）<input v-model.number="dpi" type="number" min="36" max="300" step="1" :disabled="busy || saving" /></label><label>格式<select v-model="format" :disabled="busy || saving"><option value="png">PNG</option><option value="jpeg">JPEG（有损）</option></select></label><label v-if="format === 'jpeg'">JPEG质量（10–100）<input v-model.number="quality" type="number" min="10" max="100" step="1" :disabled="busy || saving" /></label></div>
    <p class="form-hint">按填写顺序输出，以CropBox可见区域、原页面旋转和UserUnit计算像素。DPI只决定像素尺寸，文件内打印密度标记可能仍采用浏览器默认值。白底，不导出PDF透明背景；PNG不再进行有损压缩，JPEG有损。文字/链接/矢量在输出中都只是像素；不会修改原PDF或自动打开文件。</p>
    <div class="action-buttons"><button class="primary-button" :disabled="!file || busy || saving" @click="generate">生成页面图片</button><button v-if="busy" class="secondary-button" @click="clear">取消</button><button class="secondary-button" :disabled="saving" @click="file = null; clear()">清空</button></div>
    <template v-if="result"><p class="form-hint">原文档{{ result.sourcePages }}页 · 此次{{ result.images.length }}页 · {{ result.totalPixels.toLocaleString() }}像素 · {{ result.totalBytes.toLocaleString() }}字节</p>
      <ol class="image-list"><li v-for="(image, index) in result.images" :key="image.page"><img :src="urls[index]" :alt="'原第' + image.page + '页输出预览'" /><p>原第{{ image.page }}页 · {{ image.width }}×{{ image.height }} · {{ image.bytes.length.toLocaleString() }}字节</p><button class="secondary-button" :disabled="saving" @click="saveImage(index)">另存此页（不覆盖）</button></li></ol>
    </template>
    <p class="form-hint" role="status">{{ notice || (busy ? '隔离线程正在校验、绘制和编码…' : '') }}</p>
    <p class="form-hint">部分实现：支持经尺寸/分量核验的JPEG扫描图、灰度/RGB、同尺寸简单透明/1位蒙版和受验证用途的嵌入字体。仍拒绝JPX/CCITT/LZW、预测器、参数别名、内联图、ICC/特殊色彩、复杂蒙版/过程资源、外部CMap及DOM滤镜；绘制资源解码失败时拒绝发布空白替代。字体/颜色仍可能近似，PNG无损仅指已绘制像素。</p>
    <p class="form-hint">输入8MiB/原文档200页；每页最多400万像素/4096边长，每批1600万像素/32MiB输出，超限请减页数或DPI，不静默缩小。源图最多1200万像素/4096边长、总1600万像素；解压样本/字体32MiB、RGBA估算64MiB与活跃画布1600万像素分别限制，解析/编码复制仍可使峰值达到数百MiB。这不是总内存硬上限。整个解析/渲染/编码在单独可终止Worker内，30秒超时，不支持Worker内OffscreenCanvas/DOMMatrix时明确失败，不退回界面线程。取消/离页释放线程和预览URL；仅加载应用内字体，不访问文档外部资源、不执行脚本。Windows实际界面/保存未验证。</p>
  </div>
</template>
<style scoped>
.action-buttons,.option-row { display: flex; gap: 8px; flex-wrap: wrap; } input { max-width: 100%; } label,li { font-size: 12px; } .form-hint { overflow-wrap: anywhere; } .image-list { display: grid; grid-template-columns: repeat(auto-fit,minmax(180px,1fr)); gap: 12px; padding: 0; list-style: none; } li { border: 1px solid var(--line); padding: 8px; border-radius: 8px; } img { width: 100%; height: 200px; object-fit: contain; background: white; }
</style>
