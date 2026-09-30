<script setup lang="ts">
import { computed, ref } from 'vue'
import { Calculator as CalculatorIcon, Check, Clock, Copy, Delete } from '@lucide/vue'
import { copyText } from '../clipboard'

type Token = { type: 'number' | 'operator' | 'left' | 'right'; value: string }
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

function tokenize(source: string): Token[] {
  const normalized = source.replace(/×/g, '*').replace(/÷/g, '/')
  const tokens: Token[] = []
  let position = 0
  while (position < normalized.length) {
    const character = normalized[position]
    if (/\s/.test(character)) {
      position++
      continue
    }
    const number = normalized.slice(position).match(/^(?:\d+(?:\.\d*)?|\.\d+)/)
    if (number) {
      tokens.push({ type: 'number', value: number[0] })
      position += number[0].length
    } else if ('+-*/'.includes(character)) {
      tokens.push({ type: 'operator', value: character })
      position++
    } else if (character === '(' || character === ')') {
      tokens.push({ type: character === '(' ? 'left' : 'right', value: character })
      position++
    } else {
      throw new Error(`不支持字符“${character}”。`)
    }
    if (tokens.length > 200) throw new Error('表达式过长，请分步计算。')
  }
  return tokens
}

function evaluate(source: string): number {
  if (source.length > 300) throw new Error('表达式过长，请分步计算。')
  const tokens = tokenize(source)
  if (!tokens.length) throw new Error('请输入要计算的表达式。')
  let position = 0

  function parsePrimary(): number {
    const token = tokens[position]
    if (token?.type === 'number') {
      position++
      const value = Number(token.value)
      if (!Number.isFinite(value)) throw new Error('数字超出可计算范围。')
      return value
    }
    if (token?.type === 'left') {
      position++
      const value = parseExpression()
      if (tokens[position]?.type !== 'right') throw new Error('括号没有配对。')
      position++
      return value
    }
    throw new Error('这里需要数字或左括号。')
  }

  function parseUnary(): number {
    const token = tokens[position]
    if (token?.type === 'operator' && (token.value === '+' || token.value === '-')) {
      position++
      const value = parseUnary()
      return token.value === '-' ? -value : value
    }
    return parsePrimary()
  }

  function parseTerm(): number {
    let value = parseUnary()
    while (tokens[position]?.type === 'operator' && ['*', '/'].includes(tokens[position].value)) {
      const operator = tokens[position++].value
      const right = parseUnary()
      if (operator === '/' && right === 0) throw new Error('除数不能为零。')
      value = operator === '*' ? value * right : value / right
    }
    return value
  }

  function parseExpression(): number {
    let value = parseTerm()
    while (tokens[position]?.type === 'operator' && ['+', '-'].includes(tokens[position].value)) {
      const operator = tokens[position++].value
      const right = parseTerm()
      value = operator === '+' ? value + right : value - right
    }
    return value
  }

  const result = parseExpression()
  if (position < tokens.length) throw new Error(tokens[position].type === 'right' ? '括号没有配对。' : '运算符之间缺少数字。')
  if (!Number.isFinite(result)) throw new Error('结果超出可计算范围。')
  return result
}

function formatNumber(value: number): string {
  if (value === 0) return '0'
  return Number(value.toPrecision(12)).toString()
}

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
      <p class="calculator-footnote">支持 +、−、×、÷、括号和小数；按 Enter 计算。结果显示 12 位有效数字，历史记录保留在本次会话中。</p>
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
