<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { parseManagerRows, type ManagerRow } from '../systemManager'
import { useNativeDiagnostic } from '../useNativeDiagnostic'
const props = defineProps<{ command: string; scope: string; warning: string; consequence: string }>()
const task = useNativeDiagnostic()
const { busy, cancelling, error, result } = task
const query = ref(''), page = ref(1), editing = ref(false), pending = ref<ManagerRow | null>(null)
const newValue = ref(''), notice = ref(''), accepted = ref(false), changing = ref(false)
let disposed = false
const snapshot = computed(() => parseManagerRows(result.value?.output ?? ''))
const rows = computed(() => snapshot.value.rows.filter(r => `${r.name} ${r.scope}`.toLowerCase().includes(query.value.toLowerCase())))
const visible = computed(() => rows.value.slice((page.value - 1) * 25, page.value * 25))
const ready = computed(() => result.value?.status === 'completed' && result.value.exitCode === 0 && !snapshot.value.limited)
const labels: Record<string, string> = { start: '启动', stop: '停止', disable: '禁用', restore: '恢复', edit: '修改' }
async function read() {
  pending.value = null; page.value = 1
  await task.start(props.command, { request: { action: 'list', name: '', expected: '', confirmed: false } })
}
function preview(row: ManagerRow) {
  pending.value = { ...row }; newValue.value = row.value; accepted.value = false
}
async function apply() {
  const row = pending.value
  if (!row || busy.value || changing.value || !accepted.value || !editing.value || !ready.value) return
  pending.value = null; changing.value = true
  notice.value = '已提交一次操作。取消或超时不能撤销变更；不会自动重试。'
  try {
    await task.start(props.command, { request: { action: row.action, name: row.name, expected: row.state,
      confirmed: true, ...(props.command === 'run_service_manager' ? {} : {
        value: row.value, kind: row.kind, newValue: newValue.value, scope: row.scope,
      }) } })
    const r = result.value
    const verified = r?.status === 'completed' && r.exitCode === 0 && r.output.split(/\r?\n/).some(line => {
      try { return JSON.parse(line).verified === true } catch { return false }
    })
    notice.value = verified ? '操作后的目标状态已核验。正在重新读取；下次变更仍需重新确认。'
      : '操作结果未核验，可能已部分生效。正在只读重查；请勿直接重试。'
    if (!disposed) await read()
  } finally { changing.value = false }
}
onBeforeUnmount(() => { disposed = true; pending.value = null; newValue.value = ''; notice.value = '' })
</script>
<template>
  <div class="tool-form">
    <p class="form-hint">{{ scope }}。手动读取，默认只读；最多 500 条 / 64 KiB / 20 秒，结果不完整时禁止修改。不提权，权限不足即失败，不绕过权限。</p>
    <p class="form-hint">{{ warning }}</p>
    <div class="action-buttons"><button class="primary-button" :disabled="busy || changing" @click="read">读取 / 刷新</button>
      <button v-if="busy" class="secondary-button" :disabled="cancelling" @click="task.cancel">取消等待</button></div>
    <label><input v-model="editing" type="checkbox" :disabled="busy || changing" @change="pending = null" /> 本次页面允许预览变更（每次另行确认）</label>
    <input v-model="query" class="native-input" maxlength="256" placeholder="筛选名称或范围" @input="page = 1; pending = null" />
    <p v-if="snapshot.limited" class="form-hint hint-error">列表有截断或不可读项，不可据此判断全机状态；修改已锁定。</p>
    <div class="manager-table"><table><thead><tr><th>名称 / 范围</th><th>当前值 / 状态</th><th>操作</th></tr></thead><tbody>
      <tr v-for="row in visible" :key="row.scope + row.name"><td>{{ row.name }}<br />{{ row.scope }}</td>
        <td><details><summary>{{ row.state }} · 点开查看当前值</summary><pre>{{ row.value }}</pre></details></td>
        <td><button v-if="row.action" class="secondary-button" :disabled="!editing || !ready || busy || changing" @click="preview(row)">预览{{ labels[row.action] }}</button><span v-else>只读</span></td></tr>
    </tbody></table></div>
    <p class="form-hint">{{ rows.length }} 条 · 第 {{ page }} 页；空结果或失败不代表不存在。</p>
    <div class="action-buttons"><button class="secondary-button" :disabled="page <= 1" @click="page--">上一页</button><button class="secondary-button" :disabled="page * 25 >= rows.length" @click="page++">下一页</button></div>
    <section v-if="pending" class="change-preview" aria-label="变更确认">
      <p>{{ pending.scope }} / {{ pending.name }}：{{ labels[pending.action] }}</p>
      <p>旧状态：{{ pending.state }} · 旧值：</p><pre>{{ pending.value }}</pre>
      <label v-if="pending.action === 'edit'">新值（原样保存，不展开变量）<textarea v-model="newValue" class="native-input" maxlength="8192" rows="4" @input="accepted = false" /></label>
      <p v-else>新状态：{{ pending.action === 'start' ? 'Running' : pending.action === 'stop' ? 'Stopped' : pending.action === 'disable' ? '从当前用户 Run 移除，保留专用备份' : '恢复到当前用户 Run（仅目标不存在时）' }}</p>
      <p class="form-hint hint-error">{{ consequence }} 系统状态可能并发变化；写前会再次比对快照，但不能保证与其他程序的写入原子互斥。</p>
      <label><input v-model="accepted" type="checkbox" /> 我确认此目标、旧值、新值与影响，并授权执行这一次变更</label>
      <div class="action-buttons"><button class="primary-button" :disabled="!accepted || busy || changing" @click="apply">确认执行一次</button><button class="secondary-button" @click="pending = null">取消预览</button></div>
    </section>
    <p role="status" class="form-hint">{{ busy ? '正在处理…' : notice }}</p><p class="form-hint hint-error">{{ error }}</p>
    <p class="form-hint">结果仅本页内存，不自动保存或复制；展开值可能包含私人信息。离页停止等待并清空，已发生的操作不会回滚。</p>
  </div>
</template>
<style scoped>
.manager-table { max-height: 360px; overflow: auto; } table { width: 100%; font-size: 11px; text-align: left; }
th, td { padding: 7px; border-bottom: 1px solid #e5e5ec; } pre { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 140px; overflow: auto; }
.change-preview { padding: 10px; border: 1px solid #d5ad73; border-radius: 6px; font-size: 12px; }
</style>
