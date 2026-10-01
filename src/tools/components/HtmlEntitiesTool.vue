<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { ArrowDownUp, Copy } from '@lucide/vue'
import { copyText } from '../clipboard'
import { convertHtmlEntities, supportedEntities } from '../htmlEntities'

const input = ref(''), output = ref<string | null>(null), error = ref(''), encode = ref(true)
const numeric = ref(false), copied = ref(false)
let revision = 0
function invalidate(): void { revision++; output.value = null; error.value = ''; copied.value = false }
watch([input, encode, numeric], invalidate, { flush: 'sync' })
function convert(): void {
  invalidate()
  try { output.value = convertHtmlEntities(input.value, encode.value, numeric.value) }
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
    <label v-if="encode" class="form-hint"><input v-model="numeric" type="checkbox"> 同时将非 ASCII 字符编码为十六进制实体</label>
    <p class="form-hint">编码 &amp; &lt; &gt; 双引号和单引号；解码仅处理带分号的常见命名实体及十进制/十六进制数字实体。</p>
    <p class="form-hint">每次转换一层；未知命名实体与未闭合实体保持原样。严格按 Unicode 标量解码，不模拟浏览器纠错。</p>
    <details><summary>支持的命名实体</summary><p class="form-hint">{{ supportedEntities }}</p></details>
    <div class="workbench-grid">
      <section class="editor-column">
        <div class="field-heading"><label for="html-input">输入（可为空）</label></div>
        <textarea id="html-input" v-model="input" class="code-input" spellcheck="false" placeholder="输入需要转换的内容…"
          @keydown.ctrl.enter.prevent="convert"></textarea>
      </section>
      <section class="editor-column">
        <div class="field-heading"><label for="html-output">结果</label>
          <button class="quiet-button" :disabled="output === null" @click="copy">
            <Copy :size="14" /> {{ copied ? '已复制' : '复制' }}
          </button>
        </div>
        <textarea id="html-output" :value="output ?? ''" class="code-input result-input" readonly spellcheck="false"
          placeholder="纯文本结果，不作为 HTML 执行…"></textarea>
      </section>
    </div>
    <div class="tool-action-row">
      <p class="form-hint" :class="{ 'hint-error': error }" aria-live="polite">
        {{ error || (output !== null ? '转换完成。' : '每次仅转换一层；本机处理，最多 100,000 个 UTF-16 单元。Ctrl+Enter 转换。') }}
      </p>
      <button class="primary-button" @click="convert"><ArrowDownUp :size="14" /> {{ encode ? '编码' : '解码' }}</button>
    </div>
  </div>
</template>
