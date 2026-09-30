<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { isTauri } from '@tauri-apps/api/core'
import { open, save } from '@tauri-apps/plugin-dialog'
import { trackedInvoke as invoke } from '../../app/activity'
import { useUpdater } from '../../app/updater'
import { tools } from '../registry'
import { formatDate, useNativeTask } from '../nativeTools'
import {
  applyRestorePlan, createRestorePlan, createSettingsBackup, groupSummary, parseSettingsBackup, serializeSettingsBackup, settingsGroups,
  type SettingsBackup, type SettingsGroup,
} from '../settingsBackup'
import NativeToolFrame from './NativeToolFrame.vue'

const supported = isTauri()
const { busy, error, message, run } = useNativeTask()
const { currentVersion } = useUpdater()
const exportGroups = ref<SettingsGroup[]>(settingsGroups.filter((group) => !group.optional).map((group) => group.id))
const exportPreview = shallowRef<SettingsBackup | null>(null)
const imported = shallowRef<SettingsBackup | null>(null)
const importedFile = ref('')
const restoreGroups = ref<SettingsGroup[]>([])
const confirming = ref(false)
const availableGroups = computed(() => settingsGroups.filter((group) => imported.value?.settings[group.id] !== undefined))
const toolIds = tools.map((tool) => tool.id)
const restoreState = computed(() => {
  if (!imported.value || !restoreGroups.value.length) return { plan: null, error: '' }
  try { return { plan: createRestorePlan(imported.value, restoreGroups.value, toolIds), error: '' } }
  catch (cause) { return { plan: null, error: cause instanceof Error ? cause.message : '无法生成恢复预览。' } }
})
watch(exportGroups, () => { exportPreview.value = null }, { deep: true })
watch(restoreGroups, () => { confirming.value = false }, { deep: true })

async function previewExport(): Promise<void> {
  const value = await run(async () => {
    const backup = createSettingsBackup(currentVersion.value, exportGroups.value)
    serializeSettingsBackup(backup)
    return backup
  })
  if (value) exportPreview.value = value
}
async function exportBackup(): Promise<void> {
  const value = await run(async () => {
    const backup = createSettingsBackup(currentVersion.value, exportGroups.value)
    const content = serializeSettingsBackup(backup)
    exportPreview.value = backup
    const date = new Date().toISOString().slice(0, 10)
    const path = await save({ title: '保存工具箱设置备份', defaultPath: `LocalToolbox-settings-${date}.json`, filters: [{ name: 'JSON 备份', extensions: ['json'] }] })
    if (!path) return false
    await invoke('save_settings_backup', { path, content })
    return true
  })
  if (value) message.value = '设置备份已保存。'
}
async function chooseBackup(): Promise<void> {
  confirming.value = false
  const value = await run(async () => {
    const path = await open({ title: '选择工具箱设置备份', multiple: false, filters: [{ name: 'JSON 备份', extensions: ['json'] }] })
    if (typeof path !== 'string') return null
    const content = await invoke<string>('read_settings_backup', { path })
    return { path, backup: parseSettingsBackup(content) }
  })
  if (value) {
    imported.value = value.backup
    importedFile.value = value.path.split(/[\\/]/).pop() ?? value.path
    restoreGroups.value = settingsGroups.filter((group) => !group.optional && value.backup.settings[group.id] !== undefined).map((group) => group.id)
  }
}
async function restoreBackup(): Promise<void> {
  if (!confirming.value || !imported.value || !restoreState.value.plan) return
  const value = await run(async () => {
    const plan = createRestorePlan(imported.value!, restoreGroups.value, toolIds)
    applyRestorePlan(plan)
    return true
  })
  if (value) {
    confirming.value = false
    message.value = '所选设置已恢复；收藏与更新偏好已同步，其他工具下次打开时读取恢复后的内容。'
  }
}
</script>

<template>
  <NativeToolFrame :busy="busy" :error="error" :message="message" hint="导出和恢复本机设置。备份为未加密的 JSON 文件，可选包含文本片段或工作区路径；文件上限 4 MiB。">
    <p v-if="!supported" class="native-hint">请在桌面应用中选择和保存备份文件；浏览器预览可查看当前设置摘要。</p>
    <div class="settings-backup-sections">
      <section class="settings-backup-card">
        <h3>导出当前设置</h3><p class="native-hint">选择需要备份的分组，预览后保存到本机。</p>
        <label v-for="group in settingsGroups" :key="group.id" class="settings-backup-option">
          <input v-model="exportGroups" type="checkbox" :value="group.id" :disabled="busy" />
          <span><strong>{{ group.label }}</strong><small>{{ group.description }}</small></span>
        </label>
        <div class="native-toolbar">
          <button class="secondary-button" :disabled="busy || !exportGroups.length" @click="previewExport">预览备份</button>
          <button class="primary-button" :disabled="busy || !supported || !exportGroups.length" @click="exportBackup">导出 JSON 备份</button>
        </div>
        <div v-if="exportPreview" class="settings-backup-summary">
          <p v-for="group in settingsGroups.filter((item) => exportPreview?.settings[item.id] !== undefined)" :key="group.id">
            <strong>{{ group.label }}</strong><span>{{ groupSummary(exportPreview.settings, group.id) }}</span>
          </p>
        </div>
      </section>
      <section class="settings-backup-card">
        <h3>恢复备份</h3><p class="native-hint">恢复会用备份内容替换所选分组，建议先导出当前设置。</p>
        <div class="native-toolbar"><button class="secondary-button" :disabled="busy || !supported" @click="chooseBackup">选择 JSON 备份</button></div>
        <template v-if="imported">
          <div class="settings-backup-file"><strong>{{ importedFile }}</strong><span>来自 LocalToolbox {{ imported.appVersion }} · {{ formatDate(imported.exportedAt) }}</span></div>
          <label v-for="group in availableGroups" :key="group.id" class="settings-backup-option">
            <input v-model="restoreGroups" type="checkbox" :value="group.id" :disabled="busy" />
            <span><strong>{{ group.label }}</strong><small>{{ groupSummary(imported.settings, group.id) }}</small></span>
          </label>
          <p v-if="availableGroups.some((group) => group.optional)" class="native-hint">文本片段与工作区需要手动勾选后才恢复。</p>
          <p v-if="restoreState.error" class="native-error">{{ restoreState.error }}</p>
          <p v-for="warning in restoreState.plan?.warnings ?? []" :key="warning" class="native-hint">{{ warning }}</p>
          <div v-if="confirming" class="settings-backup-confirm">
            <strong>覆盖所选 {{ restoreGroups.length }} 个分组？</strong><p>所选分组当前保存的内容将被备份内容替换。</p>
            <div class="native-toolbar"><button class="secondary-button" :disabled="busy" @click="confirming = false">取消</button><button class="primary-button" :disabled="busy" @click="restoreBackup">确认恢复</button></div>
          </div>
          <button v-else class="primary-button" :disabled="busy || !restoreState.plan" @click="confirming = true">恢复所选设置</button>
        </template>
        <p v-else class="native-empty">选择备份后预览内容，再决定恢复哪些分组。</p>
      </section>
    </div>
  </NativeToolFrame>
</template>

<style scoped>
.settings-backup-sections { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px; }
.settings-backup-card { display: grid; min-width: 0; align-content: start; gap: 12px; padding: 18px; border: 1px solid #e9e8f0; border-radius: 12px; background: #fff; }
.settings-backup-card h3 { margin: 0; color: #44485d; font-size: 13px; }
.settings-backup-option { display: flex; align-items: flex-start; gap: 9px; padding: 9px 0; color: #656b80; }
.settings-backup-option input { margin-top: 3px; accent-color: #6659e8; }
.settings-backup-option span { display: grid; min-width: 0; gap: 5px; }
.settings-backup-option strong { font-size: 11px; }
.settings-backup-option small, .settings-backup-file span { color: #9499a9; font-size: 10px; line-height: 1.5; }
.settings-backup-summary, .settings-backup-file { display: grid; gap: 7px; padding: 12px; border-radius: 8px; background: #faf9ff; }
.settings-backup-summary p { display: grid; gap: 4px; margin: 0; color: #9596a8; font-size: 10px; }
.settings-backup-summary strong, .settings-backup-file strong { color: #65627f; font-size: 11px; overflow-wrap: anywhere; }
.settings-backup-confirm { padding: 13px; border: 1px solid #e8dcbd; border-radius: 9px; background: #fffdf7; color: #9b8154; font-size: 11px; }
.settings-backup-confirm p { font-size: 10px; line-height: 1.5; }
</style>
