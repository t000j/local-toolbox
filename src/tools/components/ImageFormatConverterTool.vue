<script setup lang="ts">
import { computed, ref } from 'vue'
import { trackedInvoke as invoke } from '../../app/activity'
import { open, save } from '@tauri-apps/plugin-dialog'
import { Check, ImagePlus, LoaderCircle, Sparkles, Upload } from '@lucide/vue'

type ImageFormat = 'png' | 'jpeg' | 'gif' | 'webp' | 'bmp' | 'tiff'
interface ImageInfo { width: number; height: number; sizeBytes: number; format: string; previewDataUrl: string }
interface ConversionResult { width: number; height: number; sizeBytes: number; format: string }
const formats: { value: ImageFormat; label: string; extension: string }[] = [
  { value: 'png', label: 'PNG', extension: 'png' },
  { value: 'jpeg', label: 'JPG', extension: 'jpg' },
  { value: 'gif', label: 'GIF（静态）', extension: 'gif' },
  { value: 'webp', label: 'WebP（无损）', extension: 'webp' },
  { value: 'bmp', label: 'BMP', extension: 'bmp' },
  { value: 'tiff', label: 'TIFF', extension: 'tif' },
]

const inputPath = ref('')
const inputInfo = ref<ImageInfo | null>(null)
const outputInfo = ref<ImageInfo | null>(null)
const outputName = ref('')
const outputFormat = ref<ImageFormat>('png')
const jpegQuality = ref(90)
const error = ref('')
const success = ref('')
const loading = ref(false)
const selectedFormat = computed(() => formats.find((format) => format.value === outputFormat.value) ?? formats[0])

function displayName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

function clearOutput(): void {
  outputInfo.value = null
  outputName.value = ''
  error.value = ''
  success.value = ''
}

async function selectImage(): Promise<void> {
  error.value = ''
  success.value = ''
  try {
    const selected = await open({
      title: '选择要转换的图片',
      multiple: false,
      directory: false,
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tif', 'tiff'] }],
    })
    if (typeof selected !== 'string') return

    inputPath.value = selected
    inputInfo.value = null
    clearOutput()
    loading.value = true
    inputInfo.value = await invoke<ImageInfo>('inspect_image_file', { path: selected })
  } catch (cause) {
    inputPath.value = ''
    inputInfo.value = null
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

async function convertAndSave(): Promise<void> {
  if (!inputPath.value || !inputInfo.value) return
  error.value = ''
  success.value = ''
  const defaultName = `${displayName(inputPath.value).replace(/\.[^.]*$/, '') || 'image'}-converted.${selectedFormat.value.extension}`
  try {
    const outputPath = await save({
      title: '保存转换后的图片',
      defaultPath: defaultName,
      filters: [{ name: `${selectedFormat.value.label} 图片`, extensions: [selectedFormat.value.extension] }],
    })
    if (!outputPath) return

    loading.value = true
    const result = await invoke<ConversionResult>('convert_image_file', {
      inputPath: inputPath.value,
      outputPath,
      format: outputFormat.value,
      jpegQuality: jpegQuality.value,
    })
    outputName.value = displayName(outputPath)
    success.value = `已保存 ${outputName.value} · ${formatSize(result.sizeBytes)}`
    try {
      outputInfo.value = await invoke<ImageInfo>('inspect_image_file', { path: outputPath })
    } catch {
      outputInfo.value = null
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    loading.value = false
  }
}
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

    <p v-if="error" class="image-format-message image-format-error">{{ error }}</p>
    <p v-else-if="success" class="image-format-message"><Check :size="13" /> {{ success }}</p>
    <p v-else class="image-format-message">转换在本机完成，不覆盖现有文件；JPEG 透明区域填白，动画 GIF / WebP 转换为静态图，EXIF 等元数据不复制。</p>
  </div>
</template>
