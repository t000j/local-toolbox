<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, Clock, Copy, Globe, Sparkles } from '@lucide/vue'
import { copyText } from '../clipboard'

interface WallTime { year: number; month: number; day: number; hour: number; minute: number; second: number }
interface ConversionResult { targetDate: string; targetTime: string; sourceOffset: string; targetOffset: string; dayDifference: number }

const commonTimeZones = [
  'UTC', 'Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Tokyo', 'Asia/Seoul', 'Asia/Singapore', 'Asia/Bangkok', 'Asia/Kolkata', 'Asia/Dubai',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Moscow', 'America/New_York', 'America/Toronto', 'America/Chicago',
  'America/Denver', 'America/Los_Angeles', 'America/Vancouver', 'America/Mexico_City', 'America/Sao_Paulo', 'Australia/Perth', 'Australia/Sydney', 'Pacific/Auckland',
]
const zoneNames: Record<string, string> = {
  UTC: '协调世界时', 'Asia/Shanghai': '中国标准时间（上海）', 'Asia/Hong_Kong': '香港时间', 'Asia/Tokyo': '日本标准时间（东京）',
  'Asia/Seoul': '韩国标准时间（首尔）', 'Asia/Singapore': '新加坡时间', 'Asia/Bangkok': '印度支那时间（曼谷）',
  'Asia/Kolkata': '印度标准时间（加尔各答）', 'Asia/Dubai': '海湾标准时间（迪拜）', 'Europe/London': '英国时间（伦敦）',
  'Europe/Paris': '中欧时间（巴黎）', 'Europe/Berlin': '中欧时间（柏林）', 'Europe/Moscow': '莫斯科时间',
  'America/New_York': '美国东部时间（纽约）', 'America/Toronto': '北美东部时间（多伦多）', 'America/Chicago': '美国中部时间（芝加哥）',
  'America/Denver': '美国山地时间（丹佛）', 'America/Los_Angeles': '美国太平洋时间（洛杉矶）', 'America/Vancouver': '北美太平洋时间（温哥华）',
  'America/Mexico_City': '墨西哥中部时间', 'America/Sao_Paulo': '巴西时间（圣保罗）', 'Australia/Perth': '澳大利亚西部时间（珀斯）',
  'Australia/Sydney': '澳大利亚东部时间（悉尼）', 'Pacific/Auckland': '新西兰时间（奥克兰）',
}

const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'
type IntlWithTimeZoneValues = typeof Intl & { supportedValuesOf?: (key: 'timeZone') => string[] }
const supportedTimeZones = (Intl as IntlWithTimeZoneValues).supportedValuesOf?.('timeZone') ?? commonTimeZones
const timeZones = [...new Set([localTimeZone, 'UTC', ...supportedTimeZones])].sort().map((value) => ({
  value,
  label: value === localTimeZone ? `本机时区（${zoneNames[value] ?? value}）` : zoneNames[value] ?? value,
}))
const now = new Date()
const sourceDate = ref(formatDate(now.getFullYear(), now.getMonth() + 1, now.getDate()))
const sourceTime = ref(`${pad(now.getHours())}:${pad(now.getMinutes())}`)
const sourceZone = ref(localTimeZone)
const targetZone = ref('UTC')
const result = ref<ConversionResult | null>(null)
const error = ref('')
const copied = ref(false)

function pad(value: number): string { return String(value).padStart(2, '0') }
function formatDate(year: number, month: number, day: number): string { return `${String(year).padStart(4, '0')}-${pad(month)}-${pad(day)}` }
function clearResult(): void { result.value = null; error.value = ''; copied.value = false }

function wallTimestamp(value: WallTime): number {
  const date = new Date(0)
  date.setUTCFullYear(value.year, value.month - 1, value.day)
  date.setUTCHours(value.hour, value.minute, value.second, 0)
  return date.getTime()
}

function parseWallTime(dateText: string, timeText: string): WallTime {
  const dateMatch = dateText.match(/^(\d{4,})-(\d{2})-(\d{2})$/)
  const timeMatch = timeText.match(/^([01]\d|2[0-3]):([0-5]\d)$/)
  if (!dateMatch || !timeMatch) throw new Error('请输入有效的日期和时间。')
  const value: WallTime = {
    year: Number(dateMatch[1]), month: Number(dateMatch[2]), day: Number(dateMatch[3]),
    hour: Number(timeMatch[1]), minute: Number(timeMatch[2]), second: 0,
  }
  const date = new Date(wallTimestamp(value))
  if (date.getUTCFullYear() !== value.year || date.getUTCMonth() !== value.month - 1 || date.getUTCDate() !== value.day) {
    throw new Error('请输入有效的日期。')
  }
  return value
}

function getParts(formatter: Intl.DateTimeFormat, timestamp: number): WallTime {
  const parts = formatter.formatToParts(new Date(timestamp))
  const read = (name: string): number => {
    const value = parts.find((part) => part.type === name)?.value
    if (!value) throw new Error('当前系统无法读取该时区的日期信息。')
    return Number(value)
  }
  return { year: read('year'), month: read('month'), day: read('day'), hour: read('hour'), minute: read('minute'), second: read('second') }
}

function createFormatter(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-US', {
    timeZone, calendar: 'gregory', numberingSystem: 'latn', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  })
}

function getOffsetMilliseconds(formatter: Intl.DateTimeFormat, timestamp: number): number {
  return wallTimestamp(getParts(formatter, timestamp)) - timestamp
}

function resolveLocalTime(wallTime: WallTime, timeZone: string): number {
  const formatter = createFormatter(timeZone)
  const wallAsUtc = wallTimestamp(wallTime)
  const offsets = new Set<number>()
  const sampleRange = 48 * 60 * 60 * 1000
  const sampleStep = 6 * 60 * 60 * 1000
  for (let sample = -sampleRange; sample <= sampleRange; sample += sampleStep) {
    offsets.add(getOffsetMilliseconds(formatter, wallAsUtc + sample))
  }

  const candidates = [...offsets]
    .map((offset) => wallAsUtc - offset)
    .filter((instant) => {
      const parts = getParts(formatter, instant)
      return parts.year === wallTime.year && parts.month === wallTime.month && parts.day === wallTime.day && parts.hour === wallTime.hour && parts.minute === wallTime.minute && parts.second === wallTime.second
    })
  if (candidates.length === 0) throw new Error('该当地时间因夏令时切换而不存在，请换一个时间。')
  if (candidates.length > 1) throw new Error('该当地时间因夏令时回拨出现两次，请换一个明确的时间。')
  return candidates[0]
}

function formatOffset(formatter: Intl.DateTimeFormat, timestamp: number): string {
  const offsetSeconds = Math.round(getOffsetMilliseconds(formatter, timestamp) / 1000)
  const sign = offsetSeconds >= 0 ? '+' : '−'
  const absolute = Math.abs(offsetSeconds)
  const hours = Math.floor(absolute / 3600)
  const minutes = Math.floor((absolute % 3600) / 60)
  const seconds = absolute % 60
  return `UTC${sign}${pad(hours)}:${pad(minutes)}${seconds ? `:${pad(seconds)}` : ''}`
}

function convert(): void {
  error.value = ''
  result.value = null
  copied.value = false
  try {
    const wallTime = parseWallTime(sourceDate.value, sourceTime.value)
    const instant = resolveLocalTime(wallTime, sourceZone.value)
    const sourceFormatter = createFormatter(sourceZone.value)
    const targetFormatter = createFormatter(targetZone.value)
    const target = getParts(targetFormatter, instant)
    result.value = {
      targetDate: formatDate(target.year, target.month, target.day),
      targetTime: `${pad(target.hour)}:${pad(target.minute)}`,
      sourceOffset: formatOffset(sourceFormatter, instant),
      targetOffset: formatOffset(targetFormatter, instant),
      dayDifference: Math.floor(wallTimestamp({ ...target, hour: 0, minute: 0, second: 0 }) / 86_400_000) - Math.floor(wallTimestamp({ ...wallTime, hour: 0, minute: 0, second: 0 }) / 86_400_000),
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '无法转换该时间，请检查输入。'
  }
}

const dayDifferenceLabel = computed(() => {
  if (!result.value || result.value.dayDifference === 0) return '同一天'
  return result.value.dayDifference > 0 ? `目标日期晚 ${result.value.dayDifference} 天` : `目标日期早 ${Math.abs(result.value.dayDifference)} 天`
})

async function copyResult(): Promise<void> {
  if (!result.value) return
  error.value = ''
  const value = `${result.value.targetDate} ${result.value.targetTime} ${targetZone.value} (${result.value.targetOffset})`
  try {
    await copyText(value)
    copied.value = true
    window.setTimeout(() => { copied.value = false }, 1600)
  } catch {
    error.value = '复制失败，请检查剪贴板权限。'
  }
}
</script>

<template>
  <div class="time-zone-tool">
    <section class="time-zone-input-card">
      <div class="time-zone-fields">
        <label class="time-zone-field"><span><Clock :size="14" /> 来源日期</span><input v-model="sourceDate" class="text-input" type="date" @change="clearResult" /></label>
        <label class="time-zone-field"><span><Clock :size="14" /> 来源时间</span><input v-model="sourceTime" class="text-input" type="time" @change="clearResult" /></label>
      </div>
      <div class="time-zone-fields">
        <label class="time-zone-field"><span><Globe :size="14" /> 来源时区</span><select v-model="sourceZone" class="timezone-select" @change="clearResult"><option v-for="zone in timeZones" :key="zone.value" :value="zone.value">{{ zone.label }}</option></select></label>
        <label class="time-zone-field"><span><Globe :size="14" /> 目标时区</span><select v-model="targetZone" class="timezone-select" @change="clearResult"><option v-for="zone in timeZones" :key="zone.value" :value="zone.value">{{ zone.label }}</option></select></label>
      </div>
      <button class="primary-button time-zone-convert-button" @click="convert"><Sparkles :size="15" /> 转换时间</button>
    </section>

    <p v-if="error" class="time-zone-error">{{ error }}</p>
    <section v-else-if="result" class="time-zone-result-card">
      <div class="time-zone-result-heading"><span>目标时间</span><button class="quiet-button" @click="copyResult"><Check v-if="copied" :size="14" /><Copy v-else :size="14" /> {{ copied ? '已复制' : '复制结果' }}</button></div>
      <strong>{{ result.targetDate }} {{ result.targetTime }}</strong>
      <div class="time-zone-result-meta"><span>{{ targetZone }}</span><b>{{ result.targetOffset }}</b><span>{{ dayDifferenceLabel }}</span></div>
      <p>来源时区 {{ sourceZone }} · {{ result.sourceOffset }}</p>
    </section>
    <p v-else class="form-hint time-zone-footnote">使用本机 Intl 时区数据离线换算。夏令时跳时或重复时刻会提示重新选择。</p>
  </div>
</template>
