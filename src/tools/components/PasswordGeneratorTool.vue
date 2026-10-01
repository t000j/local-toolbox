<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { Copy, Sparkles } from '@lucide/vue'
import { copyText } from '../clipboard'
import { generatePasswords, type PasswordGroup } from '../random'
const length = ref(20), count = ref(1), selected = ref<PasswordGroup[]>(['lower', 'upper', 'digits', 'symbols'])
const exclude = ref(false), output = ref(''), error = ref(''), copied = ref(false)
const choices: { key: PasswordGroup; label: string }[] = [
  { key: 'lower', label: '小写字母' }, { key: 'upper', label: '大写字母' }, { key: 'digits', label: '数字' }, { key: 'symbols', label: '符号' },
]
let revision = 0
function clear(): void { revision++; output.value = ''; error.value = ''; copied.value = false }
watch([length, count, selected, exclude], clear, { deep: true, flush: 'sync' })
function generate(): void {
  clear()
  try { output.value = generatePasswords(length.value, count.value, selected.value, exclude.value).join('\n') }
  catch (reason) { error.value = reason instanceof Error ? reason.message : '无法获取安全随机数。' }
}
async function copy(): Promise<void> {
  if (!output.value) return
  const version = revision
  try { await copyText(output.value); if (version === revision) copied.value = true }
  catch { if (version === revision) error.value = '复制失败，请检查剪贴板权限。' }
}
onBeforeUnmount(clear)
</script>

<template>
  <div class="tool-form">
    <div class="field-heading">
      <label>密码长度 <input v-model.number="length" type="number" min="1" max="256" /></label>
      <label>数量 <input v-model.number="count" type="number" min="1" max="100" /></label>
    </div>
    <div class="action-buttons">
      <label v-for="choice in choices" :key="choice.key"><input v-model="selected" type="checkbox" :value="choice.key" /> {{ choice.label }}</label>
    </div>
    <label><input v-model="exclude" type="checkbox" /> 排除易混淆字符 I、l、1、O、0、o</label>
    <p class="form-hint">每个密码包含所有选中类型。使用系统安全随机源；不保存、不上传、不记录密码。
      短密码仍然容易被猜中，建议至少 16 位。复制后可能被系统或本机剪贴板历史记录。</p>
    <div class="field-heading"><label for="password-output">生成结果（明文）</label>
      <button class="quiet-button" :disabled="!output" @click="copy"><Copy :size="14" /> {{ copied ? '已复制' : '复制全部' }}</button>
    </div>
    <textarea id="password-output" :value="output" class="code-input" readonly spellcheck="false" autocomplete="off"></textarea>
    <div class="tool-action-row">
      <p class="form-hint hint-error" aria-live="polite">{{ error }}</p>
      <div class="action-buttons"><button class="secondary-button" @click="clear">清空结果</button>
        <button class="primary-button" @click="generate"><Sparkles :size="15" /> 生成密码</button></div>
    </div>
  </div>
</template>
