<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Check, Copy, Play, RotateCcw, X } from '@lucide/vue'
import { copyText } from '../clipboard'
import type { RegexRequest, RegexResult } from '../regex'
import { useWorkerTask } from '../useWorkerTask'

const pattern = ref('')
const input = ref('')
const flags = ref(['g'])
const flagOptions = [
  { flag: 'g', label: '全部匹配' }, { flag: 'i', label: '忽略大小写' }, { flag: 'm', label: '多行锚点' },
  { flag: 's', label: '点号含换行' }, { flag: 'u', label: 'Unicode' }, { flag: 'y', label: '粘连匹配' },
]
const copied = ref(false)
const page = ref(1)
const { result, error, busy, reset, cancel, run } = useWorkerTask<RegexRequest, RegexResult>(
  () => new Worker(new URL('../regex.worker.ts', import.meta.url), { type: 'module' }),
)
const pages = computed(() => Math.max(1, Math.ceil((result.value?.matches.length ?? 0) / 25)))
const visible = computed(() => result.value?.matches.slice((page.value - 1) * 25, page.value * 25) ?? [])
let revision = 0
let copyTimer: ReturnType<typeof setTimeout> | undefined
function invalidate(): void { revision++; reset(); copied.value = false; page.value = 1; clearTimeout(copyTimer) }
watch([pattern, input, flags], invalidate, { flush: 'sync', deep: true })
function test(): void {
  invalidate()
  if (!pattern.value || pattern.value.length > 2000) { error.value = '请输入 1—2000 个字符的表达式。'; return }
  if (input.value.length > 100_000) { error.value = '样本文本不能超过 100,000 个字符。'; return }
  run({ pattern: pattern.value, flags: flags.value.join(''), input: input.value })
}
function example(): void { pattern.value = '(?<word>[a-z]+)'; input.value = 'Hello world\n你好 LocalToolbox'; flags.value = ['g', 'i'] }
function clear(): void { pattern.value = ''; input.value = ''; invalidate() }
async function copy(): Promise<void> {
  const version = revision
  if (!result.value) return
  try {
    await copyText(JSON.stringify(result.value.matches, null, 2))
    if (version !== revision) return
    copied.value = true
    copyTimer = setTimeout(() => { copied.value = false }, 1500)
  } catch { if (version === revision) error.value = '复制失败，请检查剪贴板权限。' }
}
onBeforeUnmount(() => { revision++; clearTimeout(copyTimer) })
</script>

<template>
  <div class="tool-form">
    <div class="field-heading"><label for="regex-pattern">JavaScript 正则表达式（不含 / 分隔符）</label>
      <div class="action-buttons">
        <button class="quiet-button" @click="example"><RotateCcw :size="14" /> 示例</button>
        <button class="quiet-button" :disabled="!input && !pattern" @click="clear"><X :size="14" /> 清空</button>
      </div>
    </div>
    <input id="regex-pattern" v-model="pattern" class="regex-pattern" spellcheck="false" placeholder="例如 (?<word>[a-z]+)"
      @keydown.ctrl.enter.prevent="test" />
    <div class="regex-flags">
      <label v-for="option in flagOptions" :key="option.flag">
        <input v-model="flags" type="checkbox" :value="option.flag" /> <code>{{ option.flag }}</code> {{ option.label }}
      </label>
    </div>
    <label for="regex-input" class="regex-label">样本文本（可为空）</label>
    <textarea id="regex-input" v-model="input" class="code-input regex-input" spellcheck="false"
      placeholder="输入用于匹配的文本，最多 100,000 字符…" @keydown.ctrl.enter.prevent="test"></textarea>
    <div class="tool-action-row">
      <p class="form-hint" :class="{ 'hint-error': error }" aria-live="polite">
        {{ error || (busy ? '正在本机匹配…' : '表达式最多 2000 字符，3 秒超时可取消；Ctrl+Enter 测试。') }}
      </p>
      <button v-if="busy" class="secondary-button" @click="cancel">取消测试</button>
      <button v-else class="primary-button" :disabled="!pattern" @click="test"><Play :size="14" /> 测试匹配</button>
    </div>
    <p class="form-hint">使用当前 WebView 的 JavaScript 正则语法；未勾选 g 时仅返回首个匹配。
      位置从 0 起算，按 UTF-16 编码单元计数。</p>
    <section v-if="result" class="regex-results">
      <div class="field-heading"><strong>{{ result.truncated ? '已保留' : '匹配到' }} {{ result.matches.length }} 项</strong>
        <span class="form-hint">{{ result.elapsedMs }} ms</span>
        <button class="quiet-button" @click="copy"><Check v-if="copied" :size="14" /><Copy v-else :size="14" />
          {{ copied ? '已复制' : '复制结果 JSON' }}
        </button>
      </div>
      <p v-if="result.truncated" class="form-hint" role="status">
        达到 500 项或 2 MiB 保守结果上限，仅显示部分匹配；请缩小范围。
      </p>
      <p v-else-if="!result.matches.length" class="form-hint">表达式有效，没有匹配结果。</p>
      <article v-for="(match, index) in visible" :key="index" class="regex-match">
        <header>匹配 {{ (page - 1) * 25 + index + 1 }} · [{{ match.index }}, {{ match.end }})</header>
        <pre>{{ match.value === '' ? '（空匹配）' : match.value }}</pre>
        <details v-if="match.captures.length"><summary>捕获组（{{ match.captures.length }}）</summary>
          <pre v-for="(value, group) in match.captures" :key="group">{{ group + 1 }}: {{
            value === null ? '（未参与匹配）' : JSON.stringify(value) }}</pre>
          <pre v-if="Object.keys(match.groups).length">命名组：{{ JSON.stringify(match.groups, null, 2) }}</pre>
        </details>
      </article>
      <div v-if="pages > 1" class="regex-pagination">
        <button class="secondary-button" :disabled="page <= 1" @click="page--">上一页</button>
        <span>{{ page }} / {{ pages }}</span>
        <button class="secondary-button" :disabled="page >= pages" @click="page++">下一页</button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.regex-pattern { width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); color: inherit; }
.regex-flags { display: flex; flex-wrap: wrap; gap: 12px; }
.regex-flags label { display: flex; align-items: center; gap: 5px; font-size: 11px; color: var(--muted); }
.regex-label { font-size: 11px; color: var(--muted); }
.regex-input { min-height: 180px; }
.regex-results { border-top: 1px solid var(--line); padding-top: 14px; }
.regex-match { border: 1px solid var(--line); border-radius: 6px; padding: 12px; margin-top: 10px; }
.regex-match header, .regex-match summary { color: var(--muted); font-size: 11px; }
.regex-match pre { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 200px; overflow: auto; font-size: 12px; }
.regex-pagination { display: flex; justify-content: center; align-items: center; gap: 12px; margin-top: 12px; font-size: 11px; }
</style>
