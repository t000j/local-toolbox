<script setup lang="ts">
import { ref, watch } from 'vue'
import { Check, Copy, Sparkles, X } from '@lucide/vue'
import { copyText } from '../clipboard'
import { formatXml } from '../xml'

const input = ref('<toolbox><name>LocalToolbox</name><tools><tool>XML</tool></tools></toolbox>')
const indent = ref(2)
const output = ref('')
const error = ref('')
const copied = ref(false)
let revision = 0
watch([input, indent], () => {
  revision++
  output.value = ''
  error.value = ''
  copied.value = false
}, { flush: 'sync' })

function format(): void {
  error.value = ''
  copied.value = false
  try { output.value = formatXml(input.value, indent.value) }
  catch (cause) {
    output.value = ''
    error.value = cause instanceof Error ? cause.message : 'XML 处理失败。'
  }
}

async function copyOutput(): Promise<void> {
  const current = revision
  try {
    await copyText(output.value)
    if (current === revision) { copied.value = true; error.value = '' }
  } catch {
    if (current === revision) error.value = '复制失败，请手动选择结果复制。'
  }
}
</script>

<template>
  <div class="tool-form">
    <div class="workbench-grid">
      <section class="editor-column">
        <div class="field-heading">
          <label for="xml-input">输入 XML</label>
          <button class="quiet-button" :disabled="!input" @click="input = ''"><X :size="14" /> 清空</button>
        </div>
        <textarea id="xml-input" v-model="input" class="code-input" spellcheck="false" placeholder="在此粘贴 XML…"></textarea>
      </section>
      <section class="editor-column">
        <div class="field-heading">
          <label for="xml-output">处理结果</label>
          <button class="quiet-button" :disabled="!output" @click="copyOutput">
            <Check v-if="copied" :size="14" /><Copy v-else :size="14" /> {{ copied ? '已复制' : '复制' }}
          </button>
        </div>
        <textarea id="xml-output" :value="output" class="code-input result-input" readonly spellcheck="false"
          placeholder="结构校验通过后显示格式化结果"></textarea>
      </section>
    </div>
    <div class="tool-action-row">
      <p class="form-hint" :class="{ 'hint-error': error }" role="status">
        {{ error || (output ? 'XML 结构校验通过；未执行 DTD / XSD 验证。' : '本机处理，输入上限 1 MiB；不加载外部资源。') }}
      </p>
      <div class="action-buttons">
        <label for="xml-indent">缩进</label>
        <select id="xml-indent" v-model="indent"><option :value="2">2 空格</option><option :value="4">4 空格</option></select>
        <button class="primary-button" :disabled="!input.trim()" @click="format"><Sparkles :size="15" /> 校验并格式化</button>
      </div>
    </div>
    <p class="form-hint">保留混合文本、CDATA 与 xml:space="preserve" 区域；仅调整元素间缩进，不支持 DTD 或实体声明。</p>
  </div>
</template>
