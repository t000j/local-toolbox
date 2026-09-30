<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Check, Copy, Eraser, ListFilter } from '@lucide/vue'
import { copyText } from '../clipboard'

const input = ref('')
const trimLines = ref(true)
const removeBlankLines = ref(false)
const removeDuplicates = ref(false)
const sortLines = ref(false)
const copied = ref(false)
const error = ref('')
let copiedTimeout: number | undefined

const output = computed(() => {
  let lines = input.value.replace(/\r\n?/g, '\n').split('\n')
  if (trimLines.value) lines = lines.map((line) => line.trim())
  if (removeBlankLines.value) lines = lines.filter((line) => line.trim().length > 0)
  if (removeDuplicates.value) lines = [...new Set(lines)]
  if (sortLines.value) lines.sort((left, right) => left.localeCompare(right, 'zh-CN', { numeric: true, sensitivity: 'base' }))
  return lines.join('\n')
})

const inputLineCount = computed(() => countLines(input.value))
const outputLineCount = computed(() => countLines(output.value))

watch(output, () => {
  copied.value = false
  error.value = ''
})

function countLines(value: string): number {
  return value ? value.replace(/\r\n?/g, '\n').split('\n').length : 0
}

async function copyOutput(): Promise<void> {
  if (!output.value) return
  try {
    await copyText(output.value)
    copied.value = true
    window.clearTimeout(copiedTimeout)
    copiedTimeout = window.setTimeout(() => { copied.value = false }, 1600)
  } catch {
    error.value = '复制失败，请检查剪贴板权限。'
  }
}

function clearInput(): void {
  input.value = ''
  copied.value = false
  error.value = ''
}
</script>

<template>
  <div class="text-cleaner-tool">
    <div class="text-cleaner-options" aria-label="清理选项">
      <label class="text-cleaner-option" :class="{ selected: trimLines }"><input v-model="trimLines" type="checkbox" /> 去除每行首尾空格</label>
      <label class="text-cleaner-option" :class="{ selected: removeBlankLines }"><input v-model="removeBlankLines" type="checkbox" /> 删除空行</label>
      <label class="text-cleaner-option" :class="{ selected: removeDuplicates }"><input v-model="removeDuplicates" type="checkbox" /> 删除重复行</label>
      <label class="text-cleaner-option" :class="{ selected: sortLines }"><input v-model="sortLines" type="checkbox" /> 按内容排序</label>
    </div>

    <div class="text-cleaner-layout">
      <section class="text-cleaner-panel">
        <div class="field-heading">
          <label for="cleaner-input">原始文本</label>
          <div class="text-cleaner-heading-actions">
            <span>{{ inputLineCount }} 行 · {{ input.length }} 字符</span>
            <button class="quiet-button" :disabled="!input" @click="clearInput"><Eraser :size="14" /> 清空</button>
          </div>
        </div>
        <textarea id="cleaner-input" v-model="input" class="code-input cleaner-textarea" placeholder="粘贴或输入要整理的文本…"></textarea>
      </section>

      <section class="text-cleaner-panel">
        <div class="field-heading">
          <label for="cleaner-output">整理结果</label>
          <div class="text-cleaner-heading-actions">
            <span>{{ outputLineCount }} 行 · {{ output.length }} 字符</span>
            <button class="quiet-button" :disabled="!output" @click="copyOutput"><Check v-if="copied" :size="14" /><Copy v-else :size="14" /> {{ copied ? '已复制' : '复制结果' }}</button>
          </div>
        </div>
        <textarea id="cleaner-output" class="code-input cleaner-textarea result-input" :value="output" readonly placeholder="整理后的文本会显示在这里…"></textarea>
      </section>
    </div>

    <div class="text-cleaner-footnote">
      <p v-if="error" class="inline-error">{{ error }}</p>
      <p v-else><ListFilter :size="14" /> 选项会即时应用；换行符统一为 LF，原始输入不会被覆盖。</p>
    </div>
  </div>
</template>
