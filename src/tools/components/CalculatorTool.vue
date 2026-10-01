<script setup lang="ts">
import { computed, ref } from 'vue'
import { Calculator as CalculatorIcon, Check, Clock, Copy, Delete } from '@lucide/vue'
import { copyText } from '../clipboard'

import { evaluate, formatNumber } from '../calculator'
interface HistoryItem { id: number; expression: string; result: string }

const expression = ref('')
const error = ref('')
const copied = ref(false)
const justCalculated = ref(false)
const history = ref<HistoryItem[]>([])
let historyId = 0

const keys = [
  { label: 'C', value: 'clear', kind: 'clear' }, { label: '⌫', value: 'backspace', kind: 'function' }, { label: '(', value: '(', kind: 'function' }, { label: ')', value: ')', kind: 'function' },
  { label: '7', value: '7', kind: 'digit' }, { label: '8', value: '8', kind: 'digit' }, { label: '9', value: '9', kind: 'digit' }, { label: '÷', value: '÷', kind: 'operator' },
  { label: '4', value: '4', kind: 'digit' }, { label: '5', value: '5', kind: 'digit' }, { label: '6', value: '6', kind: 'digit' }, { label: '×', value: '×', kind: 'operator' },
  { label: '1', value: '1', kind: 'digit' }, { label: '2', value: '2', kind: 'digit' }, { label: '3', value: '3', kind: 'digit' }, { label: '−', value: '-', kind: 'operator' },
  { label: '0', value: '0', kind: 'digit' }, { label: '.', value: '.', kind: 'digit' }, { label: '=', value: 'equals', kind: 'equals' }, { label: '+', value: '+', kind: 'operator' },
]

const liveResult = computed(() => {
  if (!expression.value.trim()) return ''
  try {
    return formatNumber(evaluate(expression.value))
  } catch {
    return ''
  }
})

function calculate(): void {
  error.value = ''
  copied.value = false
  try {
    const original = expression.value.trim()
    const result = formatNumber(evaluate(original))
    history.value.unshift({ id: ++historyId, expression: original, result })
    history.value = history.value.slice(0, 20)
    expression.value = result
    justCalculated.value = true
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '表达式无法计算。'
    justCalculated.value = false
  }
}

function press(key: string): void {
  error.value = ''
  copied.value = false
  if (justCalculated.value && (/^\d$/.test(key) || key === '.' || key === '(')) expression.value = ''
  justCalculated.value = false
  if (key === 'clear') {
    expression.value = ''
  } else if (key === 'backspace') {
    expression.value = expression.value.slice(0, -1)
  } else if (key === 'equals') {
    calculate()
  } else {
    expression.value += key
  }
}

async function copyResult(): Promise<void> {
  if (!liveResult.value) return
  try {
    await copyText(liveResult.value)
    copied.value = true
    window.setTimeout(() => { copied.value = false }, 1600)
  } catch {
    error.value = '复制失败，请检查剪贴板权限。'
  }
}

function useHistory(item: HistoryItem): void {
  expression.value = item.result
  error.value = ''
  copied.value = false
  justCalculated.value = true
}

function clearHistory(): void {
  history.value = []
}
</script>

<template>
  <div class="calculator-tool">
    <section class="calculator-panel">
      <div class="calculator-display">
        <div class="calculator-display-heading"><CalculatorIcon :size="16" /><span>本机计算</span></div>
        <input
          v-model="expression"
          class="calculator-expression"
          type="text"
          inputmode="decimal"
          maxlength="300"
          spellcheck="false"
          placeholder="输入表达式，例如 (12 + 3) × 4"
          aria-label="计算表达式"
          @input="error = ''; copied = false; justCalculated = false"
          @keydown.enter.prevent="calculate"
        />
        <div class="calculator-live-row">
          <span>{{ error || '实时结果' }}</span>
          <strong v-if="liveResult && !error">{{ liveResult }}</strong>
          <button v-if="liveResult && !error" class="quiet-button" aria-label="复制结果" @click="copyResult"><Check v-if="copied" :size="14" /><Copy v-else :size="14" /></button>
        </div>
      </div>
      <div class="calculator-keypad">
        <button
          v-for="key in keys"
          :key="key.value"
          class="calculator-key"
          :class="[`calculator-key-${key.kind}`, { 'calculator-key-active': key.kind === 'operator' && expression.endsWith(key.value) }]"
          :aria-label="key.value === 'backspace' ? '删除一位' : key.value === 'clear' ? '清空' : key.label"
          @click="press(key.value)"
        >
          <Delete v-if="key.value === 'backspace'" :size="16" />
          <span v-else>{{ key.label }}</span>
        </button>
      </div>
      <p class="calculator-footnote">支持 +、−、×、÷、括号、小数和 e 科学计数法；按 Enter 计算。结果显示 12 位有效数字，历史记录仅保留在当前工具页。</p>
    </section>

    <aside class="calculator-history-panel">
      <div class="calculator-history-heading"><div><Clock :size="15" /><strong>计算历史</strong></div><button class="quiet-button" :disabled="!history.length" @click="clearHistory">清空</button></div>
      <div v-if="history.length" class="calculator-history-list">
        <button v-for="item in history" :key="item.id" class="calculator-history-item" @click="useHistory(item)">
          <code>{{ item.expression }}</code><strong>= {{ item.result }}</strong>
        </button>
      </div>
      <div v-else class="calculator-history-empty"><Clock :size="20" /><span>计算结果会显示在这里</span></div>
    </aside>
  </div>
</template>
