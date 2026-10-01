<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ArrowLeftRight, Copy } from '@lucide/vue'
import { copyText } from '../clipboard'
import type { TextDiffRequest, TextDiffResult } from '../textDiff'
import { useWorkerTask } from '../useWorkerTask'

const before = ref(''), after = ref(''), changesOnly = ref(false), page = ref(1), copied = ref(false)
const { result, error, busy, reset, cancel, run } = useWorkerTask<TextDiffRequest, TextDiffResult>(
  () => new Worker(new URL('../textDiff.worker.ts', import.meta.url), { type: 'module' }),
)
const filtered = computed(() => result.value?.lines.filter(line => !changesOnly.value || line.kind !== 'same') ?? [])
const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / 100)))
const visible = computed(() => filtered.value.slice((page.value - 1) * 100, page.value * 100))
let revision = 0
function invalidate(): void { revision++; reset(); page.value = 1; copied.value = false }
watch([before, after], invalidate, { flush: 'sync' })
watch(changesOnly, () => { page.value = 1 })
function compare(): void { invalidate(); run({ before: before.value, after: after.value }) }
async function copy(): Promise<void> {
  if (!result.value) return
  const version = revision
  const text = result.value.lines.map(line => `${line.kind === 'add' ? '+' : line.kind === 'remove' ? '-' : ' '} ${line.text}`).join('\n')
  try { await copyText(text); if (version === revision) copied.value = true }
  catch { if (version === revision) error.value = '复制失败，请检查剪贴板权限。' }
}
onBeforeUnmount(() => { revision++ })
</script>

<template>
  <div class="tool-form">
    <div class="workbench-grid">
      <section class="editor-column">
        <div class="field-heading"><label for="diff-before">原始文本（可为空）</label></div>
        <textarea id="diff-before" v-model="before" class="code-input" spellcheck="false" placeholder="原始文本…"></textarea>
      </section>
      <section class="editor-column">
        <div class="field-heading"><label for="diff-after">修改后文本（可为空）</label></div>
        <textarea id="diff-after" v-model="after" class="code-input" spellcheck="false" placeholder="修改后文本…"></textarea>
      </section>
    </div>
    <div class="tool-action-row">
      <p class="form-hint" :class="{ 'hint-error': error }" aria-live="polite">{{ error || (busy ? '正在本机比较…'
        : '每段最多 100,000 字符、2000 行；3 秒超时保护。统一 CRLF / CR / LF，保留空格及末尾换行差异。') }}</p>
      <button v-if="busy" class="secondary-button" @click="cancel">取消比较</button>
      <button v-else class="primary-button" @click="compare"><ArrowLeftRight :size="14" /> 比较文本</button>
    </div>
    <section v-if="result" class="diff-results">
      <div class="field-heading"><strong>新增 {{ result.added }} 行 · 删除 {{ result.removed }} 行</strong>
        <button class="quiet-button" @click="copy"><Copy :size="14" /> {{ copied ? '已复制' : '复制全部对比' }}</button>
      </div>
      <label class="form-hint"><input v-model="changesOnly" type="checkbox" /> 只看变化行</label>
      <p v-if="!result.added && !result.removed" class="form-hint">两段文本相同（已统一换行符）。</p>
      <div class="diff-table" role="table" aria-label="逐行文本差异">
        <div class="diff-line" role="row"><span>原行</span><span>新行</span><span></span><span>内容</span></div>
        <div v-for="(line, index) in visible" :key="index" class="diff-line" :class="line.kind" role="row">
          <span>{{ line.oldLine ?? '—' }}</span><span>{{ line.newLine ?? '—' }}</span>
          <span>{{ line.kind === 'add' ? '+' : line.kind === 'remove' ? '−' : ' ' }}</span>
          <pre>{{ line.text === '' ? '（空行）' : line.text }}</pre>
        </div>
      </div>
      <div v-if="pages > 1" class="diff-pagination">
        <button class="secondary-button" :disabled="page <= 1" @click="page--">上一页</button>
        <span>{{ page }} / {{ pages }}</span>
        <button class="secondary-button" :disabled="page >= pages" @click="page++">下一页</button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.diff-table { margin-top: 12px; border: 1px solid var(--line); border-radius: 6px; overflow: auto; max-height: 600px; }
.diff-line { display: grid; grid-template-columns: 42px 42px 24px minmax(0, 1fr); font: 12px monospace; border-bottom: 1px solid var(--line); }
.diff-line span { padding: 8px 4px; color: var(--muted); }
.diff-line pre { margin: 0; padding: 8px; white-space: pre-wrap; overflow-wrap: anywhere; }
.diff-line.add { background: #16a34a18; }
.diff-line.remove { background: #dc262618; }
.diff-pagination { display: flex; justify-content: center; align-items: center; gap: 12px; margin-top: 12px; font-size: 11px; }
</style>
