<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { open } from '@tauri-apps/plugin-dialog'
import { useNativeDiagnostic } from '../useNativeDiagnostic'
import { compareTrees, comparisonLabels, treeSnapshot } from '../fileTree'
import { scanFilters, scanReason } from '../fileScan'
import { formatBytes, formatDate } from '../nativeTools'
const leftTask = useNativeDiagnostic(), rightTask = useNativeDiagnostic()
const leftRoot = ref(''), rightRoot = ref(''), busy = ref(false), choosing = ref(false), notice = ref(''), page = ref(1), differences = ref(false)
let disposed = false, cancelled = false
const left = computed(() => treeSnapshot(leftRoot.value, leftTask.result.value)), right = computed(() => treeSnapshot(rightRoot.value, rightTask.result.value))
const hasResult = computed(() => !!leftTask.result.value || !!rightTask.result.value)
const rows = computed(() => compareTrees(left.value, right.value).filter(r => !differences.value || r.status !== 'metadataSame'))
const pages = computed(() => Math.max(1, Math.ceil(rows.value.length / 25)))
const visible = computed(() => rows.value.slice((page.value - 1) * 25, page.value * 25))
function clear() { if (busy.value) return; leftTask.clear(); rightTask.clear(); notice.value = ''; page.value = 1 }
watch([leftRoot, rightRoot], clear, { flush: 'sync' }); watch(differences, () => { page.value = 1 })
async function choose(side: 'left' | 'right') {
  if (busy.value || choosing.value || disposed) return
  choosing.value = true
  try { const path = await open({ directory: true, multiple: false, title: '选择只读比较的本地子文件夹' }); if (!disposed && typeof path === 'string') (side === 'left' ? leftRoot : rightRoot).value = path }
  catch { if (!disposed) notice.value = '请在 Windows 桌面版选择文件夹' }
  finally { if (!disposed) choosing.value = false }
}
async function cancel() { cancelled = true; await Promise.all([leftTask.cancel(), rightTask.cancel()]) }
async function run() {
  if (busy.value || choosing.value || !leftRoot.value || !rightRoot.value || disposed) return
  clear(); busy.value = true; cancelled = false
  try {
    const request = (root: string) => ({ root, mode: 'tree', ...scanFilters('', '', '', '', '', '') })
    await leftTask.start('run_file_scan', { request: request(leftRoot.value) })
    if (!cancelled && !disposed) await rightTask.start('run_file_scan', { request: request(rightRoot.value) })
  } finally { if (!disposed) busy.value = false }
}
onBeforeUnmount(() => { disposed = true; void cancel() })
</script>
<template>
  <div class="tool-form">
    <p class="form-hint">手动只读扫描两个明确选择的本地子文件夹，比较相对名称、文件/目录类型、大小及修改时间。不读取正文，不同步、移动、删除或保存结果；元数据相同不能证明内容相同。</p>
    <div class="action-buttons"><button class="secondary-button" :disabled="busy || choosing" @click="choose('left')">选择左侧</button><button class="secondary-button" :disabled="busy || choosing" @click="choose('right')">选择右侧</button><button class="primary-button" :disabled="busy || choosing || !leftRoot || !rightRoot" @click="run">比较结构</button><button v-if="busy" class="secondary-button" @click="cancel">取消</button></div>
    <p class="root">左：{{ leftRoot || '尚未选择' }}<br />右：{{ rightRoot || '尚未选择' }}</p>
    <p class="form-hint">每侧最多 10,000 项遍历、32 层、1,000 目录/结果、64 KiB 输出、30 秒，按左→右顺序读取，并非同一时刻快照。拒绝网络/设备路径、链接和重解析点，不提权；被占用或无权限等条目跳过。名称精确区分大小写，不模糊合并。</p>
    <p v-if="hasResult && (!left.complete || !right.complete)" class="form-hint hint-error">至少一侧结果不完整；该侧未显示的条目为未知，不能判定不存在。</p>
    <p v-if="hasResult" class="form-hint">左：{{ left.rows.length }} 项 / 跳过 {{ left.skipped }} · 右：{{ right.rows.length }} 项 / 跳过 {{ right.skipped }}<br />{{ [...left.reasons, ...right.reasons].map(scanReason).join('；') }}</p>
    <label class="form-hint"><input v-model="differences" type="checkbox" /> 仅显示差异或未知</label>
    <div class="tree-table"><table><thead><tr><th>相对路径</th><th>状态</th><th>左侧</th><th>右侧</th></tr></thead><tbody><tr v-for="r in visible" :key="r.relative"><td>{{ r.relative }}</td><td>{{ comparisonLabels[r.status] }}</td><td v-for="(item, i) in [r.left, r.right]" :key="i">{{ item ? (item.kind === 'directory' ? '目录' : formatBytes(item.bytes)) : '—' }}<br />{{ item ? formatDate(item.modifiedMs) : '' }}</td></tr></tbody></table></div>
    <div class="action-buttons"><button class="secondary-button" :disabled="page <= 1" @click="page--">上一页</button><span>{{ page }} / {{ pages }} · {{ rows.length }} 项</span><button class="secondary-button" :disabled="page >= pages" @click="page++">下一页</button><button class="secondary-button" :disabled="busy" @click="clear">清空</button></div>
    <p class="form-hint" role="status">{{ busy ? '只读比较中…' : [leftTask.summary.value, rightTask.summary.value].filter(Boolean).join('；') }}</p><p class="form-hint hint-error">{{ notice || leftTask.error.value || rightTask.error.value }}</p>
  </div>
</template>
<style scoped>
.root, td { overflow-wrap: anywhere; } .root { font-size: 12px; } .tree-table { max-height: 340px; overflow: auto; } table { width: 100%; font-size: 11px; text-align: left; } td, th { padding: 6px; border-bottom: 1px solid #ddd; }
</style>
