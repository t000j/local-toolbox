<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { trackedInvoke as invoke } from '../../app/activity'
import NativeToolFrame from './NativeToolFrame.vue'
import { useNativeTask } from '../nativeTools'
import { canMove, moveRequest, type DesktopWindow } from '../windowMovement'
const { busy, error, message, run } = useNativeTask()
const items = ref<DesktopWindow[]>([])
const query = ref('')
const pendingClose = ref<DesktopWindow | null>(null)
const pendingMove = ref<DesktopWindow | null>(null), x = ref(0), y = ref(0), accepted = ref(false)
let disposed = false
watch([x, y], () => { accepted.value = false })
function cancelMove() { pendingMove.value = null; accepted.value = false }
function previewMove(item: DesktopWindow) {
  if (busy.value || !canMove(item)) return
  pendingClose.value = null; pendingMove.value = { ...item, rect: { ...item.rect! } }
  x.value = item.rect!.left; y.value = item.rect!.top; accepted.value = false
}
async function confirmMove() {
  if (busy.value || disposed || !pendingMove.value) return
  const request = moveRequest(pendingMove.value, x.value, y.value, accepted.value)
  if (!request) return
  cancelMove()
  await run(async () => {
    await invoke('move_desktop_window', { request })
    if (disposed) return
    const result = await invoke<DesktopWindow[]>('list_desktop_windows')
    if (!disposed) items.value = result
  }, '已核验移动位置；目标应用之后仍可能自行调整窗口。')
  if (error.value) items.value = []
}
onBeforeUnmount(() => { disposed = true; cancelMove(); pendingClose.value = null; items.value = [] })
const visible = computed(() => items.value.filter((item) => `${item.title} ${item.processName} ${item.processId}`.toLowerCase().includes(query.value.toLowerCase())))
async function refresh() { if (busy.value || disposed) return; cancelMove(); pendingClose.value = null; const result = await run(() => invoke<DesktopWindow[]>('list_desktop_windows')); if (result && !disposed) items.value = result }
async function control(item: DesktopWindow, action: string) {
  if (busy.value || disposed) return
  cancelMove()
  const result = await run(async () => {
    await invoke('control_desktop_window', { handle: item.handle, processId: item.processId, title: item.title, action })
    return invoke<DesktopWindow[]>('list_desktop_windows')
  }, action === 'close' ? '已发送关闭请求；目标应用可能提示保存内容。' : '窗口操作已请求执行。')
  if (result && !disposed) { items.value = result; pendingClose.value = null }
}
async function confirmClose() { if (pendingClose.value) await control(pendingClose.value, 'close') }
onMounted(refresh)
</script>
<template>
  <NativeToolFrame :busy="busy" :error="error" :message="message" hint="操作有标题的可见桌面窗口；关闭前请保存目标应用内容。移动只支持普通窗口，坐标为桌面物理像素（可为负）；保持尺寸与层级，不提权。">
    <template #toolbar><input v-model="query" class="native-search" placeholder="搜索窗口、进程或 PID…" aria-label="搜索窗口" /><span class="native-count">{{ visible.length }} 个窗口</span><button class="secondary-button" :disabled="busy" @click="refresh">刷新</button></template>
    <div v-if="pendingClose" class="native-confirm"><strong>关闭“{{ pendingClose.title }}”？</strong><p>将请求 {{ pendingClose.processName }}（PID {{ pendingClose.processId }}）关闭此窗口。</p><div><button class="secondary-button" :disabled="busy" @click="pendingClose = null">取消</button><button class="native-danger-button" :disabled="busy" @click="confirmClose">确认关闭</button></div></div>
    <div v-if="pendingMove" class="native-confirm">
      <strong>移动“{{ pendingMove.title }}”</strong>
      <p>{{ pendingMove.processName }} · PID {{ pendingMove.processId }}；旧坐标 {{ pendingMove.rect!.left }}, {{ pendingMove.rect!.top }}</p>
      <label>X <input v-model.number="x" type="number" min="-100000" max="100000" step="1" :disabled="busy" /></label>
      <label>Y <input v-model.number="y" type="number" min="-100000" max="100000" step="1" :disabled="busy" /></label>
      <p>新坐标 {{ x }}, {{ y }}；保持尺寸，不自动还原最大化窗口。会检查顶部仍可见；失败后请刷新，不自动回滚。</p>
      <label><input v-model="accepted" type="checkbox" :disabled="busy" /> 我确认移动此窗口到上述位置</label>
      <div><button class="secondary-button" :disabled="busy" @click="cancelMove">取消</button>
        <button class="secondary-button" :disabled="busy || !moveRequest(pendingMove, x, y, accepted)" @click="confirmMove">确认移动</button></div>
    </div>
    <div class="native-card-list"><article v-for="item in visible" :key="item.handle" class="native-record"><div class="native-record-main"><strong>{{ item.title }}</strong><span>{{ item.processName }} · PID {{ item.processId }} · {{ item.minimized ? '已最小化' : item.maximized ? '已最大化' : '普通窗口' }}<b v-if="item.topMost"> · 已置顶</b></span></div><div class="native-record-actions"><button class="quiet-button" :disabled="busy || !canMove(item)" @click="previewMove(item)">移动</button><button class="quiet-button" :disabled="busy" @click="control(item, item.topMost ? 'unpin' : 'pin')">{{ item.topMost ? '取消置顶' : '置顶' }}</button><button class="quiet-button" :disabled="busy" @click="control(item, 'minimize')">最小化</button><button class="quiet-button" :disabled="busy" @click="control(item, item.maximized || item.minimized ? 'restore' : 'maximize')">{{ item.maximized || item.minimized ? '还原' : '最大化' }}</button><button class="quiet-button native-danger" :disabled="busy" @click="cancelMove(); pendingClose = item">关闭</button></div></article><p v-if="!visible.length && !busy" class="native-empty">未找到匹配窗口</p></div>
  </NativeToolFrame>
</template>
