<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ArrowDownUp, Copy } from '@lucide/vue'
import { copyText } from '../clipboard'
import { convertUrl, type UrlMode } from '../urlCodec'

const input = ref(''), output = ref<string | null>(null), error = ref(''), encode = ref(true)
const mode = ref<UrlMode>('component'), copied = ref(false)
const explanation = computed(() => mode.value === 'uri'
  ? '完整 URI：保留 : / ? # & = 等结构字符；解码时保留这些保留字符的转义。不会校验或访问网址。'
  : mode.value === 'form' ? '单个表单字段：空格编码为 +，解码时 + 作为空格；原始 + 编码为 %2B。不是整个查询字符串解析器。'
    : '单个参数/路径片段：编码保留字符，空格编码为 %20；解码时 + 保持原样。')
let revision = 0
function invalidate(): void { revision++; output.value = null; error.value = ''; copied.value = false }
watch([input, encode, mode], invalidate, { flush: 'sync' })
function convert(): void {
  invalidate()
  try { output.value = convertUrl(input.value, encode.value, mode.value) }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '转换失败。' }
}
function swap(): void {
  if (output.value === null) return
  const value = output.value
  encode.value = !encode.value; input.value = value
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
      <button :class="{ selected: encode }" @click="encode = true">编码</button>
      <button :class="{ selected: !encode }" @click="encode = false">解码</button>
      <button class="swap-button" :disabled="output === null" aria-label="交换输入输出及编解码方向" @click="swap">
        <ArrowDownUp :size="14" />
      </button>
    </div>
    <div class="field-heading"><label for="url-mode">处理方式</label>
      <select id="url-mode" v-model="mode">
        <option value="component">单个参数 / 片段（encodeURIComponent）</option>
        <option value="uri">完整 URI（encodeURI）</option>
        <option value="form">单个表单字段（空格 ↔ +）</option>
      </select>
    </div>
    <p class="form-hint">{{ explanation }}</p>
    <div class="workbench-grid">
      <section class="editor-column">
        <div class="field-heading"><label for="url-input">输入（可为空）</label></div>
        <textarea id="url-input" v-model="input" class="code-input" spellcheck="false" placeholder="输入需要转换的内容…"
          @keydown.ctrl.enter.prevent="convert"></textarea>
      </section>
      <section class="editor-column">
        <div class="field-heading"><label for="url-output">结果</label>
          <button class="quiet-button" :disabled="output === null" @click="copy">
            <Copy :size="14" /> {{ copied ? '已复制' : '复制' }}
          </button>
        </div>
        <textarea id="url-output" :value="output ?? ''" class="code-input result-input" readonly spellcheck="false"
          placeholder="转换结果…"></textarea>
      </section>
    </div>
    <div class="tool-action-row">
      <p class="form-hint" :class="{ 'hint-error': error }" aria-live="polite">
        {{ error || (output !== null ? '转换完成。' : '每次仅转换一层；本机处理，最多 100,000 字符。Ctrl+Enter 转换。') }}
      </p>
      <button class="primary-button" @click="convert"><ArrowDownUp :size="14" /> {{ encode ? '编码' : '解码' }}</button>
    </div>
  </div>
</template>
