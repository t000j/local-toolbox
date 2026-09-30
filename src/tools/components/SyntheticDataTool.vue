<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { Copy, Download, Sparkles } from '@lucide/vue'
import { copyText } from '../clipboard'
import { generateSyntheticData, syntheticFields, type SyntheticField, type SyntheticFormat, type SyntheticResult } from '../syntheticData'

const count = ref(10)
const seed = ref(2026)
const fields = ref<SyntheticField[]>(syntheticFields.map(field => field.key))
const startDate = ref('2026-01-01')
const endDate = ref('2026-12-31')
const format = ref<SyntheticFormat>('json')
const tableName = ref('synthetic_samples')
const result = shallowRef<SyntheticResult | null>(null)
const error = ref('')
const message = ref('')
const copied = ref(false)
const copying = ref(false)
const hasDate = computed(() => fields.value.includes('date'))
const downloads = new Map<string, number>()
let revision = 0

function clear(): void {
  revision++
  result.value = null
  error.value = ''
  message.value = ''
  copied.value = false
  copying.value = false
}
watch([count, seed, fields, startDate, endDate, format, tableName], clear, { deep: true, flush: 'sync' })
function generate(): void {
  clear()
  try {
    result.value = generateSyntheticData({ count: count.value, seed: seed.value, fields: fields.value,
      startDate: startDate.value, endDate: endDate.value, format: format.value, tableName: tableName.value })
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '样例生成失败，请检查选项。' }
}
async function copy(): Promise<void> {
  if (!result.value || copying.value) return
  const version = revision
  copying.value = true
  copied.value = false
  error.value = ''
  message.value = ''
  try {
    await copyText(result.value.text)
    if (version === revision) copied.value = true
  } catch { if (version === revision) error.value = '复制失败，请检查剪贴板权限。' }
  finally { if (version === revision) copying.value = false }
}
function download(): void {
  if (!result.value) return
  error.value = ''
  message.value = ''
  try {
    const type = { json: 'application/json', csv: 'text/csv', sql: 'application/sql' }[format.value]
    const url = URL.createObjectURL(new Blob([result.value.text], { type: `${type};charset=utf-8` }))
    downloads.set(url, window.setTimeout(() => { URL.revokeObjectURL(url); downloads.delete(url) }, 1000))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `synthetic-samples.${format.value}`
    anchor.click()
    message.value = `已生成 ${result.value.rowCount} 条虚构样例的下载文件。`
  } catch { error.value = '生成下载文件失败，请尝试复制结果。' }
}
onBeforeUnmount(() => {
  clear()
  for (const [url, timer] of downloads) { window.clearTimeout(timer); URL.revokeObjectURL(url) }
})
</script>

<template>
  <div class="tool-form synthetic-tool">
    <p class="synthetic-notice">所有内容均为虚构测试样例，不代表真实个人。邮箱统一使用不可投递的 example.invalid；每条记录固定带有 _synthetic 标记。</p>
    <div class="synthetic-settings">
      <label for="synthetic-count">样例数量（1–1000）<input id="synthetic-count" v-model.number="count" type="number" min="1" max="1000" step="1" /></label>
      <label for="synthetic-seed">可复现种子<input id="synthetic-seed" v-model.number="seed" type="number" min="0" max="4294967295" step="1" /></label>
      <label for="synthetic-format">输出格式<select id="synthetic-format" v-model="format">
        <option value="json">JSON</option><option value="csv">CSV（逗号分隔）</option><option value="sql">SQL（SQLite 3）</option>
      </select></label>
    </div>
    <fieldset class="synthetic-fields">
      <legend>样例字段（至少选择一项）</legend>
      <label v-for="field in syntheticFields" :key="field.key"><input v-model="fields" type="checkbox" :value="field.key" /> {{ field.label }} <span>{{ field.key }}</span></label>
    </fieldset>
    <div class="synthetic-settings">
      <label for="synthetic-start">开始日期（含）<input id="synthetic-start" v-model="startDate" :disabled="!hasDate" type="date" min="1900-01-01" max="2199-12-31" /></label>
      <label for="synthetic-end">结束日期（含）<input id="synthetic-end" v-model="endDate" :disabled="!hasDate" type="date" min="1900-01-01" max="2199-12-31" /></label>
      <label v-if="format === 'sql'" for="synthetic-table">SQL 表名<input id="synthetic-table" v-model="tableName" type="text" maxlength="63" spellcheck="false" autocomplete="off" /></label>
    </div>
    <p class="form-hint synthetic-hint">同一种子和选项会得到相同结果；种子范围 0–4294967295，仅用于样例变化，不适合生成密码或令牌。
      序号和邮箱仅在本批次内唯一，日期按 UTC 日历日生成。只在本机生成，不读取真实数据、不联网、不自动保存。输出上限 1 MiB。</p>
    <p v-if="format === 'sql'" class="form-hint synthetic-hint">SQL 包含 CREATE TABLE 和 INSERT，仅生成文本，不连接或执行数据库。
      请仅用于隔离的测试库；现有同名表会使建表失败。日期为 TEXT，布尔值为 0/1。表名限英文字母、数字、下划线，不能以数字开头或使用 sqlite_ 前缀。</p>
    <div class="tool-action-row synthetic-actions">
      <span class="form-hint">{{ result ? `${result.rowCount} 条 · ${result.columns.length} 列 · ${result.bytes.toLocaleString()} 字节` : '选择字段后点击生成' }}</span>
      <div class="action-buttons"><button class="secondary-button" @click="clear">清空结果</button>
        <button class="primary-button" @click="generate"><Sparkles :size="15" /> 生成虚构样例</button></div>
    </div>
    <div class="field-heading synthetic-actions"><label for="synthetic-output">生成结果</label><div class="action-buttons">
      <button class="quiet-button" :disabled="!result || copying" @click="copy"><Copy :size="14" /> {{ copied ? '已复制' : copying ? '正在复制…' : '复制全部' }}</button>
      <button class="quiet-button" :disabled="!result" @click="download"><Download :size="14" /> 下载 {{ format.toUpperCase() }}</button>
    </div></div>
    <textarea id="synthetic-output" :value="result?.text ?? ''" class="code-input synthetic-output" readonly spellcheck="false" placeholder="虚构样例将在这里显示…"></textarea>
    <p v-if="error" class="form-hint hint-error synthetic-hint" role="alert">{{ error }}</p>
    <p v-if="message" class="form-hint synthetic-hint" role="status">{{ message }}</p>
  </div>
</template>

<style scoped>
.synthetic-notice { margin: 0; padding: 11px 13px; border: 1px solid #e9e5fc; border-radius: 8px; background: #f8f6ff; color: #716390; font-size: 11px; line-height: 1.75; }
.synthetic-settings { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.synthetic-settings label { display: grid; align-content: start; gap: 7px; color: #686c7e; font-size: 11px; }
.synthetic-settings input, .synthetic-settings select { width: 100%; min-width: 0; padding: 9px; border: 1px solid #e6e5ef; border-radius: 7px; background: #fff; color: #55596e; font-size: 12px; }
.synthetic-settings input:disabled { background: #f7f7fa; color: #a1a4b1; }
.synthetic-fields { display: flex; flex-wrap: wrap; gap: 12px 20px; margin: 0; padding: 12px; border: 1px solid #e8e7ef; border-radius: 8px; }
.synthetic-fields legend { padding: 0 5px; color: #686c7e; font-size: 11px; }
.synthetic-fields label { display: inline-flex; align-items: center; gap: 5px; color: #62687d; font-size: 11px; }
.synthetic-fields span { color: #999daf; font-size: 10px; }
.synthetic-hint { display: block; min-height: 0; margin: 0; line-height: 1.75; }
.synthetic-actions { flex-wrap: wrap; gap: 10px; }
.synthetic-output { min-height: 280px; }
@media (max-width: 650px) { .synthetic-settings { grid-template-columns: 1fr; } }
</style>
