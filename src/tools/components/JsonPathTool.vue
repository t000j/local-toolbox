<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { Check, Copy, Play, RotateCcw, X } from '@lucide/vue'
import { copyText } from '../clipboard'
import { jsonPathLimits, type JsonPathRequest, type JsonPathResponse, type JsonPathResult } from '../jsonPathTypes'

const sampleInput = JSON.stringify({ store: { books: [
  { title: 'TypeScript 入门', category: '开发', price: 59 },
  { title: 'Vue 实战', category: '开发', price: 79 },
  { title: '桌面应用设计', category: '设计', price: 99 },
] }, ready: true }, null, 2)
const examples = [
  { label: '全部书名', path: '$.store.books[*].title' },
  { label: '第一本书', path: '$.store.books[0]' },
  { label: '价格低于 80', path: '$.store.books[?@.price < 80].title' },
  { label: '所有价格', path: '$..price' },
  { label: '前两本书', path: '$.store.books[0:2]' },
]
const input = ref(sampleInput)
const expression = ref(examples[0].path)
const result = shallowRef<JsonPathResult | null>(null)
const error = ref('')
const busy = ref(false)
const page = ref(1)
const copied = ref('')
const pages = computed(() => Math.max(1, Math.ceil((result.value?.matches.length ?? 0) / 25)))
const visible = computed(() => result.value?.matches.slice((page.value - 1) * 25, page.value * 25) ?? [])
let worker: Worker | null = null
let timeout: number | undefined
let copiedTimer: number | undefined

function stopWorker(): void {
  worker?.terminate()
  worker = null
  window.clearTimeout(timeout)
  timeout = undefined
  busy.value = false
}
function invalidate(): void {
  stopWorker()
  result.value = null
  error.value = ''
  copied.value = ''
  page.value = 1
}
watch([input, expression], invalidate, { flush: 'sync' })
function cancelQuery(): void { stopWorker(); error.value = '已取消本次查询。' }
function loadExample(): void { input.value = sampleInput; expression.value = examples[0].path; invalidate() }
function clearAll(): void { input.value = ''; invalidate() }
function runQuery(): void {
  invalidate()
  if (!input.value.trim()) { error.value = '请先输入 JSON。'; return }
  if (!expression.value.trim()) { error.value = '请输入 JSONPath 表达式。'; return }
  if (new TextEncoder().encode(input.value).byteLength > jsonPathLimits.inputBytes) { error.value = 'JSON 输入超过 1 MiB。'; return }
  if (expression.value.length > jsonPathLimits.expressionLength) { error.value = 'JSONPath 表达式不能超过 2000 个字符。'; return }
  try {
    const current = new Worker(new URL('../jsonPath.worker.ts', import.meta.url), { type: 'module' })
    worker = current
    busy.value = true
    current.onmessage = (event: MessageEvent<JsonPathResponse>) => {
      if (worker !== current) return
      if (event.data.ok) result.value = event.data.result
      else error.value = event.data.error
      stopWorker()
    }
    current.onerror = (event) => {
      if (worker !== current) return
      event.preventDefault()
      stopWorker()
      error.value = '查询线程未能完成，请检查表达式或缩小数据范围。'
    }
    timeout = window.setTimeout(() => {
      if (worker !== current) return
      stopWorker()
      error.value = '查询超过 3 秒，已停止；请缩小数据范围或简化表达式。'
    }, jsonPathLimits.timeoutMs)
    current.postMessage({ input: input.value, expression: expression.value } satisfies JsonPathRequest)
  } catch {
    stopWorker()
    error.value = '无法启动本机查询线程，请重试。'
  }
}
async function copyResult(value: string, key: string): Promise<void> {
  try {
    await copyText(value)
    copied.value = key
    window.clearTimeout(copiedTimer)
    copiedTimer = window.setTimeout(() => { copied.value = '' }, 1500)
  } catch { error.value = '复制失败，请检查剪贴板权限。' }
}
onBeforeUnmount(() => { stopWorker(); window.clearTimeout(copiedTimer) })
</script>

<template>
  <div class="jsonpath-tool">
    <div class="field-heading"><label for="jsonpath-input">输入 JSON</label><div class="action-buttons"><button class="quiet-button" @click="loadExample"><RotateCcw :size="14" /> 加载示例</button><button class="quiet-button" :disabled="!input" @click="clearAll"><X :size="14" /> 清空</button></div></div>
    <textarea id="jsonpath-input" v-model="input" class="code-input jsonpath-input" :maxlength="jsonPathLimits.inputBytes" spellcheck="false" placeholder="粘贴需要查询的 JSON…"></textarea>
    <div class="jsonpath-query"><label for="jsonpath-expression">JSONPath</label><input id="jsonpath-expression" v-model="expression" :maxlength="jsonPathLimits.expressionLength" spellcheck="false" placeholder="例如 $.store.books[*].title" @keydown.ctrl.enter.prevent="runQuery" /><button v-if="busy" class="secondary-button" @click="cancelQuery">取消查询</button><button v-else class="primary-button" :disabled="!input.trim() || !expression.trim()" @click="runQuery"><Play :size="14" /> 查询</button></div>
    <div class="jsonpath-examples"><span>示例路径</span><button v-for="example in examples" :key="example.path" class="quiet-button" :title="example.path" @click="expression = example.path">{{ example.label }}</button></div>
    <p class="form-hint">支持字段、数组索引、通配符、递归、切片及筛选；输入上限 1 MiB，最多保留 500 个命中，Ctrl+Enter 查询。</p>
    <p v-if="busy" class="jsonpath-feedback" role="status"><span class="loading-pulse"></span> 正在本机查询…</p>
    <p v-if="error" class="inline-error" role="alert">{{ error }}</p>
    <section v-if="result" class="jsonpath-results">
      <div class="jsonpath-results-heading"><div><strong>{{ result.truncated ? '已保留' : '命中' }} {{ result.matches.length }} 项</strong><span>{{ result.elapsedMs }} ms</span></div><div class="action-buttons"><button class="quiet-button" @click="copyResult(result.valuesJson, 'values')"><Check v-if="copied === 'values'" :size="14" /><Copy v-else :size="14" /> 复制值数组</button><button class="quiet-button" :disabled="!result.matches.length" @click="copyResult(JSON.stringify(result.matches.map((item) => item.path), null, 2), 'paths')">复制路径数组</button></div></div>
      <p v-if="result.truncated" class="jsonpath-limit" role="status">{{ result.limitReason === 'count' ? '命中超过 500 项，仅保留前 500 项。' : '结果达到 2 MiB 体积上限，已停止收集。' }} 请缩小查询范围。</p>
      <p v-else-if="!result.matches.length" class="jsonpath-empty">表达式有效，但没有匹配到数据。</p>
      <article v-for="(item, index) in visible" :key="index" class="jsonpath-match">
        <header><code>{{ item.path }}</code><span>{{ item.valueType }}</span><button class="quiet-button" @click="copyResult(item.path, item.path + ':path')">复制路径</button><button class="quiet-button" @click="copyResult(item.valueText, item.path + ':value')">复制值</button></header>
        <pre>{{ item.valueText }}</pre>
      </article>
      <div v-if="result.matches.length" class="native-pagination"><span>每页 25 项</span><button class="quiet-button" :disabled="page <= 1" @click="page--">上一页</button><span>{{ page }} / {{ pages }}</span><button class="quiet-button" :disabled="page >= pages" @click="page++">下一页</button></div>
    </section>
  </div>
</template>

<style scoped>
.jsonpath-tool { display: grid; min-width: 0; gap: 12px; }
.jsonpath-input { min-height: 210px; resize: vertical; }
.jsonpath-query { display: flex; align-items: center; gap: 9px; }
.jsonpath-query label { color: #74788b; font-size: 11px; }
.jsonpath-query input { flex: 1; min-width: 0; height: 36px; padding: 8px 10px; border: 1px solid #e5e5ef; border-radius: 8px; font-family: Consolas, monospace; font-size: 12px; }
.jsonpath-examples { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; }
.jsonpath-examples > span { margin-right: 6px; color: #969bad; font-size: 10px; }
.jsonpath-feedback { display: flex; align-items: center; gap: 9px; margin: 0; color: #77728f; font-size: 11px; }
.jsonpath-results { display: grid; gap: 11px; padding-top: 13px; border-top: 1px solid #eeeef4; }
.jsonpath-results-heading, .jsonpath-results-heading > div { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.jsonpath-results-heading { justify-content: space-between; }
.jsonpath-results-heading strong { color: #555970; font-size: 12px; }
.jsonpath-results-heading span { color: #989daf; font-size: 10px; }
.jsonpath-limit { margin: 0; padding: 10px; border-radius: 7px; background: #fffaf0; color: #a0875c; font-size: 11px; line-height: 1.6; }
.jsonpath-empty { padding: 22px; border: 1px dashed #e4e4ee; border-radius: 9px; color: #969bad; text-align: center; font-size: 11px; }
.jsonpath-match { display: grid; min-width: 0; gap: 8px; padding: 12px; border: 1px solid #e8e7ef; border-radius: 9px; }
.jsonpath-match header { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; }
.jsonpath-match code { flex: 1; min-width: 140px; overflow-wrap: anywhere; color: #655aab; font-size: 11px; }
.jsonpath-match header span { color: #9b9baa; font-size: 9px; }
.jsonpath-match pre { max-height: 180px; overflow: auto; margin: 0; padding: 10px; border-radius: 7px; background: #fafafd; color: #646a7d; font: 11px/1.65 Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
@media (max-width: 850px) { .jsonpath-query { flex-wrap: wrap; } .jsonpath-query input { flex-basis: 70%; } }
</style>
