<script setup lang="ts">
import { Clock, Pause, Play, Plus, RotateCcw, Timer } from '@lucide/vue'
import { timerSession } from '../timerSession'
const { mode, countdownHours, countdownMinutes, countdownSeconds, countdownFinished, timerError, laps, stopwatchRunning, countdownRunning, stopwatchDisplay, countdownDisplay, formatStopwatch, formatCountdown, toggleStopwatch, resetStopwatch, recordLap, configuredDuration, updateConfiguredDuration, setCountdownPreset, toggleCountdown, resetCountdown } = timerSession
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
        <div v-for="lap in laps" :key="lap.id" class="timer-lap-row"><span>第 {{ lap.id }} 次</span><code>{{ formatStopwatch(lap.split) }}</code><code>{{ formatStopwatch(lap.total) }}</code></div>
      </div>
      <p v-else class="timer-footnote">计时使用单调时钟；暂停后可以继续，计次记录保留在本次会话，切换工具不会停止；关闭应用后清空。</p>
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
      <p v-else class="timer-footnote">可在暂停时修改时长；切换工具后仍持续并在应用内显示到时提醒。关闭应用后停止，不保证后台/休眠期间即时提醒。</p>
    </section>
  </div>
</template>
