<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { trackedInvoke as invoke } from '../../app/activity'
import { copyText } from '../clipboard'
import { useNativeTask } from '../nativeTools'
import NativeToolFrame from './NativeToolFrame.vue'
import NativeDataTable from './NativeDataTable.vue'

interface DeviceDriver {
  id: string; name: string; category: string; manufacturer: string; status: string; errorCode: number | null; present: boolean | null
  driverVersion: string; driverProvider: string; driverDate: string; signed: boolean | null; signer: string
}
interface DeviceList { items: DeviceDriver[]; truncated: boolean; warnings: string[] }
const { busy, error, message, run } = useNativeTask()
const data = ref<DeviceList | null>(null)
const selected = ref<DeviceDriver | null>(null)
const query = ref('')
const category = ref('all')
const state = ref('all')
const hideDisconnected = ref(true)
const categories = computed(() => [...new Set(data.value?.items.map((item) => item.category).filter(Boolean) ?? [])].sort())

function needsAttention(item: DeviceDriver): boolean {
  return item.present !== false && ((item.errorCode !== null && item.errorCode !== 0) || ['error', 'degraded', 'pred fail'].includes(item.status.toLowerCase()))
}
function statusLabel(item: DeviceDriver): string {
  if (item.present === false) return '未连接'
  if (item.errorCode === 22) return '已禁用'
  if (item.errorCode === 28) return '缺少驱动'
  if (needsAttention(item)) return '需检查'
  if (item.errorCode === 0 || item.status.toLowerCase() === 'ok') return '正常'
  return '未知'
}
const attentionCount = computed(() => data.value?.items.filter(needsAttention).length ?? 0)
const visible = computed(() => {
  const term = query.value.trim().toLocaleLowerCase()
  return data.value?.items.filter((item) => {
    if (hideDisconnected.value && item.present === false) return false
    if (category.value !== 'all' && item.category !== category.value) return false
    if (state.value === 'attention' && !needsAttention(item)) return false
    if (state.value === 'normal' && statusLabel(item) !== '正常') return false
    if (state.value === 'unknown' && statusLabel(item) !== '未知') return false
    return !term || `${item.name} ${item.category} ${item.manufacturer} ${item.driverProvider} ${item.driverVersion} ${item.id}`.toLocaleLowerCase().includes(term)
  }).map((item) => ({ ...item, statusLabel: statusLabel(item) })) ?? []
})
const details = computed(() => {
  const item = selected.value
  if (!item) return ''
  const code = item.errorCode === null ? '未提供' : String(item.errorCode)
  const presence = item.present === null ? '未提供' : item.present ? '已连接' : '未连接'
  const signature = item.signed === null ? '未提供' : item.signed ? '已登记为已签名' : '未登记为已签名'
  return [
    `设备：${item.name || '未提供'}`, `类型：${item.category || '未提供'}`, `厂商：${item.manufacturer || '未提供'}`,
    `状态：${statusLabel(item)}（配置错误码：${code}）`, `连接状态：${presence}`, `Windows 状态：${item.status || '未提供'}`,
    `驱动提供商：${item.driverProvider || '未提供'}`, `驱动版本：${item.driverVersion || '未提供'}`, `驱动日期：${item.driverDate || '未提供'}`,
    `Windows 签名登记：${signature}`, `签名者：${item.signer || '未提供'}`, `设备实例 ID：${item.id || '未提供'}`,
  ].join('\n')
})

async function refresh(): Promise<void> {
  selected.value = null
  const value = await run(() => invoke<DeviceList>('list_device_drivers'))
  if (value) {
    data.value = value
    if (category.value !== 'all' && !value.items.some((item) => item.category === category.value)) category.value = 'all'
  }
}
function selectDevice(row: object): void { selected.value = row as DeviceDriver }
async function copyDetails(): Promise<void> { if (selected.value) await run(() => copyText(details.value), '设备与驱动详情已复制。') }
async function copyList(): Promise<void> {
  await run(() => copyText(JSON.stringify(visible.value, null, 2)), '当前筛选的设备清单已复制。')
}
onMounted(refresh)
</script>

<template>
  <NativeToolFrame :busy="busy" :error="error" :message="message" hint="读取 Windows 设备与驱动登记信息。缺失字段显示为未提供，签名登记不代表已完成签名验证。">
    <template #toolbar>
      <button class="primary-button" :disabled="busy" @click="refresh">刷新设备清单</button>
      <button class="secondary-button" :disabled="busy || !visible.length" @click="copyList">复制当前列表</button>
    </template>
    <div v-if="data" class="native-stats">
      <article class="native-stat"><span>设备条目</span><strong>{{ data.items.length }}</strong></article>
      <article class="native-stat"><span>需检查设备</span><strong>{{ attentionCount }}</strong></article>
      <article class="native-stat"><span>当前筛选</span><strong>{{ visible.length }}</strong></article>
    </div>
    <div class="native-toolbar">
      <input v-model="query" class="native-search" placeholder="搜索设备、厂商、驱动版本或实例 ID…" aria-label="搜索设备与驱动" />
      <label>类型 <select v-model="category"><option value="all">全部类型</option><option v-for="value in categories" :key="value">{{ value }}</option></select></label>
      <label>状态 <select v-model="state"><option value="all">全部状态</option><option value="normal">正常</option><option value="attention">需检查</option><option value="unknown">未知</option></select></label>
      <label><input v-model="hideDisconnected" type="checkbox" /> 隐藏未连接设备</label>
    </div>
    <p v-if="data?.truncated" class="native-hint">设备条目较多，仅显示前 2000 条。</p>
    <p v-for="warning in data?.warnings ?? []" :key="warning" class="native-hint">{{ warning }}</p>
    <NativeDataTable v-if="data" :rows="visible" :columns="[{key:'name',label:'设备名称'},{key:'category',label:'类型'},{key:'statusLabel',label:'状态'},{key:'driverVersion',label:'驱动版本'}]" selectable @select="selectDevice" />
    <p v-else-if="!busy && !error" class="native-empty">点击刷新获取本机设备与驱动清单。</p>
    <div v-if="selected" class="native-detail">
      <h3>{{ selected.name || '设备详情' }}</h3><pre>{{ details }}</pre>
      <div class="native-toolbar"><button class="secondary-button" :disabled="busy" @click="copyDetails">复制设备详情</button><button class="quiet-button" @click="selected = null">收起</button></div>
    </div>
  </NativeToolFrame>
</template>
