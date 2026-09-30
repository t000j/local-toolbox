<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { open, save } from '@tauri-apps/plugin-dialog'
import { useNativeDiagnostic } from '../useNativeDiagnostic'
import { chunkBytes, partPrefix, parsePartsOutcome } from '../fileParts'
import { formatBytes } from '../nativeTools'
const task = useNativeDiagnostic(), { busy, cancelling, error, result, summary } = task
const mode = ref<'split' | 'merge'>('split'), source = ref(''), destination = ref(''), manifest = ref(''), output = ref(''), prefix = ref('split'), size = ref(16), choosing = ref(false), confirmed = ref(false), notice = ref('')
let disposed = false
const outcome = computed(() => parsePartsOutcome(result.value?.output ?? ''))
const ready = computed(() => mode.value === 'split' ? !!source.value && !!destination.value : !!manifest.value && !!output.value)
function invalidate() { if (busy.value) return; task.clear(); confirmed.value = false; notice.value = '' }
watch([mode, source, destination, manifest, output, prefix, size], invalidate, { flush: 'sync' })
async function choose(kind: 'source' | 'destination' | 'manifest' | 'output') {
  if (busy.value || choosing.value || disposed) return
  choosing.value = true; notice.value = ''
  try {
    const path = kind === 'output' ? await save({ title: '选择合并输出新文件（拒绝覆盖）', defaultPath: 'merged.bin' })
      : await open({ directory: kind === 'destination', multiple: false, title: kind === 'source' ? '选择要分割的普通文件' : kind === 'destination' ? '选择分块与清单的本地输出目录' : '选择工具箱生成的 manifest.json 清单', ...(kind === 'manifest' ? { filters: [{ name: '分割清单', extensions: ['json'] }] } : {}) })
    if (!disposed && typeof path === 'string') ({ source, destination, manifest, output })[kind].value = path
  } catch { if (!disposed) notice.value = '请在 Windows 桌面版选择路径' }
  finally { if (!disposed) choosing.value = false }
}
async function run() {
  if (busy.value || choosing.value || !confirmed.value || !ready.value || disposed) return
  notice.value = ''
  try {
    const request = mode.value === 'split' ? { mode: 'split', source: source.value, destination: destination.value, prefix: partPrefix(prefix.value), chunkBytes: chunkBytes(size.value) }
      : { mode: 'merge', manifest: manifest.value, output: output.value }
    confirmed.value = false
    await task.start('run_file_parts', { request })
  } catch (cause) { notice.value = cause instanceof Error ? cause.message : '参数无效' }
}
onBeforeUnmount(() => { disposed = true })
</script>
<template>
  <div class="tool-form">
    <p class="form-hint">本地二进制流式分割/合并；保留原文件。只使用明确选择的输入和输出，拒绝网络路径、链接/重解析点与已存在的输出。分割后需保留 JSON 清单和全部分块，合并只接受本工具版本 1 清单。</p>
    <fieldset :disabled="busy || choosing"><legend>操作</legend><label><input v-model="mode" type="radio" value="split" /> 分割</label> <label><input v-model="mode" type="radio" value="merge" /> 合并</label></fieldset>
    <div v-if="mode === 'split'">
      <div class="action-buttons"><button class="secondary-button" :disabled="busy || choosing" @click="choose('source')">选择源文件</button><button class="secondary-button" :disabled="busy || choosing" @click="choose('destination')">选择输出目录</button></div>
      <p class="parts-path">源：{{ source || '尚未选择' }}<br />输出目录：{{ destination || '尚未选择' }}</p>
      <div class="parts-options"><label>每块 MiB（1–64）<input v-model.number="size" type="number" min="1" max="64" step="1" class="native-input" :disabled="busy || choosing" /></label><label>输出前缀<input v-model="prefix" maxlength="64" class="native-input" :disabled="busy || choosing" /></label></div>
      <p class="form-hint">新建 {{ prefix || '前缀' }}.part00001.bin 等分块及 {{ prefix || '前缀' }}.manifest.json；同名即停止，不覆盖。空文件生成一个空分块。</p>
    </div>
    <div v-else><div class="action-buttons"><button class="secondary-button" :disabled="busy || choosing" @click="choose('manifest')">选择分割清单</button><button class="secondary-button" :disabled="busy || choosing" @click="choose('output')">选择合并输出</button></div><p class="parts-path">清单：{{ manifest || '尚未选择' }}<br />输出：{{ output || '尚未选择' }}</p><p class="form-hint">仅读取清单所在目录中的精确有序分块，逐块检查大小及 SHA-256，核验合并总哈希并回读输出。缺失、乱序、损坏、格式错误或输出冲突时取消保存；不要使用不可信清单，校验和不提供来源认证。</p></div>
    <p class="form-hint">源文件/合并总量最多 512 MiB、512 块、清单 256 KiB；256 KiB 缓冲，120 秒协作时限。取消/离页在下一次 IO 返回后检查，慢设备可能延迟。最终提交阶段不可中断；失败清理未提交输出，系统/磁盘异常或崩溃仍可能留空文件或已完成分块，请检查本次输出。</p>
    <label class="form-hint"><input v-model="confirmed" type="checkbox" :disabled="busy || choosing || !ready" /> 我确认以上输入、输出及新文件创建；现有文件保持不变</label>
    <div class="action-buttons"><button class="primary-button" :disabled="busy || choosing || !ready || !confirmed" @click="run">{{ mode === 'split' ? '确认分割' : '确认合并' }}</button><button v-if="busy" class="secondary-button" :disabled="cancelling" @click="task.cancel">取消</button><button class="secondary-button" :disabled="busy || choosing" @click="invalidate">清空结果</button></div>
    <p v-if="outcome" class="parts-path">已完成 {{ outcome.mode === 'split' ? '分割' : '合并' }}：{{ formatBytes(outcome.bytes) }} · {{ outcome.partCount }} 块<br />{{ outcome.outputPath }}<br />SHA-256：{{ outcome.sha256 }}</p>
    <p v-else-if="result" class="form-hint hint-error">无法解析完成回执，请检查所选输出位置</p>
    <p class="form-hint" role="status">{{ busy ? '二进制流式处理中…' : summary }}</p><p class="form-hint hint-error">{{ notice || error }}</p>
  </div>
</template>
<style scoped>.parts-path { font-size: 12px; overflow-wrap: anywhere; } .parts-options { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; } .parts-options label { min-width: 0; font-size: 12px; } .parts-options input { width: 100%; box-sizing: border-box; } fieldset { border: 1px solid #ddd; border-radius: 8px; }</style>
