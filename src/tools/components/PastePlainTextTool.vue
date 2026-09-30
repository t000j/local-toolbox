<script setup lang="ts">
import { computed, ref } from 'vue'
import { ClipboardCheck, ClipboardPaste, FileText } from '@lucide/vue'
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager'

const previewText = ref('')
const hasPreview = ref(false)
const reading = ref(false)
const writing = ref(false)
const message = ref('')
const error = ref('')
const characterCount = computed(() => previewText.value.length.toLocaleString('zh-CN'))

async function readClipboard(): Promise<void> {
  reading.value = true
  hasPreview.value = false
  previewText.value = ''
  message.value = ''
  error.value = ''
  try {
    const text = await readText()
    if (!text) {
      error.value = '剪贴板为空，或当前内容不包含可读取的文本。'
      return
    }
    previewText.value = text
    hasPreview.value = true
    message.value = '已读取剪贴板文字，请确认内容后再写回。'
  } catch {
    error.value = '读取失败。请复制一段文字后重试。'
  } finally {
    reading.value = false
  }
}

async function writePlainText(): Promise<void> {
  if (!hasPreview.value || writing.value) return
  writing.value = true
  message.value = ''
  error.value = ''
  try {
    await writeText(previewText.value)
    message.value = '已写回为纯文本，现在可以粘贴到目标应用。'
  } catch {
    error.value = '写回失败，请检查剪贴板权限后重试。'
  } finally {
    writing.value = false
  }
}
</script>

<template>
  <div class="paste-plain-text-tool">
    <section class="paste-plain-text-intro">
      <span class="paste-plain-text-icon"><ClipboardPaste :size="18" /></span>
      <div><strong>把剪贴板文字转为纯文本</strong><span>手动读取并预览，再确认写回；不会自动读取或保存内容。</span></div>
    </section>

    <div class="paste-plain-text-actions">
      <button class="secondary-button" :disabled="reading || writing" @click="readClipboard"><ClipboardPaste :size="14" /> {{ reading ? '正在读取…' : '读取剪贴板' }}</button>
      <button class="primary-button" :disabled="!hasPreview || reading || writing" @click="writePlainText"><ClipboardCheck :size="14" /> {{ writing ? '正在写回…' : '写回为纯文本' }}</button>
    </div>

    <p v-if="error" class="inline-error">{{ error }}</p>
    <p v-else-if="message" class="paste-plain-text-message" role="status">{{ message }}</p>

    <section v-if="hasPreview" class="paste-plain-text-preview-card">
      <div class="paste-plain-text-preview-heading"><span><FileText :size="14" /> 内容预览</span><small>{{ characterCount }} 个字符</small></div>
      <textarea class="paste-plain-text-preview" :value="previewText" readonly aria-label="剪贴板纯文本预览"></textarea>
    </section>
    <div v-else class="paste-plain-text-empty"><ClipboardPaste :size="22" /><strong>还没有读取剪贴板</strong><span>点击“读取剪贴板”后，文字会显示在这里供你确认。</span></div>

    <p class="paste-plain-text-footnote">写回会覆盖当前剪贴板内容，并移除原有的富文本格式；图片等非文本内容不会处理。</p>
  </div>
</template>
