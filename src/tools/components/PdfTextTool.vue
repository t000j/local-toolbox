<script setup lang="ts">
import { onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useWorkerTask } from '../useWorkerTask'
import { saveBinaryOutput } from '../binaryExport'
import type { PdfTextResult } from '../pdfText'
const file = shallowRef<File | null>(null), selection = ref(''), notice = ref(''), saving = ref(false)
const { result, error, busy, reset, cancel, run } = useWorkerTask<{ file: File; selection: string }, PdfTextResult>(() => new Worker(new URL('../pdfText.worker.ts', import.meta.url), { type: 'module' }), 30_000)
let revision = 0, disposed = false
function clear() { revision++; reset(); notice.value = '' }
watch([file, selection], clear, { flush: 'sync' })
function choose(event: Event) { const input = event.target as HTMLInputElement; file.value = input.files?.[0] ?? null; input.value = ''; clear(); if (file.value && (!file.value.size || file.value.size > 8 * 1024 * 1024)) { file.value = null; error.value = 'PDF须为1字节至8MiB。' } }
function extract() { if (!file.value || busy.value || saving.value || disposed) return; clear(); run({ file: file.value, selection: selection.value }) }
async function saveOutput() {
  const output = result.value; if (!output || saving.value || busy.value || disposed) return
  const version = revision; saving.value = true; notice.value = ''
  try { if (await saveBinaryOutput(output.bytes, 'extracted-text.txt', () => !disposed && revision === version) && !disposed && revision === version) notice.value = '已另存UTF-8文本，原PDF未修改。' }
  catch (cause) { if (!disposed && revision === version) notice.value = String(cause) }
  finally { if (!disposed) saving.value = false }
}
onBeforeUnmount(() => { disposed = true; revision++ })
</script>
<template>
  <div class="tool-form">
    <label>选择PDF<input type="file" accept=".pdf" :disabled="busy || saving" @change="choose" /></label>
    <p v-if="file" class="form-hint">{{ file.name }} · {{ file.size.toLocaleString() }} 字节</p>
    <label>页码（留空为全部，最多50页）<input v-model="selection" placeholder="1-3,5,8" maxlength="2000" :disabled="busy || saving" /></label>
    <div class="action-buttons"><button class="primary-button" :disabled="!file || busy || saving" @click="extract">提取可选择文字</button><button v-if="busy" class="secondary-button" @click="cancel">取消</button><button class="secondary-button" :disabled="saving" @click="file = null; clear()">清空</button></div>
    <template v-if="result">
      <p class="form-hint">原文档{{ result.sourcePages }}页 · 已提取{{ result.pages.length }}页 · UTF-8 {{ result.bytes.length.toLocaleString() }}字节</p>
      <p v-if="result.pages.some(page => !page.text.trim())" class="form-hint">部分页没有提取到文字，可能为空白、扫描图片或缺少可用文字映射；这不证明页面没有可见文字。</p>
      <textarea :value="result.text" readonly rows="18" aria-label="提取的文字" spellcheck="false" />
      <button class="primary-button" :disabled="saving" @click="saveOutput">{{ saving ? '保存中…' : '另存UTF-8文本（不覆盖）' }}</button>
    </template>
    <p class="form-hint" role="status">{{ error || notice || (busy ? '隔离线程正在读取文字…' : '') }}</p>
    <p class="form-hint">部分实现，仅提取PDF内已有文字，不做OCR。PDF.js会规范化空白/部分Unicode字符；保留其项目顺序和换行提示，并插入页码分隔；多栏、表格、旋转文字、双向语言、连字及字形映射可能与视觉阅读顺序不同，不保证版式或逐字准确，导出前请核对。</p>
    <p class="form-hint">本机处理，不上传。只读取随应用提供的固定字体资源，不加载外部CMap/字体或执行脚本。沿用静态PDF及保守资源准入：加密/交互/链接/表单/增量xref、JPEG等非Flate资源、预测器、内联图片和遮罩等会拒绝；并非通用PDF兼容。</p>
    <p class="form-hint">输入8MiB/原200页、每次50页/10万个文字项目/100万字符/4MiB UTF-8输出；资源解压32MiB、30秒Worker超时，取消/编辑/离页终止。真实WebView隔离线程、Windows另存未验证。</p>
  </div>
</template>
<style scoped>
.action-buttons { flex-wrap: wrap; } .form-hint { overflow-wrap: anywhere; } input, textarea { max-width: 100%; } textarea { width: 100%; white-space: pre; }
</style>
