<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useNativeImageTask } from '../useNativeImageTask'
import { open, save } from '@tauri-apps/plugin-dialog'
import { Check, ImagePlus, LoaderCircle, Sparkles, Upload } from '@lucide/vue'

type ImageFormat = 'png' | 'jpeg' | 'gif' | 'webp' | 'bmp' | 'tiff'
interface ImageInfo { width: number; height: number; sizeBytes: number; format: string; previewDataUrl: string; sourceHash: string }
const formats: { value: ImageFormat; label: string; extension: string }[] = [
  { value: 'png', label: 'PNG', extension: 'png' },
  { value: 'jpeg', label: 'JPG', extension: 'jpg' },
  { value: 'gif', label: 'GIF（静态）', extension: 'gif' },
  { value: 'webp', label: 'WebP（无损）', extension: 'webp' },
  { value: 'bmp', label: 'BMP', extension: 'bmp' },
  { value: 'tiff', label: 'TIFF', extension: 'tif' },
]

const inputPath = ref(''), inputInfo = ref<ImageInfo | null>(null), outputInfo = ref<ImageInfo | null>(null)
const outputName = ref(''), outputFormat = ref<ImageFormat>('png'), jpegQuality = ref(90)
const error = ref(''), success = ref('')
const task = useNativeImageTask(), loading = task.busy
const selectedFormat = computed(() => formats.find(f => f.value === outputFormat.value) ?? formats[0])
function displayName(path: string) { return path.split(/[\\/]/).pop() ?? path }
function formatSize(bytes: number) { return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB` }
function clearOutput() { outputInfo.value = null; outputName.value = ''; error.value = ''; success.value = '' }
async function selectImage() {
  const version = task.begin(); if (version === null) return
  clearOutput()
  try {
    const selected = await open({ title: '选择要转换的图片', multiple: false, directory: false,
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tif', 'tiff'] }] })
    if (!task.current(version) || typeof selected !== 'string') return
    inputPath.value = selected; inputInfo.value = null
    const result = await task.execute<ImageInfo>(version, 'inspect_image_file', { path: selected })
    if (result && task.current(version)) inputInfo.value = result
  } catch (cause) { if (task.current(version)) { inputPath.value = ''; inputInfo.value = null; error.value = String(cause) } }
  finally { task.finish(version) }
}
async function convertAndSave() {
  if (!inputPath.value || !inputInfo.value) return
  const version = task.begin(); if (version === null) return
  const input = inputPath.value, expectedHash = inputInfo.value.sourceHash, format = { ...selectedFormat.value }, quality = jpegQuality.value
  clearOutput()
  try {
    const outputPath = await save({ title: '保存转换后的图片',
      defaultPath: `${displayName(input).replace(/\.[^.]*$/, '') || 'image'}-converted.${format.extension}`,
      filters: [{ name: `${format.label} 图片`, extensions: [format.extension] }] })
    if (!outputPath || !task.current(version)) return
    const result = await task.execute<ImageInfo>(version, 'convert_image_file', {
      inputPath: input, outputPath, format: format.value, jpegQuality: quality, expectedHash })
    if (result && task.current(version)) {
      outputName.value = displayName(outputPath); outputInfo.value = result
      success.value = `已保存并回读核验 ${outputName.value} · ${formatSize(result.sizeBytes)}`
    }
  } catch (cause) { if (task.current(version)) error.value = String(cause) }
  finally { task.finish(version) }
}
async function cancel() { success.value = '已请求取消等待；已提交的保存不会撤销，请检查目标文件。'; await task.cancel() }
onBeforeUnmount(() => { inputPath.value = ''; inputInfo.value = null; outputInfo.value = null; outputName.value = ''; error.value = ''; success.value = '' })
</script>

<template>
  <div class="image-format-tool">
    <div class="image-format-toolbar">
      <div class="image-format-toolbar-copy">
        <div class="image-format-icon"><ImagePlus :size="19" /></div>
        <div><strong>本机图片转换</strong><span>PNG、JPG、GIF、WebP、BMP 和 TIFF</span></div>
      </div>
      <button class="secondary-button" :disabled="loading" @click="selectImage"><Upload :size="15" /> 选择图片</button>
    </div>

    <div v-if="inputPath && inputInfo" class="image-source-info">
      <span :title="inputPath">{{ displayName(inputPath) }}</span>
      <b>{{ inputInfo.format }}</b>
      <b>{{ inputInfo.width }} × {{ inputInfo.height }}</b>
      <b>{{ formatSize(inputInfo.sizeBytes) }}</b>
    </div>

    <div class="image-format-preview-grid">
      <section class="image-format-preview-card">
        <div class="field-heading"><label>原图</label><span v-if="inputInfo" class="field-suffix">{{ inputInfo.width }} × {{ inputInfo.height }}</span></div>
        <div v-if="inputInfo" class="image-format-preview-frame"><img :src="inputInfo.previewDataUrl" :alt="displayName(inputPath)" /></div>
        <div v-else class="image-format-empty"><LoaderCircle v-if="loading" class="spin-icon" :size="21" /><ImagePlus v-else :size="23" /><span>{{ loading ? '正在读取图片…' : '选择图片后显示预览' }}</span></div>
      </section>
      <section class="image-format-preview-card">
        <div class="field-heading"><label>转换结果</label><span v-if="outputInfo" class="field-suffix">{{ outputInfo.format }} · {{ formatSize(outputInfo.sizeBytes) }}</span></div>
        <div v-if="outputInfo" class="image-format-preview-frame"><img :src="outputInfo.previewDataUrl" :alt="outputName || '转换结果预览'" /></div>
        <div v-else class="image-format-empty"><ImagePlus :size="23" /><span>保存后显示转换结果</span></div>
      </section>
    </div>

    <section class="image-format-options">
      <label class="algorithm-select">
        <span>输出格式</span>
        <select v-model="outputFormat" :disabled="loading" @change="clearOutput">
          <option v-for="format in formats" :key="format.value" :value="format.value">{{ format.label }}</option>
        </select>
      </label>
      <label v-if="outputFormat === 'jpeg'" class="image-quality-control">
        <span>JPEG 质量</span><input v-model.number="jpegQuality" type="range" min="50" max="100" step="5" :disabled="loading" @input="clearOutput" /><b>{{ jpegQuality }}%</b>
      </label>
      <span v-if="outputFormat === 'webp'" class="image-format-lossless">WebP 使用无损编码</span>
      <div class="image-format-actions">
        <button class="primary-button" :disabled="!inputInfo || loading" @click="convertAndSave">
          <LoaderCircle v-if="loading" class="spin-icon" :size="15" /><Sparkles v-else :size="15" /> {{ loading ? '处理中…' : '转换并保存' }}
        </button>
      </div>
    </section>

    <p class="form-hint">输入最多 100 MiB / 4000 万像素 / 单边 16384，输出最多 128 MiB；60 秒协作时限，编解码可能延迟取消。安全句柄只创建新文件，拒绝网络/链接路径。选择后的原图变化会拒绝保存。</p>
    <button v-if="loading" class="secondary-button" :disabled="task.cancelling.value" @click="cancel">取消等待</button>
    <p v-if="error" class="image-format-message image-format-error">{{ error }}</p>
    <p v-else-if="success" class="image-format-message"><Check :size="13" /> {{ success }}</p>
    <p v-else class="image-format-message">转换在本机完成，不覆盖现有文件；JPEG 透明区域填白，动画 GIF / WebP 转换为静态图，EXIF 等元数据不复制。</p>
  </div>
</template>
