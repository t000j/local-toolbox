<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { Clock, Pause, Play, Plus, RotateCcw, Timer } from '@lucide/vue'

type TimerMode = 'stopwatch' | 'countdown'
interface Lap { id: number; total: number; split: number }

const mode = ref<TimerMode>('stopwatch')
const now = ref(performance.now())
const stopwatchStartedAt = ref<number | null>(null)
const stopwatchElapsed = ref(0)
const stopwatchLastLap = ref(0)
const laps = ref<Lap[]>([])
const countdownHours = ref(0)
const countdownMinutes = ref(5)
const countdownSeconds = ref(0)
const countdownRemaining = ref(5 * 60 * 1000)
const countdownDeadline = ref<number | null>(null)
const countdownFinished = ref(false)
const timerError = ref('')
let lapId = 0
let ticker: number | null = null

const stopwatchRunning = computed(() => stopwatchStartedAt.value !== null)
const countdownRunning = computed(() => countdownDeadline.value !== null)
const stopwatchDisplay = computed(() => stopwatchElapsed.value + (stopwatchStartedAt.value === null ? 0 : Math.max(0, now.value - stopwatchStartedAt.value)))
const countdownDisplay = computed(() => Math.max(0, countdownDeadline.value === null ? countdownRemaining.value : countdownDeadline.value - now.value))

function formatStopwatch(milliseconds: number): string {
  const centiseconds = Math.floor(milliseconds / 10)
  const hours = Math.floor(centiseconds / 360_000)
  const minutes = Math.floor(centiseconds / 6_000) % 60
  const seconds = Math.floor(centiseconds / 100) % 60
  const fractions = centiseconds % 100
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(fractions)}`
}

function formatCountdown(milliseconds: number): string {
  const seconds = Math.ceil(milliseconds / 1000)
  return `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`
}

function pad(value: number): string { return String(value).padStart(2, '0') }

function stopTicker(): void {
  if (ticker !== null) window.clearInterval(ticker)
  ticker = null
}

function updateClock(): void {
  now.value = performance.now()
  if (countdownDeadline.value !== null && now.value >= countdownDeadline.value) {
    countdownRemaining.value = 0
    countdownDeadline.value = null
    countdownFinished.value = true
  }
  if (stopwatchStartedAt.value === null && countdownDeadline.value === null) stopTicker()
}

function syncTicker(): void {
  if ((stopwatchStartedAt.value !== null || countdownDeadline.value !== null) && ticker === null) {
    ticker = window.setInterval(updateClock, 50)
  } else if (stopwatchStartedAt.value === null && countdownDeadline.value === null) {
    stopTicker()
  }
}

function toggleStopwatch(): void {
  timerError.value = ''
  if (stopwatchStartedAt.value === null) stopwatchStartedAt.value = performance.now()
  else {
    stopwatchElapsed.value += performance.now() - stopwatchStartedAt.value
    stopwatchStartedAt.value = null
  }
  syncTicker()
}

function resetStopwatch(): void {
  stopwatchStartedAt.value = null
  stopwatchElapsed.value = 0
  stopwatchLastLap.value = 0
  laps.value = []
  timerError.value = ''
  syncTicker()
}

function recordLap(): void {
  if (stopwatchStartedAt.value === null) return
  const total = stopwatchDisplay.value
  laps.value.unshift({ id: ++lapId, total, split: total - stopwatchLastLap.value })
  laps.value = laps.value.slice(0, 20)
  stopwatchLastLap.value = total
}

function configuredDuration(): number | null {
  const hours = Number(countdownHours.value)
  const minutes = Number(countdownMinutes.value)
  const seconds = Number(countdownSeconds.value)
  if (![hours, minutes, seconds].every(Number.isInteger) || hours < 0 || hours > 99 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) return null
  const duration = ((hours * 60 + minutes) * 60 + seconds) * 1000
  return duration > 0 ? duration : null
}

function updateConfiguredDuration(): void {
  if (countdownDeadline.value !== null) return
  countdownRemaining.value = configuredDuration() ?? 0
  countdownFinished.value = false
  timerError.value = ''
}

function setCountdownPreset(minutes: number): void {
  if (countdownDeadline.value !== null) return
  countdownHours.value = Math.floor(minutes / 60)
  countdownMinutes.value = minutes % 60
  countdownSeconds.value = 0
  updateConfiguredDuration()
}

function toggleCountdown(): void {
  timerError.value = ''
  if (countdownDeadline.value !== null) {
    countdownRemaining.value = Math.max(0, countdownDeadline.value - performance.now())
    countdownDeadline.value = null
    countdownFinished.value = countdownRemaining.value === 0
  } else {
    if (countdownRemaining.value <= 0) countdownRemaining.value = configuredDuration() ?? 0
    if (countdownRemaining.value <= 0) {
      timerError.value = '请设置大于 0 的倒计时时长。'
      return
    }
    countdownDeadline.value = performance.now() + countdownRemaining.value
    countdownFinished.value = false
  }
  syncTicker()
}

function resetCountdown(): void {
  countdownDeadline.value = null
  countdownRemaining.value = configuredDuration() ?? 0
  countdownFinished.value = false
  timerError.value = ''
  syncTicker()
}

onBeforeUnmount(stopTicker)
</script>

<template>
  <div class="timer-tool">
    <nav class="timer-mode-switch" aria-label="计时模式">
      <button :class="{ selected: mode === 'stopwatch' }" @click="mode = 'stopwatch'"><Timer :size="14" /> 秒表</button>
      <button :class="{ selected: mode === 'countdown' }" @click="mode = 'countdown'"><Clock :size="14" /> 倒计时</button>
      <span v-if="countdownFinished" class="timer-finished-tag">倒计时结束</span>
    </nav>

    <section v-if="mode === 'stopwatch'" class="timer-panel">
      <div class="timer-display" :class="{ 'timer-display-running': stopwatchRunning }">
        <span>{{ stopwatchRunning ? '正在计时' : '秒表' }}</span>
        <strong>{{ formatStopwatch(stopwatchDisplay) }}</strong>
      </div>
      <div class="timer-actions">
        <button class="primary-button" @click="toggleStopwatch"><Pause v-if="stopwatchRunning" :size="15" /><Play v-else :size="15" /> {{ stopwatchRunning ? '暂停' : '开始' }}</button>
        <button class="secondary-button" :disabled="!stopwatchRunning" @click="recordLap"><Plus :size="15" /> 计次</button>
        <button class="secondary-button" :disabled="stopwatchDisplay === 0" @click="resetStopwatch"><RotateCcw :size="14" /> 复位</button>
      </div>
      <div v-if="laps.length" class="timer-lap-list">
        <div class="timer-lap-heading"><span>计次</span><span>分段用时</span><span>累计用时</span></div>
        <div v-for="(lap, index) in laps" :key="lap.id" class="timer-lap-row"><span>第 {{ laps.length - index }} 次</span><code>{{ formatStopwatch(lap.split) }}</code><code>{{ formatStopwatch(lap.total) }}</code></div>
      </div>
      <p v-else class="timer-footnote">计时使用单调时钟；暂停后可以继续，计次记录保留在本次会话。</p>
    </section>

    <section v-else class="timer-panel countdown-panel">
      <div class="timer-display" :class="{ 'timer-display-running': countdownRunning, 'timer-display-finished': countdownFinished }">
        <span>{{ countdownFinished ? '时间到' : countdownRunning ? '倒计时中' : '设置倒计时' }}</span>
        <strong>{{ formatCountdown(countdownDisplay) }}</strong>
      </div>
      <div class="countdown-duration-fields">
        <label><input v-model.number="countdownHours" type="number" min="0" max="99" :disabled="countdownRunning" @input="updateConfiguredDuration" /><span>小时</span></label>
        <b>:</b>
        <label><input v-model.number="countdownMinutes" type="number" min="0" max="59" :disabled="countdownRunning" @input="updateConfiguredDuration" /><span>分钟</span></label>
        <b>:</b>
        <label><input v-model.number="countdownSeconds" type="number" min="0" max="59" :disabled="countdownRunning" @input="updateConfiguredDuration" /><span>秒</span></label>
      </div>
      <div class="countdown-presets"><span>快捷设置</span><button :disabled="countdownRunning" @click="setCountdownPreset(1)">1 分钟</button><button :disabled="countdownRunning" @click="setCountdownPreset(5)">5 分钟</button><button :disabled="countdownRunning" @click="setCountdownPreset(10)">10 分钟</button></div>
      <div class="timer-actions">
        <button class="primary-button" @click="toggleCountdown"><Pause v-if="countdownRunning" :size="15" /><Play v-else :size="15" /> {{ countdownRunning ? '暂停' : countdownFinished ? '重新开始' : '开始倒计时' }}</button>
        <button class="secondary-button" :disabled="!configuredDuration() && !countdownRunning" @click="resetCountdown"><RotateCcw :size="14" /> 复位</button>
      </div>
      <p v-if="timerError" class="inline-error">{{ timerError }}</p>
      <p v-else-if="countdownFinished" class="timer-finished-message" role="status">倒计时已结束。</p>
      <p v-else class="timer-footnote">可在暂停时修改时长；切换到秒表模式不会停止正在运行的倒计时。</p>
    </section>
  </div>
</template>
