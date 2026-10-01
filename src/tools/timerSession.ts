import { computed, ref } from 'vue'

// App-session state is independent of the mounted tool page. No persistence or OS alarms.
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
let ticker: ReturnType<typeof setInterval> | null = null
const countdownNoticeDismissed = ref(false)

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

export function stopSessionTicker(): void {
  if (ticker !== null) clearInterval(ticker)
  ticker = null
}

function updateClock(): void {
  now.value = performance.now()
  if (countdownDeadline.value !== null && now.value >= countdownDeadline.value) {
    countdownRemaining.value = 0
    countdownDeadline.value = null
    countdownFinished.value = true
    countdownNoticeDismissed.value = false
  }
  if (stopwatchStartedAt.value === null && countdownDeadline.value === null) stopSessionTicker()
}

function syncTicker(): void {
  if ((stopwatchStartedAt.value !== null || countdownDeadline.value !== null) && ticker === null) {
    ticker = setInterval(updateClock, 50)
  } else if (stopwatchStartedAt.value === null && countdownDeadline.value === null) {
    stopSessionTicker()
  }
}

function toggleStopwatch(): void {
  timerError.value = ''
  if (stopwatchStartedAt.value === null) stopwatchStartedAt.value = performance.now()
  else {
    stopwatchElapsed.value += performance.now() - stopwatchStartedAt.value
    stopwatchStartedAt.value = null
  }
  updateClock()
  syncTicker()
}

function resetStopwatch(): void {
  stopwatchStartedAt.value = null
  stopwatchElapsed.value = 0
  stopwatchLastLap.value = 0
  laps.value = []
  lapId = 0
  timerError.value = ''
  updateClock()
  syncTicker()
}

function recordLap(): void {
  if (stopwatchStartedAt.value === null) return
  updateClock()
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
    countdownNoticeDismissed.value = false
  }
  updateClock()
  syncTicker()
}

function resetCountdown(): void {
  countdownDeadline.value = null
  countdownRemaining.value = configuredDuration() ?? 0
  countdownFinished.value = false
  timerError.value = ''
  updateClock()
  syncTicker()
}

export const timerSession = { mode, countdownHours, countdownMinutes, countdownSeconds, countdownFinished, countdownNoticeDismissed, timerError, laps, stopwatchRunning, countdownRunning, stopwatchDisplay, countdownDisplay, formatStopwatch, formatCountdown, toggleStopwatch, resetStopwatch, recordLap, configuredDuration, updateConfiguredDuration, setCountdownPreset, toggleCountdown, resetCountdown, updateClock }
