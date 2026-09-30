<script setup lang="ts">
import { computed, ref } from 'vue'
import { CalendarDays, Check, Copy } from '@lucide/vue'
import { copyText } from '../clipboard'

interface DateIntervalResult { differenceDays: number; inclusiveDays: number; workdays: number }

function dateInputValue(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const today = new Date()
const nextWeek = new Date(today)
nextWeek.setDate(today.getDate() + 7)
const startDate = ref(dateInputValue(today))
const endDate = ref(dateInputValue(nextWeek))
const copied = ref(false)
const copyError = ref('')

function toDayIndex(value: string): number | null {
  if (!/^\d{4,}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  date.setUTCHours(0, 0, 0, 0)
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return Math.floor(date.getTime() / 86_400_000)
}

function countWeekdays(firstDay: number, lastDay: number): number {
  const dayCount = lastDay - firstDay + 1
  const completeWeeks = Math.floor(dayCount / 7)
  let workdays = completeWeeks * 5
  const firstWeekday = new Date(firstDay * 86_400_000).getUTCDay()
  for (let offset = 0; offset < dayCount % 7; offset++) {
    const weekday = (firstWeekday + offset) % 7
    if (weekday !== 0 && weekday !== 6) workdays++
  }
  return workdays
}

const dateError = computed(() => {
  const start = toDayIndex(startDate.value)
  const end = toDayIndex(endDate.value)
  if (start === null || end === null) return '请选择有效的开始日期和结束日期。'
  if (end < start) return '结束日期不能早于开始日期。'
  return ''
})

const result = computed<DateIntervalResult | null>(() => {
  if (dateError.value) return null
  const start = toDayIndex(startDate.value)!
  const end = toDayIndex(endDate.value)!
  const differenceDays = end - start
  return { differenceDays, inclusiveDays: differenceDays + 1, workdays: countWeekdays(start, end) }
})

const visibleError = computed(() => copyError.value || dateError.value)

async function copySummary(): Promise<void> {
  if (!result.value) return
  copyError.value = ''
  const summary = [
    `${startDate.value} 至 ${endDate.value}`,
    `相差 ${result.value.differenceDays} 天（不含开始日）`,
    `日历天数 ${result.value.inclusiveDays} 天（含首尾）`,
    `工作日 ${result.value.workdays} 天（含首尾日期，周一至周五）`,
  ].join('\n')
  try {
    await copyText(summary)
    copied.value = true
    window.setTimeout(() => { copied.value = false }, 1600)
  } catch {
    copyError.value = '复制失败，请检查剪贴板权限。'
  }
}
</script>

<template>
  <div class="date-interval-tool">
    <div class="date-interval-fields">
      <label class="date-interval-field">
        <span><CalendarDays :size="15" /> 开始日期</span>
        <input v-model="startDate" class="text-input" type="date" @change="copied = false; copyError = ''" />
      </label>
      <label class="date-interval-field">
        <span><CalendarDays :size="15" /> 结束日期</span>
        <input v-model="endDate" class="text-input" type="date" :min="startDate" @change="copied = false; copyError = ''" />
      </label>
    </div>

    <div v-if="result" class="date-interval-results">
      <article class="date-interval-result-card">
        <span>相差天数</span><strong>{{ result.differenceDays }}</strong><small>不含开始日</small>
      </article>
      <article class="date-interval-result-card">
        <span>日历天数</span><strong>{{ result.inclusiveDays }}</strong><small>开始和结束日期都计入</small>
      </article>
      <article class="date-interval-result-card workday-result-card">
        <span>工作日</span><strong>{{ result.workdays }}</strong><small>含首尾日期，周一至周五</small>
      </article>
    </div>

    <div class="date-interval-footer">
      <p v-if="visibleError" class="inline-error">{{ visibleError }}</p>
      <p v-else class="form-hint">工作日含首尾日期，只排除周六、周日，不扣除法定节假日。</p>
      <button class="quiet-button" :disabled="!result" @click="copySummary"><Check v-if="copied" :size="14" /><Copy v-else :size="14" /> {{ copied ? '已复制' : '复制结果' }}</button>
    </div>
  </div>
</template>
