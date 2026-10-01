<script setup lang="ts">
import { onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useWorkerTask } from '../useWorkerTask'
import { saveBinaryOutput } from '../binaryExport'
import { MAX_ENCODING_INPUT, TEXT_ENCODINGS, type TextEncoding, type SourceBom, type TargetBom,
  type EncodingRequest, type EncodingResult } from '../textEncoding'
const file = shallowRef<File | null>(null), source = ref<TextEncoding>('utf-8'), target = ref<TextEncoding>('utf-16le')
const sourceBom = ref<SourceBom>('strip'), targetBom = ref<TargetBom>('add'), saving = ref(false), notice = ref('')
const { result, error, busy, reset, cancel, run } = useWorkerTask<EncodingRequest, EncodingResult>(
  () => new Worker(new URL('../textEncoding.worker.ts', import.meta.url), { type: 'module' }), 10_000,
)
let revision = 0, disposed = false
function clear() { revision++; reset(); notice.value = '' }
watch([file, source, target, sourceBom, targetBom], clear, { flush: 'sync' })
watch(source, value => { if (value === 'ascii' || value === 'latin1') sourceBom.value = 'keep' }, { flush: 'sync' })
watch(target, value => { if (value === 'ascii' || value === 'latin1') targetBom.value = 'none' }, { flush: 'sync' })
function choose(event: Event) {
  const element = event.target as HTMLInputElement
  file.value = element.files?.[0] ?? null; element.value = ''
  if (file.value && file.value.size > MAX_ENCODING_INPUT) { file.value = null; error.value = '源文件最多 4 MiB。' }
}
function convert() {
  if (!file.value || busy.value || saving.value) return
  clear(); run({ file: file.value, source: source.value, target: target.value, sourceBom: sourceBom.value, targetBom: targetBom.value })
}
async function saveOutput() {
  const payload = result.value
  if (!payload || saving.value || busy.value || disposed) return
  const version = revision; saving.value = true; notice.value = ''
  try {
    const saved = await saveBinaryOutput(payload.bytes, `converted-${payload.target}.txt`, () => !disposed && version === revision)
    if (saved && !disposed && version === revision) notice.value = '已另存为新文件；原始文件未修改。'
  } catch (cause) { if (!disposed) notice.value = String(cause) }
  finally { if (!disposed) saving.value = false }
}
onBeforeUnmount(() => { disposed = true; revision++ })
</script>
<template>
  <div class="tool-form">
    <label for="encoding-file">选择文本文件（最多 4 MiB）</label>
    <input id="encoding-file" type="file" :disabled="saving" @change="choose" />
    <p v-if="file" class="form-hint">{{ file.name }} · {{ file.size.toLocaleString() }} 字节</p>
    <div class="action-buttons">
      <label>源编码 <select v-model="source" :disabled="saving"><option v-for="name in TEXT_ENCODINGS" :key="name">{{ name }}</option></select></label>
      <label>源 BOM <select v-model="sourceBom" :disabled="saving">
        <option value="strip" :disabled="source === 'ascii' || source === 'latin1'">若存在则去掉</option>
        <option value="require" :disabled="source === 'ascii' || source === 'latin1'">必须存在并去掉</option>
        <option value="keep">保留为正文</option>
      </select></label>
    </div>
    <div class="action-buttons">
      <label>目标编码 <select v-model="target" :disabled="saving"><option v-for="name in TEXT_ENCODINGS" :key="name">{{ name }}</option></select></label>
      <label>目标 BOM <select v-model="targetBom" :disabled="saving"><option value="none">不另加 BOM</option>
        <option value="add" :disabled="target === 'ascii' || target === 'latin1'">添加 BOM</option></select></label>
      <button class="primary-button" :disabled="!file || busy || saving" @click="convert">转换并预览</button>
      <button v-if="busy" class="secondary-button" @click="cancel">取消</button>
    </div>
    <p class="form-hint">手动明确源编码，不自动猜测。UTF-8、UTF-16LE/BE、ASCII 与 ISO-8859-1（Latin-1，不是 Windows-1252）；
      暂不支持 GBK / GB18030 / Shift-JIS / UTF-32。换行、空白、NUL 与 Unicode 组合形式原样保留，不执行正文。</p>
    <p class="form-hint">无效字节或目标无法表示的字符会报错，绝不静默改成问号或替换字符；输出经往返核验。
      BOM 与源编码冲突会拒绝；保留源 BOM 时不再添加第二个 BOM。10 秒线程超时，可取消。</p>
    <div v-if="result" class="encoding-result">
      <p class="form-hint">{{ result.source }} → {{ result.target }} · {{ result.inputBytes.toLocaleString() }} → {{ result.outputBytes.toLocaleString() }} 字节
        · {{ result.characters.toLocaleString() }} 个 Unicode 码点</p>
      <p class="form-hint">源 BOM：{{ result.detectedBom }} · 目标 BOM：{{ result.outputBom }}</p>
      <textarea :value="result.preview" class="code-input" rows="12" readonly spellcheck="false" aria-label="转换后正文预览" />
      <p class="form-hint">{{ result.previewTruncated ? '仅预览前 50,000 个 UTF-16 码元以内；另存包含全部内容。' : '正文完整预览。' }}
        隐形字符及 NUL 可能不可见；此处是解码后的文字，不表示目标字节布局。</p>
    </div>
    <button class="primary-button" :disabled="!result || busy || saving" @click="saveOutput">{{ saving ? '保存中…' : '选择新文件位置并另存' }}</button>
    <p class="form-hint">输出最多 16 MiB；仅 Windows 桌面版支持保存。只创建新文件，拒绝覆盖原文件或其他已有文件、链接/重解析路径。
      保存开始后无法撤回，离页可能继续完成；失败会尽力清理未完成输出，若系统拒绝清理需手动检查。</p>
    <p class="form-hint" :class="{ 'hint-error': !!error }" role="status">{{ error || notice || (busy ? '正在本机严格转换与核验…' : '') }}</p>
  </div>
</template>
<style scoped>
.encoding-result { display: grid; gap: 8px; } textarea { box-sizing: border-box; width: 100%; }
input { max-width: 100%; } select { font-size: 12px; }
</style>
