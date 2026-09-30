<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { trackedInvoke as invoke } from '../../app/activity'
import { open } from '@tauri-apps/plugin-dialog'
import { ArrowRight, Check, FolderOpen, LoaderCircle, RotateCcw, Sparkles } from '@lucide/vue'

type RenameMode = 'prefixSuffix' | 'replace'
type PreviewStatus = 'ready' | 'unchanged' | 'conflict' | 'invalid'
interface RenameRule { mode: RenameMode; prefix: string; suffix: string; find: string; replace: string }
interface RenamePreview { oldPath: string; newPath: string; oldName: string; newName: string; sizeBytes: number; status: PreviewStatus; reason: string | null }
interface RenameRecord { oldPath: string; newPath: string }

const selectedPaths = ref<string[]>([])
const mode = ref<RenameMode>('prefixSuffix')
const prefix = ref('')
const suffix = ref('')
const findText = ref('')
const replaceText = ref('')
const previews = ref<RenamePreview[]>([])
const undoRecords = ref<RenameRecord[]>([])
const error = ref('')
const success = ref('')
const loading = ref(false)
const confirmationOpen = ref(false)
const rule = computed<RenameRule>(() => ({ mode: mode.value, prefix: prefix.value, suffix: suffix.value, find: findText.value, replace: replaceText.value }))
const readyCount = computed(() => previews.value.filter((item) => item.status === 'ready').length)
const blockedCount = computed(() => previews.value.filter((item) => item.status === 'conflict' || item.status === 'invalid').length)
const canApply = computed(() => readyCount.value > 0 && blockedCount.value === 0 && !loading.value)

watch([selectedPaths, mode, prefix, suffix, findText, replaceText], () => {
  previews.value = []
  confirmationOpen.value = false
  error.value = ''
}, { deep: true })

function clearMessages(): void {
  error.value = ''
  success.value = ''
}

async function selectFiles(): Promise<void> {
  clearMessages()
  try {
    const selection = await open({ title: '选择要重命名的文件（最多 200 个）', multiple: true, directory: false })
    if (Array.isArray(selection)) selectedPaths.value = selection
    else if (selection) selectedPaths.value = [selection]
  } catch {
    error.value = '无法打开系统文件选择器，请在桌面应用中使用此工具。'
  }
}

function displayName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

async function createPreview(): Promise<void> {
  clearMessages()
  if (selectedPaths.value.length === 0) {
    error.value = '请先选择要重命名的文件。'
    return
  }
  if (mode.value === 'prefixSuffix' && !prefix.value && !suffix.value) {
    error.value = '请至少填写一个前缀或后缀。'
    return
  }
  if (mode.value === 'replace' && !findText.value) {
    error.value = '请输入要查找的文件名内容。'
    return
  }
  loading.value = true
  try {
    previews.value = await invoke<RenamePreview[]>('preview_batch_rename', { paths: selectedPaths.value, rule: rule.value })
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    loading.value = false
  }
}

async function renameFiles(): Promise<void> {
  confirmationOpen.value = false
  clearMessages()
  loading.value = true
  try {
    const records = await invoke<RenameRecord[]>('rename_batch_files', { paths: selectedPaths.value, rule: rule.value })
    undoRecords.value = records
    success.value = `已重命名 ${records.length} 个文件，可以撤销最近一次操作。`
    selectedPaths.value = []
    previews.value = []
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    try {
      previews.value = await invoke<RenamePreview[]>('preview_batch_rename', { paths: selectedPaths.value, rule: rule.value })
    } catch {
      previews.value = []
    }
    error.value = message
  } finally {
    loading.value = false
  }
}

async function undoRename(): Promise<void> {
  if (!undoRecords.value.length) return
  clearMessages()
  loading.value = true
  try {
    await invoke('undo_batch_rename', { records: undoRecords.value })
    success.value = `已撤销 ${undoRecords.value.length} 个文件的改名。`
    undoRecords.value = []
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    loading.value = false
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function statusLabel(status: PreviewStatus): string {
  return { ready: '可改名', unchanged: '名称不变', conflict: '名称冲突', invalid: '无法改名' }[status]
}
</script>

<template>
  <div class="batch-rename-tool">
    <section class="rename-select-card">
      <div class="rename-select-copy">
        <div class="rename-select-icon"><FolderOpen :size="19" /></div>
        <div><strong>选择本地文件</strong><span>最多 200 个；只处理文件本身，不递归目录</span></div>
      </div>
      <button class="secondary-button" :disabled="loading" @click="selectFiles"><FolderOpen :size="15" /> 选择文件</button>
    </section>

    <div v-if="selectedPaths.length" class="rename-selection-summary">
      <strong>已选 {{ selectedPaths.length }} 个文件</strong>
      <div class="rename-selected-files"><span v-for="path in selectedPaths" :key="path">{{ displayName(path) }}</span></div>
    </div>

    <section class="rename-rule-card">
      <div class="field-heading"><label for="rename-mode">命名规则</label><span class="field-suffix">扩展名保持不变</span></div>
      <select id="rename-mode" v-model="mode" class="rename-mode-select">
        <option value="prefixSuffix">添加前缀 / 后缀</option>
        <option value="replace">查找并替换文件名</option>
      </select>
      <div v-if="mode === 'prefixSuffix'" class="rename-rule-fields">
        <label>前缀<input v-model="prefix" class="text-input" placeholder="例如：2026-" /></label>
        <label>后缀<input v-model="suffix" class="text-input" placeholder="例如：-备份" /></label>
      </div>
      <div v-else class="rename-rule-fields">
        <label>查找<input v-model="findText" class="text-input" placeholder="要替换的文件名片段" /></label>
        <label>替换为<input v-model="replaceText" class="text-input" placeholder="新内容，可留空以删除" /></label>
      </div>
      <div class="rename-rule-footer">
        <p class="form-hint">先预览并检查冲突；确认后才会改名，可撤销最近一次批量操作。</p>
        <button class="primary-button" :disabled="!selectedPaths.length || loading" @click="createPreview">
          <LoaderCircle v-if="loading" class="spin-icon" :size="15" /><Sparkles v-else :size="15" /> {{ loading ? '处理中…' : '预览改名' }}
        </button>
      </div>
    </section>

    <p v-if="error" class="rename-message rename-error">{{ error }}</p>
    <div v-else-if="success" class="rename-feedback-row">
      <p class="rename-message rename-success"><Check :size="14" /> {{ success }}</p>
      <button v-if="undoRecords.length" class="secondary-button" :disabled="loading" @click="undoRename"><RotateCcw :size="14" /> 撤销本次改名</button>
    </div>

    <section v-if="previews.length" class="rename-preview-section">
      <div class="rename-preview-heading">
        <div><h2>改名预览</h2><span>{{ previews.length }} 个文件 · {{ readyCount }} 个可改名</span></div>
        <button v-if="undoRecords.length" class="quiet-button" :disabled="loading" @click="undoRename"><RotateCcw :size="14" /> 撤销上次改名</button>
      </div>
      <div class="rename-preview-list">
        <article v-for="item in previews" :key="item.oldPath" class="rename-preview-row" :class="`rename-${item.status}`">
          <div class="rename-preview-names"><strong :title="item.oldName">{{ item.oldName }}</strong><ArrowRight :size="14" /><strong :title="item.newName">{{ item.newName }}</strong></div>
          <span class="rename-file-size">{{ formatSize(item.sizeBytes) }}</span>
          <span class="rename-status">{{ item.reason || statusLabel(item.status) }}</span>
        </article>
      </div>
      <div class="rename-preview-actions">
        <p v-if="blockedCount" class="form-hint hint-error">有 {{ blockedCount }} 个文件存在冲突或无效名称，请调整规则后重新预览。</p>
        <p v-else class="form-hint">改名仅作用于当前选择的文件，文件内容不会被读取或修改。</p>
        <button class="primary-button" :disabled="!canApply" @click="confirmationOpen = true">确认改名（{{ readyCount }}）</button>
      </div>
    </section>

    <div v-if="confirmationOpen" class="rename-confirm-backdrop" role="presentation">
      <section class="rename-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="rename-confirm-title">
        <h2 id="rename-confirm-title">确认批量改名</h2>
        <p>即将重命名 {{ readyCount }} 个文件。执行前会再次检查原文件和目标名称；如操作中出错，会尝试撤销本批次已完成的部分。</p>
        <div class="rename-confirm-actions">
          <button class="secondary-button" @click="confirmationOpen = false">返回预览</button>
          <button class="primary-button" :disabled="loading" @click="renameFiles">确认改名</button>
        </div>
      </section>
    </div>
  </div>
</template>
