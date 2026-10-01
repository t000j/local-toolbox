<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { Copy, Sparkles } from '@lucide/vue'
import { copyText } from '../clipboard'
import { generateIntegers, generateStrings } from '../random'
const mode = ref<'integer' | 'string'>('integer'), min = ref(1), max = ref(100), count = ref(10), length = ref(16)
const alphabet = ref('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'), output = ref(''), error = ref(''), copied = ref(false)
let revision = 0
function clear(): void { revision++; output.value = ''; error.value = ''; copied.value = false }
watch([mode, min, max, count, length, alphabet], clear, { flush: 'sync' })
function generate(): void {
  clear()
  try {
    output.value = (mode.value === 'integer' ? generateIntegers(min.value, max.value, count.value)
      : generateStrings(alphabet.value, length.value, count.value)).join('\n')
  } catch (reason) { error.value = reason instanceof Error ? reason.message : '无法获取安全随机数。' }
}
async function copy(): Promise<void> {
  if (!output.value) return
  const version = revision
  try { await copyText(output.value); if (version === revision) copied.value = true }
  catch { if (version === revision) error.value = '复制失败，请检查剪贴板权限。' }
}
onBeforeUnmount(clear)
</script>

<template>
  <div class="tool-form">
    <div class="mode-switch">
      <button :class="{ selected: mode === 'integer' }" @click="mode = 'integer'">随机整数</button>
      <button :class="{ selected: mode === 'string' }" @click="mode = 'string'">随机字符串</button>
    </div>
    <div v-if="mode === 'integer'" class="field-heading">
      <label>下界（含） <input v-model.number="min" type="number" /></label>
      <label>上界（含） <input v-model.number="max" type="number" /></label>
    </div>
    <template v-else>
      <label for="random-alphabet">自定义字符池（重复码点自动去重）</label>
      <input id="random-alphabet" v-model="alphabet" type="text" maxlength="2048" spellcheck="false" />
      <label>长度（按 Unicode 码点） <input v-model.number="length" type="number" min="1" max="256" /></label>
    </template>
    <label>数量 <input v-model.number="count" type="number" min="1" max="100" /></label>
    <p class="form-hint">系统安全随机源，无模偏差，允许结果重复，不保证唯一。
      整数范围限安全整数，区间最多 2³² 项；字符串最长 256 码点，每次最多 100 项。不上传、不保存。</p>
    <div class="field-heading"><label for="random-output">生成结果</label>
      <button class="quiet-button" :disabled="!output" @click="copy"><Copy :size="14" /> {{ copied ? '已复制' : '复制全部' }}</button>
    </div>
    <textarea id="random-output" :value="output" class="code-input" readonly spellcheck="false"></textarea>
    <div class="tool-action-row">
      <p class="form-hint hint-error" aria-live="polite">{{ error }}</p>
      <div class="action-buttons"><button class="secondary-button" @click="clear">清空结果</button>
        <button class="primary-button" @click="generate"><Sparkles :size="15" /> 生成</button></div>
    </div>
  </div>
</template>
