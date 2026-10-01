<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { ArrowDownUp, Copy, Download } from '@lucide/vue'
import { copyText } from '../clipboard'
import { MAX_BASE64_BYTES, MAX_BASE64_INPUT, type Base64Request, type Base64Result } from '../base64'
import { useWorkerTask } from '../useWorkerTask'

const input = ref(''), mode = ref<'encode' | 'decode'>('encode'), fileMode = ref(false), copied = ref(false)
const file = shallowRef<File | null>(null), reading = ref(false)
const { result, error, busy, reset, cancel, run } = useWorkerTask<Base64Request, Base64Result>(
  () => new Worker(new URL('../base64.worker.ts', import.meta.url), { type: 'module' }), 5000,
)
const preview = computed(() => result.value?.text?.slice(0, 100_000) ?? '')
let revision = 0
const urls = new Set<string>()
const timers = new Set<ReturnType<typeof setTimeout>>()
function invalidate(): void { revision++; reading.value = false; reset(); copied.value = false }
watch([input, mode, fileMode, file], invalidate, { flush: 'sync' })
function selectFile(event: Event): void {
  const element = event.target as HTMLInputElement
  file.value = element.files?.[0] ?? null
  element.value = ''
  if (file.value && file.value.size > MAX_BASE64_BYTES) {
    file.value = null; error.value = '文件最多 4 MiB。'
  }
}
async function convert(): Promise<void> {
  invalidate()
  const version = revision
  if (mode.value === 'decode') {
    if (input.value.length > MAX_BASE64_INPUT) { error.value = 'Base64 输入最多 6 MiB 字符。'; return }
    run({ mode: 'decode', value: input.value, file: fileMode.value }); return
  }
  if (!fileMode.value) {
    if (input.value.length > MAX_BASE64_BYTES) { error.value = '原始文本最多 4 MiB。'; return }
    run({ mode: 'encode', value: input.value }); return
  }
  const selected = file.value
  if (!selected) { error.value = '请先选择本地文件。'; return }
  reading.value = true
  try {
    const bytes = new Uint8Array(await selected.arrayBuffer())
    if (version === revision) run({ mode: 'encode', value: bytes })
  } catch { if (version === revision) error.value = '文件读取失败，请重新选择。' }
  finally { if (version === revision) reading.value = false }
}
function stop(): void { invalidate(); cancel() }
async function copy(): Promise<void> {
  const text = result.value?.text, version = revision
  if (text === null || text === undefined) return
  try { await copyText(text); if (version === revision) copied.value = true }
  catch { if (version === revision) error.value = '复制失败，请检查剪贴板权限。' }
}
function download(): void {
  if (!result.value) return
  try {
    const blob = result.value.bytes ? new Blob([new Uint8Array(result.value.bytes)], { type: 'application/octet-stream' })
      : new Blob([result.value.text ?? ''], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    urls.add(url)
    const link = document.createElement('a')
    link.href = url; link.download = result.value.bytes ? 'base64-decoded.bin' : mode.value === 'encode' ? 'encoded.base64.txt' : 'decoded.txt'
    document.body.append(link); link.click(); link.remove()
    const timer = setTimeout(() => { URL.revokeObjectURL(url); urls.delete(url); timers.delete(timer) }, 60_000)
    timers.add(timer)
  } catch { error.value = '保存失败，请重试。' }
}
onBeforeUnmount(() => { revision++; urls.forEach(url => URL.revokeObjectURL(url)); timers.forEach(clearTimeout) })
</script>

<template>
  <div class="tool-form">
    <div class="mode-switch">
      <button :class="{ selected: mode === 'encode' }" @click="mode = 'encode'">编码</button>
      <button :class="{ selected: mode === 'decode' }" @click="mode = 'decode'">解码</button>
      <label><input v-model="fileMode" type="checkbox" /> 文件模式</label>
    </div>
    <p class="form-hint">标准 Base64 编码，不是加密。文件/解码结果最多 4 MiB；Base64 输入最多 6 MiB 字符。
      不支持 data URL 或 URL-safe 格式，允许省略末尾填充与 ASCII 空白；文本按 UTF-8 处理。</p>
    <div class="workbench-grid">
      <section class="editor-column">
        <div class="field-heading"><label for="base64-input">{{ mode === 'encode' ? '原始内容' : 'Base64 文本' }}</label></div>
        <div v-if="fileMode && mode === 'encode'" class="base64-file">
          <label for="base64-file">选择任意本地文件（含空文件）</label>
          <input id="base64-file" type="file" @change="selectFile" />
          <p v-if="file" class="form-hint">{{ file.name }} · {{ file.size.toLocaleString() }} 字节</p>
        </div>
        <textarea v-else id="base64-input" v-model="input" class="code-input" spellcheck="false" placeholder="输入或粘贴内容，可为空…"></textarea>
      </section>
      <section class="editor-column">
        <div class="field-heading"><span>转换结果</span>
          <div class="action-buttons">
            <button class="quiet-button" :disabled="!result || result.text === null" @click="copy">
              <Copy :size="14" /> {{ copied ? '已复制' : '复制全部' }}
            </button>
            <button class="quiet-button" :disabled="!result" @click="download"><Download :size="14" /> 保存结果</button>
          </div>
        </div>
        <p v-if="result?.bytes" class="form-hint">已解码 {{ result.bytes.length.toLocaleString() }} 字节。
          保存为 .bin 后可自行更改扩展名，不自动打开文件。</p>
        <textarea v-else :value="preview" class="code-input result-input" readonly spellcheck="false"
          aria-label="Base64 转换结果" placeholder="转换结果…"></textarea>
        <p v-if="(result?.text?.length ?? 0) > 100_000" class="form-hint">预览前 100,000 字符；复制与保存包含完整结果。</p>
      </section>
    </div>
    <div class="tool-action-row">
      <p class="form-hint" :class="{ 'hint-error': error }" aria-live="polite">
        {{ error || (reading ? '正在读取本地文件…' : busy ? '正在转换…' : result ? '转换完成。' : '完全在本机完成；5 秒转换超时保护。') }}
      </p>
      <button v-if="busy || reading" class="secondary-button" @click="stop">取消</button>
      <button v-else class="primary-button" @click="convert"><ArrowDownUp :size="15" /> {{ mode === 'encode' ? '编码' : '解码' }}</button>
    </div>
  </div>
</template>

<style scoped>
.base64-file { display: grid; align-content: start; gap: 16px; padding: 20px; border: 1px solid var(--line); border-radius: 6px; }
.base64-file label { font-size: 12px; color: var(--muted); }
.base64-file input { max-width: 100%; }
</style>
