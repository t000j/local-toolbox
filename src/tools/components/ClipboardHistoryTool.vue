<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Image as TauriImage } from '@tauri-apps/api/image'
import { readImage, readText, writeImage, writeText } from '@tauri-apps/plugin-clipboard-manager'
import { Check, Clock, Copy, Image as ImageIcon, Pause, Play, Search, X } from '@lucide/vue'
import {
  clearClipboardEntries,
  deleteClipboardEntries,
  putClipboardEntry,
  readClipboardEntries,
  type ClipboardHistoryEntry,
} from '../clipboardHistoryStore'

type ContentFilter = 'all' | 'text' | 'image'
const maxItems = ref(readLimit())
const entries = ref<ClipboardHistoryEntry[]>([])
const imageUrls = ref<Record<string, string>>({})
const query = ref('')
const filter = ref<ContentFilter>('all')
const captureEnabled = ref(false)
const confirmClear = ref(false)
const copiedId = ref('')
const captureNotice = ref('')
const storageError = ref('')
const loading = ref(true)
const filteredEntries = computed(() => {
  const term = query.value.trim().toLocaleLowerCase()
  return entries.value.filter((entry) => {
    const matchesType = filter.value === 'all' || entry.kind === filter.value
    const matchesQuery = !term || (entry.kind === 'text' ? entry.text?.toLocaleLowerCase().includes(term) : '图片 image'.includes(term))
    return matchesType && matchesQuery
  })
})

const maxTextBytes = 512 * 1024
const maxImageBytes = 8 * 1024 * 1024
const maxImagePixels = 12_000_000
const maxHistoryBytes = 64 * 1024 * 1024
let pollTimer: number | null = null
let isPolling = false
let entrySequence = 0
let lastSkippedImageFingerprint = ''

function readLimit(): number {
  try {
    const stored = Number(localStorage.getItem('toolbox:clipboard-history-limit:v1'))
    return [20, 50, 100].includes(stored) ? stored : 50
  } catch {
    return 50
  }
}

function entryFingerprint(text: string): string {
  let hash = 2166136261
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619)
  return `text:${text.length}:${hash >>> 0}`
}

function imageFingerprint(bytes: Uint8Array, width: number, height: number): string {
  let hash = 2166136261
  const pixelCount = Math.min(width * height, Math.ceil(bytes.length / 4))
  const stride = Math.max(1, Math.floor(pixelCount / 4096))
  for (let pixel = 0; pixel < pixelCount; pixel += stride) {
    const offset = pixel * 4
    for (let channel = 0; channel < 4; channel++) hash = Math.imul(hash ^ bytes[offset + channel], 16777619)
  }
  return `image:${width}x${height}:${hash >>> 0}`
}

function getEntryBytes(entry: ClipboardHistoryEntry): number {
  return entry.kind === 'text' ? entry.sizeBytes : entry.imageBlob?.size ?? entry.sizeBytes
}

function trimToLimits(items: ClipboardHistoryEntry[]): { kept: ClipboardHistoryEntry[]; removed: ClipboardHistoryEntry[] } {
  const kept: ClipboardHistoryEntry[] = []
  const removed: ClipboardHistoryEntry[] = []
  let usedBytes = 0
  for (const entry of items) {
    const size = getEntryBytes(entry)
    if (kept.length >= maxItems.value || usedBytes + size > maxHistoryBytes) removed.push(entry)
    else {
      kept.push(entry)
      usedBytes += size
    }
  }
  return { kept, removed }
}

function createImageUrl(entry: ClipboardHistoryEntry): void {
  if (entry.kind !== 'image' || !entry.imageBlob || imageUrls.value[entry.id]) return
  imageUrls.value = { ...imageUrls.value, [entry.id]: URL.createObjectURL(entry.imageBlob) }
}

function releaseImageUrl(id: string): void {
  const url = imageUrls.value[id]
  if (!url) return
  URL.revokeObjectURL(url)
  const next = { ...imageUrls.value }
  delete next[id]
  imageUrls.value = next
}

function releaseAllImageUrls(): void {
  Object.values(imageUrls.value).forEach((url) => URL.revokeObjectURL(url))
  imageUrls.value = {}
}

async function pruneHistory(): Promise<void> {
  const { kept, removed } = trimToLimits(entries.value)
  if (!removed.length) return
  await deleteClipboardEntries(removed.map((entry) => entry.id))
  removed.forEach((entry) => releaseImageUrl(entry.id))
  entries.value = kept
}

async function loadHistory(): Promise<void> {
  loading.value = true
  try {
    const all = await readClipboardEntries()
    const { kept, removed } = trimToLimits(all)
    if (removed.length) await deleteClipboardEntries(removed.map((entry) => entry.id))
    entries.value = kept
    kept.forEach(createImageUrl)
  } catch {
    storageError.value = '无法读取本机剪贴板历史存储。'
  } finally {
    loading.value = false
  }
}

async function addEntry(entry: ClipboardHistoryEntry): Promise<void> {
  const latest = entries.value[0]
  if (latest?.kind === 'text' && entry.kind === 'text' && latest.text === entry.text) return
  if (latest?.kind === 'image' && entry.kind === 'image' && latest.fingerprint === entry.fingerprint) return
  const { kept, removed } = trimToLimits([entry, ...entries.value])
  if (!kept.some((item) => item.id === entry.id)) {
    captureNotice.value = '历史容量已满，当前内容未保存。'
    return
  }
  await putClipboardEntry(entry)
  if (removed.length) await deleteClipboardEntries(removed.map((item) => item.id))
  removed.forEach((item) => releaseImageUrl(item.id))
  entries.value = kept
  createImageUrl(entry)
  captureNotice.value = ''
}

function nextId(): string {
  return `${Date.now()}-${++entrySequence}`
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function blobFromRgba(bytes: Uint8Array, width: number, height: number): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法创建图片预览。')
  context.putImageData(new ImageData(new Uint8ClampedArray(bytes), width, height), 0, 0)
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('无法保存剪贴板图片。')), 'image/png'))
}

async function captureClipboard(): Promise<void> {
  if (!captureEnabled.value || isPolling) return
  isPolling = true
  try {
    let text = ''
    try { text = await readText() } catch { /* The clipboard may contain an image instead. */ }
    if (!captureEnabled.value) return
    if (text.length) {
      lastSkippedImageFingerprint = ''
      const sizeBytes = new Blob([text]).size
      if (sizeBytes > maxTextBytes) {
        captureNotice.value = '超长文本未保存（单条上限 512 KB）。'
        return
      }
      await addEntry({ id: nextId(), kind: 'text', text, createdAt: Date.now(), fingerprint: entryFingerprint(text), sizeBytes })
      return
    }

    let image: TauriImage | null = null
    try { image = await readImage() } catch { return }
    try {
      const { width, height } = await image.size()
      if (!captureEnabled.value) return
      if (!width || !height || width * height > maxImagePixels) {
        captureNotice.value = '过大的剪贴板图片未保存（最多 1,200 万像素）。'
        return
      }
      const rgba = await image.rgba()
      if (!captureEnabled.value) return
      const fingerprint = imageFingerprint(rgba, width, height)
      if (fingerprint === lastSkippedImageFingerprint) return
      if (entries.value[0]?.kind === 'image' && entries.value[0].fingerprint === fingerprint) return
      const imageBlob = await blobFromRgba(rgba, width, height)
      if (!captureEnabled.value) return
      if (imageBlob.size > maxImageBytes) {
        lastSkippedImageFingerprint = fingerprint
        captureNotice.value = '剪贴板图片超过单条保存上限 8 MB。'
        return
      }
      await addEntry({
        id: nextId(), kind: 'image', imageBlob, imageWidth: width, imageHeight: height,
        createdAt: Date.now(), fingerprint, sizeBytes: imageBlob.size,
      })
    } finally {
      await image.close()
    }
  } catch {
    captureNotice.value = '读取或保存剪贴板内容失败。'
  } finally {
    isPolling = false
  }
}

function startCapture(): void {
  if (storageError.value || captureEnabled.value) return
  captureNotice.value = ''
  captureEnabled.value = true
  void captureClipboard()
  pollTimer = window.setInterval(() => { void captureClipboard() }, 1000)
}

function pauseCapture(): void {
  captureEnabled.value = false
  if (pollTimer !== null) window.clearInterval(pollTimer)
  pollTimer = null
}

async function removeEntry(entry: ClipboardHistoryEntry): Promise<void> {
  try {
    await deleteClipboardEntries([entry.id])
    entries.value = entries.value.filter((item) => item.id !== entry.id)
    releaseImageUrl(entry.id)
  } catch {
    storageError.value = '无法删除这条本机记录。'
  }
}

async function clearHistory(): Promise<void> {
  try {
    await clearClipboardEntries()
    entries.value = []
    releaseAllImageUrls()
    confirmClear.value = false
    captureNotice.value = ''
  } catch {
    storageError.value = '无法清空本机剪贴板历史。'
  }
}

async function copyEntry(entry: ClipboardHistoryEntry): Promise<void> {
  try {
    if (entry.kind === 'text') {
      await writeText(entry.text ?? '')
    } else if (entry.imageBlob && entry.imageWidth && entry.imageHeight) {
      const bitmap = await createImageBitmap(entry.imageBlob)
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const context = canvas.getContext('2d')
      if (!context) {
        bitmap.close()
        throw new Error('无法读取保存的图片。')
      }
      context.drawImage(bitmap, 0, 0)
      bitmap.close()
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
      const image = await TauriImage.new(new Uint8Array(pixels), canvas.width, canvas.height)
      try { await writeImage(image) } finally { await image.close() }
    }
    copiedId.value = entry.id
    window.setTimeout(() => { if (copiedId.value === entry.id) copiedId.value = '' }, 1400)
  } catch {
    captureNotice.value = '无法复制这条历史记录。'
  }
}

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(timestamp)
}

watch(maxItems, (value) => {
  try { localStorage.setItem('toolbox:clipboard-history-limit:v1', String(value)) } catch { /* The current selection remains usable. */ }
  void pruneHistory().catch(() => { storageError.value = '无法按新上限整理剪贴板历史。' })
})

onMounted(() => { void loadHistory() })
onBeforeUnmount(() => {
  pauseCapture()
  releaseAllImageUrls()
})
</script>

<template>
  <div class="clipboard-history-tool">
    <section class="clipboard-history-toolbar">
      <div class="clipboard-history-status">
        <span class="clipboard-status-dot" :class="{ active: captureEnabled }"></span>
        <div><strong>{{ captureEnabled ? '正在记录剪贴板' : '剪贴板记录已关闭' }}</strong><span>{{ captureEnabled ? '仅在此工具打开且记录开启时读取' : '默认关闭，开启后只保存在本机' }}</span></div>
      </div>
      <div class="clipboard-history-controls">
        <label class="clipboard-limit-select"><span>保留</span><select v-model.number="maxItems" :disabled="loading"><option :value="20">20 条</option><option :value="50">50 条</option><option :value="100">100 条</option></select></label>
        <button v-if="captureEnabled" class="secondary-button" @click="pauseCapture"><Pause :size="14" /> 暂停</button>
        <button v-else class="primary-button" :disabled="loading || !!storageError" @click="startCapture"><Play :size="14" /> 开始记录</button>
        <button class="quiet-button" :disabled="!entries.length" @click="confirmClear = true">清空</button>
      </div>
    </section>

    <label class="clipboard-history-search"><Search :size="14" /><input v-model="query" type="search" placeholder="搜索历史文本…" aria-label="搜索剪贴板历史" /><button v-if="query" class="quiet-button" aria-label="清空搜索" @click="query = ''">×</button></label>
    <nav class="clipboard-filter-tabs" aria-label="剪贴板记录类型">
      <button :class="{ selected: filter === 'all' }" @click="filter = 'all'">全部</button>
      <button :class="{ selected: filter === 'text' }" @click="filter = 'text'">文本</button>
      <button :class="{ selected: filter === 'image' }" @click="filter = 'image'">图片</button>
    </nav>

    <p v-if="storageError" class="clipboard-history-message clipboard-history-error">{{ storageError }}</p>
    <p v-else-if="captureNotice" class="clipboard-history-message clipboard-history-warning">{{ captureNotice }}</p>

    <div v-if="loading" class="clipboard-history-empty"><span class="loading-pulse"></span> 正在读取本机历史…</div>
    <div v-else-if="filteredEntries.length" class="clipboard-history-list">
      <article v-for="entry in filteredEntries" :key="entry.id" class="clipboard-entry-card">
        <div class="clipboard-entry-content">
          <pre v-if="entry.kind === 'text'" class="clipboard-entry-text">{{ entry.text }}</pre>
          <img v-else-if="imageUrls[entry.id]" class="clipboard-entry-image" :src="imageUrls[entry.id]" :alt="`剪贴板图片 ${entry.imageWidth}×${entry.imageHeight}`" />
          <span class="clipboard-entry-meta"><ImageIcon v-if="entry.kind === 'image'" :size="12" /> {{ entry.kind === 'text' ? `${formatSize(entry.sizeBytes)} 文本` : `图片 · ${entry.imageWidth} × ${entry.imageHeight} · ${formatSize(entry.sizeBytes)}` }} · {{ formatTime(entry.createdAt) }}</span>
        </div>
        <div class="clipboard-entry-actions">
          <button class="quiet-button" :aria-label="copiedId === entry.id ? '已复制' : '复制记录'" @click="copyEntry(entry)"><Check v-if="copiedId === entry.id" :size="14" /><Copy v-else :size="14" /></button>
          <button class="quiet-button" aria-label="删除记录" @click="removeEntry(entry)"><X :size="14" /></button>
        </div>
      </article>
    </div>
    <div v-else class="clipboard-history-empty"><Copy :size="22" /><strong>{{ entries.length ? '没有匹配的记录' : '暂无剪贴板记录' }}</strong><span>{{ entries.length ? '试试更短的关键词。' : '开启记录后，复制的文本或图片会出现在这里。' }}</span></div>

    <p class="clipboard-history-footnote">仅在本工具页开启时读取。历史保存在本机 IndexedDB，不加密、不上传；敏感内容请暂停记录。超大内容会跳过，暂停不会清除已有历史。</p>

    <div v-if="confirmClear" class="clipboard-confirm-backdrop" role="presentation">
      <section class="clipboard-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="clipboard-clear-title">
        <h2 id="clipboard-clear-title">清空剪贴板历史？</h2>
        <p>将删除本机保存的 {{ entries.length }} 条记录。此操作无法撤销。</p>
        <div><button class="secondary-button" @click="confirmClear = false">取消</button><button class="primary-button" @click="clearHistory">清空历史</button></div>
      </section>
    </div>
  </div>
</template>
