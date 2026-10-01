<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Check, Copy, RotateCcw, X } from '@lucide/vue'
import { copyText } from '../clipboard'
import { sanitizeMarkdown } from '../sanitizeMarkdown'
import { useWorkerTask } from '../useWorkerTask'

const sample = '# Markdown 预览\n\n在本机编辑 **Markdown**，不会上传或自动保存。\n\n- 支持列表\n- 支持表格与代码块\n\n```js\nconsole.log("你好");\n```\n'
const input = ref('')
const copied = ref(false)
const { result, error, busy, reset, cancel, run } = useWorkerTask<string, string>(
  () => new Worker(new URL('../markdown.worker.ts', import.meta.url), { type: 'module' }),
)
const preview = computed(() => result.value === null ? '' : sanitizeMarkdown(result.value))
let debounce: ReturnType<typeof setTimeout> | undefined
let copyTimer: ReturnType<typeof setTimeout> | undefined
let revision = 0
watch(input, () => {
  revision++
  reset()
  copied.value = false
  clearTimeout(copyTimer)
  clearTimeout(debounce)
  if (!input.value) return
  if (input.value.length > 100_000) { error.value = 'Markdown 不能超过 100,000 个字符。'; return }
  debounce = setTimeout(() => run(input.value), 350)
}, { flush: 'sync' })
async function copyHtml(): Promise<void> {
  const version = revision
  if (!preview.value) return
  try {
    await copyText(preview.value)
    if (version !== revision) return
    copied.value = true
    copyTimer = setTimeout(() => { copied.value = false }, 1500)
  } catch { if (version === revision) error.value = '复制失败，请检查剪贴板权限。' }
}
function cancelPreview(): void { clearTimeout(debounce); cancel() }
onBeforeUnmount(() => { revision++; clearTimeout(debounce); clearTimeout(copyTimer) })
</script>

<template>
  <div class="tool-form">
    <div class="workbench-grid">
      <section class="editor-column">
        <div class="field-heading"><label for="markdown-input">Markdown 文本</label><div class="action-buttons">
          <button class="quiet-button" @click="input = sample"><RotateCcw :size="14" /> 示例</button>
          <button class="quiet-button" :disabled="!input" @click="input = ''"><X :size="14" /> 清空</button>
        </div></div>
        <textarea id="markdown-input" v-model="input" class="code-input markdown-editor" spellcheck="false"
          placeholder="# 在这里开始写作&#10;&#10;编辑后自动预览，最多 100,000 字符…"></textarea>
      </section>
      <section class="editor-column">
        <div class="field-heading"><span id="markdown-preview-label">安全预览</span>
          <button class="quiet-button" :disabled="!preview" @click="copyHtml">
            <Check v-if="copied" :size="14" /><Copy v-else :size="14" /> {{ copied ? '已复制' : '复制安全 HTML' }}
          </button>
        </div>
        <div class="markdown-preview" aria-labelledby="markdown-preview-label">
          <div v-if="preview" class="markdown-content" v-html="preview"></div>
          <p v-else class="form-hint">{{ busy ? '正在本机生成预览…' : '输入 Markdown 后，在这里预览。' }}</p>
        </div>
      </section>
    </div>
    <p class="form-hint">支持标题、列表、引用、表格与代码块。HTML 按白名单净化；脚本、样式、图片与嵌入内容不显示，链接仅显示文字。</p>
    <div class="tool-action-row">
      <p class="form-hint" :class="{ 'hint-error': error }" aria-live="polite">
        {{ error || (busy ? '正在生成预览…' : '不加载外部资源、不上传或自动保存；3 秒超时保护。') }}
      </p>
      <button v-if="busy" class="secondary-button" @click="cancelPreview">取消预览</button>
    </div>
  </div>
</template>

<style scoped>
.markdown-editor, .markdown-preview { min-height: 360px; }
.markdown-preview { max-height: 650px; overflow: auto; border: 1px solid var(--line); border-radius: 8px; padding: 16px; }
.markdown-content { font-size: 13px; line-height: 1.75; overflow-wrap: anywhere; }
.markdown-content :deep(h1), .markdown-content :deep(h2), .markdown-content :deep(h3) { margin: 1em 0 .5em; line-height: 1.3; }
.markdown-content :deep(h1) { font-size: 24px; }
.markdown-content :deep(h2) { font-size: 20px; }
.markdown-content :deep(h3) { font-size: 16px; }
.markdown-content :deep(pre) { overflow-x: auto; padding: 12px; border: 1px solid var(--line); border-radius: 6px; }
.markdown-content :deep(code) { font-family: ui-monospace, monospace; font-size: 12px; }
.markdown-content :deep(blockquote) { margin-left: 0; padding-left: 12px; border-left: 3px solid var(--line); color: var(--muted); }
.markdown-content :deep(table) { border-collapse: collapse; display: block; overflow-x: auto; }
.markdown-content :deep(th), .markdown-content :deep(td) { padding: 6px 10px; border: 1px solid var(--line); }
.markdown-content :deep(a) { text-decoration: underline dotted; }
</style>
