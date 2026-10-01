<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { STARTUP_SOURCES, STARTUP_STATES, parseStartupSnapshot, startupChangeRequest, startupChangeVerified, type StartupRow, type StartupSource } from '../startupManager'
import { useNativeDiagnostic } from '../useNativeDiagnostic'
const task = useNativeDiagnostic(), { busy, cancelling, error, result } = task
const source = ref<StartupSource>('hkcu-run-64'), query = ref(''), page = ref(1), editing = ref(false)
const pending = ref<StartupRow | null>(null), accepted = ref(false), changing = ref(false), notice = ref('')
let disposed = false
const folder = computed(() => source.value.endsWith('-folder'))
const spec = computed(() => STARTUP_SOURCES.find(s => s.id === source.value)!)
const snapshot = computed(() => parseStartupSnapshot(result.value?.output ?? '', source.value))
const rows = computed(() => snapshot.value.rows.filter(r => r.name.toLowerCase().includes(query.value.toLowerCase())))
const visible = computed(() => rows.value.slice((page.value - 1) * 25, page.value * 25))
const ready = computed(() => result.value?.status === 'completed' && result.value.exitCode === 0 && snapshot.value.complete && !snapshot.value.limited)
function closePreview() { pending.value = null; accepted.value = false }
function resetSource() { closePreview(); editing.value = false; page.value = 1; notice.value = ''; task.clear() }
async function read(internal = false) {
  if (disposed || busy.value || (changing.value && !internal)) return
  closePreview(); page.value = 1
  await task.start('run_startup_manager', { request: { action: 'list', source: source.value, name: '', expected: '', confirmed: false } })
}
function preview(row: StartupRow) {
  closePreview()
  if (!editing.value || !ready.value || busy.value || changing.value || !row.action || !snapshot.value.rows.some(r => JSON.stringify(r) === JSON.stringify(row))) return
  pending.value = { ...row }
}
async function apply() {
  const row = pending.value
  if (!row || disposed || !accepted.value || !editing.value || !ready.value || busy.value || changing.value
    || !row.action || row.source !== source.value || !snapshot.value.rows.some(r => JSON.stringify(r) === JSON.stringify(row))) return
  closePreview(); changing.value = true
  notice.value = '已提交一次操作；取消或超时不能撤销变更，不会自动重试。'
  try {
    await task.start('run_startup_manager', { request: startupChangeRequest(row) })
    if (disposed) return
    const r = result.value
    notice.value = r?.status === 'completed' && r.exitCode === 0 && startupChangeVerified(r.output, row)
      ? '目标变更已核验，正在只读重查。下次变更仍需确认。'
      : '结果未核验，可能已部分生效。正在只读重查；请勿直接重试。'
    await read(true)
  } finally { changing.value = false }
}
onBeforeUnmount(() => { disposed = true; closePreview(); notice.value = ''; query.value = '' })
</script>
<template>
  <div class="tool-form">
    <p class="form-hint">按来源手动读取，默认只读。每个来源最多 500 条 / 64 KiB / 20 秒，完整读取后才允许逐项确认。不会执行命令、解析快捷方式目标、自动提权或更改权限。</p>
    <p class="form-hint">范围限制：RunOnce 仅查看；计划任务、策略与其他自启来源未覆盖，不修改 Windows StartupApproved 标记。已登记不代表会运行，恢复也不保证 Windows 会启动它。注册表视图可能共享同一实际键。</p>
    <label>来源 <select v-model="source" class="native-input" :disabled="busy || changing" @change="resetSource"><option v-for="s in STARTUP_SOURCES" :key="s.id" :value="s.id">{{ s.label }}</option></select></label>
    <div class="action-buttons"><button class="primary-button" :disabled="busy || changing" @click="read()">读取 / 刷新</button><button v-if="busy" class="secondary-button" :disabled="cancelling" @click="task.cancel">取消等待</button></div>
    <p v-if="folder" class="form-hint">仅本地正常目录及单硬链接普通文件；不读启动文件内容。禁用将原文件无覆盖移到启动文件夹旁的专用 .LocalToolbox-StartupBackup 文件夹，保留内容、标识与 ACL；恢复原路移回，备份位置不再保有该文件。重解析点、网络/重定向、占用或不支持的条目会阻止本来源修改。</p>
    <p v-else class="form-hint">Run 值禁用前保留同一 hive / 视图中的未加密专用备份，原始 String / ExpandString 不展开；恢复仅在原位置不存在时进行并保留备份。全机项影响所有用户，权限不足即失败。32 位系统不模拟 64 位视图。</p>
    <label><input v-model="editing" type="checkbox" :disabled="busy || changing || !spec.writable" @change="closePreview" /> 本次页面允许预览变更（每次另行确认）</label>
    <input v-model="query" class="native-input" maxlength="256" placeholder="按名称筛选" @input="page = 1; closePreview()" />
    <p v-if="result && !ready" class="form-hint hint-error">本来源读取未完成、有不支持或不可读条目，修改已锁定；空结果不代表全机没有启动项。</p>
    <div class="manager-table"><table><thead><tr><th>名称 / 位置</th><th>当前值 / 状态</th><th>操作</th></tr></thead><tbody><tr v-for="row in visible" :key="`${row.backup}:${row.name}`">
      <td>{{ row.name }}<br />{{ row.backup ? '专用备份' : '原始位置' }}</td><td><details><summary>{{ STARTUP_STATES[row.state] }} · {{ row.kind }}</summary><pre>{{ row.value }}</pre></details></td>
      <td><button v-if="row.action" class="secondary-button" :disabled="!editing || !ready || busy || changing" @click="preview(row)">预览{{ row.action === 'disable' ? '禁用' : '恢复登记' }}</button><span v-else>只读</span></td>
    </tr></tbody></table></div>
    <p class="form-hint">{{ rows.length }} 条 · 第 {{ page }} 页</p><div class="action-buttons"><button class="secondary-button" :disabled="page <= 1" @click="page--; closePreview()">上一页</button><button class="secondary-button" :disabled="page * 25 >= rows.length" @click="page++; closePreview()">下一页</button></div>
    <section v-if="pending" class="change-preview" aria-label="启动项变更确认">
      <p>{{ spec.label }} / {{ pending.name }}：{{ pending.action === 'disable' ? '禁用' : '恢复登记' }}</p>
      <p>旧状态：{{ STARTUP_STATES[pending.state] }} · {{ pending.kind }}</p><pre>{{ pending.value }}</pre>
      <p>新状态：{{ pending.action === 'disable' ? '原始位置移除，保留专用备份' : '恢复到原始位置（仅目标不存在时）' }}</p>
      <p v-if="source.startsWith('hklm-') || source === 'common-folder'" class="form-hint hint-error">这是所有用户的启动来源，变更可能影响其他账户。</p>
      <p class="form-hint hint-error">禁用可能使应用下次登录不再启动；恢复可能导致该程序下次登录运行。原始值/文件可能包含隐私信息，备份不加密。{{ folder ? '文件原地无覆盖移动，恢复后备份位置不保留副本。' : '注册表写前比对与写后核验仍存在外部程序并发写入的非原子窗口。' }} 不覆盖冲突，不自动回滚或重试。</p>
      <label><input v-model="accepted" type="checkbox" /> 我确认此来源、目标、旧/新状态和影响，授权这一次变更</label>
      <div class="action-buttons"><button class="primary-button" :disabled="!accepted || busy || changing" @click="apply">确认执行一次</button><button class="secondary-button" @click="closePreview">取消预览</button></div>
    </section>
    <p role="status" class="form-hint">{{ busy ? '正在处理…' : notice }}</p><p class="form-hint hint-error">{{ error }}</p>
    <p class="form-hint">列表仅本页内存，不自动保存、复制或记录原始命令。离页清空并停止等待；已发生的变更不会撤销。</p>
  </div>
</template>
<style scoped>
.manager-table { max-height: 360px; overflow: auto; } table { width: 100%; font-size: 11px; text-align: left; }
th, td { padding: 7px; border-bottom: 1px solid #e5e5ec; } pre { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 140px; overflow: auto; }
.change-preview { padding: 10px; border: 1px solid #d5ad73; border-radius: 6px; font-size: 12px; }
</style>
