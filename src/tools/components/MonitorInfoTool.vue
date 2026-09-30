<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { trackedInvoke } from '../../app/activity'
import { monitorLayout, parseMonitors, type MonitorRow } from '../monitorInfo'
const busy = ref(false), error = ref(''), rows = ref<MonitorRow[]>([]), limited = ref(false), loaded = ref(false)
const layout = computed(() => monitorLayout(rows.value))
let disposed = false
async function read() {
  if (busy.value || disposed) return
  busy.value = true; error.value = ''; rows.value = []; loaded.value = false; limited.value = false
  try {
    const result = parseMonitors(await trackedInvoke('read_monitor_info'))
    if (!disposed) { rows.value = result.monitors; limited.value = result.limited; loaded.value = true }
  } catch (cause) { if (!disposed) error.value = typeof cause === 'string' ? cause : cause instanceof Error ? cause.message : '请在 Windows 桌面版读取显示器' }
  finally { if (!disposed) busy.value = false }
}
onBeforeUnmount(() => { disposed = true; rows.value = [] })
</script>
<template>
  <div class="tool-form">
    <p class="form-hint">手动读取系统报告的已连接显示器：物理分辨率、缩放与桌面坐标。只读，不修改分辨率或排列，不截图；最多 32 台。</p>
    <button class="primary-button" :disabled="busy" @click="read">{{ busy ? '读取中…' : '读取显示器信息' }}</button>
    <svg v-if="rows.length" :viewBox="layout.viewBox" class="monitor-map" role="img" aria-label="按物理桌面坐标缩放的显示器排列示意图">
      <g v-for="(r, i) in layout.rows" :key="i"><rect :x="r.left" :y="r.top" :width="r.w" :height="r.h" :class="{ primary: r.primary }"/><text :x="r.left + r.w / 2" :y="r.top + r.h / 2" text-anchor="middle" dominant-baseline="middle">{{ i + 1 }}</text></g>
    </svg>
    <p v-if="limited" class="form-hint hint-error">部分显示器未显示：超过数量上限或系统数据无效。</p>
    <div class="monitor-list"><div v-for="(r, i) in rows" :key="i" class="monitor-row"><strong>{{ i + 1 }} · {{ r.name }}{{ r.primary ? ' · 主显示器' : '' }}</strong><p>{{ r.width }} × {{ r.height }} 物理像素 · {{ (r.scale * 100).toFixed(0) }}% 缩放</p><p>左上角 ({{ r.x }}, {{ r.y }}) · 逻辑尺寸约 {{ Math.round(r.width / r.scale) }} × {{ Math.round(r.height / r.scale) }}</p></div></div>
    <p v-if="loaded && !rows.length" class="form-hint">未读取到有效显示器；远程会话、驱动与系统权限可能影响结果。</p>
    <p class="form-hint">负坐标代表位于主屏左侧或上方；镜像屏可能重叠。示意图按系统物理坐标绘制，不代表实际屏幕英寸；缩放为系统报告值。连接或设置变化后请重新读取。</p>
    <p class="form-hint hint-error" role="status">{{ error }}</p>
  </div>
</template>
<style scoped>
.monitor-map { width: 100%; max-height: 220px; } rect { fill: #ede9fe; stroke: #777; stroke-width: 2; } rect.primary { fill: #dbeafe; stroke: #2563eb; } text { font-size: 16px; fill: #222; }
.monitor-list { max-height: 300px; overflow: auto; } .monitor-row { padding: 8px; border-bottom: 1px solid #ddd; font-size: 12px; } p { margin: 5px 0; }
</style>
