<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { Download, RefreshCw, X } from '@lucide/vue'
import { useUpdater } from './updater'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
const { currentVersion, latestVersion, releaseNotes, status, error, autoCheck, supported, busy, canCheck, downloadedBytes,
  totalBytes, progressPercent, activeNativeTasks, checkNow, downloadUpdate, installUpdate, restartApp } = useUpdater()
const confirming = ref(false)
const dialog = ref<HTMLElement | null>(null)
let previousFocus: HTMLElement | null = null
watch(() => props.open, async (open) => {
  if (open) {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    await nextTick()
    dialog.value?.focus()
  } else { confirming.value = false; previousFocus?.focus() }
})
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return }
  if (event.key !== 'Tab' || !dialog.value) return
  const elements = Array.from(dialog.value.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]'))
  if (!elements.length) { event.preventDefault(); return }
  const index = elements.indexOf(document.activeElement as HTMLElement)
  if (index < 0 || (event.shiftKey && index === 0) || (!event.shiftKey && index === elements.length - 1)) {
    event.preventDefault()
    elements[event.shiftKey ? elements.length - 1 : 0]?.focus()
  }
}
function close() { if (status.value !== 'installing') { confirming.value = false; emit('close') } }
async function confirmInstall() { confirming.value = false; await installUpdate() }
function bytes(value: number): string { return `${(value / 1024 / 1024).toFixed(1)} MiB` }
</script>

<template>
  <div v-if="open" class="updater-backdrop" @click.self="close">
    <section ref="dialog" class="updater-dialog" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="updater-title" @keydown="onKeydown">
      <header><div><h2 id="updater-title">关于与更新</h2><p>本地工具箱 · 当前版本 {{ currentVersion }}</p></div><button class="quiet-button" :disabled="status === 'installing'" aria-label="关闭更新窗口" @click="close"><X :size="17" /></button></header>
      <label class="updater-preference"><input v-model="autoCheck" type="checkbox" :disabled="busy" /> 启动后自动检查更新</label>
      <p v-if="!supported" class="updater-note">浏览器预览和开发模式不检查更新；安装后的正式版本可使用此功能。</p>
      <div class="updater-status" aria-live="polite">
        <span v-if="status === 'checking'">正在检查新版本…</span>
        <span v-else-if="status === 'current'">当前已是最新版本。</span>
        <span v-else-if="status === 'downloading'">正在下载 {{ bytes(downloadedBytes) }}<template v-if="totalBytes"> / {{ bytes(totalBytes) }}</template></span>
        <span v-else-if="status === 'downloaded'">更新已下载并通过签名验证，可以安装。</span>
        <span v-else-if="status === 'installing'">正在安装或重启，请稍候…</span>
        <span v-else-if="status === 'restartReady'">更新已安装，请重启应用。</span>
        <span v-else-if="latestVersion">发现新版本 {{ latestVersion }}</span>
        <span v-else>检查更新以获取新功能与修复。</span>
      </div>
      <div v-if="status === 'downloading'" class="updater-progress" :class="{ indeterminate: progressPercent == null }"><span :style="{ width: `${progressPercent ?? 40}%` }"></span></div>
      <p v-if="error" class="updater-error" role="alert">{{ error }}</p>
      <section v-if="latestVersion" class="updater-notes"><strong>版本 {{ latestVersion }}</strong><pre>{{ releaseNotes }}</pre></section>
      <p v-if="activeNativeTasks" class="updater-note">{{ activeNativeTasks }} 个本机工具任务正在执行，完成后才能安装或重启。</p>
      <div v-if="confirming" class="updater-confirm"><strong>安装更新并重新启动？</strong><p>应用将关闭，请先保存尚未保存的编辑内容。</p><div><button class="secondary-button" @click="confirming = false">稍后安装</button><button class="primary-button" :disabled="busy || activeNativeTasks > 0" @click="confirmInstall">确认安装并重启</button></div></div>
      <footer>
        <button class="secondary-button" :disabled="!canCheck" @click="checkNow"><RefreshCw :size="14" /> {{ status === 'checking' ? '检查中…' : '检查更新' }}</button>
        <button v-if="status === 'available'" class="primary-button" @click="downloadUpdate"><Download :size="14" /> 下载更新</button>
        <button v-if="status === 'downloaded' && !confirming" class="primary-button" :disabled="activeNativeTasks > 0" @click="confirming = true">安装并重启</button>
        <button v-if="status === 'restartReady'" class="primary-button" :disabled="activeNativeTasks > 0" @click="restartApp">重新启动</button>
      </footer>
    </section>
  </div>
</template>
