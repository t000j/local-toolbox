<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { Check, ClipboardCopy, Pencil, Plus, Search, Trash, X } from '@lucide/vue'
import { copyText } from '../clipboard'

interface TextSnippet { id: string; title: string; content: string; updatedAt: number }

const storageKey = 'toolbox:text-snippets:v1'
const maxSnippets = 100
const maxTitleLength = 80
const maxContentLength = 10000
const snippets = ref(readSnippets())
const query = ref('')
const editorOpen = ref(false)
const editingId = ref('')
const title = ref('')
const content = ref('')
const formError = ref('')
const actionError = ref('')
const pendingDeleteId = ref('')
const copiedId = ref('')
const visibleSnippets = computed(() => {
  const term = query.value.trim().toLocaleLowerCase()
  return [...snippets.value]
    .filter((snippet) => !term || `${snippet.title} ${snippet.content}`.toLocaleLowerCase().includes(term))
    .sort((left, right) => right.updatedAt - left.updatedAt)
})
let copiedTimer: number | undefined

function isSnippet(value: unknown): value is TextSnippet {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<TextSnippet>
  return typeof item.id === 'string' && typeof item.title === 'string' && typeof item.content === 'string' && typeof item.updatedAt === 'number'
}

function readSnippets(): TextSnippet[] {
  try {
    const stored = localStorage.getItem(storageKey)
    const parsed: unknown = stored ? JSON.parse(stored) : []
    return Array.isArray(parsed) ? parsed.filter(isSnippet).sort((left, right) => right.updatedAt - left.updatedAt).slice(0, maxSnippets) : []
  } catch {
    return []
  }
}

function persistSnippets(next: TextSnippet[]): boolean {
  try {
    localStorage.setItem(storageKey, JSON.stringify(next))
    snippets.value = next
    actionError.value = ''
    return true
  } catch {
    actionError.value = '本机存储失败，可能是存储空间不足；本次更改未保存。'
    return false
  }
}

function resetEditor(): void {
  editorOpen.value = false
  editingId.value = ''
  title.value = ''
  content.value = ''
  formError.value = ''
}

function createSnippet(): void {
  editingId.value = ''
  title.value = ''
  content.value = ''
  formError.value = ''
  pendingDeleteId.value = ''
  editorOpen.value = true
}

function editSnippet(snippet: TextSnippet): void {
  editingId.value = snippet.id
  title.value = snippet.title
  content.value = snippet.content
  formError.value = ''
  pendingDeleteId.value = ''
  editorOpen.value = true
}

function saveSnippet(): void {
  const normalizedTitle = title.value.trim()
  if (!normalizedTitle) { formError.value = '请填写片段名称。'; return }
  if (!content.value.trim()) { formError.value = '请填写要保存的文本内容。'; return }
  if (normalizedTitle.length > maxTitleLength || content.value.length > maxContentLength) { formError.value = '内容超过允许长度，请缩短后再保存。'; return }
  const now = Date.now()
  const next = editingId.value
    ? snippets.value.map((snippet) => snippet.id === editingId.value ? { ...snippet, title: normalizedTitle, content: content.value, updatedAt: now } : snippet)
    : [...snippets.value, { id: crypto.randomUUID(), title: normalizedTitle, content: content.value, updatedAt: now }]
  if (!editingId.value && snippets.value.length >= maxSnippets) { formError.value = `最多保存 ${maxSnippets} 条文本片段。`; return }
  if (persistSnippets(next)) resetEditor()
}

function deleteSnippet(snippet: TextSnippet): void {
  if (persistSnippets(snippets.value.filter((item) => item.id !== snippet.id))) pendingDeleteId.value = ''
}

async function copySnippet(snippet: TextSnippet): Promise<void> {
  actionError.value = ''
  try {
    await copyText(snippet.content)
    copiedId.value = snippet.id
    window.clearTimeout(copiedTimer)
    copiedTimer = window.setTimeout(() => { if (copiedId.value === snippet.id) copiedId.value = '' }, 1400)
  } catch {
    actionError.value = '复制失败，请检查剪贴板权限。'
  }
}

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(timestamp)
}

onBeforeUnmount(() => window.clearTimeout(copiedTimer))
</script>

<template>
  <div class="text-snippet-tool">
    <header class="text-snippet-toolbar">
      <div><strong>常用文本片段</strong><span>保存常用回复、地址或代码片段，随时复制使用。</span></div>
      <button class="primary-button" :disabled="editorOpen || snippets.length >= maxSnippets" @click="createSnippet"><Plus :size="14" /> 新建片段</button>
    </header>

    <form v-if="editorOpen" class="text-snippet-editor" @submit.prevent="saveSnippet">
      <div class="text-snippet-editor-heading"><strong>{{ editingId ? '编辑片段' : '新建片段' }}</strong><button type="button" class="quiet-button" aria-label="关闭编辑" @click="resetEditor"><X :size="14" /></button></div>
      <label class="text-snippet-field"><span>名称</span><input v-model="title" :maxlength="maxTitleLength" placeholder="例如：会议邀请、常用命令" /></label>
      <label class="text-snippet-field"><span>文本内容</span><textarea v-model="content" :maxlength="maxContentLength" placeholder="输入要保存的文本…"></textarea></label>
      <p v-if="formError" class="inline-error">{{ formError }}</p>
      <div class="text-snippet-editor-footer"><small>{{ content.length.toLocaleString('zh-CN') }} / {{ maxContentLength }} 字符</small><div><button type="button" class="secondary-button" @click="resetEditor">取消</button><button type="submit" class="primary-button">{{ editingId ? '保存修改' : '保存片段' }}</button></div></div>
    </form>

    <div class="text-snippet-search-row">
      <label class="text-snippet-search"><Search :size="14" /><input v-model="query" type="search" placeholder="搜索名称或内容…" aria-label="搜索文本片段" /><button v-if="query" class="quiet-button" type="button" aria-label="清空搜索" @click="query = ''">×</button></label>
      <span>{{ visibleSnippets.length }} / {{ snippets.length }} 条</span>
    </div>

    <p v-if="actionError" class="inline-error">{{ actionError }}</p>
    <div v-if="visibleSnippets.length" class="text-snippet-list">
      <article v-for="snippet in visibleSnippets" :key="snippet.id" class="text-snippet-card">
        <div class="text-snippet-card-main"><div class="text-snippet-card-heading"><strong>{{ snippet.title }}</strong><small>{{ formatTime(snippet.updatedAt) }}</small></div><pre>{{ snippet.content }}</pre></div>
        <div class="text-snippet-card-actions">
          <button class="quiet-button" :aria-label="copiedId === snippet.id ? '已复制' : `复制${snippet.title}`" @click="copySnippet(snippet)"><Check v-if="copiedId === snippet.id" :size="14" /><ClipboardCopy v-else :size="14" /> {{ copiedId === snippet.id ? '已复制' : '复制' }}</button>
          <button class="quiet-button" :aria-label="`编辑${snippet.title}`" @click="editSnippet(snippet)"><Pencil :size="14" /></button>
          <button class="quiet-button" :aria-label="`删除${snippet.title}`" @click="pendingDeleteId = pendingDeleteId === snippet.id ? '' : snippet.id"><Trash :size="14" /></button>
        </div>
        <div v-if="pendingDeleteId === snippet.id" class="text-snippet-delete-confirm"><span>删除“{{ snippet.title }}”？</span><button class="quiet-button" @click="pendingDeleteId = ''">取消</button><button class="quiet-button text-snippet-delete-button" @click="deleteSnippet(snippet)">确认删除</button></div>
      </article>
    </div>
    <div v-else-if="!editorOpen || snippets.length" class="text-snippet-empty"><ClipboardCopy :size="22" /><strong>{{ snippets.length ? '没有匹配的片段' : '还没有保存文本片段' }}</strong><span>{{ snippets.length ? '试试更短的关键词。' : '把常用内容保存下来，下次一键复制。' }}</span><button v-if="!snippets.length && !editorOpen" class="secondary-button" @click="createSnippet"><Plus :size="14" /> 添加第一个片段</button></div>

    <p class="text-snippet-footnote">最多保存 {{ maxSnippets }} 条；内容保存在本机浏览器存储且未加密，请勿保存密码或密钥。</p>
  </div>
</template>
