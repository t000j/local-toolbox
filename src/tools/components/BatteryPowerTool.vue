<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { trackedInvoke as invoke } from '../../app/activity'
import { save } from '@tauri-apps/plugin-dialog'
import NativeToolFrame from './NativeToolFrame.vue'
import { useNativeTask } from '../nativeTools'
interface Battery { name: string; deviceId: string; charge: number | null; status: number; runtimeMinutes: number | null }
interface Capacity { instance: string; designCapacity: number | null; fullChargeCapacity: number | null; healthPercent: number | null; unit: string }
interface PowerInfo { acStatus: string; batteryStatus: string; batteries: Battery[]; capacities: Capacity[]; activeScheme: string; warnings: string[] }
const { busy, error, message, run } = useNativeTask()
const data = ref<PowerInfo | null>(null)
const statusLabels: Record<number, string> = {1:'放电中',2:'连接电源或已充电',3:'已充满',4:'低电量',5:'电量紧急',6:'充电中',7:'充电且电量较高',8:'充电且电量较低',9:'充电且电量紧急',10:'未知',11:'部分充电'}
async function refresh() { const value = await run(() => invoke<PowerInfo>('get_battery_power')); if (value) data.value = value }
async function exportReport() {
  await run(async () => {
    const path = await save({ title: '保存 Windows 电池报告', defaultPath: `电池报告-${Date.now()}.html`, filters: [{ name: 'HTML 报告', extensions: ['html'] }] })
    if (!path) return
    await invoke('export_battery_report', { path })
    message.value = `已保存 ${path}`
  })
}
onMounted(refresh)
</script>
<template>
  <NativeToolFrame :busy="busy" :error="error" :message="message" hint="读取设备报告的电池状态与容量；未提供的字段显示未知。电池报告包含设备信息和历史用电记录，另存新 HTML 文件。">
    <template #toolbar><button class="secondary-button" :disabled="busy" @click="refresh">刷新电源信息</button><button class="primary-button" :disabled="busy || !data?.batteries.length" @click="exportReport">导出 Windows 电池报告</button></template>
    <template v-if="data"><div class="native-stats"><article class="native-stat"><span>电源连接</span><strong>{{ data.acStatus === 'Online' ? '已连接电源' : data.acStatus === 'Offline' ? '使用电池' : '未知' }}</strong></article><article class="native-stat"><span>电池数量</span><strong>{{ data.batteries.length }}</strong></article></div><p class="native-path">{{ data.activeScheme || '当前电源计划不可用' }}</p>
      <p v-if="!data.batteries.length" class="native-empty">设备未报告电池；台式机出现此情况属于正常情况。</p>
      <div class="native-card-list"><article v-for="battery in data.batteries" :key="battery.deviceId" class="native-record"><div class="native-record-main"><strong>{{ battery.name }} · {{ battery.charge == null ? '电量未知' : battery.charge + '%' }}</strong><span>{{ statusLabels[battery.status] ?? '未知状态' }} · 预计剩余 {{ battery.runtimeMinutes == null ? '未知' : battery.runtimeMinutes + ' 分钟' }}</span></div><div class="native-bar" style="width: 110px"><span :style="{width: `${Math.min(100, Math.max(0, battery.charge ?? 0))}%`}"></span></div></article></div>
      <div v-for="capacity in data.capacities" :key="capacity.instance" class="native-detail"><h3>电池容量</h3><p class="native-hint">{{ capacity.instance }}</p><div class="native-stats"><article class="native-stat"><span>设计容量</span><strong>{{ capacity.designCapacity ? capacity.designCapacity + ' ' + capacity.unit : '未知' }}</strong></article><article class="native-stat"><span>满充容量</span><strong>{{ capacity.fullChargeCapacity ? capacity.fullChargeCapacity + ' ' + capacity.unit : '未知' }}</strong></article><article class="native-stat"><span>满充 / 设计容量</span><strong>{{ capacity.healthPercent == null ? '未知' : capacity.healthPercent + '%' }}</strong></article></div></div><p v-for="warning in data.warnings" :key="warning" class="native-hint">{{ warning }}</p>
    </template>
  </NativeToolFrame>
</template>
