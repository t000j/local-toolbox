<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Copy } from '@lucide/vue'
import { copyText } from '../clipboard'
import { decodeUnicode, encodeUnicode, inspectUnicode, type UnicodeFormat, type UnicodeRow } from '../unicode'

const input = ref(''), output = ref<string | null>(null), error = ref(''), copied = ref(false)
const mode = ref<'view' | 'encode' | 'decode'>('view'), format = ref<UnicodeFormat>('utf16')
const rows = ref<UnicodeRow[]>([]), ready = ref(false), page = ref(1)
const pages = computed(() => Math.max(1, Math.ceil(rows.value.length / 50)))
const visible = computed(() => rows.value.slice((page.value - 1) * 50, page.value * 50))
const invalidCount = computed(() => rows.value.filter(row => row.loneSurrogate).length)
let revision = 0
function invalidate(): void {
  revision++; output.value = null; error.value = ''; copied.value = false; rows.value = []; ready.value = false; page.value = 1
}
watch([input, mode, format], invalidate, { flush: 'sync' })
function convert(): void {
  invalidate()
  try {
    const text = mode.value === 'decode' ? decodeUnicode(input.value) : input.value
    const inspected = inspectUnicode(text)
    const result = mode.value === 'encode' ? encodeUnicode(input.value, format.value) : text
    rows.value = inspected; output.value = result; ready.value = true
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '转换失败。' }
}
async function copy(): Promise<void> {
  if (output.value === null) return
  const version = revision
  try { await copyText(output.value); if (version === revision) copied.value = true }
  catch { if (version === revision) error.value = '复制失败，请检查剪贴板权限。' }
}
onBeforeUnmount(() => { revision++ })
</script>

<template>
  <div class="tool-form">
    <div class="mode-switch">
      <button :class="{ selected: mode === 'view' }" @click="mode = 'view'">字符查看</button>
      <button :class="{ selected: mode === 'encode' }" @click="mode = 'encode'">转义编码</button>
      <button :class="{ selected: mode === 'decode' }" @click="mode = 'decode'">转义解码</button>
    </div>
    <div v-if="mode === 'encode'" class="field-heading"><label for="unicode-format">输出形式</label>
      <select id="unicode-format" v-model="format">
        <option value="utf16">UTF-16：\uXXXX（补充字符使用代理对）</option>
        <option value="codepoint">码点：\u{...}（孤立代理项保留为 \uXXXX）</option>
      </select>
    </div>
    <p class="form-hint">只处理字面转义，不执行 JavaScript、不去除引号。解码仅接受 \uXXXX、\u{...} 和 \\；
      \n 等其他转义报错。普通字符原样保留，仅解码一层。</p>
    <p class="form-hint">孤立 UTF-16 代理项会保留并标记；花括号转义必须是 Unicode 标量值。
      表格按码点及孤立代理项拆分，不按可见字形拆分；组合字符和 emoji 序列可能占多行。</p>
    <div class="workbench-grid">
      <section class="editor-column">
        <div class="field-heading"><label for="unicode-input">输入（可为空）</label></div>
        <textarea id="unicode-input" v-model="input" class="code-input" spellcheck="false" placeholder="输入文本或字面转义…"
          @keydown.ctrl.enter.prevent="convert"></textarea>
      </section>
      <section class="editor-column">
        <div class="field-heading"><label for="unicode-output">{{ mode === 'view' ? '原文' : '结果' }}</label>
          <button class="quiet-button" :disabled="output === null" @click="copy">
            <Copy :size="14" /> {{ copied ? '已复制' : '复制' }}
          </button>
        </div>
        <textarea id="unicode-output" :value="output ?? ''" class="code-input result-input" readonly spellcheck="false"
          placeholder="处理结果…"></textarea>
      </section>
    </div>
    <div class="tool-action-row">
      <p class="form-hint" :class="{ 'hint-error': error }" aria-live="polite">
        {{ error || (ready ? (rows.length ? '处理完成。' : '输入为空：结果为空，字符数为 0。')
          : '本机处理，不保存、不联网。原文/解码结果最多 100,000 个 UTF-16 码元；转义输入/输出最多 600,000 字符。Ctrl+Enter 处理。') }}
      </p>
      <button class="primary-button" @click="convert">{{ mode === 'view' ? '查看字符' : mode === 'encode' ? '编码' : '解码' }}</button>
    </div>
    <section v-if="ready" aria-label="Unicode 字符明细">
      <p class="form-hint">{{ mode === 'decode' ? '解码后文本' : '输入文本' }}：{{ rows.length }} 项；
        {{ invalidCount }} 个孤立代理项。UTF-16 偏移从 0 开始；不可见、组合字符以转义显示。</p>
      <div v-if="rows.length" class="unicode-table-wrap">
        <table class="unicode-table">
          <thead><tr><th>#</th><th>UTF-16 偏移</th><th>字符</th><th>码点 / 代理项</th><th>UTF-16 码元</th><th>转义</th></tr></thead>
          <tbody><tr v-for="row in visible" :key="row.index">
            <td>{{ row.index }}</td><td>{{ row.offset }}</td><td><bdi>{{ row.display }}</bdi></td>
            <td>{{ row.codepoint }} <span v-if="row.loneSurrogate" class="hint-error">孤立代理项（非标量）</span></td>
            <td>{{ row.utf16 }}</td><td>{{ row.escaped }}</td>
          </tr></tbody>
        </table>
      </div>
      <div v-if="rows.length" class="native-pagination"><span>每页 50 项</span>
        <button class="quiet-button" :disabled="page <= 1" @click="page--">上一页</button><span>{{ page }} / {{ pages }}</span>
        <button class="quiet-button" :disabled="page >= pages" @click="page++">下一页</button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.unicode-table-wrap { overflow-x: auto; }
.unicode-table { width: 100%; border-collapse: collapse; font-family: monospace; font-size: 12px; }
.unicode-table th, .unicode-table td { text-align: left; padding: 8px; border-bottom: 1px solid var(--border-color, #8884); }
.unicode-table th { white-space: nowrap; }
</style>
