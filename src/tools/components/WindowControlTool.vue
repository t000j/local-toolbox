<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { trackedInvoke as invoke } from '../../app/activity'
import NativeToolFrame from './NativeToolFrame.vue'
import { useNativeTask } from '../nativeTools'
interface DesktopWindow { handle: number; processId: number; title: string; processName: string; topMost: boolean; minimized: boolean; maximized: boolean }
const { busy, error, message, run } = useNativeTask()
const items = ref<DesktopWindow[]>([])
const query = ref('')
const pendingClose = ref<DesktopWindow | null>(null)
const visible = computed(() => items.value.filter((item) => `${item.title} ${item.processName} ${item.processId}`.toLowerCase().includes(query.value.toLowerCase())))
async function refresh() { const result = await run(() => invoke<DesktopWindow[]>('list_desktop_windows')); if (result) items.value = result }
async function control(item: DesktopWindow, action: string) {
  const result = await run(async () => {
    await invoke('control_desktop_window', { handle: item.handle, processId: item.processId, title: item.title, action })
    return invoke<DesktopWindow[]>('list_desktop_windows')
  }, action === 'close' ? '已发送关闭请求；目标应用可能提示保存内容。' : '窗口操作已请求执行。')
  if (result) { items.value = result; pendingClose.value = null }
}
async function confirmClose() { if (pendingClose.value) await control(pendingClose.value, 'close') }
onMounted(refresh)
</script>
<template>
  <NativeToolFrame :busy="busy" :error="error" :message="message" hint="操作有标题的可见桌面窗口；关闭前请保存目标应用内容。部分管理员窗口可能拒绝控制。">
    <template #toolbar><input v-model="query" class="native-search" placeholder="搜索窗口、进程或 PID…" aria-label="搜索窗口" /><span class="native-count">{{ visible.length }} 个窗口</span><button class="secondary-button" :disabled="busy" @click="refresh">刷新</button></template>
    <div v-if="pendingClose" class="native-confirm"><strong>关闭“{{ pendingClose.title }}”？</strong><p>将请求 {{ pendingClose.processName }}（PID {{ pendingClose.processId }}）关闭此窗口。</p><div><button class="secondary-button" :disabled="busy" @click="pendingClose = null">取消</button><button class="native-danger-button" :disabled="busy" @click="confirmClose">确认关闭</button></div></div>
    <div class="native-card-list"><article v-for="item in visible" :key="item.handle" class="native-record"><div class="native-record-main"><strong>{{ item.title }}</strong><span>{{ item.processName }} · PID {{ item.processId }} · {{ item.minimized ? '已最小化' : item.maximized ? '已最大化' : '普通窗口' }}<b v-if="item.topMost"> · 已置顶</b></span></div><div class="native-record-actions"><button class="quiet-button" :disabled="busy" @click="control(item, item.topMost ? 'unpin' : 'pin')">{{ item.topMost ? '取消置顶' : '置顶' }}</button><button class="quiet-button" :disabled="busy" @click="control(item, 'minimize')">最小化</button><button class="quiet-button" :disabled="busy" @click="control(item, item.maximized || item.minimized ? 'restore' : 'maximize')">{{ item.maximized || item.minimized ? '还原' : '最大化' }}</button><button class="quiet-button native-danger" :disabled="busy" @click="pendingClose = item">关闭</button></div></article><p v-if="!visible.length && !busy" class="native-empty">未找到匹配窗口</p></div>
  </NativeToolFrame>
</template>
