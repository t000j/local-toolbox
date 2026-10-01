<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { Check, Copy, Download, FileUp, RotateCcw, Search, Table2, X } from '@lucide/vue'
import { copyText } from '../clipboard'
import { csvLimits, csvToJson, filterCsvRows, parseCsv, type CsvData, type CsvDelimiter } from '../csv'

const sample = ['编号,名称,备注', '001,本地工具箱,"含有逗号, 保留原样"',
  '002,CSV 查看器,"支持""引号""和\r\n多行字段"'].join('\r\n')
const input = ref('')
const delimiter = ref<CsvDelimiter>(',')
const fileInput = ref<HTMLInputElement | null>(null)
const sourceName = ref('')
const data = shallowRef<CsvData | null>(null)
const query = ref('')
const page = ref(1)
const pageSize = ref(50)
const error = ref('')
const message = ref('')
const loading = ref(false)
const copied = ref(false)
const filtered = computed(() => data.value ? filterCsvRows(data.value, query.value) : [])
const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize.value)))
const visible = computed(() => filtered.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
const renamed = computed(() => data.value?.headers.flatMap((header, index) =>
  header === data.value?.originalHeaders[index] ? [] : [{ column: index + 1, key: header }]) ?? [])
let readGeneration = 0
let copyGeneration = 0
let copiedTimer: number | undefined
const downloads = new Map<string, number>()

function invalidate(): void {
  readGeneration++
  copyGeneration++
  loading.value = false
  data.value = null
  error.value = ''
  message.value = ''
  copied.value = false
  page.value = 1
}
watch(input, () => { sourceName.value = ''; invalidate() }, { flush: 'sync' })
watch(delimiter, invalidate, { flush: 'sync' })
watch([query, pageSize], () => {
  copyGeneration++
  page.value = 1
  copied.value = false
  message.value = ''
}, { flush: 'sync' })

function parseInput(): void {
  invalidate()
  try { data.value = parseCsv(input.value, delimiter.value) }
  catch (cause) { error.value = cause instanceof Error ? cause.message : 'CSV 解析失败。' }
}
function loadExample(): void { delimiter.value = ','; input.value = sample; query.value = ''; parseInput() }
function clearAll(): void { input.value = ''; sourceName.value = ''; query.value = ''; invalidate() }
async function openFile(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  target.value = ''
  if (!file) return
  invalidate()
  const generation = readGeneration
  if (file.size > csvLimits.inputBytes) { error.value = '文件超过 5 MiB，请选择较小的 CSV 文件。'; return }
  loading.value = true
  try {
    const bytes = await file.arrayBuffer()
    if (generation !== readGeneration) return
    let text: string
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
    catch { throw new Error('文件不是有效的 UTF-8 文本，请先另存为 UTF-8 CSV 后打开。') }
    input.value = text
    sourceName.value = file.name
    query.value = ''
    parseInput()
  } catch (cause) {
    if (generation === readGeneration) error.value = cause instanceof Error ? cause.message : '文件读取失败，请重新选择。'
  } finally {
    if (generation === readGeneration) loading.value = false
  }
}
async function copyFiltered(): Promise<void> {
  if (!data.value) return
  error.value = ''
  message.value = ''
  copied.value = false
  const generation = ++copyGeneration
  const current = data.value
  try {
    await copyText(csvToJson(current, filtered.value))
    if (generation !== copyGeneration) return
    copied.value = true
    window.clearTimeout(copiedTimer)
    copiedTimer = window.setTimeout(() => { copied.value = false }, 1500)
  } catch (cause) {
    if (generation === copyGeneration) {
      error.value = cause instanceof Error ? cause.message : '复制失败，请检查剪贴板权限。'
    }
  }
}
function exportJson(scope: 'filtered' | 'all'): void {
  if (!data.value) return
  error.value = ''
  message.value = ''
  try {
    const indices = scope === 'filtered' ? filtered.value : undefined
    const json = csvToJson(data.value, indices)
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json;charset=utf-8' }))
    downloads.set(url, window.setTimeout(() => { URL.revokeObjectURL(url); downloads.delete(url) }, 1000))
    const anchor = document.createElement('a')
    const base = sourceName.value.replace(/\.[^.]*$/, '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_') || 'toolbox-csv'
    anchor.href = url
    anchor.download = `${base}-${scope}.json`
    anchor.click()
    const label = scope === 'filtered' ? '筛选结果' : '全部数据'
    message.value = `已生成${label} JSON 下载文件，共 ${indices?.length ?? data.value.rows.length} 行。`
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'JSON 导出失败。' }
}
onBeforeUnmount(() => {
  readGeneration++
  copyGeneration++
  window.clearTimeout(copiedTimer)
  for (const [url, timer] of downloads) { window.clearTimeout(timer); URL.revokeObjectURL(url) }
})
</script>

<template>
  <div class="csv-tool">
    <div class="field-heading csv-heading">
      <label for="csv-input">CSV 内容</label>
      <div class="action-buttons">
        <button class="quiet-button" @click="loadExample"><RotateCcw :size="13" /> 示例</button>
        <button class="quiet-button" :disabled="!input && !loading" @click="clearAll"><X :size="13" /> 清空</button>
        <button class="secondary-button" @click="fileInput?.click()"><FileUp :size="14" /> 打开本地文件</button>
      </div>
      <input ref="fileInput" class="csv-file-input" type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
        aria-label="选择本地 CSV 文件" @change="openFile" />
    </div>
    <textarea id="csv-input" v-model="input" class="code-input csv-input" spellcheck="false"
      placeholder="粘贴 CSV，第一条记录作为表头…" @keydown.ctrl.enter.prevent="parseInput"></textarea>
    <div class="csv-controls">
      <label for="csv-delimiter">分隔符</label>
      <select id="csv-delimiter" v-model="delimiter">
        <option value=",">逗号 (,)</option><option :value="'\t'">制表符 (Tab)</option><option value=";">分号 (;)</option>
      </select>
      <span v-if="sourceName" class="csv-source" :title="sourceName">{{ sourceName }}</span>
      <button class="primary-button" :disabled="!input || loading" @click="parseInput"><Table2 :size="14" /> 解析 CSV</button>
    </div>
    <p class="form-hint csv-hint">
      仅在本机处理 UTF-8 文件。上限 5 MiB、20,000 行数据、200 列、200,000 个单元格（含表头），单格 100,000 字符。
    </p>
    <p class="form-hint csv-hint">
      首条记录作为表头；跳过不含任何字符的空行，保留空格与字段内换行。各行列数必须一致，双引号须按 CSV 规则转义。
    </p>
    <p v-if="loading" class="form-hint" role="status">正在读取本地文件…</p>
    <p v-if="error" class="inline-error csv-feedback" role="alert">{{ error }}</p>
    <p v-if="message" class="csv-feedback csv-success" role="status">{{ message }}</p>

    <section v-if="data" class="csv-results" aria-label="CSV 解析结果">
      <div class="csv-result-heading">
        <strong>{{ data.rows.length }} 行 · {{ data.headers.length }} 列</strong>
        <span v-if="data.skippedBlankRows">已跳过 {{ data.skippedBlankRows }} 个空行</span>
      </div>
      <p class="form-hint csv-hint">
        JSON 为对象数组，所有值均保留为字符串（包括 001）。空或仅含空白的表头命名为 column_列号，重复或冲突追加 __2、__3。
        保留其他原始表头，表格显示导出键名。
      </p>
      <details v-if="renamed.length" class="csv-renamed">
        <summary>{{ renamed.length }} 个表头已更名，查看导出键名</summary>
        <ul><li v-for="item in renamed" :key="item.column">第 {{ item.column }} 列 → <code>{{ item.key }}</code></li></ul>
      </details>
      <div class="csv-filter">
        <Search :size="14" aria-hidden="true" />
        <label class="csv-visually-hidden" for="csv-filter">筛选所有列</label>
        <input id="csv-filter" v-model="query" type="search" maxlength="1000" placeholder="搜索所有列，不区分大小写…" />
        <span aria-live="polite">{{ filtered.length }} / {{ data.rows.length }} 行</span>
      </div>
      <div class="csv-table-scroll" tabindex="0" role="region" aria-label="CSV 数据表，可横向滚动">
        <table class="csv-table">
          <thead><tr><th class="csv-row-number" scope="col">数据行</th>
            <th v-for="(header, index) in data.headers" :key="index" scope="col"><div :title="header">{{ header }}</div></th>
          </tr></thead>
          <tbody>
            <tr v-for="rowIndex in visible" :key="rowIndex">
              <th class="csv-row-number" scope="row">{{ rowIndex + 1 }}</th>
              <td v-for="(cell, index) in data.rows[rowIndex]" :key="index"><div :title="cell">{{ cell }}</div></td>
            </tr>
            <tr v-if="!filtered.length"><td :colspan="data.headers.length + 1" class="csv-empty">
              {{ data.rows.length ? '没有符合筛选条件的记录' : '文件仅包含表头，没有数据行' }}
            </td></tr>
          </tbody>
        </table>
      </div>
      <div class="native-pagination csv-pagination">
        <span>匹配 {{ filtered.length }} 行</span>
        <label for="csv-page-size">每页</label>
        <select id="csv-page-size" v-model.number="pageSize"><option :value="25">25</option><option :value="50">50</option></select>
        <button class="quiet-button" :disabled="page <= 1" @click="page--">上一页</button><span>{{ page }} / {{ pages }}</span>
        <button class="quiet-button" :disabled="page >= pages" @click="page++">下一页</button>
      </div>
      <div class="csv-exports">
        <button class="secondary-button" @click="copyFiltered">
          <Check v-if="copied" :size="14" /><Copy v-else :size="14" /> {{ copied ? '已复制' : '复制筛选 JSON' }}
        </button>
        <button class="secondary-button" @click="exportJson('filtered')">
          <Download :size="14" /> 导出筛选 JSON（{{ filtered.length }} 行）
        </button>
        <button class="secondary-button" @click="exportJson('all')">
          <Download :size="14" /> 导出全部 JSON（{{ data.rows.length }} 行）
        </button>
      </div>
      <p class="form-hint csv-hint">
        筛选导出包含全部匹配行，不限于当前页；JSON 上限 16 MiB。导出键名与表格一致，原始文件不会被覆盖。
      </p>
    </section>
  </div>
</template>

<style scoped>
.csv-tool, .csv-results { display: grid; min-width: 0; gap: 11px; }
.csv-heading { flex-wrap: wrap; }
.csv-file-input { display: none; }
.csv-input { min-height: 165px; }
.csv-controls, .csv-result-heading, .csv-exports { display: flex; flex-wrap: wrap; align-items: center; gap: 9px; }
.csv-controls label, .csv-controls select, .csv-pagination select { color: #6c7083; font-size: 10px; }
.csv-controls select, .csv-pagination select { padding: 7px; border: 1px solid #e6e5ef; border-radius: 6px; background: #fff; }
.csv-controls .primary-button { margin-left: auto; }
.csv-source { max-width: 40%; overflow: hidden; color: #9598a8; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.csv-hint { display: block; min-height: 0; line-height: 1.65; }
.csv-feedback { margin: 0; font-size: 10px; line-height: 1.6; overflow-wrap: anywhere; }
.csv-success { color: #59967d; }
.csv-results { padding-top: 14px; border-top: 1px solid #eeeef4; }
.csv-result-heading strong { color: #555970; font-size: 12px; }
.csv-result-heading > span { color: #989daf; font-size: 10px; }
.csv-renamed { padding: 9px 11px; border-radius: 7px; background: #fffaf0; color: #9a8256; font-size: 10px; }
.csv-renamed summary { cursor: pointer; }
.csv-renamed ul { max-height: 120px; overflow: auto; margin-bottom: 0; padding-left: 20px; line-height: 1.7; }
.csv-renamed code { overflow-wrap: anywhere; }
.csv-filter { display: flex; align-items: center; gap: 8px; color: #9897ad; }
.csv-filter input { flex: 1; min-width: 0; height: 33px; padding: 7px 9px; border: 1px solid #e6e5ef; border-radius: 7px; font-size: 11px; }
.csv-filter span { font-size: 10px; white-space: nowrap; }
.csv-table-scroll { max-height: 450px; overflow: auto; border: 1px solid #e8e7ef; border-radius: 8px; }
.csv-table { width: 100%; border-collapse: separate; border-spacing: 0; text-align: left; font-size: 10px; }
.csv-table th, .csv-table td { max-width: 280px; padding: 9px 11px; border-bottom: 1px solid #efeff5; vertical-align: top; }
.csv-table thead th { position: sticky; top: 0; z-index: 1; background: #faf9fe; color: #746c91; overflow-wrap: anywhere; }
.csv-table thead th > div { max-height: 70px; overflow: auto; white-space: pre-wrap; }
.csv-table td { min-width: 110px; color: #60677b; }
.csv-table td > div { max-height: 110px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; }
.csv-table .csv-row-number { min-width: 52px; color: #a0a3b0; font-weight: 400; white-space: nowrap; }
.csv-table tbody tr:last-child > * { border-bottom: 0; }
.csv-table tbody tr:hover { background: #fcfbff; }
.csv-table .csv-empty { padding: 28px; color: #999eb0; text-align: center; }
.csv-pagination { margin-top: 0; font-size: 10px; }
.csv-pagination select { padding: 4px; }
.csv-visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
@media (max-width: 600px) { .csv-source { max-width: 100%; flex-basis: 100%; } .csv-exports > button { flex: 1 1 45%; } }
</style>
