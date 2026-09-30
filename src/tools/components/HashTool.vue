<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, Copy, Hash, LoaderCircle, ShieldAlert } from '@lucide/vue'
import { copyText } from '../clipboard'
import { md5, sha1 } from 'hash-wasm'

type HashAlgorithm = 'MD5' | 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512'

const input = ref('')
const algorithm = ref<HashAlgorithm>('SHA-256')
const output = ref('')
const error = ref('')
const copied = ref(false)
const loading = ref(false)
const isWeakAlgorithm = computed(() => algorithm.value === 'MD5' || algorithm.value === 'SHA-1')

async function calculate(): Promise<void> {
  error.value = ''
  output.value = ''
  copied.value = false
  loading.value = true
  try {
    if (algorithm.value === 'MD5') {
      output.value = await md5(input.value)
    } else if (algorithm.value === 'SHA-1') {
      output.value = await sha1(input.value)
    } else {
      const data = new TextEncoder().encode(input.value)
      const digest = await crypto.subtle.digest(algorithm.value, data)
      output.value = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
    }
  } catch {
    error.value = '当前环境无法执行摘要计算。'
  } finally {
    loading.value = false
  }
}

async function copyOutput(): Promise<void> {
  if (!output.value) return
  try {
    await copyText(output.value)
    copied.value = true
    window.setTimeout(() => { copied.value = false }, 1600)
  } catch {
    error.value = '复制失败，请检查剪贴板权限。'
  }
}
</script>

<template>
  <div class="single-column-tool">
    <div class="field-heading">
      <label for="hash-input">输入文本</label>
      <div class="algorithm-select">
        <span>算法</span>
        <select v-model="algorithm" @change="output = ''; error = ''">
          <option value="MD5">MD5</option>
          <option value="SHA-1">SHA-1</option>
          <option value="SHA-256">SHA-256</option>
          <option value="SHA-384">SHA-384</option>
          <option value="SHA-512">SHA-512</option>
        </select>
      </div>
    </div>
    <textarea id="hash-input" v-model="input" class="code-input hash-input" placeholder="输入要计算摘要的文本…" @input="output = ''; error = ''"></textarea>
    <div class="field-heading result-heading">
      <label>摘要结果</label>
      <button class="quiet-button" :disabled="!output" @click="copyOutput">
        <Check v-if="copied" :size="14" /><Copy v-else :size="14" /> {{ copied ? '已复制' : '复制' }}
      </button>
    </div>
    <div class="hash-result" :class="{ empty: !output }">
      <Hash v-if="!output" :size="16" />
      <code v-else>{{ output }}</code>
    </div>
    <div class="tool-action-row">
      <p class="form-hint" :class="{ 'hint-error': error }">
        <span v-if="error">{{ error }}</span>
        <span v-else-if="isWeakAlgorithm" class="algorithm-warning"><ShieldAlert :size="14" /> MD5 / SHA-1 已不适合安全用途，不要用于密码存储或防篡改校验。</span>
        <span v-else-if="output"><Check :size="14" /> 哈希是单向摘要，无法从结果还原原文；计算在本机完成。</span>
        <span v-else>哈希会为输入生成摘要，无法解密还原；MD5 / SHA-1 不适合安全用途。</span>
      </p>
      <button class="primary-button" :disabled="loading" @click="calculate">
        <LoaderCircle v-if="loading" class="spin-icon" :size="15" />
        <Hash v-else :size="15" />
        {{ loading ? '计算中…' : '计算摘要' }}
      </button>
    </div>
  </div>
</template>
