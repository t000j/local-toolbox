<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { open } from '@tauri-apps/plugin-dialog'
import { useWorkerTask } from '../useWorkerTask'
import { useNativeDiagnostic } from '../useNativeDiagnostic'
import { directoryZipInputs, MAX_ZIP_BYTES, MAX_ZIP_FILES, MAX_ZIP_OUTPUT, validZipName, type ZipRequest, type ZipResult } from '../zipArchive'
import { saveBinaryOutput } from '../binaryExport'
const mode = ref<'browse' | 'create'>('browse'), createSource = ref<'files' | 'directory'>('files')
const archive = shallowRef<File | null>(null), files = shallowRef<File[]>([]), sourceDirectory = ref(''), destination = ref(''), folderName = ref('extracted')
const selected = ref(-1), page = ref(0), saving = ref(false), choosing = ref(false), confirmed = ref(false), notice = ref('')
const native = useNativeDiagnostic()
const { result, error, busy, reset, cancel, run } = useWorkerTask<ZipRequest, ZipResult>(
  () => new Worker(new URL('../zipArchive.worker.ts', import.meta.url), { type: 'module' }), 15_000,
)
let disposed = false, revision = 0, nativeKind: 'read' | 'write' | null = null
const locked = computed(() => busy.value || saving.value || choosing.value || native.busy.value)
const entries = computed(() => result.value?.entries ?? [])
const visible = computed(() => entries.value.slice(page.value * 25, page.value * 25 + 25))
const treeBytes = computed(() => result.value?.tree?.reduce((sum, entry) => sum + entry.size, 0) ?? 0)
const treeReady = computed(() => !!result.value?.tree && !!destination.value && !!folderName.value && validZipName(folderName.value) && !folderName.value.includes('/'))
const outputPath = computed(() => destination.value ? `${destination.value.replace(/[\\/]$/u, '')}\\${folderName.value}` : '')
function clear() { revision++; reset(); native.clear(); selected.value = -1; page.value = 0; confirmed.value = false; notice.value = '' }
watch([mode, createSource], clear, { flush: 'sync' })
watch([destination, folderName], () => { confirmed.value = false; notice.value = '' }, { flush: 'sync' })
function choose(event: Event) {
  if (locked.value || disposed) return
  const element = event.target as HTMLInputElement, chosen = Array.from(element.files ?? [])
  element.value = ''; clear(); archive.value = null; files.value = []
  if (mode.value === 'browse') {
    if (chosen[0]?.size > MAX_ZIP_BYTES) { error.value = 'ZIP 最多 32 MiB。'; return }
    archive.value = chosen[0] ?? null
  } else {
    if (chosen.length > MAX_ZIP_FILES || chosen.reduce((sum, file) => sum + file.size, 0) > MAX_ZIP_OUTPUT) { error.value = '最多 200 个文件，合计 16 MiB。'; return }
    files.value = chosen
  }
}
async function chooseDirectory(kind: 'source' | 'destination') {
  if (locked.value || disposed) return
  choosing.value = true; const version = revision
  try {
    const path = await open({ directory: true, multiple: false, title: kind === 'source' ? '选择要打包的本地目录（保留根目录及空目录）' : '选择解压新目录的父目录（不复用已有子目录）' })
    if (disposed || version !== revision || typeof path !== 'string') return
    if (kind === 'source') { clear(); sourceDirectory.value = path }
    else destination.value = path
  } catch { if (!disposed) notice.value = '请选择 Windows 桌面版中的本地目录。' }
  finally { if (!disposed) choosing.value = false }
}
async function process() {
  if (locked.value || disposed) return
  clear(); const version = revision
  if (mode.value === 'create' && createSource.value === 'directory') {
    if (!sourceDirectory.value) return
    nativeKind = 'read'
    await native.start('read_zip_directory', { path: sourceDirectory.value })
    nativeKind = null
    if (disposed || version !== revision || !native.result.value || native.result.value.status !== 'completed' || native.result.value.exitCode !== 0) return
    try {
      const inputs = directoryZipInputs(native.result.value.output)
      native.clear(); run({ mode: 'create', files: inputs })
    } catch (cause) { error.value = String(cause); native.clear() }
  } else if (mode.value === 'create') {
    if (files.value.length) run({ mode: 'create', files: files.value.map(file => ({ name: file.name, file })) })
  } else if (archive.value) run({ mode: 'browse', file: archive.value })
}
function extract(all = false) {
  if (!archive.value || (!all && selected.value < 0) || locked.value || disposed) return
  revision++; notice.value = ''; confirmed.value = false; native.clear()
  run({ mode: all ? 'extractAll' : 'extract', file: archive.value, index: selected.value })
}
function select(index: number) {
  if (locked.value || disposed) return
  selected.value = index; notice.value = ''; confirmed.value = false; revision++
  if (result.value) result.value = { entries: result.value.entries }
}
async function saveOutput() {
  const payload = result.value
  if (!payload?.bytes || locked.value || disposed) return
  saving.value = true; notice.value = ''; const version = revision
  try {
    const saved = await saveBinaryOutput(payload.bytes, payload.name || 'extracted.bin', () => !disposed && version === revision)
    if (!disposed && version === revision && saved) notice.value = '已保存新文件；未覆盖现有文件。'
  } catch (cause) { if (!disposed) notice.value = String(cause) }
  finally { if (!disposed) saving.value = false }
}
async function saveTree() {
  const tree = result.value?.tree
  if (!tree || !treeReady.value || !confirmed.value || locked.value || disposed) return
  const version = revision, path = outputPath.value
  confirmed.value = false; notice.value = ''; nativeKind = 'write'
  await native.start('save_zip_directory', { destination: destination.value, name: folderName.value, entries: tree })
  nativeKind = null
  if (!disposed && version === revision && native.result.value) {
    const response = native.result.value
    let receipt: unknown
    try { receipt = JSON.parse(response.output) } catch { /* Invalid receipt is never success. */ }
    const saved = receipt as { outputPath?: unknown; entries?: unknown; bytes?: unknown } | null
    if (response.status === 'completed' && response.exitCode === 0 && saved && saved.outputPath === path
      && saved.entries === tree.length && saved.bytes === tree.reduce((sum, entry) => sum + entry.size, 0)) notice.value = `已校验并保存新目录：${path}。未覆盖现有文件。`
    else notice.value = `无法核验完成回执，请检查本次新目录：${path}；不要直接重复保存。`
  }
}
function stop() {
  if (native.busy.value) { if (nativeKind === 'read') revision++; void native.cancel(); return }
  revision++; cancel(); selected.value = -1; confirmed.value = false; notice.value = ''
}
onBeforeUnmount(() => { disposed = true; revision++ })
</script>
<template>
  <div class="tool-form">
    <div class="action-buttons">
      <label>模式 <select v-model="mode" :disabled="locked"><option value="browse">浏览与解压</option><option value="create">创建 ZIP</option></select></label>
      <label v-if="mode === 'create'">输入 <select v-model="createSource" :disabled="locked"><option value="files">选中文件</option><option value="directory">整个目录（含空目录）</option></select></label>
      <input v-if="mode === 'browse' || createSource === 'files'" :key="mode" type="file" :multiple="mode === 'create'" :accept="mode === 'browse' ? '.zip' : undefined"
        :disabled="locked" aria-label="选择本地 ZIP 或待打包文件" @change="choose" />
      <button v-else class="secondary-button" :disabled="locked" @click="chooseDirectory('source')">选择源目录</button>
      <button class="primary-button" :disabled="locked || (mode === 'browse' ? !archive : createSource === 'files' ? !files.length : !sourceDirectory)" @click="process">
        {{ mode === 'create' ? '读取并创建压缩包预览' : '读取 ZIP 目录' }}
      </button>
      <button v-if="busy || native.busy.value" class="secondary-button" :disabled="native.cancelling.value" @click="stop">取消</button>
    </div>
    <p class="form-hint path">{{ mode === 'browse' ? archive?.name : createSource === 'files' ? `${files.length} 个选中文件` : sourceDirectory || '未选择源目录' }}</p>
    <p class="form-hint">ZIP 最多 32 MiB / 200 项；单项展开最多 16 MiB，总大小 64 MiB，压缩比最多 200 倍。
      支持存储 / Deflate、ASCII / UTF-8 名称；拒绝加密、分卷、ZIP64、路径穿越、链接与不安全名称。计算 15 秒线程超时，可取消。</p>
    <p class="form-hint">创建合计最多 16 MiB；整个目录保留选中根目录、子目录和空目录，含目录共 200 项、16 层。目录来源通过安全句柄读取，不跟随重解析点/符号链接，拒绝硬链接。
      不保留时间、权限、所有者、备用数据流或其他元数据；高压缩比文件使用存储模式。浏览只核验结构，解压再核验大小与 CRC32。</p>
    <div v-if="entries.length" class="zip-list">
      <button v-for="(entry, index) in visible" :key="entry.name" class="secondary-button zip-entry"
        :class="{ chosen: selected === page * 25 + index }" :disabled="entry.directory || locked || mode === 'create'"
        :aria-pressed="selected === page * 25 + index" @click="select(page * 25 + index)">
        <span>{{ entry.name }}</span><span>{{ entry.directory ? '目录' : `${entry.size.toLocaleString()} 字节` }}</span>
      </button>
      <div class="action-buttons"><button :disabled="page === 0" @click="page--">上一页</button>
        <span>{{ page + 1 }} / {{ Math.max(1, Math.ceil(entries.length / 25)) }}</span>
        <button :disabled="(page + 1) * 25 >= entries.length" @click="page++">下一页</button></div>
    </div>
    <div class="action-buttons">
      <button v-if="mode === 'browse'" class="primary-button" :disabled="selected < 0 || locked" @click="extract(false)">校验并解压选中项</button>
      <button v-if="mode === 'browse'" class="primary-button" :disabled="!archive || locked" @click="extract(true)">校验整包（含空目录）</button>
      <button v-if="!result?.tree" class="primary-button" :disabled="!result?.bytes || locked" @click="saveOutput">{{ saving ? '保存中…' : '选择新文件保存位置' }}</button>
    </div>
    <p v-if="result?.bytes" class="form-hint">待保存：{{ result.name }} · {{ result.bytes.length.toLocaleString() }} 字节</p>
    <fieldset v-if="result?.tree" :disabled="locked">
      <legend>整包新建目录</legend>
      <p class="form-hint">已全部校验：{{ result.tree.length }} 项（含隐含父目录，最多 200 项）· {{ treeBytes.toLocaleString() }} 字节；不执行文件</p>
      <button class="secondary-button" @click="chooseDirectory('destination')">选择目标父目录</button>
      <label>新目录名 <input v-model="folderName" maxlength="120" aria-label="解压新目录名称" /></label>
      <p class="form-hint path">{{ outputPath || '尚未选择目标' }}</p>
      <p class="form-hint">仅在以上位置新建一棵目录树；同名文件或目录即失败，不覆盖、不合并。整包为空时也新建此目录。</p>
      <label class="form-hint"><input v-model="confirmed" type="checkbox" :disabled="!treeReady" /> 我确认将已校验的所有条目保存到以上新目录</label>
      <button class="primary-button" :disabled="!treeReady || !confirmed" @click="saveTree">确认创建新目录并解压</button>
    </fieldset>
    <p class="form-hint">目录读写仅支持 Windows 本地子目录，安全句柄逐层拒绝重解析路径，独占新建。60 秒协作时限，取消/离页在下一次 IO 返回后检查；慢设备可能延迟。
      最后保留阶段不可取消；失败尽力从叶到根清理，系统异常或崩溃可能留下部分新目录/文件，需检查所选位置。不是原子事务。
      单文件另存开始后不能撤回，离页也可能完成；之前已保存的结果保留。</p>
    <p class="form-hint" :class="{ 'hint-error': !!error || !!native.error.value }" role="status">{{ error || native.error.value || notice || (locked ? '正在本机处理…' : result ? `${entries.length} 个 ZIP 条目` : '等待选择文件') }}</p>
  </div>
</template>
<style scoped>
.zip-list { display: grid; gap: 8px; } .zip-entry { display: flex; justify-content: space-between; gap: 12px; text-align: left; }
.zip-entry span:first-child, .path { overflow-wrap: anywhere; } .chosen { outline: 2px solid var(--accent); }
input { max-width: 100%; } select { font-size: 12px; } fieldset { border: 1px solid var(--border-color, #ddd); border-radius: 8px; display: grid; gap: 8px; }
</style>
