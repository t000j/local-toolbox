<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { trackedInvoke as invoke } from '../../app/activity'
import { open } from '@tauri-apps/plugin-dialog'
import NativeToolFrame from './NativeToolFrame.vue'
import NativeDataTable from './NativeDataTable.vue'
import { formatBytes, useNativeTask } from '../nativeTools'
interface Volume { drive: string; name: string; totalBytes: number; freeBytes: number; fileSystem: string }
interface DiskScan { root: string; totalBytes: number; fileCount: number; directoryCount: number; skippedCount: number; truncated: boolean; folders: { path: string; bytes: number }[]; largeFiles: { path: string; bytes: number }[] }
const { busy, error, message, run } = useNativeTask()
const volumes = ref<Volume[]>([])
const result = ref<DiskScan | null>(null)
const fileRows = computed(() => result.value?.largeFiles.map((file) => ({ ...file, size: formatBytes(file.bytes) })) ?? [])
async function refreshVolumes() { const value = await run(() => invoke<Volume[]>('list_disk_volumes')); if (value) volumes.value = value }
async function scan() {
  const value = await run(async () => {
    const path = await open({ title: '选择要分析的文件夹', directory: true, multiple: false })
    return typeof path === 'string' ? invoke<DiskScan>('analyze_disk_space', { path }) : null
  })
  if (value) result.value = value
}
onMounted(refreshVolumes)
</script>
<template>
  <NativeToolFrame :busy="busy" :error="error" :message="message" hint="统计文件逻辑大小；最多遍历 20 万项或 20 秒，跳过无权限项目和目录链接。">
    <template #toolbar><button class="primary-button" :disabled="busy" @click="scan">选择文件夹并分析</button><button class="secondary-button" :disabled="busy" @click="refreshVolumes">刷新磁盘</button></template>
    <div class="native-stats"><article v-for="volume in volumes" :key="volume.drive" class="native-stat"><span>{{ volume.drive }} {{ volume.name }} · {{ volume.fileSystem }}</span><strong>{{ formatBytes(volume.freeBytes) }} 可用</strong><span>共 {{ formatBytes(volume.totalBytes) }}</span><div class="native-bar"><span :style="{ width: `${volume.totalBytes ? (1 - volume.freeBytes / volume.totalBytes) * 100 : 0}%` }"></span></div></article></div>
    <template v-if="result"><p class="native-path">{{ result.root }}</p><p v-if="result.truncated || result.skippedCount" class="native-hint">{{ result.truncated ? '本次为部分扫描结果，已达到遍历限制。' : '' }} 跳过 {{ result.skippedCount }} 项。</p><div class="native-stats"><article class="native-stat"><span>累计文件大小</span><strong>{{ formatBytes(result.totalBytes) }}</strong></article><article class="native-stat"><span>文件</span><strong>{{ result.fileCount }}</strong></article><article class="native-stat"><span>文件夹</span><strong>{{ result.directoryCount }}</strong></article></div>
      <div class="native-detail"><h3>顶层目录占用（前 50 项）</h3><div v-for="folder in result.folders" :key="folder.path"><p class="native-hint">{{ folder.path }} · {{ formatBytes(folder.bytes) }}</p><div class="native-bar"><span :style="{ width: `${result.totalBytes ? folder.bytes / result.totalBytes * 100 : 0}%` }"></span></div></div></div>
      <NativeDataTable :rows="fileRows" :columns="[{key:'path',label:'最大的文件（前 50 项）'},{key:'size',label:'逻辑大小'}]" />
    </template>
  </NativeToolFrame>
</template>
