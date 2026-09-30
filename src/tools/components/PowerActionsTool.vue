<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { createPowerCountdown, powerActions, type PowerAction } from '../powerActions'
import { useNativeDiagnostic } from '../useNativeDiagnostic'
const task = useNativeDiagnostic(), { busy, error, result, summary } = task
const pending = ref<PowerAction | null>(null), accepted = ref(false), seconds = ref(0), queued = ref(false), notice = ref('')
let disposed = false
const countdown = createPowerCountdown(() => { void execute() }, n => { seconds.value = n })
function preview(action: PowerAction) {
  if (busy.value || queued.value || disposed) return
  pending.value = action; accepted.value = false; task.clear(); notice.value = ''
}
function confirm() {
  if (!pending.value || !accepted.value || busy.value || queued.value || disposed) return
  queued.value = true; countdown.start()
}
function cancel() {
  countdown.cancel(); queued.value = false; pending.value = null; accepted.value = false
  notice.value = '已取消本页预览 / 倒计时，未向系统提交操作。'
}
async function execute() {
  const action = pending.value
  if (!queued.value || !action || !accepted.value || disposed) return
  queued.value = false; pending.value = null; accepted.value = false
  notice.value = '正在提交一次请求。提交后无法由此页面撤销；不会自动重试。'
  await task.start('run_power_action', { action: action.id, confirmed: true })
  if (!disposed) notice.value = result.value?.status === 'completed' && result.value.exitCode === 0
    ? '系统命令返回成功；最终状态未核验。应用或策略可能阻止操作，请观察系统状态。'
    : '请求结果未核验，可能已经生效。请观察系统状态，不要重复提交。'
}
onBeforeUnmount(() => { disposed = true; countdown.cancel(); queued.value = false; pending.value = null; accepted.value = false })
</script>
<template>
  <div class="tool-form">
    <p class="form-hint hint-error">这些操作会影响当前会话或整台电脑。先保存工作；每次必须查看影响并明确确认，然后等待本页 10 秒可取消倒计时。不强制关闭应用、不提权、不创建系统定时关机任务。</p>
    <div class="action-buttons"><button v-for="action in powerActions" :key="action.id" class="secondary-button" :disabled="busy || queued" @click="preview(action)">预览{{ action.name }}</button></div>
    <section v-if="pending" class="power-preview" aria-label="电源操作确认">
      <p>目标：本机 · 操作：{{ pending.name }}</p><p>{{ pending.impact }}</p>
      <p class="form-hint">不使用强制参数，应用可能阻止注销、重启或关机；系统策略与权限不足会失败。不关闭其他程序来绕过阻止。睡眠请求可能在唤醒后才返回。</p>
      <label><input v-model="accepted" type="checkbox" :disabled="queued" /> 我已保存工作、确认影响范围，并授权本次{{ pending.name }}</label>
      <div class="action-buttons"><button class="primary-button" :disabled="!accepted || busy || queued" @click="confirm">确认，开始 10 秒倒计时</button><button class="secondary-button" @click="cancel">取消{{ queued ? '倒计时' : '预览' }}</button></div>
      <p v-if="queued" role="status">{{ seconds }} 秒后提交{{ pending.name }}。离开此页会取消尚未提交的倒计时。</p>
    </section>
    <p class="form-hint" role="status">{{ notice }}</p><p class="form-hint">{{ summary }}</p><p class="form-hint hint-error">{{ error }}</p>
    <pre v-if="result?.output">{{ result.output }}</pre>
    <p class="form-hint">取消只在本页倒计时阶段有效。提交后即便关闭工具或停止等待，也不能保证阻止系统操作；不会发送全局 shutdown /a，以免取消其他程序安排的任务。无自动执行或持久保存。</p>
  </div>
</template>
<style scoped>
.power-preview { padding: 10px; border: 1px solid #d5ad73; border-radius: 6px; font-size: 12px; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 11px; }
</style>
