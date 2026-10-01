import { computed, ref, watch } from 'vue'
import { getVersion } from '@tauri-apps/api/app'
import { isTauri } from '@tauri-apps/api/core'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import appPackage from '../../package.json'
import { activeNativeTasks, claimUpdateInstallation, releaseUpdateInstallation } from './activity'
import { restoredKeys, settingsRestoredEvent } from './settingsEvents'

type UpdateStatus = 'idle' | 'checking' | 'current' | 'available' | 'downloading' | 'downloaded' | 'installing' | 'restartReady' | 'error'
const preferenceKey = 'toolbox:auto-update:v1'
const updateCheckTimeoutMs = 45000
const currentVersion = ref(appPackage.version)
const latestVersion = ref('')
const releaseNotes = ref('')
const status = ref<UpdateStatus>('idle')
const error = ref('')
const downloadedBytes = ref(0)
const totalBytes = ref(0)
const autoCheck = ref(readPreference())
const supported = isTauri() && !import.meta.env.DEV
const busy = computed(() => ['checking', 'downloading', 'installing'].includes(status.value))
const canCheck = computed(() => supported && !busy.value && status.value !== 'downloaded' && status.value !== 'restartReady')
const updateAvailable = computed(() => !!latestVersion.value && status.value !== 'current')
const progressPercent = computed(() => totalBytes.value ? Math.min(100, Math.round(downloadedBytes.value / totalBytes.value * 100)) : null)
let update: Update | null = null
let initialized = false
let startupTimer: number | undefined
let listeningForSettings = false

function onSettingsRestored(event: Event): void {
  if (restoredKeys(event).includes(preferenceKey)) autoCheck.value = readPreference()
}

function readPreference(): boolean {
  try { return localStorage.getItem(preferenceKey) !== 'false' } catch { return true }
}

watch(autoCheck, (value) => {
  try { localStorage.setItem(preferenceKey, String(value)) } catch { /* Keep the setting for this session. */ }
  window.clearTimeout(startupTimer)
  startupTimer = undefined
  if (value && initialized && supported) scheduleStartupCheck()
})

function scheduleStartupCheck(): void {
  window.clearTimeout(startupTimer)
  startupTimer = window.setTimeout(() => { startupTimer = undefined; void checkNow() }, 3500)
}

function errorText(cause: unknown): string {
  const detail = typeof cause === 'string' ? cause : cause instanceof Error ? cause.message : String(cause)
  if (detail.includes('404')) return '尚未找到正式发布的更新版本，请稍后重试。'
  if (/timeout|timed\s*out|超时/i.test(detail)) return '连接更新服务超时，请检查网络后重试。'
  if (/error sending request|error trying to connect|dns error/i.test(detail)) return '无法连接更新服务，请检查网络或代理设置后重试。'
  return `更新操作未完成：${detail}`
}

async function initialize(): Promise<void> {
  if (!listeningForSettings) { window.addEventListener(settingsRestoredEvent, onSettingsRestored); listeningForSettings = true }
  if (initialized) return
  initialized = true
  if (isTauri()) {
    try { currentVersion.value = await getVersion() } catch { /* Use the bundled package version. */ }
  }
  if (supported && autoCheck.value) scheduleStartupCheck()
}

async function checkNow(): Promise<void> {
  if (!canCheck.value) return
  status.value = 'checking'
  error.value = ''
  if (update) await update.close().catch(() => undefined)
  update = null
  latestVersion.value = ''
  releaseNotes.value = ''
  try {
    update = await check({ timeout: updateCheckTimeoutMs })
    if (update) {
      latestVersion.value = update.version
      releaseNotes.value = update.body ?? '此版本未提供更新说明。'
      status.value = 'available'
    } else status.value = 'current'
  } catch (cause) { status.value = 'error'; error.value = errorText(cause) }
}

async function downloadUpdate(): Promise<void> {
  if (!update || status.value !== 'available') return
  error.value = ''
  status.value = 'downloading'
  downloadedBytes.value = 0
  totalBytes.value = 0
  try {
    await update.download((event) => {
      if (event.event === 'Started') totalBytes.value = event.data.contentLength ?? 0
      else if (event.event === 'Progress') downloadedBytes.value += event.data.chunkLength
    }, { timeout: 180000 })
    status.value = 'downloaded'
  } catch (cause) { status.value = 'available'; error.value = errorText(cause) }
}

async function restartApp(): Promise<void> {
  if (!claimUpdateInstallation()) { error.value = '有本机工具任务正在执行，请等待完成后重启。'; return }
  status.value = 'installing'
  try { await relaunch() }
  catch (cause) { releaseUpdateInstallation(); status.value = 'restartReady'; error.value = errorText(cause) }
}

async function installUpdate(): Promise<void> {
  if (!update || status.value !== 'downloaded') return
  if (!claimUpdateInstallation()) { error.value = '有本机工具任务正在执行，请等待完成后安装。'; return }
  error.value = ''
  status.value = 'installing'
  try { await update.install({ restartAfterInstall: true }) }
  catch (cause) { releaseUpdateInstallation(); status.value = 'downloaded'; error.value = errorText(cause); return }
  // Windows exits inside install(); this handles platforms whose installer returns.
  try { await relaunch() }
  catch (cause) { releaseUpdateInstallation(); status.value = 'restartReady'; error.value = errorText(cause) }
}

function dispose(): void {
  window.clearTimeout(startupTimer)
  if (listeningForSettings) { window.removeEventListener(settingsRestoredEvent, onSettingsRestored); listeningForSettings = false }
  if (update && !busy.value) void update.close().catch(() => undefined)
}

export function useUpdater() {
  return { currentVersion, latestVersion, releaseNotes, status, error, autoCheck, supported, busy, canCheck, updateAvailable,
    downloadedBytes, totalBytes, progressPercent, activeNativeTasks, initialize, checkNow, downloadUpdate, installUpdate, restartApp, dispose }
}
