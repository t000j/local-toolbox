<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { Copy, Hash } from '@lucide/vue'
import { copyText } from '../clipboard'
import { MAX_HASH_FILE, MAX_HASH_TEXT, type HashAlgorithm, type HashRequest } from '../hash'
import { useWorkerTask } from '../useWorkerTask'

const input = ref(''), algorithm = ref<HashAlgorithm>('SHA-256'), fileMode = ref(false), copied = ref(false)
const file = shallowRef<File | null>(null)
const { result, error, busy, reset, cancel, run } = useWorkerTask<HashRequest, string>(
  () => new Worker(new URL('../hash.worker.ts', import.meta.url), { type: 'module' }), 30_000,
)
const isWeakAlgorithm = computed(() => algorithm.value === 'MD5' || algorithm.value === 'SHA-1')
let revision = 0
function invalidate(): void { revision++; reset(); copied.value = false }
watch([input, algorithm, fileMode, file], invalidate, { flush: 'sync' })
function selectFile(event: Event): void {
  const element = event.target as HTMLInputElement
  file.value = element.files?.[0] ?? null
  element.value = ''
  if (file.value && file.value.size > MAX_HASH_FILE) { file.value = null; error.value = '文件最多 256 MiB。' }
}
function calculate(): void {
  invalidate()
  if (fileMode.value && !file.value) { error.value = '请先选择本地文件。'; return }
  if (!fileMode.value && input.value.length > MAX_HASH_TEXT) { error.value = '文本最多 1 MiB UTF-16 码元。'; return }
  run({ algorithm: algorithm.value, value: fileMode.value ? file.value! : input.value })
}
async function copy(): Promise<void> {
  if (!result.value) return
  const version = revision
  try { await copyText(result.value); if (version === revision) copied.value = true }
  catch { if (version === revision) error.value = '复制失败，请检查剪贴板权限。' }
}
function stop(): void { invalidate(); cancel() }
onBeforeUnmount(() => { revision++ })
</script>

<template>
  <div class="single-column-tool">
    <div class="field-heading">
      <label><input v-model="fileMode" type="checkbox" /> 本地文件模式</label>
      <label class="algorithm-select">算法
        <select v-model="algorithm">
          <option v-for="name in ['MD5', 'SHA-1', 'SHA-256', 'SHA-384', 'SHA-512']" :key="name">{{ name }}</option>
        </select>
      </label>
    </div>
    <div v-if="fileMode">
      <label for="hash-file">选择文件（最多 256 MiB，可为空文件）</label>
      <input id="hash-file" type="file" @change="selectFile" />
      <p v-if="file" class="form-hint">{{ file.name }} · {{ file.size.toLocaleString() }} 字节</p>
    </div>
    <template v-else>
      <label for="hash-input">输入文本（UTF-8 摘要，最多 1 MiB UTF-16 码元）</label>
      <textarea id="hash-input" v-model="input" class="code-input hash-input" spellcheck="false"></textarea>
    </template>
    <div class="field-heading result-heading">
      <span>摘要结果</span>
      <button class="quiet-button" :disabled="!result" @click="copy"><Copy :size="14" /> {{ copied ? '已复制' : '复制' }}</button>
    </div>
    <div class="hash-result" :class="{ empty: !result }"><code>{{ result || '等待计算…' }}</code></div>
    <p v-if="isWeakAlgorithm" class="form-hint hint-error">MD5 / SHA-1 不适合密码存储或防篡改等安全用途。</p>
    <div class="tool-action-row">
      <p class="form-hint" :class="{ 'hint-error': error }" aria-live="polite">
        {{ error || (busy ? '正在本机分块计算…' : '哈希是单向摘要；不上传文件，后台计算，30 秒超时保护。') }}
      </p>
      <button v-if="busy" class="secondary-button" @click="stop">取消</button>
      <button v-else class="primary-button" @click="calculate"><Hash :size="15" /> 计算摘要</button>
    </div>
  </div>
</template>
