<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowDown, ArrowUp, Check, ClipboardCopy, Plus, RotateCcw, Trash, X } from '@lucide/vue'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'

interface QueueItem { id: string; text: string; copied: boolean }

const maxItems = 50
const maxTextLength = 10000
const queue = ref<QueueItem[]>([])
const draft = ref('')
const copying = ref(false)
const confirmClear = ref(false)
const message = ref('')
const error = ref('')
const nextIndex = computed(() => queue.value.findIndex((item) => !item.copied))
const completedCount = computed(() => queue.value.filter((item) => item.copied).length)

function addItem(): void {
  error.value = ''
  message.value = ''
  if (!draft.value.trim()) { error.value = '请输入要加入队列的内容。'; return }
  if (draft.value.length > maxTextLength) { error.value = `单项内容不能超过 ${maxTextLength.toLocaleString('zh-CN')} 个字符。`; return }
  if (queue.value.length >= maxItems) { error.value = `队列最多包含 ${maxItems} 项。`; return }
  queue.value = [...queue.value, { id: crypto.randomUUID(), text: draft.value, copied: false }]
  draft.value = ''
  confirmClear.value = false
}

function moveItem(id: string, direction: -1 | 1): void {
  const index = queue.value.findIndex((item) => item.id === id)
  const target = index + direction
  if (index < 0 || target < 0 || target >= queue.value.length) return
  const next = [...queue.value]
  const item = next[index]
  next[index] = next[target]
  next[target] = item
  queue.value = next
  message.value = ''
}

function removeItem(id: string): void {
  queue.value = queue.value.filter((item) => item.id !== id)
  message.value = ''
  error.value = ''
}

async function copyNext(): Promise<void> {
  if (copying.value || nextIndex.value < 0) return
  const currentIndex = nextIndex.value
  const item = queue.value[currentIndex]
  copying.value = true
  error.value = ''
  message.value = ''
  try {
    await writeText(item.text)
    queue.value = queue.value.map((entry) => entry.id === item.id ? { ...entry, copied: true } : entry)
    message.value = `第 ${currentIndex + 1} 项已复制。请先在目标程序粘贴，再回来复制下一项。`
  } catch {
    error.value = '复制失败，请检查剪贴板权限后重试。'
  } finally {
    copying.value = false
  }
}

function restartQueue(): void {
  queue.value = queue.value.map((item) => ({ ...item, copied: false }))
  message.value = '队列已重置，可以从第一项重新开始。'
  error.value = ''
}

function clearQueue(): void {
  queue.value = []
  draft.value = ''
  confirmClear.value = false
  message.value = ''
  error.value = ''
}
</script>

<template>
  <div class="paste-queue-tool">
    <section class="paste-queue-overview">
      <div><strong>按顺序逐项复制</strong><span>复制一项后，到目标程序按 Ctrl+V 粘贴，再回来继续下一项。</span></div>
      <div class="paste-queue-progress"><strong>{{ completedCount }} / {{ queue.length }}</strong><span>已复制</span></div>
    </section>

    <section class="paste-queue-entry-form">
      <div class="field-heading"><label for="paste-queue-draft">添加队列内容</label><span>{{ draft.length.toLocaleString('zh-CN') }} / {{ maxTextLength.toLocaleString('zh-CN') }}</span></div>
      <textarea id="paste-queue-draft" v-model="draft" class="code-input paste-queue-input" :maxlength="maxTextLength" placeholder="输入一条要依次粘贴的文字…"></textarea>
      <div class="paste-queue-form-footer"><small>每项单独添加，可保留多行文本；队列最多 {{ maxItems }} 项。</small><button class="secondary-button" :disabled="queue.length >= maxItems" @click="addItem"><Plus :size="14" /> 加入队列</button></div>
    </section>

    <div class="paste-queue-controls">
      <button class="primary-button" :disabled="copying || confirmClear || nextIndex < 0" @click="copyNext"><ClipboardCopy :size="14" /> {{ copying ? '正在复制…' : nextIndex < 0 ? '队列已完成' : `复制第 ${nextIndex + 1} 项` }}</button>
      <button v-if="completedCount" class="secondary-button" :disabled="copying || confirmClear" @click="restartQueue"><RotateCcw :size="14" /> 重新开始</button>
      <button v-if="queue.length && !confirmClear" class="quiet-button" :disabled="copying" @click="confirmClear = true">清空队列</button>
      <template v-else-if="confirmClear"><span class="paste-queue-confirm-label">确定清空 {{ queue.length }} 项？</span><button class="quiet-button" @click="confirmClear = false">取消</button><button class="quiet-button paste-queue-danger" @click="clearQueue">确认清空</button></template>
    </div>

    <p v-if="error" class="inline-error">{{ error }}</p>
    <p v-else-if="message" class="paste-queue-message" role="status">{{ message }}</p>

    <div v-if="queue.length" class="paste-queue-list">
      <article v-for="(item, index) in queue" :key="item.id" class="paste-queue-card" :class="{ copied: item.copied, current: index === nextIndex }">
        <span class="paste-queue-index">{{ String(index + 1).padStart(2, '0') }}</span>
        <div class="paste-queue-content"><strong>{{ item.copied ? '已复制' : index === nextIndex ? '下一项' : '待复制' }}</strong><pre>{{ item.text }}</pre></div>
        <div class="paste-queue-item-actions">
          <button class="quiet-button" :disabled="index === 0 || copying || confirmClear" :aria-label="`第 ${index + 1} 项上移`" @click="moveItem(item.id, -1)"><ArrowUp :size="14" /></button>
          <button class="quiet-button" :disabled="index === queue.length - 1 || copying || confirmClear" :aria-label="`第 ${index + 1} 项下移`" @click="moveItem(item.id, 1)"><ArrowDown :size="14" /></button>
          <button class="quiet-button" :disabled="copying || confirmClear" :aria-label="`移除第 ${index + 1} 项`" @click="removeItem(item.id)"><X :size="14" /></button>
        </div>
      </article>
    </div>
    <div v-else class="paste-queue-empty"><ClipboardCopy :size="22" /><strong>队列还是空的</strong><span>先添加几条文字，之后就能逐项复制。</span></div>

    <p class="paste-queue-footnote">队列只保存在当前页面内存中，离开工具页后会清空；工具不会自动粘贴到其他应用。</p>
  </div>
</template>
