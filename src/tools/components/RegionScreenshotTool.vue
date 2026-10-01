<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { trackedInvoke as invoke } from '../../app/activity'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { save } from '@tauri-apps/plugin-dialog'
import { Image as TauriImage } from '@tauri-apps/api/image'
import { writeImage } from '@tauri-apps/plugin-clipboard-manager'
import { Camera, Check, ClipboardCopy, Crop, Download, LoaderCircle, X } from '@lucide/vue'

interface Selection { x: number; y: number; width: number; height: number }
interface Point { x: number; y: number }

const appWindow = getCurrentWindow()
const maxCapturePixels = 50_000_000
const maxClipboardPixels = 12_000_000
const maxPngBytes = 64 * 1024 * 1024
const screenshotUrl = ref('')
const imageRef = ref<HTMLImageElement | null>(null)
const frameRef = ref<HTMLDivElement | null>(null)
const sourceWidth = ref(0)
const sourceHeight = ref(0)
const selection = ref<Selection | null>(null)
const dragStart = ref<Point | null>(null)
const dragging = ref(false)
const busy = ref(false)
const error = ref('')
const message = ref('')
const hasSelection = computed(() => !!selection.value && selection.value.width >= 2 && selection.value.height >= 2)
const selectionStyle = computed(() => {
  if (!selection.value || !sourceWidth.value || !sourceHeight.value) return {}
  return {
    left: `${selection.value.x / sourceWidth.value * 100}%`,
    top: `${selection.value.y / sourceHeight.value * 100}%`,
    width: `${selection.value.width / sourceWidth.value * 100}%`,
    height: `${selection.value.height / sourceHeight.value * 100}%`,
  }
})
const selectionLabel = computed(() => hasSelection.value && selection.value ? `${Math.round(selection.value.width)} × ${Math.round(selection.value.height)} 像素` : '拖动鼠标框选区域')

function releaseScreenshot(): void {
  if (screenshotUrl.value) URL.revokeObjectURL(screenshotUrl.value)
  screenshotUrl.value = ''
  sourceWidth.value = 0
  sourceHeight.value = 0
  selection.value = null
  dragStart.value = null
  dragging.value = false
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

async function captureScreen(): Promise<void> {
  if (busy.value) return
  error.value = ''
  message.value = ''
  if (!navigator.mediaDevices?.getDisplayMedia) {
    error.value = '当前 WebView 不支持屏幕捕获，请更新 Microsoft Edge WebView2 Runtime。'
    return
  }

  let stream: MediaStream | null = null
  let hidden = false
  const video = document.createElement('video')
  busy.value = true
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
    video.muted = true
    video.srcObject = stream
    await video.play()
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      await new Promise<void>((resolve, reject) => {
        video.addEventListener('loadeddata', () => resolve(), { once: true })
        video.addEventListener('error', () => reject(new Error('无法读取屏幕画面。')), { once: true })
      })
    }
    await appWindow.hide()
    hidden = true
    await wait(260)
    const width = video.videoWidth
    const height = video.videoHeight
    if (!width || !height) throw new Error('未能获取屏幕画面尺寸。')
    if (width * height > maxCapturePixels) throw new Error('当前屏幕画面过大，最多支持 5,000 万像素。')
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('无法创建截图画布。')
    context.drawImage(video, 0, 0, width, height)
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('生成截图失败。')), 'image/png'))
    releaseScreenshot()
    screenshotUrl.value = URL.createObjectURL(blob)
    sourceWidth.value = width
    sourceHeight.value = height
    message.value = `已截取 ${width} × ${height} 画面，请拖动鼠标框选要保留的区域。`
  } catch (cause) {
    const name = cause instanceof DOMException ? cause.name : ''
    if (name === 'AbortError' || name === 'NotAllowedError') message.value = '已取消屏幕选择。'
    else error.value = cause instanceof Error ? cause.message : '屏幕捕获失败，请重试。'
  } finally {
    stream?.getTracks().forEach((track) => track.stop())
    video.srcObject = null
    if (hidden) {
      try { await appWindow.show() } catch { error.value = '截图已处理，但窗口未能自动恢复显示。' }
    }
    busy.value = false
  }
}

function pointerPosition(event: PointerEvent): Point | null {
  const image = imageRef.value
  if (!image || !sourceWidth.value || !sourceHeight.value) return null
  const bounds = image.getBoundingClientRect()
  if (!bounds.width || !bounds.height) return null
  const x = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))
  const y = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height))
  return { x: x * sourceWidth.value, y: y * sourceHeight.value }
}

function updateSelection(event: PointerEvent): void {
  if (!dragStart.value) return
  const point = pointerPosition(event)
  if (!point) return
  selection.value = {
    x: Math.min(dragStart.value.x, point.x),
    y: Math.min(dragStart.value.y, point.y),
    width: Math.abs(point.x - dragStart.value.x),
    height: Math.abs(point.y - dragStart.value.y),
  }
}

function beginSelection(event: PointerEvent): void {
  if (busy.value) return
  const point = pointerPosition(event)
  if (!point) return
  event.preventDefault()
  frameRef.value?.setPointerCapture(event.pointerId)
  dragStart.value = point
  selection.value = { x: point.x, y: point.y, width: 0, height: 0 }
  dragging.value = true
  error.value = ''
  message.value = ''
}

function finishSelection(event: PointerEvent): void {
  if (!dragging.value) return
  updateSelection(event)
  dragging.value = false
  dragStart.value = null
  if (!hasSelection.value) {
    selection.value = null
    error.value = '框选区域太小，请重新拖动选择。'
  }
}

async function createCropBlob(): Promise<Blob> {
  const image = imageRef.value
  const region = selection.value
  if (!image || !region || !hasSelection.value) throw new Error('请先框选要保留的区域。')
  const left = Math.max(0, Math.min(sourceWidth.value - 1, Math.round(region.x)))
  const top = Math.max(0, Math.min(sourceHeight.value - 1, Math.round(region.y)))
  const right = Math.max(left + 1, Math.min(sourceWidth.value, Math.round(region.x + region.width)))
  const bottom = Math.max(top + 1, Math.min(sourceHeight.value, Math.round(region.y + region.height)))
  const width = right - left
  const height = bottom - top
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法裁切所选区域。')
  context.drawImage(image, left, top, width, height, 0, 0, width, height)
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('生成区域截图失败。')), 'image/png'))
}

async function copySelection(): Promise<void> {
  if (busy.value || !hasSelection.value) return
  busy.value = true
  error.value = ''
  message.value = ''
  let bitmap: ImageBitmap | null = null
  let image: TauriImage | null = null
  try {
    if (selection.value && selection.value.width * selection.value.height > maxClipboardPixels) throw new Error('复制到剪贴板最多支持 1,200 万像素；可以改为保存 PNG。')
    const blob = await createCropBlob()
    bitmap = await createImageBitmap(blob)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('无法读取裁切后的截图。')
    context.drawImage(bitmap, 0, 0)
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
    image = await TauriImage.new(new Uint8Array(pixels), canvas.width, canvas.height)
    await writeImage(image)
    message.value = `已复制所选区域（${canvas.width} × ${canvas.height}），可以粘贴到其他应用。`
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '复制截图失败，请检查剪贴板权限。'
  } finally {
    bitmap?.close()
    if (image) await image.close().catch(() => undefined)
    busy.value = false
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result.slice(reader.result.indexOf(',') + 1)) : reject(new Error('无法读取截图数据。'))
    reader.onerror = () => reject(new Error('无法读取截图数据。'))
    reader.readAsDataURL(blob)
  })
}

async function saveSelection(): Promise<void> {
  if (busy.value || !hasSelection.value) return
  error.value = ''
  message.value = ''
  busy.value = true
  try {
    const outputPath = await save({
      title: '保存区域截图（新文件，不覆盖）',
      defaultPath: `区域截图-${new Date().toISOString().replace(/[:.]/g, '-')}.png`,
      filters: [{ name: 'PNG 图片', extensions: ['png'] }],
    })
    if (!outputPath) return
    const blob = await createCropBlob()
    if (blob.size > maxPngBytes) throw new Error('截图超过 64 MB 保存上限，请缩小框选区域。')
    const pngBase64 = await blobToBase64(blob)
    await invoke('save_screenshot_png', { outputPath, pngBase64 })
    message.value = `截图已保存到 ${outputPath}`
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '保存截图失败。'
  } finally {
    busy.value = false
  }
}

function clearScreenshot(): void {
  releaseScreenshot()
  error.value = ''
  message.value = ''
}

onBeforeUnmount(releaseScreenshot)
</script>

<template>
  <div class="region-screenshot-tool">
    <section class="region-screenshot-toolbar">
      <div class="region-screenshot-heading"><span><Camera :size="18" /></span><div><strong>本机区域截图</strong><small>选择屏幕或窗口后，在画面上拖动框选；请勿选择本工具窗口。</small></div></div>
      <div class="region-screenshot-toolbar-actions">
        <button class="secondary-button" :disabled="busy" @click="captureScreen"><LoaderCircle v-if="busy" class="spin-icon" :size="14" /><Camera v-else :size="14" /> {{ busy ? '处理中…' : screenshotUrl ? '重新截图' : '选择屏幕并截图' }}</button>
        <button v-if="screenshotUrl" class="quiet-button" :disabled="busy" aria-label="清除截图" @click="clearScreenshot"><X :size="14" /></button>
      </div>
    </section>

    <div v-if="screenshotUrl" class="region-screenshot-stage">
      <div class="region-screenshot-stage-heading"><span>{{ selectionLabel }}</span><small v-if="sourceWidth">画面 {{ sourceWidth }} × {{ sourceHeight }}</small></div>
      <div class="region-screenshot-scroll">
        <div ref="frameRef" class="region-screenshot-frame" @pointerdown="beginSelection" @pointermove="updateSelection" @pointerup="finishSelection" @pointercancel="finishSelection">
          <img ref="imageRef" :src="screenshotUrl" alt="待裁切的屏幕截图" draggable="false" />
          <div v-if="selection" class="region-screenshot-selection" :class="{ dragging }" :style="selectionStyle"></div>
        </div>
      </div>
    </div>
    <div v-else class="region-screenshot-empty"><Crop :size="24" /><strong>先选择要捕获的屏幕或窗口</strong><span>捕获时工具窗口会短暂隐藏，画面只在本机处理。</span></div>

    <div class="region-screenshot-actions">
      <button class="primary-button" :disabled="busy || !hasSelection" @click="copySelection"><ClipboardCopy :size="14" /> 复制所选区域</button>
      <button class="secondary-button" :disabled="busy || !hasSelection" @click="saveSelection"><Download :size="14" /> 另存新 PNG</button>
      <span v-if="hasSelection" class="region-screenshot-size"><Check :size="13" /> {{ selectionLabel }}</span>
    </div>
    <p v-if="error" class="inline-error">{{ error }}</p>
    <p v-else-if="message" class="region-screenshot-message" role="status">{{ message }}</p>
    <p class="region-screenshot-footnote">每次截图前都需在 WebView2 屏幕选择器中确认；截图仅在本机处理，不会上传。复制后可粘贴到其他应用。保存请选择本地子目录中的新文件；不覆盖已有文件，不支持盘符根目录或网络路径。</p>
  </div>
</template>
