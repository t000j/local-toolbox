<script setup lang="ts">
import { computed, ref } from 'vue'
import { trackedInvoke as invoke } from '../../app/activity'
import { open, save } from '@tauri-apps/plugin-dialog'
import { Check, ImagePlus, LoaderCircle, Minimize2, Upload } from '@lucide/vue'

type OutputFormat = 'jpeg' | 'png'
interface ImageInfo { width: number; height: number; sizeBytes: number; format: string; previewDataUrl: string }
interface CompressionPreview { width: number; height: number; inputSizeBytes: number; outputSizeBytes: number; reductionPercent: number; format: string; previewDataUrl: string }
interface CompressionResult { inputSizeBytes: number; outputSizeBytes: number; reductionPercent: number; format: string }

const inputPath = ref('')
const inputInfo = ref<ImageInfo | null>(null)
const preview = ref<CompressionPreview | null>(null)
const outputFormat = ref<OutputFormat>('jpeg')
const jpegQuality = ref(80)
const error = ref('')
const success = ref('')
const loading = ref(false)
const outputName = ref('')
const sizeDifference = computed(() => {
  if (!preview.value) return ''
  const percent = Math.abs(preview.value.reductionPercent).toFixed(1)
  return preview.value.reductionPercent > 0 ? `减少 ${percent}%` : preview.value.reductionPercent < 0 ? `增加 ${percent}%` : '体积不变'
})

function displayName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function clearPreview(): void {
  preview.value = null
  outputName.value = ''
  error.value = ''
  success.value = ''
}

async function selectImage(): Promise<void> {
  error.value = ''
  success.value = ''
  try {
    const selected = await open({
      title: '选择要压缩的图片',
      multiple: false,
      directory: false,
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tif', 'tiff'] }],
    })
    if (typeof selected !== 'string') return

    inputPath.value = selected
    inputInfo.value = null
    clearPreview()
    loading.value = true
    inputInfo.value = await invoke<ImageInfo>('inspect_image_file', { path: selected })
    outputFormat.value = inputInfo.value.format === 'JPG' ? 'jpeg' : 'png'
  } catch (cause) {
    inputPath.value = ''
    inputInfo.value = null
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    loading.value = false
  }
}

async function createPreview(): Promise<void> {
  if (!inputPath.value || !inputInfo.value) return
  error.value = ''
  success.value = ''
  loading.value = true
  try {
    preview.value = await invoke<CompressionPreview>('preview_image_compression', {
      path: inputPath.value,
      outputFormat: outputFormat.value,
      jpegQuality: jpegQuality.value,
    })
    outputName.value = ''
  } catch (cause) {
    preview.value = null
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    loading.value = false
  }
}

async function saveCompressed(): Promise<void> {
  if (!inputPath.value || !preview.value) return
  error.value = ''
  success.value = ''
  const extension = outputFormat.value === 'jpeg' ? 'jpg' : 'png'
  const defaultName = `${displayName(inputPath.value).replace(/\.[^.]*$/, '') || 'image'}-compressed.${extension}`
  loading.value = true
  try {
    const outputPath = await save({
      title: '保存压缩后的图片',
      defaultPath: defaultName,
      filters: [{ name: `${extension.toUpperCase()} 图片`, extensions: [extension] }],
    })
    if (!outputPath) return
    const result = await invoke<CompressionResult>('compress_image_file', {
      inputPath: inputPath.value,
      outputPath,
      outputFormat: outputFormat.value,
      jpegQuality: jpegQuality.value,
    })
    outputName.value = displayName(outputPath)
    success.value = `已保存 ${outputName.value} · ${formatSize(result.outputSizeBytes)}`
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="image-compression-tool">
    <div class="image-format-toolbar">
      <div class="image-format-toolbar-copy">
        <div class="image-format-icon"><Minimize2 :size="19" /></div>
        <div><strong>本机图片压缩</strong><span>JPEG 有损压缩 · PNG 无损优化</span></div>
      </div>
      <button class="secondary-button" :disabled="loading" @click="selectImage"><Upload :size="15" /> 选择图片</button>
    </div>

    <div v-if="inputPath && inputInfo" class="image-source-info">
      <span :title="inputPath">{{ displayName(inputPath) }}</span><b>{{ inputInfo.format }}</b><b>{{ inputInfo.width }} × {{ inputInfo.height }}</b><b>{{ formatSize(inputInfo.sizeBytes) }}</b>
    </div>

    <div class="image-format-preview-grid">
      <section class="image-format-preview-card">
        <div class="field-heading"><label>原图</label><span v-if="inputInfo" class="field-suffix">{{ formatSize(inputInfo.sizeBytes) }}</span></div>
        <div v-if="inputInfo" class="image-format-preview-frame"><img :src="inputInfo.previewDataUrl" :alt="displayName(inputPath)" /></div>
        <div v-else class="image-format-empty"><LoaderCircle v-if="loading" class="spin-icon" :size="21" /><ImagePlus v-else :size="23" /><span>{{ loading ? '正在读取图片…' : '选择图片后显示预览' }}</span></div>
      </section>
      <section class="image-format-preview-card">
        <div class="field-heading"><label>压缩预览</label><span v-if="preview" class="field-suffix">{{ formatSize(preview.outputSizeBytes) }}</span></div>
        <div v-if="preview" class="image-format-preview-frame"><img :src="preview.previewDataUrl" alt="压缩后的图片预览" /></div>
        <div v-else class="image-format-empty"><ImagePlus :size="23" /><span>生成预览后比较压缩效果</span></div>
      </section>
    </div>

    <section class="image-format-options">
      <label class="algorithm-select">
        <span>压缩方式</span>
        <select v-model="outputFormat" :disabled="loading" @change="clearPreview">
          <option value="jpeg">JPEG 有损压缩</option><option value="png">PNG 无损优化</option>
        </select>
      </label>
      <label v-if="outputFormat === 'jpeg'" class="image-quality-control">
        <span>JPEG 质量</span><input v-model.number="jpegQuality" type="range" min="40" max="95" step="5" :disabled="loading" @input="clearPreview" /><b>{{ jpegQuality }}%</b>
      </label>
      <button class="secondary-button" :disabled="!inputInfo || loading" @click="createPreview"><LoaderCircle v-if="loading" class="spin-icon" :size="14" /><Minimize2 v-else :size="14" /> 生成压缩预览</button>
      <button v-if="preview" class="primary-button" :disabled="loading" @click="saveCompressed"><LoaderCircle v-if="loading" class="spin-icon" :size="14" /> 保存压缩图</button>
    </section>

    <div v-if="preview" class="compression-size-summary" :class="{ 'compression-larger': preview.reductionPercent < 0 }">
      <span>{{ formatSize(preview.inputSizeBytes) }} <b>→</b> {{ formatSize(preview.outputSizeBytes) }}</span>
      <strong>{{ sizeDifference }}</strong>
    </div>
    <p v-if="error" class="image-format-message image-format-error">{{ error }}</p>
    <p v-else-if="success" class="image-format-message"><Check :size="13" /> {{ success }}</p>
    <p v-else class="image-format-message">先预览文件大小和画质，再另存新文件；PNG 无损优化不保证体积变小。动画 GIF / WebP 会转为静态图，EXIF 等元数据不复制。</p>
  </div>
</template>
