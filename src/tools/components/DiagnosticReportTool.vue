<script setup lang="ts">
import { computed, ref } from 'vue'
import { trackedInvoke as invoke } from '../../app/activity'
import { save } from '@tauri-apps/plugin-dialog'
import { copyText } from '../clipboard'
import NativeToolFrame from './NativeToolFrame.vue'
import { formatBytes, useNativeTask } from '../nativeTools'
interface DiagnosticReport {
  reportVersion: number
  system: { hostName: string; osName: string; osVersion: string; cpuBrand: string; architecture: string; logicalCoreCount: number; physicalCoreCount: number | null; totalMemoryBytes: number; usedMemoryBytes: number; uptimeSeconds: number }
  volumes: { drive: string; name: string; totalBytes: number; freeBytes: number; fileSystem: string }[] | null
  network: object[] | null
  networkIncluded: boolean
  warnings: string[]
  generatedAt?: string
}
const { busy, error, message, run } = useNativeTask()
const includeNetwork = ref(false)
const report = ref<DiagnosticReport | null>(null)
const jsonPreview = computed(() => report.value ? JSON.stringify(report.value, null, 2) : '')
const textPreview = computed(() => {
  if (!report.value) return ''
  const item = report.value
  const system = item.system
  return [`本机诊断报告 · ${item.generatedAt}`, `设备：${system.hostName}`, `系统：${system.osName} ${system.osVersion}`, `处理器：${system.cpuBrand}`, `架构：${system.architecture}`, `核心：${system.physicalCoreCount ?? '未知'} 物理 / ${system.logicalCoreCount} 逻辑`, `内存：${formatBytes(system.usedMemoryBytes)} / ${formatBytes(system.totalMemoryBytes)}`, `运行时间：${system.uptimeSeconds} 秒`, '', '磁盘：', ...(item.volumes?.map((volume) => `${volume.drive} ${volume.name} · 可用 ${formatBytes(volume.freeBytes)} / ${formatBytes(volume.totalBytes)}`) ?? ['读取失败']), '', item.networkIncluded ? `网络配置：\n${JSON.stringify(item.network, null, 2)}` : '未包含网络配置', '', ...item.warnings.map((warning) => `未获取项：${warning}`)].join('\n')
})
async function generate() {
  const value = await run(() => invoke<DiagnosticReport>('collect_diagnostic_report', { includeNetwork: includeNetwork.value }))
  if (value) report.value = { ...value, generatedAt: new Date().toISOString() }
}
async function exportReport(format: 'json' | 'txt') {
  if (!report.value) return
  await run(async () => {
    const path = await save({ title: '保存本机诊断报告', defaultPath: `本机诊断-${Date.now()}.${format}`, filters: [{ name: format.toUpperCase(), extensions: [format] }] })
    if (!path) return
    await invoke('save_local_report', { path, content: format === 'json' ? jsonPreview.value : textPreview.value })
    message.value = `报告已保存到 ${path}`
  })
}
async function copyReport() { await run(() => copyText(textPreview.value), '报告已复制。') }
</script>
<template>
  <NativeToolFrame :busy="busy" :error="error" :message="message" hint="汇总设备名称、操作系统、CPU、内存和磁盘。网络配置可按需加入；生成后可预览再导出。">
    <template #toolbar><label><input v-model="includeNetwork" type="checkbox" :disabled="busy" /> 包含网卡、IP 和 MAC</label><button class="primary-button" :disabled="busy" @click="generate">生成诊断报告</button></template>
    <template v-if="report"><div class="native-stats"><article class="native-stat"><span>系统</span><strong>{{ report.system.osName }}</strong></article><article class="native-stat"><span>内存总量</span><strong>{{ formatBytes(report.system.totalMemoryBytes) }}</strong></article><article class="native-stat"><span>磁盘数量</span><strong>{{ report.volumes?.length ?? '—' }}</strong></article></div><p v-for="warning in report.warnings" :key="warning" class="native-hint">部分信息未获取：{{ warning }}</p><textarea class="code-input result-input" :value="textPreview" readonly aria-label="诊断报告预览"></textarea><div class="native-toolbar"><button class="secondary-button" :disabled="busy" @click="exportReport('json')">保存 JSON</button><button class="secondary-button" :disabled="busy" @click="exportReport('txt')">保存 TXT</button><button class="quiet-button" :disabled="busy" @click="copyReport">复制报告</button></div></template>
    <p v-else class="native-empty">点击生成，汇总当前设备信息。</p>
  </NativeToolFrame>
</template>
