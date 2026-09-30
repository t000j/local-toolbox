<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { open, save } from '@tauri-apps/plugin-dialog'
import { trackedInvoke as invoke } from '../../app/activity'
import { useNativeDiagnostic } from '../useNativeDiagnostic'
import { treeSnapshot } from '../fileTree'
import { fileListText } from '../fileList'
import { scanFilters, scanReason } from '../fileScan'
const task = useNativeDiagnostic(), { busy, error, result, summary } = task
const root = ref(''), choosing = ref(false), saving = ref(false), format = ref<'csv' | 'txt'>('csv'), notice = ref(''), allowPartial = ref(false)
let disposed = false, revision = 0
const snapshot = computed(() => treeSnapshot(root.value, result.value))
const preview = computed(() => { try { return result.value ? fileListText(root.value, snapshot.value, format.value) : '' } catch { return '' } })
function clear() { if (busy.value || saving.value) return; revision++; task.clear(); allowPartial.value = false; notice.value = '' }
watch(root, clear, { flush: 'sync' }); watch(format, () => { notice.value = ''; revision++ })
async function choose() {
  if (busy.value || choosing.value || saving.value || disposed) return
  choosing.value = true
  try { const path = await open({ directory: true, multiple: false, title: '选择只读生成清单的本地子文件夹' }); if (!disposed && typeof path === 'string') root.value = path }
  catch { if (!disposed) notice.value = '请在 Windows 桌面版选择文件夹' }
  finally { if (!disposed) choosing.value = false }
}
async function run() {
  if (!root.value || busy.value || choosing.value || saving.value || disposed) return
  clear(); await task.start('run_file_scan', { request: { root: root.value, mode: 'tree', ...scanFilters('', '', '', '', '', '') } })
}
async function exportList() {
  if (busy.value || choosing.value || saving.value || !result.value || (!snapshot.value.complete && !allowPartial.value) || disposed) return
  saving.value = true; notice.value = ''; const version = revision
  try {
    const content = fileListText(root.value, snapshot.value, format.value)
    const path = await save({ title: '保存清单为新文件（不覆盖已有文件）', defaultPath: `file-list.${format.value}`, filters: [{ name: format.value.toUpperCase(), extensions: [format.value] }] })
    if (!path || disposed || revision !== version) return
    await invoke('save_file_list', { path, content })
    if (!disposed && revision === version) notice.value = '清单已保存为新文件'
  } catch (cause) { if (!disposed && revision === version) notice.value = typeof cause === 'string' ? cause : cause instanceof Error ? cause.message : '保存失败' }
  finally { if (!disposed) saving.value = false }
}
onBeforeUnmount(() => { disposed = true; revision++ })
</script>
<template>
  <div class="tool-form">
    <p class="form-hint">只读扫描手动选择的本地子目录，包含文件、目录及空目录；最多 10,000 项遍历、32 层、1,000 目录/结果、64 KiB、30 秒。拒绝网络路径、链接/重解析点，不读取正文，不自动导出。</p>
    <div class="action-buttons"><button class="secondary-button" :disabled="busy || choosing || saving" @click="choose">选择文件夹</button><button class="primary-button" :disabled="busy || choosing || saving || !root" @click="run">生成清单</button><button v-if="busy" class="secondary-button" @click="task.cancel">取消扫描</button><button class="secondary-button" :disabled="busy || saving" @click="clear">清空</button></div>
    <p class="list-root">{{ root || '尚未选择文件夹' }}</p>
    <p v-if="result && !snapshot.complete" class="form-hint hint-error">清单不完整（取消、跳过、读取失败或上限），未列出不代表不存在。{{ snapshot.reasons.map(scanReason).join('；') }}</p>
    <label v-if="result && !snapshot.complete" class="form-hint"><input v-model="allowPartial" type="checkbox" :disabled="saving" /> 我接受导出明确标记为不完整的清单</label>
    <div class="action-buttons"><label>格式 <select v-model="format" :disabled="saving"><option value="csv">CSV</option><option value="txt">文本</option></select></label><button class="primary-button" :disabled="busy || choosing || saving || !result || (!snapshot.complete && !allowPartial)" @click="exportList">{{ saving ? '保存中…' : '选择保存位置' }}</button></div>
    <p class="form-hint">导出含扫描范围、完整性标记、相对路径、类型、字节数及 UTC 修改时间。CSV 为 UTF-8 BOM/CRLF，危险公式前缀加单引号；文本路径用 JSON 转义。最多 1 MiB，仅创建新文件，拒绝已有文件及输出路径中的链接；保存开始后离页不撤回已提交写入。</p>
    <textarea :value="preview" class="code-input" rows="10" readonly spellcheck="false" aria-label="文件清单预览" />
    <p class="form-hint" role="status">{{ busy ? '读取目录中…' : summary }} · {{ snapshot.rows.length }} 项</p><p class="form-hint" :class="{ 'hint-error': !!error }">{{ notice || error }}</p>
  </div>
</template>
<style scoped>.list-root { overflow-wrap: anywhere; font-size: 12px; } textarea { width: 100%; box-sizing: border-box; } select { font-size: 12px; }</style>
