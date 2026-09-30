<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef } from 'vue'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import { Camera, Check, ClipboardCopy, LoaderCircle, RotateCcw, Ruler, X } from '@lucide/vue'

interface Point { x: number; y: number }
interface RulerLine { start: Point; end: Point }

const appWindow = getCurrentWindow()
const sourceBitmap = shallowRef<ImageBitmap | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const sourceWidth = ref(0)
const sourceHeight = ref(0)
const rulerLine = ref<RulerLine | null>(null)
const dragging = ref(false)
const busy = ref(false)
const copying = ref(false)
const error = ref('')
const message = ref('')
const maxCapturePixels = 50_000_000
const measurements = computed(() => {
  const line = rulerLine.value
  if (!line) return null
  const deltaX = line.end.x - line.start.x
  const deltaY = line.end.y - line.start.y
  const angle = (Math.atan2(deltaY, deltaX) * 180 / Math.PI + 360) % 360
  return { horizontal: Math.abs(deltaX), vertical: Math.abs(deltaY), distance: Math.hypot(deltaX, deltaY), angle }
})

function releaseScreen(): void {
  sourceBitmap.value?.close()
  sourceBitmap.value = null
  sourceWidth.value = 0
  sourceHeight.value = 0
  rulerLine.value = null
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
    if (!width || !height || width * height > maxCapturePixels) throw new Error('屏幕画面尺寸无效或超过 5,000 万像素。')
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('无法创建测量画面。')
    context.drawImage(video, 0, 0, width, height)
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('生成屏幕画面失败。')), 'image/png'))
    const bitmap = await createImageBitmap(blob)
    releaseScreen()
    sourceBitmap.value = bitmap
    sourceWidth.value = bitmap.width
    sourceHeight.value = bitmap.height
    await nextTick()
    drawCanvas()
    message.value = '画面已冻结，拖动鼠标即可测量像素距离。'
  } catch (cause) {
    const name = cause instanceof DOMException ? cause.name : ''
    if (name === 'AbortError' || name === 'NotAllowedError') message.value = '已取消屏幕选择。'
    else error.value = cause instanceof Error ? cause.message : '屏幕捕获失败，请重试。'
  } finally {
    stream?.getTracks().forEach((track) => track.stop())
    video.srcObject = null
    if (hidden) {
      try { await appWindow.show() } catch { error.value = '画面已捕获，但窗口未能自动恢复显示。' }
    }
    busy.value = false
  }
}

function canvasPoint(event: PointerEvent): Point | null {
  const canvas = canvasRef.value
  if (!canvas) return null
  const bounds = canvas.getBoundingClientRect()
  if (!bounds.width || !bounds.height) return null
  return {
    x: Math.max(0, Math.min(canvas.width, (event.clientX - bounds.left) * canvas.width / bounds.width)),
    y: Math.max(0, Math.min(canvas.height, (event.clientY - bounds.top) * canvas.height / bounds.height)),
  }
}

function drawCanvas(): void {
  const canvas = canvasRef.value
  const bitmap = sourceBitmap.value
  if (!canvas || !bitmap) return
  if (canvas.width !== bitmap.width) canvas.width = bitmap.width
  if (canvas.height !== bitmap.height) canvas.height = bitmap.height
  const context = canvas.getContext('2d')
  if (!context) return
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.drawImage(bitmap, 0, 0)
  const line = rulerLine.value
  if (!line) return
  context.save()
  context.strokeStyle = '#f04444'
  context.fillStyle = '#fff'
  context.lineWidth = Math.max(2, canvas.width / 1800)
  context.shadowColor = 'rgba(25, 27, 42, 0.65)'
  context.shadowBlur = Math.max(2, canvas.width / 1200)
  context.beginPath()
  context.moveTo(line.start.x, line.start.y)
  context.lineTo(line.end.x, line.end.y)
  context.stroke()
  const radius = Math.max(5, canvas.width / 900)
  for (const point of [line.start, line.end]) {
    context.beginPath()
    context.arc(point.x, point.y, radius, 0, Math.PI * 2)
    context.fill()
    context.stroke()
  }
  context.restore()
}

function startMeasure(event: PointerEvent): void {
  if (busy.value || !sourceBitmap.value || event.button !== 0) return
  const point = canvasPoint(event)
  if (!point) return
  event.preventDefault()
  canvasRef.value?.setPointerCapture(event.pointerId)
  rulerLine.value = { start: point, end: point }
  dragging.value = true
  error.value = ''
  message.value = ''
  drawCanvas()
}

function moveMeasure(event: PointerEvent): void {
  if (!dragging.value || !rulerLine.value) return
  const point = canvasPoint(event)
  if (!point) return
  rulerLine.value = { ...rulerLine.value, end: point }
  drawCanvas()
}

function finishMeasure(event: PointerEvent): void {
  if (!dragging.value) return
  moveMeasure(event)
  dragging.value = false
  if (measurements.value) {
    message.value = `测量完成：${measurements.value.distance.toFixed(1)} px`
  }
}

function clearMeasure(): void {
  rulerLine.value = null
  message.value = ''
  error.value = ''
  drawCanvas()
}

async function copyMeasurement(): Promise<void> {
  if (!measurements.value || busy.value || copying.value) return
  error.value = ''
  message.value = ''
  const result = measurements.value
  const text = `水平：${result.horizontal.toFixed(1)} px\n垂直：${result.vertical.toFixed(1)} px\n直线：${result.distance.toFixed(1)} px\n角度：${result.angle.toFixed(1)}°`
  copying.value = true
  try {
    await writeText(text)
    message.value = '测量结果已复制。'
  } catch {
    error.value = '复制失败，请检查剪贴板权限。'
  } finally {
    copying.value = false
  }
}

onBeforeUnmount(releaseScreen)
</script>

<template>
  <div class="screen-ruler-tool">
    <section class="screen-ruler-toolbar">
      <div class="screen-ruler-heading"><span><Ruler :size="18" /></span><div><strong>本机屏幕标尺</strong><small>选择屏幕或窗口，再拖动测量线的起点和终点。</small></div></div>
      <div class="screen-ruler-toolbar-actions">
        <button class="secondary-button" :disabled="busy || copying" @click="captureScreen"><LoaderCircle v-if="busy" class="spin-icon" :size="14" /><Camera v-else :size="14" /> {{ busy ? '正在捕获…' : sourceBitmap ? '重新截取' : '选择屏幕' }}</button>
        <button v-if="sourceBitmap" class="quiet-button" :disabled="busy || copying" aria-label="清除屏幕画面" @click="releaseScreen"><X :size="14" /></button>
      </div>
    </section>

    <div v-if="sourceBitmap" class="screen-ruler-stage">
      <div class="screen-ruler-stage-heading"><span>{{ dragging ? '拖动测量线…' : rulerLine ? '可拖动新测量线重新测量' : '在画面上拖动测量线' }}</span><small>{{ sourceWidth }} × {{ sourceHeight }} px</small></div>
      <div class="screen-ruler-canvas-scroll">
        <canvas ref="canvasRef" class="screen-ruler-canvas" aria-label="屏幕像素测量画面" @pointerdown="startMeasure" @pointermove="moveMeasure" @pointerup="finishMeasure" @pointercancel="finishMeasure"></canvas>
      </div>
      <div v-if="measurements" class="screen-ruler-results">
        <div><span>水平距离</span><strong>{{ measurements.horizontal.toFixed(1) }} <small>px</small></strong></div>
        <div><span>垂直距离</span><strong>{{ measurements.vertical.toFixed(1) }} <small>px</small></strong></div>
        <div class="screen-ruler-primary-result"><span>直线距离</span><strong>{{ measurements.distance.toFixed(1) }} <small>px</small></strong></div>
        <div><span>角度（向右 0°，顺时针）</span><strong>{{ measurements.angle.toFixed(1) }}<small>°</small></strong></div>
      </div>
    </div>
    <div v-else class="screen-ruler-empty"><Ruler :size="24" /><strong>先选择要测量的屏幕或窗口</strong><span>画面会冻结在本机；工具窗口会短暂隐藏。</span></div>

    <div class="screen-ruler-actions">
      <button class="primary-button" :disabled="busy || copying || !measurements" @click="copyMeasurement"><ClipboardCopy :size="14" /> {{ copying ? '正在复制…' : '复制测量结果' }}</button>
      <button v-if="rulerLine" class="secondary-button" :disabled="busy || copying" @click="clearMeasure"><RotateCcw :size="14" /> 清除测量线</button>
    </div>
    <p v-if="error" class="inline-error">{{ error }}</p>
    <p v-else-if="message" class="screen-ruler-message" role="status"><Check :size="13" /> {{ message }}</p>
    <p class="screen-ruler-footnote">结果按捕获画面的像素计算，不是厘米或 CSS 像素；适合对比屏幕元素间距，不代表实体尺寸。</p>
  </div>
</template>
