<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useWorkerTask } from '../useWorkerTask'
import { MAX_ZIP_BYTES, MAX_ZIP_FILES, MAX_ZIP_OUTPUT, type ZipRequest, type ZipResult } from '../zipArchive'
import { saveBinaryOutput } from '../binaryExport'
const mode = ref<'browse' | 'create'>('browse'), archive = shallowRef<File | null>(null), files = shallowRef<File[]>([])
const selected = ref(-1), page = ref(0), saving = ref(false), notice = ref('')
const { result, error, busy, reset, cancel, run } = useWorkerTask<ZipRequest, ZipResult>(
  () => new Worker(new URL('../zipArchive.worker.ts', import.meta.url), { type: 'module' }), 15_000,
)
let disposed = false, revision = 0
const entries = computed(() => result.value?.entries ?? [])
const visible = computed(() => entries.value.slice(page.value * 25, page.value * 25 + 25))
function clear() { revision++; reset(); selected.value = -1; page.value = 0; notice.value = '' }
watch(mode, clear, { flush: 'sync' })
function choose(event: Event) {
  const element = event.target as HTMLInputElement, chosen = Array.from(element.files ?? [])
  element.value = ''; clear(); archive.value = null; files.value = []
  if (mode.value === 'browse') {
    if (chosen[0]?.size > MAX_ZIP_BYTES) { error.value = 'ZIP 最多 32 MiB。'; return }
    archive.value = chosen[0] ?? null
  } else {
    if (chosen.length > MAX_ZIP_FILES || chosen.reduce((sum, file) => sum + file.size, 0) > MAX_ZIP_OUTPUT) {
      error.value = '最多 200 个文件，合计 16 MiB。'; return
    }
    files.value = chosen
  }
}
function process() {
  if (busy.value || saving.value) return
  clear()
  if (mode.value === 'create') run({ mode: 'create', files: files.value.map(file => ({ name: file.name, file })) })
  else if (archive.value) run({ mode: 'browse', file: archive.value })
}
function extract() {
  if (!archive.value || selected.value < 0 || busy.value || saving.value) return
  revision++; notice.value = ''
  run({ mode: 'extract', file: archive.value, index: selected.value })
}
function select(index: number) {
  if (busy.value || saving.value) return
  selected.value = index; notice.value = ''; revision++
  // Never let an old extracted payload masquerade as the newly selected row.
  if (result.value) result.value = { entries: result.value.entries }
}
async function saveOutput() {
  const payload = result.value
  if (!payload?.bytes || saving.value || busy.value || disposed) return
  saving.value = true; notice.value = ''; const version = revision
  try {
    const saved = await saveBinaryOutput(payload.bytes, payload.name || 'extracted.bin', () => !disposed && version === revision)
    if (!disposed && version === revision && saved) notice.value = '已保存新文件；未覆盖现有文件。'
  } catch (cause) { if (!disposed) notice.value = String(cause) }
  finally { if (!disposed) saving.value = false }
}
function stop() { revision++; cancel(); selected.value = -1; notice.value = '' }
onBeforeUnmount(() => { disposed = true; revision++ })
</script>
<template>
  <div class="tool-form">
    <div class="action-buttons">
      <label>模式 <select v-model="mode" :disabled="saving"><option value="browse">浏览与逐项解压</option><option value="create">创建 ZIP</option></select></label>
      <input :key="mode" type="file" :multiple="mode === 'create'" :accept="mode === 'browse' ? '.zip' : undefined"
        :disabled="saving" aria-label="选择本地 ZIP 或待打包文件" @change="choose" />
      <button class="primary-button" :disabled="busy || saving || (mode === 'browse' ? !archive : !files.length)" @click="process">
        {{ mode === 'create' ? '创建压缩包预览' : '读取目录' }}
      </button>
      <button v-if="busy" class="secondary-button" @click="stop">取消</button>
    </div>
    <p class="form-hint">{{ mode === 'browse' ? archive?.name : `${files.length} 个选中文件` }}</p>
    <p class="form-hint">ZIP 最多 32 MiB / 200 项；单项展开最多 16 MiB，总声明大小 64 MiB，压缩比最多 200 倍。
      支持存储 / Deflate、ASCII / UTF-8 名称；拒绝加密、分卷、ZIP64、路径穿越、链接和不安全名称。15 秒线程超时，可取消。</p>
    <p class="form-hint">创建时仅打包选中文件的文件名，不递归目录，合计最多 16 MiB；高压缩比内容自动使用存储模式。
      浏览仅核验结构，解压时再核验大小与 CRC32。当前逐项解压另存，不支持整包目录恢复或空目录导出。</p>
    <div v-if="entries.length" class="zip-list">
      <button v-for="(entry, index) in visible" :key="entry.name" class="secondary-button zip-entry"
        :class="{ chosen: selected === page * 25 + index }" :disabled="entry.directory || busy || saving || mode === 'create'"
        :aria-pressed="selected === page * 25 + index" @click="select(page * 25 + index)">
        <span>{{ entry.name }}</span><span>{{ entry.directory ? '目录' : `${entry.size.toLocaleString()} 字节` }}</span>
      </button>
      <div class="action-buttons"><button :disabled="page === 0" @click="page--">上一页</button>
        <span>{{ page + 1 }} / {{ Math.max(1, Math.ceil(entries.length / 25)) }}</span>
        <button :disabled="(page + 1) * 25 >= entries.length" @click="page++">下一页</button></div>
    </div>
    <div class="action-buttons">
      <button v-if="mode === 'browse'" class="primary-button" :disabled="selected < 0 || busy || saving" @click="extract">解压并校验选中项</button>
      <button class="primary-button" :disabled="!result?.bytes || busy || saving" @click="saveOutput">{{ saving ? '保存中…' : '选择新文件保存位置' }}</button>
    </div>
    <p v-if="result?.bytes" class="form-hint">待保存：{{ result.name }} · {{ result.bytes.length.toLocaleString() }} 字节</p>
    <p class="form-hint">解压只将选中项保存到你明确选择的新文件，不使用包内路径创建目录，不执行文件。仅 Windows 桌面版支持保存；
      安全句柄拒绝目标路径中的链接/重解析点及已有文件。取消计算没有磁盘输出；保存开始后不能撤回，离页也可能完成。
      保存失败会尽力清理当前新文件，若系统拒绝清理需手动检查；之前已保存的项目保留。</p>
    <p class="form-hint" :class="{ 'hint-error': !!error }" role="status">{{ error || notice || (busy ? '正在本机处理…' : result ? `${entries.length} 个目录条目` : '等待选择文件') }}</p>
  </div>
</template>
<style scoped>
.zip-list { display: grid; gap: 8px; } .zip-entry { display: flex; justify-content: space-between; gap: 12px; text-align: left; }
.zip-entry span:first-child { overflow-wrap: anywhere; } .chosen { outline: 2px solid var(--accent); }
input { max-width: 100%; } select { font-size: 12px; }
</style>
