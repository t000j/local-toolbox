<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { MAX_HASH_FILE, type HashAlgorithm } from '../hash'
import { CHECKSUM_LENGTHS, parseChecksum, type ChecksumFormat, type ChecksumRequest, type ChecksumResult } from '../checksum'
import { useWorkerTask } from '../useWorkerTask'
const algorithm = ref<HashAlgorithm>('SHA-256'), format = ref<ChecksumFormat>('hex'), expected = ref('')
const file = shallowRef<File | null>(null)
const { result, error, busy, reset, cancel, run } = useWorkerTask<ChecksumRequest, ChecksumResult>(
  () => new Worker(new URL('../checksum.worker.ts', import.meta.url), { type: 'module' }), 30_000,
)
const parsed = computed(() => {
  try { return { value: parseChecksum(expected.value, algorithm.value, format.value), error: '' } }
  catch (cause) { return { value: null, error: expected.value ? String(cause).replace(/^Error: /u, '') : '' } }
})
watch([algorithm, format, expected, file], reset, { flush: 'sync' })
function choose(event: Event) {
  const element = event.target as HTMLInputElement
  file.value = element.files?.[0] ?? null; element.value = ''
  if (file.value && file.value.size > MAX_HASH_FILE) { file.value = null; error.value = '文件最多 256 MiB。' }
}
function verify() {
  if (busy.value || !file.value || !parsed.value.value) return
  run({ algorithm: algorithm.value, format: format.value, expected: expected.value, file: file.value })
}
</script>
<template>
  <div class="single-column-tool">
    <div class="action-buttons">
      <label>摘要算法 <select v-model="algorithm"><option v-for="name in Object.keys(CHECKSUM_LENGTHS)" :key="name">{{ name }}</option></select></label>
      <label>输入格式 <select v-model="format"><option value="hex">纯十六进制摘要</option><option value="gnu">GNU 单条记录</option><option value="bsd">BSD 单条记录</option></select></label>
    </div>
    <label for="checksum-expected">可信来源提供的预期校验值</label>
    <textarea id="checksum-expected" v-model="expected" class="code-input" rows="4" maxlength="4096" spellcheck="false"
      :placeholder="format === 'hex' ? '粘贴完整摘要…' : format === 'gnu' ? '摘要  文件名（两个空格），或 摘要 *文件名' : 'SHA256 (文件名) = 摘要'" />
    <p class="form-hint" :class="{ 'hint-error': !!parsed.error }">{{ parsed.error || `需要 ${CHECKSUM_LENGTHS[algorithm]} 个十六进制字符；不自动猜测算法。` }}</p>
    <p v-if="parsed.value?.filename" class="form-hint">记录文件名：{{ parsed.value.filename }}（须与所选文件名完全一致）</p>
    <label for="checksum-file">选择要验证的本地文件（最多 256 MiB，允许空文件）</label>
    <input id="checksum-file" type="file" @change="choose" />
    <p v-if="file" class="form-hint">{{ file.name }} · {{ file.size.toLocaleString() }} 字节</p>
    <div class="tool-action-row">
      <button v-if="busy" class="secondary-button" @click="cancel">取消</button>
      <button v-else class="primary-button" :disabled="!file || !parsed.value" @click="verify">验证文件内容</button>
    </div>
    <div v-if="result" class="checksum-result" :class="{ 'hint-error': !result.matches }" role="status">
      <strong>{{ result.matches ? '校验值一致' : '校验值不一致' }}</strong>
      <p>{{ result.name }} · {{ result.algorithm }} · {{ result.size.toLocaleString() }} 字节</p>
      <p>预期：{{ result.digest }}</p><p>实际：{{ result.actual }}</p>
    </div>
    <p class="form-hint" :class="{ 'hint-error': !!error }" aria-live="polite">{{ error || (busy ? '正在本机分块读取文件并计算摘要…' : '只读验证文件内容；编辑任意输入会清除旧结果。') }}</p>
    <p class="form-hint">支持 MD5、SHA-1、SHA-256/384/512；GNU/BSD 仅单条、无目录的文件名记录，不自动读取清单指定的路径。
      1 MiB 分块、30 秒超时；取消或离页立即终止线程。文件不上传、不修改；读取期间不要修改源文件。</p>
    <p class="form-hint hint-error">摘要一致只说明与提供的校验值相符，不能证明来源可信、无恶意代码或签名有效。
      请从可信渠道取得校验值；MD5 / SHA-1 不适合防恶意篡改用途。</p>
  </div>
</template>
<style scoped>
.checksum-result { padding: 16px; border: 1px solid var(--line); border-radius: 6px; overflow-wrap: anywhere; font-size: 12px; }
input { max-width: 100%; } select { font-size: 12px; }
</style>
