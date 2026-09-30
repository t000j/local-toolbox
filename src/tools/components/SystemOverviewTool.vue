<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { trackedInvoke as invoke } from '../../app/activity'
import { Check, Clock3, Copy, Cpu, LoaderCircle, MemoryStick, Monitor, PanelsTopLeft, RefreshCw } from '@lucide/vue'
import { copyText } from '../clipboard'

interface SystemOverview {
  osName: string
  osVersion: string
  hostName: string
  cpuBrand: string
  architecture: string
  logicalCoreCount: number
  physicalCoreCount: number | null
  totalMemoryBytes: number
  usedMemoryBytes: number
  uptimeSeconds: number
}

const system = ref<SystemOverview | null>(null)
const loading = ref(false)
const error = ref('')
const copied = ref(false)
const memoryUsage = computed(() => {
  if (!system.value || system.value.totalMemoryBytes <= 0) return 0
  return Math.min(100, Math.round(system.value.usedMemoryBytes / system.value.totalMemoryBytes * 100))
})

function formatMemory(bytes: number): string {
  return (bytes / (1024 ** 3)).toFixed(1) + ' GiB'
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const parts: string[] = []
  if (days) parts.push(days + ' 天')
  if (hours || days) parts.push(hours + ' 小时')
  parts.push(minutes + ' 分钟')
  return parts.join(' ')
}

async function refresh(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    system.value = await invoke<SystemOverview>('get_system_overview')
  } catch (cause) {
    error.value = typeof cause === 'string' ? cause : cause instanceof Error ? cause.message : '读取系统信息失败，请重试。'
  } finally {
    loading.value = false
  }
}

async function copyReport(): Promise<void> {
  if (!system.value) return
  const info = system.value
  const lines = [
    '设备名称：' + info.hostName,
    '操作系统：' + info.osName + ' ' + info.osVersion,
    '处理器：' + info.cpuBrand,
    '逻辑处理器：' + info.logicalCoreCount,
    '物理核心：' + (info.physicalCoreCount ?? '未知'),
    '内存：' + formatMemory(info.totalMemoryBytes),
    '系统运行时间：' + formatUptime(info.uptimeSeconds),
  ]
  try {
    await copyText(lines.join('\n'))
    copied.value = true
    window.setTimeout(() => { copied.value = false }, 1600)
  } catch {
    error.value = '复制失败，请检查剪贴板权限。'
  }
}

onMounted(refresh)
</script>

<template>
  <div class="system-overview-tool">
    <div class="system-overview-toolbar">
      <div class="system-overview-brand">
        <div class="system-overview-icon"><Monitor :size="20" /></div>
        <div><span>设备信息</span><h2>系统与设备概览</h2></div>
      </div>
      <div class="system-overview-actions">
        <button v-if="system" class="quiet-button" @click="copyReport">
          <Check v-if="copied" :size="14" /><Copy v-else :size="14" /> {{ copied ? '已复制' : '复制报告' }}
        </button>
        <button class="secondary-button" :disabled="loading" @click="refresh">
          <LoaderCircle v-if="loading" class="spin-icon" :size="15" /><RefreshCw v-else :size="15" /> 刷新
        </button>
      </div>
    </div>

    <div v-if="error" class="system-overview-error">{{ error }}</div>
    <div v-else-if="loading && !system" class="system-overview-loading"><span class="loading-pulse"></span> 正在读取设备信息…</div>
    <div v-else-if="system" class="system-overview-grid">
      <article class="system-info-card os-info-card">
        <div class="system-info-icon tone-violet"><PanelsTopLeft :size="18" /></div>
        <span class="system-info-label">操作系统</span>
        <strong>{{ system.osName }}</strong>
        <span class="system-info-secondary">{{ system.osVersion }}</span>
        <div class="system-host-name">设备名称 <b>{{ system.hostName }}</b></div>
      </article>

      <article class="system-info-card cpu-info-card">
        <div class="system-info-icon tone-blue"><Cpu :size="18" /></div>
        <span class="system-info-label">处理器</span>
        <strong class="cpu-brand">{{ system.cpuBrand }}</strong>
        <div class="system-stat-pair">
          <span><b>{{ system.logicalCoreCount }}</b> 逻辑处理器</span>
          <span><b>{{ system.physicalCoreCount ?? '—' }}</b> 物理核心</span>
        </div>
        <span class="system-info-secondary">架构 {{ system.architecture }}</span>
      </article>

      <article class="system-info-card memory-info-card">
        <div class="system-info-icon tone-green"><MemoryStick :size="18" /></div>
        <span class="system-info-label">内存</span>
        <strong>{{ formatMemory(system.totalMemoryBytes) }}</strong>
        <div class="memory-progress-track"><span :style="{ width: memoryUsage + '%' }"></span></div>
        <div class="memory-usage-row"><span>当前已用 {{ formatMemory(system.usedMemoryBytes) }}</span><b>{{ memoryUsage }}%</b></div>
      </article>

      <article class="system-info-card uptime-info-card">
        <div class="system-info-icon tone-amber"><Clock3 :size="18" /></div>
        <span class="system-info-label">系统运行时间</span>
        <strong>{{ formatUptime(system.uptimeSeconds) }}</strong>
        <span class="system-info-secondary">自上次启动后累计运行</span>
      </article>
    </div>

    <div class="system-overview-footnote"><span class="status-dot"></span> 信息仅读取并显示在当前设备上。</div>
  </div>
</template>
