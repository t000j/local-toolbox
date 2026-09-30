<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ArrowDownUp, Check, Clock, Copy } from '@lucide/vue'
import { copyText } from '../clipboard'

const direction = ref<'timestamp-to-date' | 'date-to-timestamp'>('timestamp-to-date')
const timestampInput = ref('')
const dateInput = ref('')
const error = ref('')
const copied = ref(false)

const dateResult = computed(() => {
  if (!timestampInput.value.trim()) return null
  const raw = timestampInput.value.trim()
  if (!/^-?\d+(\.\d+)?$/.test(raw)) return null
  const numeric = Number(raw)
  const milliseconds = raw.replace('-', '').split('.')[0].length <= 10 ? numeric * 1000 : numeric
  const date = new Date(milliseconds)
  return Number.isNaN(date.getTime()) ? null : date
})

const timestampResult = computed(() => {
  if (!dateInput.value) return null
  const milliseconds = new Date(dateInput.value).getTime()
  return Number.isNaN(milliseconds) ? null : { seconds: Math.floor(milliseconds / 1000), milliseconds }
})

function useNow(): void {
  const now = new Date()
  timestampInput.value = Math.floor(now.getTime() / 1000).toString()
  dateInput.value = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  error.value = ''
}

async function copy(value: string): Promise<void> {
  try {
    await copyText(value)
    copied.value = true
    window.setTimeout(() => { copied.value = false }, 1600)
  } catch {
    error.value = '复制失败，请检查剪贴板权限。'
  }
}

onMounted(useNow)
</script>

<template>
  <div class="single-column-tool timestamp-tool">
    <div class="mode-switch timestamp-switch">
      <button :class="{ selected: direction === 'timestamp-to-date' }" @click="direction = 'timestamp-to-date'; error = ''">时间戳转日期</button>
      <button :class="{ selected: direction === 'date-to-timestamp' }" @click="direction = 'date-to-timestamp'; error = ''">日期转时间戳</button>
      <button class="swap-button" aria-label="切换转换方向" @click="direction = direction === 'timestamp-to-date' ? 'date-to-timestamp' : 'timestamp-to-date'"><ArrowDownUp :size="14" /></button>
      <button class="quiet-button now-button" @click="useNow"><Clock :size="14" /> 当前时间</button>
    </div>

    <template v-if="direction === 'timestamp-to-date'">
      <div class="field-heading"><label for="timestamp-input">Unix 时间戳</label><span class="field-suffix">支持秒或毫秒</span></div>
      <input id="timestamp-input" v-model="timestampInput" class="text-input" inputmode="decimal" placeholder="例如 1720000000" @input="error = ''; copied = false" />
      <div v-if="timestampInput && dateResult" class="timestamp-result-card">
        <div class="result-icon"><Clock :size="18" /></div>
        <div class="timestamp-result-content">
          <span class="result-caption">本地日期时间</span>
          <strong>{{ dateResult.toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'medium' }) }}</strong>
          <span class="iso-value">{{ dateResult.toISOString() }}</span>
        </div>
        <button class="icon-button" aria-label="复制 ISO 时间" @click="copy(dateResult.toISOString())"><Check v-if="copied" :size="16" /><Copy v-else :size="16" /></button>
      </div>
      <p v-else-if="timestampInput" class="inline-error">请输入有效的秒或毫秒时间戳。</p>
      <p v-else class="form-hint">时间戳会根据位数自动识别为秒或毫秒。</p>
    </template>

    <template v-else>
      <div class="field-heading"><label for="date-input">本地日期时间</label><span class="field-suffix">按本机时区换算</span></div>
      <input id="date-input" v-model="dateInput" class="text-input" type="datetime-local" @input="error = ''; copied = false" />
      <div v-if="timestampResult" class="timestamp-result-card timestamp-pair">
        <div class="timestamp-result-content">
          <span class="result-caption">Unix 秒</span>
          <strong>{{ timestampResult.seconds }}</strong>
        </div>
        <button class="icon-button" aria-label="复制秒时间戳" @click="copy(String(timestampResult.seconds))"><Check v-if="copied" :size="16" /><Copy v-else :size="16" /></button>
      </div>
      <div v-if="timestampResult" class="timestamp-result-card timestamp-pair">
        <div class="timestamp-result-content">
          <span class="result-caption">Unix 毫秒</span>
          <strong>{{ timestampResult.milliseconds }}</strong>
        </div>
        <button class="icon-button" aria-label="复制毫秒时间戳" @click="copy(String(timestampResult.milliseconds))"><Check v-if="copied" :size="16" /><Copy v-else :size="16" /></button>
      </div>
    </template>
    <p v-if="error" class="inline-error">{{ error }}</p>
  </div>
</template>
