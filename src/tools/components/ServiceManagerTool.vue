<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { parseManagerRows, type ManagerRow } from '../systemManager'
import { parseServicePlan, serviceApplyRequest, serviceOutcome, type ServicePlan } from '../serviceDependencies'
import { useNativeDiagnostic } from '../useNativeDiagnostic'
const task = useNativeDiagnostic()
const { busy, cancelling, error } = task
const rows = ref<ManagerRow[]>([]), listReady = ref(false), limited = ref(false)
const query = ref(''), page = ref(1), editing = ref(false), accepted = ref(false)
const pending = ref<ServicePlan | null>(null), changing = ref(false), notice = ref('')
let disposed = false, revision = 0
const filtered = computed(() => rows.value.filter(r => `${r.name} ${r.value}`.toLowerCase().includes(query.value.toLowerCase())))
const visible = computed(() => filtered.value.slice((page.value - 1) * 25, page.value * 25))
const changed = computed(() => pending.value?.services.filter(s => s.state !== s.nextState).length ?? 0)
function dismiss() { revision++; pending.value = null; accepted.value = false }
async function read(internal = false) {
  if (disposed || busy.value || (changing.value && !internal)) return
  dismiss(); rows.value = []; listReady.value = false; limited.value = false; page.value = 1
  if (!internal) notice.value = ''
  await task.start('run_service_manager', { request: { action: 'list', name: '', expected: '', confirmed: false } })
  if (disposed) return
  const r = task.result.value, parsed = parseManagerRows(r?.output ?? '')
  rows.value = parsed.rows; limited.value = parsed.limited
  listReady.value = r?.status === 'completed' && r.exitCode === 0 && !parsed.limited
}
async function preview(row: ManagerRow) {
  if (disposed || busy.value || changing.value || !editing.value || !listReady.value || !['start', 'stop'].includes(row.action)) return
  dismiss(); const version = revision
  notice.value = '正在只读读取依赖关系；尚未提交服务变更。'
  await task.start('run_service_manager', { request: { action: 'preview', name: row.name, expected: row.state, confirmed: false } })
  if (disposed) return
  if (version !== revision || !editing.value) { notice.value = '已放弃该依赖预览；未提交服务变更。'; return }
  const r = task.result.value
  pending.value = r?.status === 'completed' && r.exitCode === 0 ? parseServicePlan(r.output, row.name, row.action) : null
  notice.value = pending.value ? '' : '无法生成完整依赖预览。可能状态已改变、权限不足或超出支持范围；请重新读取，不会执行变更。'
}
async function apply() {
  const plan = pending.value
  if (disposed || !plan || !accepted.value || !editing.value || busy.value || changing.value || !listReady.value) return
  dismiss(); changing.value = true; listReady.value = false
  notice.value = '已提交一次依赖操作。取消或超时不能撤销已发生的变更；不会自动重试。'
  try {
    await task.start('run_service_manager', { request: serviceApplyRequest(plan) })
    if (disposed) return
    const r = task.result.value, outcome = serviceOutcome(r?.output ?? '', plan)
    notice.value = r?.status === 'completed' && r.exitCode === 0 && outcome.verified
      ? '整份依赖计划的最终状态已核验。正在只读重查；下次操作需重新预览和确认。'
      : `结果未完整核验，可能部分生效。已收到逐项核验：${outcome.completed.join('、') || '无'}。正在只读重查；请勿直接重试。`
    await read(true)
    if (!disposed) notice.value = notice.value.replace('正在只读重查', listReady.value ? '已完成只读重查' : '只读重查不完整，请手动刷新核对')
  } finally { changing.value = false }
}
function cancel() { dismiss(); void task.cancel() }
onBeforeUnmount(() => { disposed = true; dismiss(); rows.value = []; notice.value = ''; listReady.value = false })
</script>
<template>
  <div class="tool-form">
    <p class="form-hint">本机 Windows 普通服务。手动读取，默认只读；列表最多 500 条、依赖图最多 32 项，每次命令 64 KiB / 20 秒。结果不完整时禁止变更；不提权、不绕过权限。</p>
    <p class="form-hint">启动时先启动停止的前置依赖；停止时先停止正在运行的被依赖服务。已处于目标状态的节点仅核验。不改启动类型、不强制停止、不创建或删除服务。驱动、服务组、暂停/过渡状态及超限依赖仍不支持，属于明确范围限制。</p>
    <div class="action-buttons"><button class="primary-button" :disabled="busy || changing" @click="read()">读取 / 刷新</button>
      <button v-if="busy" class="secondary-button" :disabled="cancelling" @click="cancel">取消等待</button></div>
    <label><input v-model="editing" type="checkbox" :disabled="busy || changing" @change="dismiss" /> 本次页面允许预览变更（每次另行确认）</label>
    <input v-model="query" class="native-input" maxlength="256" placeholder="筛选服务名称或显示名称" @input="page = 1; dismiss()" />
    <p v-if="limited" class="form-hint hint-error">列表有截断或不可读项，不能据此判断全机状态；变更已锁定。</p>
    <div class="manager-table"><table><thead><tr><th>服务名称</th><th>状态</th><th>操作</th></tr></thead><tbody>
      <tr v-for="row in visible" :key="row.name"><td>{{ row.name }}<br />{{ row.value }}</td><td>{{ row.state }}</td>
        <td><button v-if="row.action" class="secondary-button" :disabled="!editing || !listReady || busy || changing" @click="preview(row)">预览{{ row.action === 'start' ? '启动' : '停止' }}及依赖</button><span v-else>只读</span></td></tr>
    </tbody></table></div>
    <p class="form-hint">{{ filtered.length }} 条 · 第 {{ page }} 页；空结果或失败不代表不存在。</p>
    <div class="action-buttons"><button class="secondary-button" :disabled="page <= 1" @click="page--; dismiss()">上一页</button><button class="secondary-button" :disabled="page * 25 >= filtered.length" @click="page++; dismiss()">下一页</button></div>
    <section v-if="pending" class="change-preview" aria-label="服务依赖变更确认">
      <p>本机服务 {{ pending.name }}：{{ pending.action === 'start' ? '启动' : '停止' }}。下列 {{ pending.services.length }} 项为完整核验范围，其中 {{ changed }} 项将改变状态，按表中顺序执行。</p>
      <div class="manager-table"><table><thead><tr><th>顺序 / 服务</th><th>旧状态 → 新状态</th><th>先核验 / 处理的关联服务</th></tr></thead><tbody>
        <tr v-for="(service, index) in pending.services" :key="service.name"><td>{{ index + 1 }}. {{ service.name }}<br />{{ service.displayName }}</td>
          <td>{{ service.state }} → {{ service.nextState }}{{ service.state === service.nextState ? '（仅核验）' : '' }}</td><td>{{ service.links.join('、') || '无' }}</td></tr>
      </tbody></table></div>
      <p class="form-hint hint-error">启动可能运行服务程序；停止可能中断网络、应用、数据处理或系统功能。逐步重新比对依赖、配置与状态，发现变化即中止，但无法与其他程序原子互斥。Windows 仍可能在竞态中隐式启动依赖；服务自身也可能触发额外行为。取消、失败或超时可能留下部分变更，不自动回滚或重试。</p>
      <label><input v-model="accepted" type="checkbox" /> 我已核对以上全部服务、顺序、旧/新状态与影响，并授权执行这一次计划</label>
      <div class="action-buttons"><button class="primary-button" :disabled="!accepted || busy || changing" @click="apply">确认执行一次依赖计划</button><button class="secondary-button" @click="dismiss">取消预览</button></div>
    </section>
    <p role="status" class="form-hint">{{ busy ? '正在处理…' : notice }}</p><p class="form-hint hint-error">{{ error }}</p>
    <p class="form-hint">结果仅本页内存，不自动保存或复制；离页取消等待并清空，已发生的变更不会撤销。失败、超限或受限服务请使用 Windows 系统工具检查。</p>
  </div>
</template>
<style scoped>
.manager-table { max-height: 360px; overflow: auto; } table { width: 100%; font-size: 11px; text-align: left; }
th, td { padding: 7px; border-bottom: 1px solid var(--border-color, #e5e5ec); overflow-wrap: anywhere; }
.change-preview { padding: 10px; border: 1px solid #d5ad73; border-radius: 6px; font-size: 12px; }
</style>
