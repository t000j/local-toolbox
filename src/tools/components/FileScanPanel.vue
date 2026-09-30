<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { open } from '@tauri-apps/plugin-dialog'
import { duplicateGroups, parseFileScan, scanFilters, scanReason } from '../fileScan'
import { formatBytes, formatDate } from '../nativeTools'
import { useNativeDiagnostic } from '../useNativeDiagnostic'
const props = defineProps<{ mode: 'search' | 'duplicates' }>()
const task = useNativeDiagnostic(), { busy, cancelling, error, result, summary } = task
const root = ref(''), name = ref(''), extension = ref(''), min = ref(''), max = ref(''), after = ref(''), before = ref(''), notice = ref(''), choosing = ref(false), page = ref(1)
let disposed = false
const snapshot = computed(() => parseFileScan(result.value?.output ?? ''))
const groups = computed(() => duplicateGroups(snapshot.value.rows))
const rows = computed(() => props.mode === 'duplicates' ? groups.value.flatMap((group, i) => group.map(r => ({ ...r, group: i + 1 }))) : snapshot.value.rows.map(r => ({ ...r, group: 0 })))
const pages = computed(() => Math.max(1, Math.ceil(rows.value.length / 25)))
const visible = computed(() => rows.value.slice((page.value - 1) * 25, page.value * 25))
watch([root, name, extension, min, max, after, before], () => { task.clear(); notice.value = ''; page.value = 1 }, { flush: 'sync' })
watch(result, () => { page.value = 1 }, { flush: 'sync' })
async function choose() {
  if (busy.value || choosing.value || disposed) return
  choosing.value = true; notice.value = ''
  try { const path = await open({ directory: true, multiple: false, title: '选择明确授权只读扫描的本地文件夹' }); if (!disposed && typeof path === 'string') root.value = path }
  catch { if (!disposed) notice.value = '无法选择文件夹，请在 Windows 桌面版操作' }
  finally { if (!disposed) choosing.value = false }
}
async function run() {
  if (!root.value || busy.value || choosing.value || disposed) return
  notice.value = ''
  try {
    const filters = props.mode === 'search' ? scanFilters(name.value, extension.value, min.value, max.value, after.value, before.value) : scanFilters('', '', '', '', '', '')
    await task.start('run_file_scan', { request: { root: root.value, mode: props.mode, ...filters } })
  } catch (cause) { notice.value = cause instanceof Error ? cause.message : '筛选参数无效' }
}
onBeforeUnmount(() => { disposed = true; root.value = '' })
</script>
<template>
  <div class="tool-form">
    <p class="form-hint">仅手动扫描你选择的本地文件夹；拒绝驱动器根目录、网络路径及重解析点/链接，不跟随链接，不提权。只读、不移动或删除文件，路径与结果不保存。</p>
    <div class="action-buttons"><button class="secondary-button" :disabled="busy || choosing" @click="choose">选择文件夹</button><button class="primary-button" :disabled="busy || choosing || !root" @click="run">{{ mode === 'duplicates' ? '比较内容哈希' : '开始搜索' }}</button><button v-if="busy" class="secondary-button" :disabled="cancelling" @click="task.cancel">取消扫描</button></div>
    <p class="scan-root">{{ root || '尚未选择文件夹' }}</p>
    <fieldset v-if="mode === 'search'" :disabled="busy || choosing"><legend>搜索条件（同时满足）</legend><div class="scan-filters">
      <label>文件名包含（非通配符）<input v-model="name" class="native-input" maxlength="200" /></label><label>扩展名<input v-model="extension" class="native-input" placeholder="txt" maxlength="32" /></label>
      <label>最小字节数<input v-model="min" class="native-input" inputmode="numeric" /></label><label>最大字节数<input v-model="max" class="native-input" inputmode="numeric" /></label>
      <label>修改时间起（本地）<input v-model="after" class="native-input" type="datetime-local" /></label><label>修改时间止（本地）<input v-model="before" class="native-input" type="datetime-local" /></label>
    </div></fieldset>
    <p class="form-hint">最多遍历 10,000 项、32 层、合计 1,000 个目录；总时限 30 秒、输出 64 KiB、最多 1,000 条。被占用、无权限、链接或超限项会跳过，结果可能不完整；取消与离页停止扫描。</p>
    <p v-if="mode === 'duplicates'" class="form-hint">按大小及完整 SHA-256 内容哈希分组，只显示至少 2 个匹配路径。每文件最多 64 MiB、总读取最多 512 MiB；无法读取或扫描期间变化的文件跳过。相同哈希是重复候选，不提供清理；同一文件的硬链接别名会跳过，不计算可释放空间。</p>
    <p v-if="result && (snapshot.limited || result.status !== 'completed' || result.exitCode !== 0)" class="form-hint hint-error">结果不完整：存在跳过、权限/读取错误、取消或上限。未显示不代表不存在；重复候选只覆盖成功读取内容的文件。</p>
    <p v-if="mode === 'duplicates' && result" class="form-hint">已接收 {{ snapshot.rows.length }} 个完整文件摘要；不同内容的同大小文件不会合为一组。</p>
    <p v-if="snapshot.summary" class="form-hint">已遍历 {{ snapshot.summary.visited }} 项 · 跳过 {{ snapshot.summary.skipped }} 项</p>
    <p v-if="snapshot.summary?.reasons.length" class="form-hint">{{ snapshot.summary.reasons.map(scanReason).join('；') }}</p>
    <div class="scan-table"><table><thead><tr><th v-if="mode === 'duplicates'">组</th><th>文件</th><th>大小</th><th>修改时间</th></tr></thead><tbody><tr v-for="r in visible" :key="r.path"><td v-if="mode === 'duplicates'">{{ r.group }}</td><td>{{ r.name }}<details><summary>完整路径{{ r.hash ? '与 SHA-256' : '' }}</summary><p>{{ r.path }}</p><p v-if="r.hash">{{ r.hash }}</p></details></td><td>{{ formatBytes(r.bytes) }}</td><td>{{ formatDate(r.modifiedMs) }}</td></tr></tbody></table></div>
    <p v-if="result" class="form-hint">{{ rows.length }} 条{{ mode === 'duplicates' ? ` · ${groups.length} 组候选` : '' }} · 第 {{ page }} / {{ pages }} 页；这是有界实时读取，并非系统一致性快照；文件可随后变化。</p>
    <div class="action-buttons"><button class="secondary-button" :disabled="page <= 1" @click="page--">上一页</button><button class="secondary-button" :disabled="page >= pages" @click="page++">下一页</button><button class="secondary-button" :disabled="busy" @click="task.clear">清空结果</button></div>
    <p class="form-hint" role="status">{{ busy ? '只读扫描中…' : summary }}</p><p class="form-hint hint-error">{{ notice || error }}</p>
  </div>
</template>
<style scoped>
.scan-root, td { overflow-wrap: anywhere; } .scan-root { font-size: 12px; } .scan-filters { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 8px; } .scan-filters label { min-width: 0; font-size: 12px; } .scan-filters input { width: 100%; box-sizing: border-box; } fieldset { border: 1px solid #ddd; border-radius: 8px; } .scan-table { max-height: 340px; overflow: auto; } table { width: 100%; font-size: 11px; text-align: left; } td, th { padding: 6px; border-bottom: 1px solid #ddd; } details p { max-width: 360px; }
</style>
