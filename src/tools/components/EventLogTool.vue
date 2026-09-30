<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { trackedInvoke as invoke } from '../../app/activity'
import { copyText } from '../clipboard'
import NativeToolFrame from './NativeToolFrame.vue'
import NativeDataTable from './NativeDataTable.vue'
import { formatDate, useNativeTask } from '../nativeTools'
interface EventEntry { recordId: number; id: number; time: string; provider: string; level: number; levelName: string; message: string; truncated: boolean }
const { busy, error, message, run } = useNativeTask()
const logName = ref('System')
const days = ref(7)
const level = ref(2)
const limit = ref(100)
const provider = ref('')
const query = ref('')
const events = ref<EventEntry[]>([])
const selected = ref<EventEntry | null>(null)
const levelLabels: Record<number, string> = { 0: '全部级别', 1: '关键', 2: '错误', 3: '警告', 4: '信息', 5: '详细' }
const visible = computed(() => events.value.filter((item) => `${item.provider} ${item.id} ${item.message}`.toLowerCase().includes(query.value.toLowerCase())).map((item) => ({ ...item, timeDisplay: formatDate(item.time), levelDisplay: levelLabels[item.level] ?? item.levelName })))
async function refresh() {
  selected.value = null
  const value = await run(() => invoke<EventEntry[]>('query_event_logs', { logName: logName.value, days: days.value, level: level.value, limit: limit.value, provider: provider.value.trim() }))
  if (value) events.value = value
}
function selectEvent(row: object) { selected.value = row as EventEntry }
async function copyEvent() { if (selected.value) await run(() => copyText(`时间：${formatDate(selected.value!.time)}\n来源：${selected.value!.provider}\nID：${selected.value!.id}\n${selected.value!.message}`), '事件信息已复制。') }
onMounted(refresh)
</script>
<template>
  <NativeToolFrame :busy="busy" :error="error" :message="message" hint="仅读取本机 System / Application 日志，每次查询最多 200 条；来源名称填写精确值，消息搜索作用于已读取记录。">
    <template #toolbar><label>日志 <select v-model="logName"><option value="System">系统</option><option value="Application">应用</option></select></label><label>时间 <select v-model.number="days"><option :value="1">最近 1 天</option><option :value="7">最近 7 天</option><option :value="30">最近 30 天</option></select></label><label>级别 <select v-model.number="level"><option v-for="(label, value) in levelLabels" :key="value" :value="Number(value)">{{ label }}</option></select></label><label>数量 <select v-model.number="limit"><option :value="50">50</option><option :value="100">100</option><option :value="200">200</option></select></label><button class="primary-button" :disabled="busy" @click="refresh">查询日志</button></template>
    <div class="native-toolbar"><input v-model="provider" class="native-search" maxlength="200" placeholder="来源名称（可选，精确匹配）" aria-label="事件来源" /><input v-model="query" class="native-search" placeholder="在结果中搜索 ID、来源或消息…" aria-label="搜索事件结果" /></div>
    <NativeDataTable :rows="visible" :columns="[{key:'timeDisplay',label:'时间'},{key:'levelDisplay',label:'级别'},{key:'provider',label:'来源'},{key:'id',label:'事件 ID'}]" selectable @select="selectEvent" />
    <div v-if="selected" class="native-detail"><h3>{{ selected.provider }} · {{ selected.id }}</h3><p class="native-hint">{{ formatDate(selected.time) }} · 记录 {{ selected.recordId }}</p><pre>{{ selected.message || '此事件没有可用消息。' }}</pre><div class="native-toolbar"><button class="secondary-button" :disabled="busy" @click="copyEvent">复制事件</button><button class="quiet-button" @click="selected = null">收起</button></div></div>
  </NativeToolFrame>
</template>
