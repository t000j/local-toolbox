<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { Check, Copy, Play, X } from '@lucide/vue'
import { copyText } from '../clipboard'
import type { SqlLanguage, SqlRequest } from '../sql'
import { useWorkerTask } from '../useWorkerTask'

const input = ref('')
const language = ref<SqlLanguage>('sql')
const indent = ref(2)
const keywordCase = ref<SqlRequest['keywordCase']>('upper')
const copied = ref(false)
const { result, error, busy, reset, cancel, run } = useWorkerTask<SqlRequest, string>(
  () => new Worker(new URL('../sql.worker.ts', import.meta.url), { type: 'module' }),
)
let revision = 0
let copyTimer: ReturnType<typeof setTimeout> | undefined
function invalidate(): void { revision++; reset(); copied.value = false; clearTimeout(copyTimer) }
watch([input, language, indent, keywordCase], invalidate, { flush: 'sync' })
function format(): void {
  invalidate()
  if (!input.value.trim()) { error.value = '请先输入 SQL。'; return }
  if (input.value.length > 100_000) { error.value = 'SQL 输入不能超过 100,000 个字符。'; return }
  run({ input: input.value, language: language.value, indent: indent.value, keywordCase: keywordCase.value })
}
async function copy(): Promise<void> {
  const version = revision
  if (!result.value) return
  try {
    await copyText(result.value)
    if (version !== revision) return
    copied.value = true
    copyTimer = setTimeout(() => { copied.value = false }, 1500)
  } catch { if (version === revision) error.value = '复制失败，请检查剪贴板权限。' }
}
onBeforeUnmount(() => { revision++; clearTimeout(copyTimer) })
</script>

<template>
  <div class="tool-form">
    <div class="sql-options">
      <label>SQL 方言 <select v-model="language">
        <option value="sql">标准 SQL</option><option value="mysql">MySQL</option><option value="postgresql">PostgreSQL</option>
        <option value="sqlite">SQLite</option><option value="transactsql">SQL Server</option>
      </select></label>
      <label>关键字 <select v-model="keywordCase">
        <option value="upper">大写</option><option value="lower">小写</option><option value="preserve">保留原样</option>
      </select></label>
      <label>缩进 <select v-model.number="indent"><option :value="2">2 空格</option><option :value="4">4 空格</option></select></label>
    </div>
    <div class="workbench-grid">
      <section class="editor-column">
        <div class="field-heading"><label for="sql-input">输入 SQL</label>
          <button class="quiet-button" :disabled="!input" @click="input = ''"><X :size="14" /> 清空</button>
        </div>
        <textarea id="sql-input" v-model="input" class="code-input" spellcheck="false"
          placeholder="select id, name from users where active = 1;" @keydown.ctrl.enter.prevent="format"></textarea>
      </section>
      <section class="editor-column">
        <div class="field-heading"><label for="sql-output">格式化结果</label>
          <button class="quiet-button" :disabled="!result" @click="copy">
            <Check v-if="copied" :size="14" /><Copy v-else :size="14" /> {{ copied ? '已复制' : '复制' }}
          </button>
        </div>
        <textarea id="sql-output" :value="result ?? ''" class="code-input result-input" readonly spellcheck="false"
          placeholder="格式化结果会显示在这里"></textarea>
      </section>
    </div>
    <p class="form-hint">仅整理排版，不连接数据库、不执行 SQL，也不保证 SQL 语义正确。存储过程及自定义分隔符不支持。</p>
    <div class="tool-action-row">
      <p class="form-hint" :class="{ 'hint-error': error }" aria-live="polite">
        {{ error || (busy ? '正在本机格式化…' : '最多 100,000 字符，3 秒超时保护；Ctrl+Enter 格式化。') }}
      </p>
      <button v-if="busy" class="secondary-button" @click="cancel">取消</button>
      <button v-else class="primary-button" :disabled="!input.trim()" @click="format"><Play :size="14" /> 格式化</button>
    </div>
  </div>
</template>

<style scoped>
.sql-options { display: flex; flex-wrap: wrap; gap: 12px; }
.sql-options label { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 11px; }
.sql-options select { padding: 6px 9px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); color: inherit; }
</style>
