<script setup lang="ts">
import { onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useWorkerTask } from '../useWorkerTask'
import { saveBinaryOutput } from '../binaryExport'
import type { mergePdfs } from '../pdfMerge'
const files = shallowRef<File[]>([]), saving = ref(false), acknowledged = ref(false), notice = ref('')
const { result, error, busy, reset, cancel, run } = useWorkerTask<File[], Awaited<ReturnType<typeof mergePdfs>>>(() => new Worker(new URL('../pdfMerge.worker.ts', import.meta.url), { type: 'module' }), 30_000)
let revision = 0, disposed = false
function clear() { revision++; reset(); notice.value = ''; acknowledged.value = false }
watch(files, clear, { flush: 'sync' })
function choose(event: Event) {
  const input = event.target as HTMLInputElement
  files.value = Array.from(input.files ?? []); input.value = ''; clear()
  if (files.value.length > 8 || files.value.some(file => !file.size || file.size > 8 * 1024 * 1024) || files.value.reduce((sum, file) => sum + file.size, 0) > 16 * 1024 * 1024) { files.value = []; error.value = '最多8个文件，每份8MiB，总计16MiB。' }
}
function move(index: number, direction: number) {
  if (busy.value || saving.value || index + direction < 0 || index + direction >= files.value.length) return
  const list = [...files.value]; [list[index], list[index + direction]] = [list[index + direction], list[index]]; files.value = list
}
function remove(index: number) { if (!busy.value && !saving.value) files.value = files.value.filter((_, i) => i !== index) }
function merge() { if (files.value.length < 2 || busy.value || saving.value || disposed) return; clear(); run(files.value) }
async function saveOutput() {
  const output = result.value
  if (!output || !acknowledged.value || busy.value || saving.value || disposed) return
  const version = revision; saving.value = true; notice.value = ''
  try { const saved = await saveBinaryOutput(output.bytes, 'merged.pdf', () => !disposed && revision === version); if (saved && !disposed && revision === version) notice.value = '已另存新 PDF；原文件未修改。' }
  catch (cause) { if (!disposed) notice.value = String(cause) }
  finally { if (!disposed) saving.value = false }
}
onBeforeUnmount(() => { disposed = true; revision++ })
</script>
<template>
  <div class="tool-form">
    <label>选择2–8个PDF（重新选择替换列表）<input type="file" accept=".pdf" multiple :disabled="saving || busy" @change="choose" /></label>
    <ol class="pdf-list"><li v-for="(file, i) in files" :key="i"><span>{{ i + 1 }}. {{ file.name }} · {{ file.size.toLocaleString() }} 字节</span>
      <button class="secondary-button" :disabled="i === 0 || busy || saving" :aria-label="'上移第' + (i + 1) + '份文件'" @click="move(i, -1)">↑</button><button class="secondary-button" :disabled="i === files.length - 1 || busy || saving" :aria-label="'下移第' + (i + 1) + '份文件'" @click="move(i, 1)">↓</button><button class="secondary-button" :disabled="busy || saving" @click="remove(i)">移除</button></li></ol>
    <p class="form-hint">按列表顺序逐份追加全部页面，保留各份文档内页序、页面尺寸/框和旋转。不会自动按文件名排序；可先上移/下移调整。此处只预览清单，不嵌入PDF阅读器或执行内容。</p>
    <div class="action-buttons"><button class="primary-button" :disabled="files.length < 2 || busy || saving" @click="merge">合并并校验</button><button v-if="busy" class="secondary-button" @click="cancel">取消</button><button class="secondary-button" :disabled="saving" @click="files = []; clear()">清空</button></div>
    <template v-if="result">
      <p class="form-hint">共 {{ result.pages }} 页 · 输出 {{ result.bytes.length.toLocaleString() }} 字节</p>
      <ol><li v-for="(item, i) in result.inputs" :key="i">{{ item.name }}：{{ item.pages }} 页</li></ol>
      <ul><li v-for="warning in result.warnings" :key="warning">{{ warning }}</li></ul>
      <label><input v-model="acknowledged" type="checkbox" :disabled="saving" />我已确认文件顺序，并理解仅支持静态页面子集及下述限制</label>
      <button class="primary-button" :disabled="!acknowledged || saving" @click="saveOutput">{{ saving ? '保存中…' : '另存新 PDF（不覆盖）' }}</button>
    </template>
    <p class="form-hint" role="status">{{ error || notice || (busy ? '正在本机解析、合并并重读校验…' : '') }}</p>
    <p class="form-hint">当前为静态页面子集：支持经典xref及有界的单次保存ObjStm/XRef，拒绝混合/增量xref、间接流长度、加密/密码、表单/签名、注释/链接/动作/脚本、附件、外部引用、分层/标记等不支持结构；不会绕过保护或静默扁平化。目录书签、元数据及文档级功能不保证保留，遇到不支持结构会停止。不是恶意PDF清洗器，仍应只打开可信来源的文档。</p>
    <p class="form-hint">每份8MiB、总输入/输出16MiB、最多200页、30秒Worker超时。解析前后还有结构/对象/深度限制，可能保守拒绝部分正常PDF；解析器实际内存无法绝对保证。取消/清空/离页终止，不上传或自动保存。Windows桌面版安全新建另存，拒绝覆盖；提交保存后无法撤回。合并不等于压缩或PDF/A合规转换。</p>
  </div>
</template>
<style scoped>
.action-buttons { flex-wrap: wrap; } label, li { font-size: 12px; } input { max-width: 100%; } .form-hint { overflow-wrap: anywhere; } .pdf-list { list-style: none; padding: 0; display: grid; gap: 6px; } .pdf-list li { display: flex; align-items: center; gap: 6px; } .pdf-list span { flex: 1; overflow-wrap: anywhere; min-width: 0; }
</style>
