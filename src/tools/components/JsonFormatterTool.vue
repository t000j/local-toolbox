<script setup lang="ts">
import { ref } from 'vue'
import { Check, Copy, Minimize2, Sparkles, X } from '@lucide/vue'
import { copyText } from '../clipboard'

const input = ref('{\n  "name": "LocalToolbox",\n  "ready": true,\n  "tools": ["JSON", "Base64", "Hash"]\n}')
const output = ref('')
const error = ref('')
const copied = ref(false)

function formatJson(compact = false): void {
  error.value = ''
  copied.value = false
  try {
    const parsed: unknown = JSON.parse(input.value)
    output.value = JSON.stringify(parsed, null, compact ? undefined : 2)
  } catch (cause) {
    output.value = ''
    error.value = cause instanceof Error ? cause.message : 'JSON 格式不正确'
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

function clearAll(): void {
  input.value = ''
  output.value = ''
  error.value = ''
}
</script>

<template>
  <div class="tool-form">
    <div class="workbench-grid">
      <section class="editor-column">
        <div class="field-heading">
          <label for="json-input">输入 JSON</label>
          <button class="quiet-button" :disabled="!input" @click="clearAll"><X :size="14" /> 清空</button>
        </div>
        <textarea id="json-input" v-model="input" class="code-input" spellcheck="false" placeholder="在此粘贴 JSON…"></textarea>
      </section>
      <section class="editor-column">
        <div class="field-heading">
          <label>处理结果</label>
          <button class="quiet-button" :disabled="!output" @click="copyOutput">
            <Check v-if="copied" :size="14" /><Copy v-else :size="14" /> {{ copied ? '已复制' : '复制' }}
          </button>
        </div>
        <textarea :value="output" class="code-input result-input" readonly spellcheck="false" placeholder="格式化结果会显示在这里"></textarea>
      </section>
    </div>
    <div class="tool-action-row">
      <p class="form-hint" :class="{ 'hint-error': error }">
        <span v-if="error">{{ error }}</span>
        <span v-else-if="output"><Check :size="14" /> JSON 校验通过，处理在本机完成</span>
        <span v-else>支持美化缩进或压缩成单行。</span>
      </p>
      <div class="action-buttons">
        <button class="secondary-button" :disabled="!input" @click="formatJson(true)"><Minimize2 :size="15" /> 压缩</button>
        <button class="primary-button" :disabled="!input" @click="formatJson(false)"><Sparkles :size="15" /> 格式化</button>
      </div>
    </div>
  </div>
</template>
