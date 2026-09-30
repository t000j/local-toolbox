<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Clock, Globe, X } from '@lucide/vue'

const storageKey = 'toolbox:world-clock-zones:v1'
const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'
const fallbackZones = [
  'UTC', 'Africa/Cairo', 'Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Tokyo', 'Asia/Seoul', 'Asia/Singapore', 'Asia/Bangkok', 'Asia/Kolkata', 'Asia/Dubai',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Moscow', 'America/New_York', 'America/Toronto', 'America/Chicago', 'America/Denver',
  'America/Los_Angeles', 'America/Vancouver', 'America/Mexico_City', 'America/Sao_Paulo', 'Australia/Perth', 'Australia/Sydney', 'Pacific/Auckland',
]
const cityNames: Record<string, string> = {
  UTC: '协调世界时', 'Africa/Cairo': '开罗', 'Asia/Shanghai': '上海', 'Asia/Hong_Kong': '香港', 'Asia/Tokyo': '东京', 'Asia/Seoul': '首尔',
  'Asia/Singapore': '新加坡', 'Asia/Bangkok': '曼谷', 'Asia/Kolkata': '加尔各答', 'Asia/Dubai': '迪拜', 'Europe/London': '伦敦',
  'Europe/Paris': '巴黎', 'Europe/Berlin': '柏林', 'Europe/Moscow': '莫斯科', 'America/New_York': '纽约', 'America/Toronto': '多伦多',
  'America/Chicago': '芝加哥', 'America/Denver': '丹佛', 'America/Los_Angeles': '洛杉矶', 'America/Vancouver': '温哥华',
  'America/Mexico_City': '墨西哥城', 'America/Sao_Paulo': '圣保罗', 'Australia/Perth': '珀斯', 'Australia/Sydney': '悉尼', 'Pacific/Auckland': '奥克兰',
}

type IntlWithTimeZoneValues = typeof Intl & { supportedValuesOf?: (key: 'timeZone') => string[] }
const supportedZones = (Intl as IntlWithTimeZoneValues).supportedValuesOf?.('timeZone') ?? fallbackZones
const zoneIds = [...new Set([localTimeZone, 'UTC', ...supportedZones])].sort()
const zoneSet = new Set(zoneIds)
const timeZones = zoneIds.map((zone) => ({ value: zone, label: `${cityNames[zone] ?? zone.split('/').pop()?.replace(/_/g, ' ') ?? zone} · ${zone}` }))

interface WorldClock { zone: string; city: string; date: string; time: string; isLocal: boolean }
const selectedZones = ref(readSelectedZones())
function nextAvailableZone(excluded = selectedZones.value): string {
  const preferred = ['Asia/Tokyo', 'Europe/London', 'America/New_York', 'Australia/Sydney', 'Asia/Singapore']
  return preferred.find((zone) => zoneSet.has(zone) && !excluded.includes(zone)) ?? zoneIds.find((zone) => !excluded.includes(zone)) ?? 'UTC'
}
const zoneToAdd = ref(nextAvailableZone())
const now = ref(Date.now())
const formatters = new Map<string, { date: Intl.DateTimeFormat; time: Intl.DateTimeFormat }>()
const clocks = computed<WorldClock[]>(() => {
  const instant = new Date(now.value)
  return selectedZones.value.map((zone) => {
    let formatter = formatters.get(zone)
    if (!formatter) {
      formatter = {
        date: new Intl.DateTimeFormat('zh-CN', { timeZone: zone, year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }),
        time: new Intl.DateTimeFormat('zh-CN', { timeZone: zone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }),
      }
      formatters.set(zone, formatter)
    }
    return {
      zone,
      city: cityNames[zone] ?? zone.split('/').pop()?.replace(/_/g, ' ') ?? zone,
      date: formatter.date.format(instant),
      time: formatter.time.format(instant),
      isLocal: zone === localTimeZone,
    }
  })
})
const canAddZone = computed(() => selectedZones.value.length < 12 && !selectedZones.value.includes(zoneToAdd.value))
let clockTimer = 0

function readSelectedZones(): string[] {
  try {
    const stored = localStorage.getItem(storageKey)
    if (stored === null) return [...new Set([localTimeZone, 'Asia/Tokyo', 'Europe/London', 'America/New_York', 'Australia/Sydney'])].slice(0, 12)
    const value: unknown = JSON.parse(stored)
    return Array.isArray(value) ? [...new Set(value.filter((zone): zone is string => typeof zone === 'string' && validStoredZone(zone)))].slice(0, 12) : []
  } catch {
    return [...new Set([localTimeZone, 'Asia/Tokyo', 'Europe/London', 'America/New_York', 'Australia/Sydney'])].slice(0, 12)
  }
}

function validStoredZone(zone: string): boolean {
  try { new Intl.DateTimeFormat('zh-CN', { timeZone: zone }).format(0); return true }
  catch { return false }
}

function addZone(): void {
  if (!canAddZone.value) return
  selectedZones.value = [...selectedZones.value, zoneToAdd.value]
  zoneToAdd.value = nextAvailableZone()
}

function removeZone(zone: string): void {
  selectedZones.value = selectedZones.value.filter((selected) => selected !== zone)
}

watch(selectedZones, (zones) => {
  try {
    localStorage.setItem(storageKey, JSON.stringify(zones))
  } catch {
    // Selected clocks remain available for the current session if storage is unavailable.
  }
}, { deep: true })

onMounted(() => { clockTimer = window.setInterval(() => { now.value = Date.now() }, 1000) })
onBeforeUnmount(() => window.clearInterval(clockTimer))
</script>

<template>
  <div class="world-clock-tool">
    <section class="world-clock-toolbar">
      <div class="world-clock-toolbar-copy"><div class="world-clock-icon"><Globe :size="18" /></div><div><strong>选择城市时区</strong><span>最多添加 12 个时钟；选择保存在本机</span></div></div>
      <div class="world-clock-add-row">
        <select v-model="zoneToAdd" class="timezone-select" aria-label="选择要添加的时区">
          <option v-for="zone in timeZones" :key="zone.value" :value="zone.value">{{ zone.label }}</option>
        </select>
        <button class="primary-button" :disabled="!canAddZone" @click="addZone">添加时钟</button>
      </div>
    </section>

    <div v-if="clocks.length" class="world-clock-grid">
      <article v-for="clock in clocks" :key="clock.zone" class="world-clock-card" :class="{ 'world-clock-local': clock.isLocal }">
        <div class="world-clock-card-heading"><div><strong>{{ clock.city }}</strong><span>{{ clock.zone }}</span></div><button class="quiet-button" :aria-label="`移除${clock.city}时钟`" @click="removeZone(clock.zone)"><X :size="14" /></button></div>
        <strong class="world-clock-time">{{ clock.time }}</strong>
        <span class="world-clock-date">{{ clock.date }}</span>
        <span v-if="clock.isLocal" class="world-clock-local-tag"><Clock :size="11" /> 本机时区</span>
      </article>
    </div>
    <div v-else class="world-clock-empty"><Globe :size="24" /><strong>还没有添加城市</strong><span>从上方选择一个时区，再添加到世界时钟。</span></div>
    <p class="world-clock-footnote">时间根据本机时区数据库显示，不需要联网；夏令时由系统时区规则自动处理。</p>
  </div>
</template>
