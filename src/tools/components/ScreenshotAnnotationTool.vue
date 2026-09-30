<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef } from 'vue'
import { trackedInvoke as invoke } from '../../app/activity'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { save } from '@tauri-apps/plugin-dialog'
import { Image as TauriImage } from '@tauri-apps/api/image'
import { writeImage } from '@tauri-apps/plugin-clipboard-manager'
import { ArrowUpRight, Camera, Check, ClipboardCopy, LoaderCircle, Pencil, RotateCcw, Save, Type, Upload, X } from '@lucide/vue'

interface Point { x: number; y: number }
type Annotation =
  | { id: string; kind: 'arrow'; start: Point; end: Point; color: string; width: number }
  | { id: string; kind: 'marker'; points: Point[]; color: string; width: number }
  | { id: string; kind: 'text'; point: Point; text: string; color: string; fontSize: number }
type AnnotationTool = 'arrow' | 'marker' | 'text'
type SourceAction = 'file' | 'screen' | 'clear'

const appWindow = getCurrentWindow()
const fileInput = ref<HTMLInputElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const sourceBitmap = shallowRef<ImageBitmap | null>(null)
const sourceName = ref('')
const sourceWidth = ref(0)
const sourceHeight = ref(0)
const annotations = ref<Annotation[]>([])
const selectedTool = ref<AnnotationTool>('arrow')
const color = ref('#f04444')
const lineWidth = ref(4)
const pendingTextPoint = ref<Point | null>(null)
const textDraft = ref('')
const busy = ref(false)
const error = ref('')
const message = ref('')
const pendingSourceAction = ref<SourceAction | null>(null)
const canUndo = computed(() => annotations.value.length > 0)
const maxSourceBytes = 100 * 1024 * 1024
const maxSourcePixels = 40_000_000
const maxClipboardPixels = 12_000_000
const maxPngBytes = 64 * 1024 * 1024
let isDrawing = false
let drawStart: Point | null = null
let activeEnd: Point | null = null
let activePoints: Point[] = []

function closeSource(): void {
  sourceBitmap.value?.close()
  sourceBitmap.value = null
}

async function setSource(bitmap: ImageBitmap, name: string): Promise<void> {
  closeSource()
  sourceBitmap.value = bitmap
  sourceName.value = name
  sourceWidth.value = bitmap.width
  sourceHeight.value = bitmap.height
  annotations.value = []
  pendingSourceAction.value = null
  pendingTextPoint.value = null
  textDraft.value = ''
  error.value = ''
  message.value = ''
  await nextTick()
  renderCanvas()
}

async function openImage(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  error.value = ''
  message.value = ''
  if (file.size > maxSourceBytes) { error.value = '图片文件不能超过 100 MB。'; return }
  busy.value = true
  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await createImageBitmap(file)
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > maxSourcePixels) throw new Error('图片分辨率过高，最多支持 4,000 万像素。')
    await setSource(bitmap, file.name)
    bitmap = null
    message.value = '图片已在本机打开，可以添加箭头、标记或文字。'
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '无法打开所选图片。'
  } finally {
    bitmap?.close()
    busy.value = false
  }
}

function pickFile(): void {
  fileInput.value?.click()
}

function runSourceAction(action: SourceAction): void {
  pendingSourceAction.value = null
  if (action === 'file') pickFile()
  else if (action === 'screen') void captureScreen()
  else clearSource()
}

function continueSourceAction(): void {
  if (pendingSourceAction.value) runSourceAction(pendingSourceAction.value)
}

function requestSourceAction(action: SourceAction): void {
  error.value = ''
  message.value = ''
  if (annotations.value.length || pendingTextPoint.value) pendingSourceAction.value = action
  else runSourceAction(action)
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

async function captureScreen(): Promise<void> {
  if (busy.value) return
  error.value = ''
  message.value = ''
  if (!navigator.mediaDevices?.getDisplayMedia) { error.value = '当前 WebView 不支持屏幕捕获，请更新 Microsoft Edge WebView2 Runtime。'; return }
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
    if (!width || !height || width * height > maxSourcePixels) throw new Error('屏幕画面尺寸无效或超过 4,000 万像素。')
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('无法创建截图画布。')
    context.drawImage(video, 0, 0, width, height)
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('生成截图失败。')), 'image/png'))
    await setSource(await createImageBitmap(blob), '屏幕截图')
    message.value = '截图已载入，可以添加箭头、标记或文字。'
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

function drawArrow(context: CanvasRenderingContext2D, start: Point, end: Point, stroke: string, width: number): void {
  const angle = Math.atan2(end.y - start.y, end.x - start.x)
  const head = Math.max(12, width * 4)
  context.strokeStyle = stroke
  context.fillStyle = stroke
  context.lineWidth = width
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.beginPath()
  context.moveTo(start.x, start.y)
  context.lineTo(end.x, end.y)
  context.stroke()
  context.beginPath()
  context.moveTo(end.x, end.y)
  context.lineTo(end.x - head * Math.cos(angle - Math.PI / 6), end.y - head * Math.sin(angle - Math.PI / 6))
  context.lineTo(end.x - head * Math.cos(angle + Math.PI / 6), end.y - head * Math.sin(angle + Math.PI / 6))
  context.closePath()
  context.fill()
}

function drawMarker(context: CanvasRenderingContext2D, points: Point[], stroke: string, width: number): void {
  if (!points.length) return
  context.save()
  context.globalAlpha = 0.72
  context.strokeStyle = stroke
  context.fillStyle = stroke
  context.lineWidth = width
  context.lineCap = 'round'
  context.lineJoin = 'round'
  if (points.length === 1) {
    context.beginPath()
    context.arc(points[0].x, points[0].y, width / 2, 0, Math.PI * 2)
    context.fill()
  } else {
    context.beginPath()
    context.moveTo(points[0].x, points[0].y)
    points.slice(1).forEach((point) => context.lineTo(point.x, point.y))
    context.stroke()
  }
  context.restore()
}

function drawAnnotation(context: CanvasRenderingContext2D, annotation: Annotation): void {
  if (annotation.kind === 'arrow') drawArrow(context, annotation.start, annotation.end, annotation.color, annotation.width)
  else if (annotation.kind === 'marker') drawMarker(context, annotation.points, annotation.color, annotation.width)
  else {
    context.save()
    context.font = `700 ${annotation.fontSize}px "Segoe UI", "Microsoft YaHei UI", sans-serif`
    context.lineJoin = 'round'
    context.lineWidth = Math.max(3, annotation.fontSize / 7)
    context.strokeStyle = 'rgba(20, 22, 32, 0.8)'
    context.fillStyle = annotation.color
    const maxWidth = Math.max(1, sourceWidth.value - annotation.point.x - 12)
    context.strokeText(annotation.text, annotation.point.x, annotation.point.y, maxWidth)
    context.fillText(annotation.text, annotation.point.x, annotation.point.y, maxWidth)
    context.restore()
  }
}

function renderCanvas(): void {
  const canvas = canvasRef.value
  const bitmap = sourceBitmap.value
  if (!canvas || !bitmap) return
  if (canvas.width !== bitmap.width) canvas.width = bitmap.width
  if (canvas.height !== bitmap.height) canvas.height = bitmap.height
  const context = canvas.getContext('2d')
  if (!context) return
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.drawImage(bitmap, 0, 0)
  annotations.value.forEach((annotation) => drawAnnotation(context, annotation))
  if (isDrawing && drawStart && activeEnd) {
    if (selectedTool.value === 'arrow') drawArrow(context, drawStart, activeEnd, color.value, lineWidth.value)
    else if (selectedTool.value === 'marker') drawMarker(context, activePoints, color.value, lineWidth.value)
  }
  if (pendingTextPoint.value) {
    context.save()
    context.strokeStyle = color.value
    context.lineWidth = 2
    context.beginPath()
    context.arc(pendingTextPoint.value.x, pendingTextPoint.value.y, 8, 0, Math.PI * 2)
    context.stroke()
    context.restore()
  }
}

function startDrawing(event: PointerEvent): void {
  if (busy.value || !sourceBitmap.value || event.button !== 0) return
  const point = canvasPoint(event)
  if (!point) return
  if (selectedTool.value === 'text') {
    pendingTextPoint.value = point
    textDraft.value = ''
    renderCanvas()
    return
  }
  event.preventDefault()
  canvasRef.value?.setPointerCapture(event.pointerId)
  drawStart = point
  activeEnd = point
  activePoints = [point]
  isDrawing = true
  renderCanvas()
}

function continueDrawing(event: PointerEvent): void {
  if (!isDrawing) return
  const point = canvasPoint(event)
  if (!point) return
  activeEnd = point
  if (selectedTool.value === 'marker') {
    const last = activePoints[activePoints.length - 1]
    if (last && Math.hypot(point.x - last.x, point.y - last.y) >= 2) activePoints.push(point)
  }
  renderCanvas()
}

function finishDrawing(event: PointerEvent): void {
  if (busy.value || !isDrawing || !drawStart) return
  continueDrawing(event)
  if (selectedTool.value === 'arrow' && activeEnd && Math.hypot(activeEnd.x - drawStart.x, activeEnd.y - drawStart.y) >= 4) {
    annotations.value.push({ id: crypto.randomUUID(), kind: 'arrow', start: drawStart, end: activeEnd, color: color.value, width: lineWidth.value })
  } else if (selectedTool.value === 'marker' && activePoints.length) {
    annotations.value.push({ id: crypto.randomUUID(), kind: 'marker', points: [...activePoints], color: color.value, width: lineWidth.value })
  }
  isDrawing = false
  drawStart = null
  activeEnd = null
  activePoints = []
  renderCanvas()
}

function addText(): void {
  if (busy.value) return
  const text = textDraft.value.trim()
  if (!text || !pendingTextPoint.value) return
  annotations.value.push({ id: crypto.randomUUID(), kind: 'text', point: pendingTextPoint.value, text, color: color.value, fontSize: Math.max(20, lineWidth.value * 6) })
  pendingTextPoint.value = null
  textDraft.value = ''
  renderCanvas()
}

function cancelText(): void {
  pendingTextPoint.value = null
  textDraft.value = ''
  renderCanvas()
}

function undoAnnotation(): void {
  annotations.value = annotations.value.slice(0, -1)
  renderCanvas()
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result.slice(reader.result.indexOf(',') + 1)) : reject(new Error('无法读取图片数据。'))
    reader.onerror = () => reject(new Error('无法读取图片数据。'))
    reader.readAsDataURL(blob)
  })
}

function exportBlob(): Promise<Blob> {
  const canvas = canvasRef.value
  if (!canvas || !sourceBitmap.value) throw new Error('请先打开一张图片或截取屏幕。')
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('生成标注图片失败。')), 'image/png'))
}

async function copyAnnotatedImage(): Promise<void> {
  if (busy.value || !sourceBitmap.value) return
  error.value = ''
  message.value = ''
  if (sourceWidth.value * sourceHeight.value > maxClipboardPixels) { error.value = '复制到剪贴板最多支持 1,200 万像素；可以改为保存 PNG。'; return }
  busy.value = true
  let bitmap: ImageBitmap | null = null
  let clipboardImage: TauriImage | null = null
  try {
    bitmap = await createImageBitmap(await exportBlob())
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('无法读取标注图片。')
    context.drawImage(bitmap, 0, 0)
    clipboardImage = await TauriImage.new(new Uint8Array(context.getImageData(0, 0, canvas.width, canvas.height).data), canvas.width, canvas.height)
    await writeImage(clipboardImage)
    message.value = '标注图片已复制，可以粘贴到其他应用。'
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '复制图片失败，请检查剪贴板权限。'
  } finally {
    bitmap?.close()
    if (clipboardImage) await clipboardImage.close().catch(() => undefined)
    busy.value = false
  }
}

async function saveAnnotatedImage(): Promise<void> {
  if (busy.value || !sourceBitmap.value) return
  error.value = ''
  message.value = ''
  busy.value = true
  try {
    const name = sourceName.value.replace(/\.[^.]*$/, '') || '图片'
    const suffix = new Date().toISOString().replace(/[:.]/g, '-')
    const outputPath = await save({ title: '保存截图标注', defaultPath: `${name}-标注-${suffix}.png`, filters: [{ name: 'PNG 图片', extensions: ['png'] }] })
    if (!outputPath) return
    const blob = await exportBlob()
    if (blob.size > maxPngBytes) throw new Error('标注图片超过 64 MB 保存上限。')
    await invoke('save_annotated_png', { outputPath, pngBase64: await blobToBase64(blob) })
    message.value = `标注图片已保存到 ${outputPath}`
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '保存图片失败。'
  } finally {
    busy.value = false
  }
}

function clearSource(): void {
  closeSource()
  sourceName.value = ''
  sourceWidth.value = 0
  sourceHeight.value = 0
  annotations.value = []
  pendingSourceAction.value = null
  pendingTextPoint.value = null
  error.value = ''
  message.value = ''
}

onBeforeUnmount(closeSource)
</script>

<template>
  <div class="screenshot-annotation-tool">
    <input ref="fileInput" hidden type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp" @change="openImage" />
    <section class="screenshot-annotation-toolbar">
      <div class="screenshot-annotation-heading"><span><Pencil :size="18" /></span><div><strong>本机截图标注</strong><small>打开本地图片或截取屏幕；原图不会被覆盖。</small></div></div>
      <div class="screenshot-annotation-source-actions">
        <button class="secondary-button" :disabled="busy || !!pendingSourceAction" @click="requestSourceAction('file')"><Upload :size="14" /> 打开图片</button>
        <button class="secondary-button" :disabled="busy || !!pendingSourceAction" @click="requestSourceAction('screen')"><LoaderCircle v-if="busy" class="spin-icon" :size="14" /><Camera v-else :size="14" /> {{ busy ? '处理中…' : '截取屏幕' }}</button>
        <button v-if="sourceBitmap" class="quiet-button" :disabled="busy || !!pendingSourceAction" aria-label="清除图片" @click="requestSourceAction('clear')"><X :size="14" /></button>
      </div>
    </section>

    <div v-if="pendingSourceAction" class="screenshot-annotation-confirm"><span>更换或清除图片会删除当前 {{ annotations.length + (pendingTextPoint ? 1 : 0) }} 项未保存标注。</span><button class="secondary-button" @click="pendingSourceAction = null">继续编辑</button><button class="primary-button" @click="continueSourceAction">{{ pendingSourceAction === 'clear' ? '清除图片' : '继续更换' }}</button></div>

    <div v-if="sourceBitmap" class="screenshot-annotation-editor">
      <div class="screenshot-annotation-controls">
        <div class="screenshot-annotation-tools" aria-label="标注工具">
          <button class="secondary-button" :class="{ selected: selectedTool === 'arrow' }" :disabled="busy" @click="selectedTool = 'arrow'"><ArrowUpRight :size="14" /> 箭头</button>
          <button class="secondary-button" :class="{ selected: selectedTool === 'marker' }" :disabled="busy" @click="selectedTool = 'marker'"><Pencil :size="14" /> 画笔</button>
          <button class="secondary-button" :class="{ selected: selectedTool === 'text' }" :disabled="busy" @click="selectedTool = 'text'"><Type :size="14" /> 文字</button>
        </div>
        <label class="screenshot-annotation-style"><span>颜色</span><input v-model="color" type="color" aria-label="标注颜色" :disabled="busy" /><span>{{ selectedTool === 'text' ? '文字大小' : '粗细' }}</span><input v-model.number="lineWidth" type="range" min="2" max="12" step="1" :disabled="busy" /><b>{{ lineWidth }}</b></label>
        <div class="screenshot-annotation-history"><span>{{ annotations.length }} 项标注</span><button class="quiet-button" :disabled="busy || !canUndo" @click="undoAnnotation"><RotateCcw :size="14" /> 撤销</button></div>
      </div>

      <div v-if="pendingTextPoint" class="screenshot-annotation-text-editor">
        <input v-model="textDraft" maxlength="100" placeholder="输入标注文字…" aria-label="标注文字" :disabled="busy" @keydown.enter.prevent="addText" />
        <button class="primary-button" :disabled="busy || !textDraft.trim()" @click="addText">添加文字</button>
        <button class="quiet-button" :disabled="busy" @click="cancelText">取消</button>
      </div>

      <div class="screenshot-annotation-canvas-scroll">
        <canvas ref="canvasRef" class="screenshot-annotation-canvas" :aria-label="`${sourceName} 标注画布`" @pointerdown="startDrawing" @pointermove="continueDrawing" @pointerup="finishDrawing" @pointercancel="finishDrawing"></canvas>
      </div>
      <div class="screenshot-annotation-image-info"><span :title="sourceName">{{ sourceName }}</span><span>{{ sourceWidth }} × {{ sourceHeight }}</span></div>
    </div>
    <div v-else class="screenshot-annotation-empty"><Pencil :size="23" /><strong>打开图片，或先截取屏幕</strong><span>支持 PNG、JPG、WebP、GIF、BMP；所有标注都在本机完成。</span></div>

    <div class="screenshot-annotation-export">
      <button class="primary-button" :disabled="busy || !sourceBitmap" @click="saveAnnotatedImage"><Save :size="14" /> 保存标注 PNG</button>
      <button class="secondary-button" :disabled="busy || !sourceBitmap || sourceWidth * sourceHeight > maxClipboardPixels" @click="copyAnnotatedImage"><ClipboardCopy :size="14" /> 复制图片</button>
      <span v-if="sourceBitmap && sourceWidth * sourceHeight > maxClipboardPixels">复制上限 1,200 万像素</span>
    </div>
    <p v-if="error" class="inline-error">{{ error }}</p>
    <p v-else-if="message" class="screenshot-annotation-message" role="status"><Check :size="13" /> {{ message }}</p>
    <p class="screenshot-annotation-footnote">标注会合并进导出的 PNG；另存为新文件，不覆盖输入图片。屏幕捕获需要你在选择器中选取画面，工具窗口会短暂隐藏。</p>
  </div>
</template>
