<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useNativeDiagnostic } from '../useNativeDiagnostic'
import { USER_ENVIRONMENT_SCOPE, SYSTEM_ENVIRONMENT_SCOPE, environmentChangeError, environmentChangeVerified,
  parseEnvironmentSnapshot, type EnvironmentChange, type EnvironmentKind, type EnvironmentRow } from '../environmentManager'
const task = useNativeDiagnostic()
const { busy, cancelling, error, result } = task
const query = ref(''), page = ref(1), editing = ref(false), accepted = ref(false), changing = ref(false)
const editor = ref<{ action: 'add' | 'edit'; row: EnvironmentRow | null } | null>(null)
const draftName = ref(''), draftValue = ref(''), draftKind = ref<EnvironmentKind>('String')
const pending = ref<EnvironmentChange | null>(null), notice = ref(''), validation = ref('')
let disposed = false
const snapshot = computed(() => parseEnvironmentSnapshot(result.value?.output ?? ''))
const ready = computed(() => result.value?.status === 'completed' && result.value.exitCode === 0 && snapshot.value.complete && !snapshot.value.limited)
const rows = computed(() => snapshot.value.rows.filter(r => `${r.name} ${r.scope}`.toLowerCase().includes(query.value.toLowerCase())))
const visible = computed(() => rows.value.slice((page.value - 1) * 25, page.value * 25))
const labels = { add: '新增', edit: '修改', delete: '删除' }
const systemMatch = computed(() => pending.value && snapshot.value.rows.find(r => r.scope === SYSTEM_ENVIRONMENT_SCOPE && r.name.toUpperCase() === pending.value!.name.toUpperCase()))
function invalidatePreview() { pending.value = null; accepted.value = false; validation.value = '' }
function closeEditor() { invalidatePreview(); editor.value = null; draftName.value = ''; draftValue.value = ''; draftKind.value = 'String' }
async function readSnapshot() {
  closeEditor(); page.value = 1
  await task.start('run_environment_manager', { request: { action: 'list', name: '', expected: '', confirmed: false } })
}
async function read() {
  if (disposed || busy.value || changing.value) return
  notice.value = ''; await readSnapshot()
}
function begin(action: 'add' | 'edit', row?: EnvironmentRow) {
  if (disposed || busy.value || changing.value || !ready.value || !editing.value || (action === 'edit' && row?.action !== 'edit')) return
  closeEditor(); editor.value = { action, row: row ? { ...row } : null }
  draftName.value = row?.name ?? ''; draftValue.value = row?.value ?? ''; draftKind.value = row?.kind ?? 'String'
}
function previewDelete(row: EnvironmentRow) {
  if (disposed || busy.value || changing.value || !ready.value || !editing.value) return
  closeEditor()
  previewChange({ action: 'delete', name: row.name, value: row.value, newValue: '', kind: row.kind,
    scope: row.scope, expected: 'present', confirmed: false })
}
function previewChange(change: EnvironmentChange) {
  invalidatePreview(); validation.value = environmentChangeError(snapshot.value.rows, change)
  if (!validation.value) pending.value = { ...change }
}
function preview() {
  if (!editor.value || disposed || busy.value || changing.value || !ready.value || !editing.value) return
  const old = editor.value.row
  previewChange({ action: editor.value.action, name: old?.name ?? draftName.value, value: old?.value ?? '',
    newValue: draftValue.value, kind: old?.kind ?? draftKind.value, scope: USER_ENVIRONMENT_SCOPE,
    expected: old ? 'present' : 'absent', confirmed: false })
}
async function apply() {
  const change = pending.value
  if (disposed || !change || busy.value || changing.value || !accepted.value || !editing.value || !ready.value) return
  validation.value = environmentChangeError(snapshot.value.rows, change)
  if (validation.value) { pending.value = null; accepted.value = false; return }
  closeEditor(); changing.value = true
  notice.value = '已提交一次操作。取消或超时不能撤销变更；不会自动重试。'
  try {
    await task.start('run_environment_manager', { request: { ...change, confirmed: true } })
    if (disposed) return
    const r = result.value
    const verified = r?.status === 'completed' && r.exitCode === 0 && environmentChangeVerified(r.output, change)
    notice.value = verified ? `${labels[change.action]}后的目标状态已核验。正在重新读取；下次变更仍需重新确认。`
      : '操作结果未核验，可能已部分生效。正在只读重查；请勿直接重试。'
    await readSnapshot()
  } finally { changing.value = false }
}
onBeforeUnmount(() => { disposed = true; closeEditor(); notice.value = ''; editing.value = false })
</script>
<template>
  <div class="tool-form">
    <p class="form-hint">用户 / 系统持久环境变量（64 位注册表原始值）。手动读取，默认只读；最多 500 条 / 64 KiB / 20 秒，结果不完整时禁止变更。不提权，权限不足即失败。</p>
    <p class="form-hint">支持范围：支持普通用户变量新增、修改、删除。系统变量、PATH 等受保护名称只读；敏感名称内容不读取。只编辑 ASCII 名称，不支持重命名或修改既有类型。名称筛选无法识别所有秘密，普通值仍可能敏感；不会读取进程环境。</p>
    <div class="action-buttons"><button class="primary-button" :disabled="busy || changing" @click="read">读取 / 刷新</button>
      <button v-if="busy" class="secondary-button" :disabled="cancelling" @click="task.cancel">取消等待</button></div>
    <label><input v-model="editing" type="checkbox" :disabled="busy || changing" @change="closeEditor" /> 本次页面允许预览变更（每次另行确认）</label>
    <div class="action-buttons"><button class="secondary-button" :disabled="!editing || !ready || busy || changing" @click="begin('add')">新增用户变量</button></div>
    <input v-model="query" class="native-input" maxlength="256" placeholder="筛选名称或范围" @input="page = 1; closeEditor()" />
    <p v-if="result && (!ready || snapshot.limited)" class="form-hint hint-error">未取得完整列表，不可据此判断变量是否存在；变更已锁定，请重新读取。</p>
    <div class="manager-table"><table><thead><tr><th>名称 / 范围 / 类型</th><th>当前值 / 状态</th><th>操作</th></tr></thead><tbody>
      <tr v-for="row in visible" :key="row.scope + row.name"><td>{{ row.name }}<br />{{ row.scope }}<br />{{ row.kind }}</td>
        <td><details><summary>{{ row.state }} · 点开查看当前值</summary><pre>{{ row.value === '' ? '（空字符串）' : row.value }}</pre></details></td>
        <td v-if="row.action === 'edit'"><button class="secondary-button" :disabled="!editing || !ready || busy || changing" @click="begin('edit', row)">修改</button>
          <button class="secondary-button" :disabled="!editing || !ready || busy || changing" @click="previewDelete(row)">预览删除</button></td><td v-else>只读</td></tr>
    </tbody></table></div>
    <p class="form-hint">{{ rows.length }} 条 · 第 {{ page }} 页；空结果或失败不代表不存在。</p>
    <div class="action-buttons"><button class="secondary-button" :disabled="page <= 1" @click="page--; closeEditor()">上一页</button><button class="secondary-button" :disabled="page * 25 >= rows.length" @click="page++; closeEditor()">下一页</button></div>
    <section v-if="editor" class="change-preview" aria-label="编辑用户变量">
      <label>用户变量名称<input v-model="draftName" class="native-input" maxlength="256" :readonly="editor.action === 'edit'" @input="invalidatePreview" /></label>
      <label>类型<select v-model="draftKind" :disabled="editor.action === 'edit'" @change="invalidatePreview"><option value="String">String（普通字符串）</option><option value="ExpandString">ExpandString（可展开字符串）</option></select></label>
      <label>新值<textarea v-model="draftValue" class="native-input" maxlength="8192" rows="4" @input="invalidatePreview" /></label>
      <p class="form-hint">原样保存，包括空白与空字符串。此工具不展开 %变量%；其他程序可能按 ExpandString 类型展开。空字符串不是删除。</p>
      <div class="action-buttons"><button class="secondary-button" :disabled="busy || changing" @click="preview">生成变更预览</button><button class="secondary-button" @click="closeEditor">取消编辑</button></div>
    </section>
    <p v-if="validation" role="alert" class="form-hint hint-error">{{ validation }}</p>
    <section v-if="pending" class="change-preview" aria-label="变更确认">
      <p>{{ pending.scope }} / {{ pending.name }}：{{ labels[pending.action] }} · {{ pending.kind }}</p>
      <p>旧值：{{ pending.expected === 'absent' ? '用户变量不存在' : '' }}</p><pre v-if="pending.expected === 'present'">{{ pending.value === '' ? '（空字符串）' : pending.value }}</pre>
      <p>新值：{{ pending.action === 'delete' ? '删除此用户变量（不是清空值）' : '' }}</p><pre v-if="pending.action !== 'delete'">{{ pending.newValue === '' ? '（空字符串）' : pending.newValue }}</pre>
      <p v-if="systemMatch" class="form-hint hint-error">存在同名系统变量：用户值可能遮蔽它；删除用户值后系统值可能重新显现。系统变量不会改动。</p>
      <p class="form-hint hint-error">修改影响后续登录会话中的应用；不广播更新，不改变已运行进程，可能需要注销后重新登录。错误值或删除可能使依赖它的应用异常。不自动备份或回滚；请自行妥善留存旧值，恢复也需重新预览确认。系统状态可能并发变化；写前会再次比对存在性、原始值和类型，但不能保证与其他程序的写入原子互斥。</p>
      <label><input v-model="accepted" type="checkbox" /> 我确认此目标、旧值、新值与影响，并授权执行这一次{{ labels[pending.action] }}</label>
      <div class="action-buttons"><button class="primary-button" :disabled="!accepted || busy || changing" @click="apply">确认执行一次{{ labels[pending.action] }}</button><button class="secondary-button" @click="invalidatePreview">取消预览</button></div>
    </section>
    <p role="status" class="form-hint">{{ busy ? '正在处理…' : notice }}</p><p class="form-hint hint-error">{{ error }}</p>
    <p class="form-hint">结果仅本页内存，不自动保存或复制；展开值可能包含私人信息。离页停止等待并清空，已发生的操作不会回滚。</p>
  </div>
</template>
<style scoped>
.manager-table { max-height: 360px; overflow: auto; } table { width: 100%; font-size: 11px; text-align: left; }
th, td { padding: 7px; border-bottom: 1px solid #e5e5ec; } pre { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 140px; overflow: auto; }
.change-preview { margin-top: 10px; padding: 10px; border: 1px solid #d5ad73; border-radius: 6px; font-size: 12px; }
.change-preview label { display: block; margin-bottom: 8px; }
</style>
