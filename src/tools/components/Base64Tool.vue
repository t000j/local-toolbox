<script setup lang="ts">
import { ref } from 'vue'
import { ArrowDownUp, Check, Copy } from '@lucide/vue'
import { copyText } from '../clipboard'

const input = ref('')
const output = ref('')
const error = ref('')
const mode = ref<'encode' | 'decode'>('encode')
const copied = ref(false)

function encodeUtf8Base64(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

function decodeUtf8Base64(value: string): string {
  const binary = atob(value.replace(/\s/g, ''))
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

function convert(): void {
  error.value = ''
  output.value = ''
  copied.value = false
  try {
    output.value = mode.value === 'encode' ? encodeUtf8Base64(input.value) : decodeUtf8Base64(input.value)
  } catch {
    error.value = mode.value === 'decode' ? '内容不是有效的 UTF-8 Base64 文本。' : '编码失败，请检查输入内容。'
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

function swapMode(): void {
  mode.value = mode.value === 'encode' ? 'decode' : 'encode'
  input.value = output.value
  output.value = ''
  error.value = ''
}
</script>

<template>
  <div class="tool-form">
    <div class="mode-switch">
      <button :class="{ selected: mode === 'encode' }" @click="mode = 'encode'; output = ''; error = ''">编码</button>
      <button :class="{ selected: mode === 'decode' }" @click="mode = 'decode'; output = ''; error = ''">解码</button>
      <button class="swap-button" aria-label="交换输入与输出" :disabled="!output" @click="swapMode"><ArrowDownUp :size="14" /></button>
      <span>文本转换完全在本机完成</span>
    </div>
    <div class="workbench-grid">
      <section class="editor-column">
        <div class="field-heading"><label for="base64-input">{{ mode === 'encode' ? '原始文本' : 'Base64 文本' }}</label></div>
        <textarea id="base64-input" v-model="input" class="code-input" spellcheck="false" placeholder="输入或粘贴内容…"></textarea>
      </section>
      <section class="editor-column">
        <div class="field-heading">
          <label>{{ mode === 'encode' ? 'Base64 结果' : '解码结果' }}</label>
          <button class="quiet-button" :disabled="!output" @click="copyOutput">
            <Check v-if="copied" :size="14" /><Copy v-else :size="14" /> {{ copied ? '已复制' : '复制' }}
          </button>
        </div>
        <textarea :value="output" class="code-input result-input" readonly spellcheck="false" placeholder="转换结果会显示在这里"></textarea>
      </section>
    </div>
    <div class="tool-action-row">
      <p class="form-hint" :class="{ 'hint-error': error }">
        <span v-if="error">{{ error }}</span>
        <span v-else-if="output"><Check :size="14" /> 转换完成</span>
        <span v-else>中文字符会按 UTF-8 正确处理。</span>
      </p>
      <button class="primary-button" :disabled="!input" @click="convert">
        <ArrowDownUp :size="15" /> {{ mode === 'encode' ? '编码为 Base64' : '解码为文本' }}
      </button>
    </div>
  </div>
</template>
